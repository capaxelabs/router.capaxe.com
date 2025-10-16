import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { googleImageModels } from '../shared/imageModels/google'
import { runwareImageModels } from '../shared/imageModels/runware'
import { selectProvider, RequestParams } from '../utils/providerSelector'
import { getGeminiApiKey, getGoogleAccessToken, validateGoogleConfig } from './googleAuth'
import { createStorageService } from '../lib/storage'
import { extractWidthHeight } from '../lib/imageHelpers'
import { ImageGenerationRequest, ImageGenerationResponse } from '../lib/validation'


export interface ImageGenerationParams extends ImageGenerationRequest {
  files?: {
    image?: File[]
    mask?: File[]
  }
  imagesData?: Array<{
    data: string
    type?: string
    filename?: string
  }>
}

export interface GenerationResult {
  created: number
  data: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string | null
  }>
  latency?: number
  cost?: number
  provider?: string
}

/**
 * Generate images using Google models
 */
export async function generateImage(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: ImageGenerationParams,
  userId: string
): Promise<GenerationResult> {
  const startTime = Date.now()
  
  // Get model configuration from Google and Runware models
  const allImageModels = { ...googleImageModels, ...runwareImageModels }
  const modelConfig = allImageModels[params.model]
  if (!modelConfig) {
    throw new Error(`Model '${params.model}' not found`)
  }

  // Select provider
  const providerIndex = selectProvider(modelConfig.providers, params as RequestParams)
  const selectedProvider = modelConfig.providers[providerIndex]

  if (!selectedProvider) {
    throw new Error('Invalid provider selected')
  }

  // Get the actual model name for the provider
  const actualModel = selectedProvider.model_name

  // Apply image processing if needed
  let processedParams = { ...params }
  if (params.files?.image && typeof selectedProvider.applyImage === 'function') {
    processedParams = await selectedProvider.applyImage(processedParams)
  }

  // Apply mask processing if needed
  if (params.files?.mask && typeof selectedProvider.applyMask === 'function') {
    processedParams = await selectedProvider.applyMask(processedParams)
  }

  // Clean up files reference
  delete processedParams.files

  // Apply quality settings if available
  if (params.quality && typeof selectedProvider.applyQuality === 'function') {
    processedParams = selectedProvider.applyQuality(processedParams)
  }

  // Route to appropriate provider handler
  let result: GenerationResult
  
  switch (selectedProvider.id) {
    case 'gemini':
    case 'geminiImagen':
      result = await generateGemini(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'vertex':
      result = await generateVertex(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'runware':
      // Runware defaults to async mode for production scalability
      if (c.req.query('async') === 'false') {
        // Only allow sync mode when explicitly requested (for testing/development)
        console.warn('Sync mode used for Runware - not recommended for production')
        result = await generateRunware(c, { ...processedParams, model: actualModel }, userId)
      } else {
        // Default to async mode - handled by queue consumer
        throw new Error('Async image generation should be handled by queue consumer')
      }
      break
    default:
      throw new Error(`Provider '${selectedProvider.id}' not implemented`)
  }

  result.latency = Date.now() - startTime
  result.provider = selectedProvider.id

  // Process through storage service if not a test model
  if (!params.model.includes('test')) {
    const storageService = createStorageService(
      c.env.STORAGE_BUCKET,
      c.env.R2_BUCKET_NAME,
      c.env.R2_CUSTOM_PUBLIC_URL
    )
    
    if (storageService) {
      result = await processImageResult(result, storageService, userId, params.response_format || 'url')
    }
  }

  return result
}

/**
 * Generate images using Google Gemini API
 */
async function generateGemini(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: ImageGenerationParams & { model: string },
  userId: string
): Promise<GenerationResult> {
  const providerKey = getGeminiApiKey(params.model, c.env)
  const providerUrl = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${providerKey}`

  const parts: any[] = [{ text: params.prompt }]

  // Add image data if available (for image editing)
  if (params.imagesData && params.imagesData.length > 0) {
    for (const imageData of params.imagesData) {
      if (imageData.data) {
        // Use the structured base64 data directly
        parts.push({
          inline_data: {
            mime_type: imageData.type || 'image/png',
            data: imageData.data
          }
        })
      } else if ((imageData as any).blob) {
        // Fallback for legacy blob format
        const arrayBuffer = await (imageData as any).blob.arrayBuffer()
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        parts.push({
          inline_data: {
            mime_type: (imageData as any).blob.type,
            data: base64Data
          }
        })
      }
    }
  }

  const requestBody = {
    contents: [{
      parts: parts
    }],
    generationConfig: { responseModalities: ["Text", "Image"] }
  }

  const response = await fetch(providerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  const rawBody = await response.text()
  let data: any
  
  try {
    data = rawBody ? JSON.parse(rawBody) : null
  } catch {
    data = null
  }

  if (!response.ok) {
    const formattedError = {
      status: data?.error?.code || response.status,
      statusText: data?.error?.status || response.statusText,
      error: {
        message: data?.error?.message || (rawBody || 'Request failed'),
        type: data?.error?.status || 'unknown_error'
      },
      original_response_from_provider: data ?? rawBody
    }

    if (formattedError?.statusText === 'RESOURCE_EXHAUSTED' && params.model === 'gemini-2.0-flash-exp-image-generation') {
      formattedError.error.message = 'This model hit a global rate limit. Please try again.'
    }

    throw new Error(JSON.stringify(formattedError))
  }

  if (!data) {
    throw new Error('Provider returned invalid response')
  }

  // Extract image data from response
  const imageDataArray: string[] = []
  if (data?.candidates?.[0]?.content?.parts) {
    for (const part of data.candidates[0].content.parts) {
      if (part?.inlineData?.data) {
        imageDataArray.push(part.inlineData.data)
      }
    }
  }

  if (imageDataArray.length > 0) {
    return {
      created: Math.floor(Date.now() / 1000),
      data: imageDataArray.map(imageData => ({
        b64_json: imageData,
        revised_prompt: null,
      }))
    }
  } else {
    // Look for text response
    let textResponse: string | null = null
    if (data?.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part?.text) {
          textResponse = part.text
          break
        }
      }
    }

    throw new Error(`No image generated: ${textResponse || 'No image or text found in response'}`)
  }
}

/**
 * Generate images using Google Vertex AI
 */
async function generateVertex(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: ImageGenerationParams & { model: string },
  userId: string
): Promise<GenerationResult> {
  validateGoogleConfig(c.env)
  
  const projectId = c.env.GOOGLE_CLOUD_PROJECT_ID
  const location = c.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  
  // Get access token (simplified - in production implement proper OAuth2)
  console.warn('Using mock access token - implement proper Vertex AI authentication')
  const accessToken = 'mock_access_token'
  
  const providerUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${params.model}:predict`

  const requestBody = {
    instances: [{
      prompt: params.prompt
    }],
    parameters: {
      sampleCount: 1,
      safetySetting: 'block_only_high',
    }
  }

  const response = await fetch(providerUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Vertex AI request failed: ${errorData}`)
  }

  const data = await response.json()

  if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
    return {
      created: Math.floor(Date.now() / 1000),
      data: [{
        b64_json: data.predictions[0].bytesBase64Encoded,
        revised_prompt: null,
      }]
    }
  } else {
    throw new Error('No image data in Vertex AI response')
  }
}

/**
 * Generate images using Runware SDK
 * Uses the official @runware/sdk-js with WebSocket-based API
 */
async function generateRunware(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: ImageGenerationParams & { model: string },
  userId: string
): Promise<GenerationResult> {
  const providerKey = c.env.RUNWARE_API_KEY

  if (!providerKey) {
    throw new Error('RUNWARE_API_KEY environment variable is required')
  }

  try {
    // Import Runware service
    const { getRunwareService } = await import('./runwareService')

    // Get or create Runware service instance (singleton pattern)
    const runwareService = getRunwareService(providerKey, {
      shouldReconnect: true,
      globalMaxRetries: 3,
      timeoutDuration: 90000 // 90 seconds
    })

    // Determine if this is a background removal operation
    const isBackgroundRemoval = params.model.includes('runware:110@1')

    // Extract width and height from size parameter
    const { width, height } = extractWidthHeight(params.size || 'auto')

    // Build Runware request parameters
    const runwareParams: any = {
      model: params.model,
      prompt: params.prompt,
      width: width || 1024,
      height: height || 1024,
      n: params.n || 1,
      includeCost: true,
      response_format: params.response_format || 'url'
    }

    // Add optional parameters
    if (params.negativePrompt) runwareParams.negativePrompt = params.negativePrompt
    if (params.steps) runwareParams.steps = params.steps
    if (params.seed) runwareParams.seed = params.seed
    if (params.guidance) runwareParams.guidance = params.guidance
    if (params.scheduler) runwareParams.scheduler = params.scheduler
    if (params.lora) runwareParams.lora = params.lora

    // Handle special operations
    if (isBackgroundRemoval && params.inputImage) {
      runwareParams.removeBackground = true
      runwareParams.inputImage = params.inputImage
    }

    // Image-to-image
    if (params.seedImage) {
      runwareParams.inputImage = params.seedImage
      runwareParams.strength = typeof params.strength === 'number' ? params.strength : 0.8
    }

    // Inpainting (mask)
    if (params.maskImage) {
      runwareParams.maskImage = params.maskImage
    }

    // ControlNet support
    if (params.controlNet) {
      runwareParams.controlNet = params.controlNet
    }

    // Upscaling
    if (params.upscale && params.inputImage) {
      runwareParams.upscale = true
      runwareParams.inputImage = params.inputImage
      runwareParams.upscaleFactor = params.upscaleFactor || 4
    }

    // Generate image using Runware SDK
    const result = await runwareService.generateImage(runwareParams)

    return result
  } catch (error) {
    const formattedError = {
      status: 500,
      statusText: 'INTERNAL_ERROR',
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: 'runware_generation_error'
      },
      original_response_from_provider: error
    }

    throw new Error(JSON.stringify(formattedError))
  }
}

async function processImageResult(
  result: GenerationResult,
  storageService: any,
  userId: string,
  responseFormat: 'url' | 'b64_json'
): Promise<GenerationResult> {
  // Use the updated storage service methods with CUID and date-based folders
  return await storageService.processImageResult(result, userId, responseFormat)
}