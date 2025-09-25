import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { googleImageModels } from '../shared/imageModels/google'
import { bytedanceImageModels } from '../shared/imageModels/bytedance'
import { runwareImageModels } from '../shared/imageModels/runware'
import { selectProvider, RequestParams } from '../utils/providerSelector'
import { getGeminiApiKey, getGoogleAccessToken, validateGoogleConfig } from './googleAuth'
import { createStorageService } from '../lib/storage'
import { extractWidthHeight } from '../lib/imageHelpers'
import { ImageGenerationRequest, ImageGenerationResponse } from '../lib/validation'
import { pollReplicatePrediction } from './replicateUtils'

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
  
  // Get model configuration from Google, Bytedance, and Runware models
  const allImageModels = { ...googleImageModels, ...bytedanceImageModels, ...runwareImageModels }
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
    case 'openrouter':
      result = await generateOpenRouter(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'replicate':
      // Replicate defaults to async mode for production scalability
      if (c.req.query('async') === 'false') {
        // Only allow sync mode when explicitly requested (for testing/development)
        console.warn('Sync mode used for Replicate - not recommended for production')
        result = await generateReplicate(c, { ...processedParams, model: actualModel }, userId)
      } else {
        // Default to async mode - handled by queue consumer
        throw new Error('Async image generation should be handled by queue consumer')
      }
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
 * Generate images using OpenRouter (for Gemini models)
 */
async function generateOpenRouter(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: ImageGenerationParams & { model: string },
  userId: string
): Promise<GenerationResult> {
  const providerKey = c.env.OPENROUTER_API_KEY
  if (!providerKey) {
    throw new Error('OpenRouter API key not configured')
  }

  const providerUrl = 'https://openrouter.ai/api/v1/chat/completions'

  const messages: any[] = [{
    role: 'user',
    content: params.prompt
  }]

  // Add image data if available
  if (params.imagesData && params.imagesData.length > 0) {
    const imageContent = params.imagesData.map(imageData => ({
      type: 'image_url',
      image_url: { url: imageData }
    }))
    
    messages[0].content = [
      { type: 'text', text: params.prompt },
      ...imageContent
    ]
  }

  const requestBody = {
    model: params.model,
    messages: messages,
    max_tokens: 1000,
  }

  const response = await fetch(providerUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${providerKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://imagerouter.io',
      'X-Title': 'ImageRouter'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`OpenRouter request failed: ${errorData}`)
  }

  const data = await response.json()

  // OpenRouter returns chat completion format, need to extract images
  // This is a simplified implementation
  if (data.choices?.[0]?.message?.content) {
    // Parse content for image data - this would need proper implementation
    throw new Error('OpenRouter image extraction not fully implemented')
  } else {
    throw new Error('No content in OpenRouter response')
  }
}

/**
 * Process image generation result through storage
 */
/**
 * Generate images using Replicate API
 */
async function generateReplicate(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: ImageGenerationParams & { model: string },
  userId: string
): Promise<GenerationResult> {
  const providerUrl = `https://api.replicate.com/v1/models/${params.model}/predictions`
  const providerKey = c.env.REPLICATE_API_KEY

  if (!providerKey) {
    throw new Error('REPLICATE_API_KEY environment variable is required')
  }

  // Build the input object starting with the prompt
  const input: Record<string, any> = {
    prompt: params.prompt
  }

  // Add additional parameters from the request
  if (params.width) input.width = params.width
  if (params.height) input.height = params.height
  if (params.n) input.num_outputs = params.n
  if (params.size) {
    const { width, height } = extractWidthHeight(params.size)
    if (width && height) {
      input.width = width
      input.height = height
    }
  }

  // Add any additional parameters that might be specific to the model
  Object.keys(params).forEach(key => {
    if (!['prompt', 'model', 'width', 'height', 'n', 'size', 'files', 'imagesData'].includes(key)) {
      input[key] = params[key as keyof typeof params]
    }
  })

  const requestBody = {
    input: input
  }

  const response = await fetch(providerUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${providerKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Replicate API error: ${errorData.detail || response.statusText}`)
  }

  let data = await response.json()

  // If the prediction is still running, poll until it finishes
  // Use shorter timeout for images (5 minutes vs 20 minutes for videos)
  if (data.status !== 'succeeded' || !data.output) {
    data = await pollReplicatePrediction(data.urls.get, providerKey, {
      maxAttempts: 60, // 5 minutes at 5-second intervals
      pollingInterval: 5000
    })
  }

  // Handle timeout without throwing so credits are not fully refunded
  if (data.status === 'timeout' || !data.output) {
    throw new Error('Prediction timed out on Replicate – please try again later')
  }

  // Process the output - Replicate typically returns array of URLs
  const output = Array.isArray(data.output) ? data.output : [data.output]
  
  return {
    created: Math.floor(Date.now() / 1000),
    data: output.map((url: string) => ({
      url: url,
      revised_prompt: null
    })),
    cost: data.cost || 0
  }
}

/**
 * Generate images using Runware API
 */
async function generateRunware(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: ImageGenerationParams & { model: string },
  userId: string
): Promise<GenerationResult> {
  const providerUrl = 'https://api.runware.ai/v1'
  const providerKey = c.env.RUNWARE_API_KEY
  
  if (!providerKey) {
    throw new Error('RUNWARE_API_KEY environment variable is required')
  }

  // Generate a unique task UUID for tracking
  const taskUUID = `task-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
  const taskType = params.model.includes('runware:110@1') ? 'imageBackgroundRemoval' : 'imageInference'

  // Extract width and height from size parameter
  const { width, height } = extractWidthHeight(params.size || 'auto')

  // Build the Runware task payload
  const taskPayload: any = {
    taskType,
    taskUUID,
    positivePrompt: params.prompt,
    model: params.model,
    outputFormat: "WEBP",
    numberResults: params.n || 1,
    includeCost: true
  }

  // Set dimensions for non-background-removal models
  if (!params.model.includes('runware:110@1')) {
    taskPayload.width = width || 1024
    taskPayload.height = height || 1024
  }

  // Add steps if provided
  if (params.steps) {
    taskPayload.steps = params.steps
  }

  // Handle different image types based on processed parameters
  if (params.referenceImages) {
    taskPayload.referenceImages = Array.isArray(params.referenceImages) 
      ? params.referenceImages 
      : [params.referenceImages]
  }

  // Background removal support
  if (params.inputImage) {
    taskPayload.inputImage = params.inputImage
  }

  // Image-to-image support
  if (params.seedImage) {
    taskPayload.seedImage = params.seedImage
    taskPayload.strength = typeof params.strength === 'number' ? params.strength : 0.8
  }

  // Inpainting support (mask)
  if (params.maskImage) {
    taskPayload.maskImage = params.maskImage
  }

  try {
    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerKey}`
      },
      body: JSON.stringify([taskPayload])
    })

    const data = await response.json()

    if (!response.ok || !data?.data) {
      const errorObj = data?.errors?.[0] || {}
      const formattedError = {
        status: response.status,
        statusText: errorObj?.code || 'Error',
        error: {
          message: errorObj?.message || 'Runware generation failed',
          type: errorObj?.code || 'runware_error'
        },
        original_response_from_provider: data
      }
      throw new Error(JSON.stringify(formattedError))
    }

    // Locate result corresponding to our taskUUID
    const taskResult = data.data.find((item: any) => item.taskUUID === taskUUID) || data.data[0]
    const imageURL = taskResult?.imageURL || null

    return {
      created: Math.floor(Date.now() / 1000),
      data: [{
        url: imageURL,
        revised_prompt: null,
      }],
      cost: taskResult?.cost || 0
    }
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