import { Context } from 'hono'
import { CloudflareBindings } from '../types/env'
import { googleImageModels } from '../shared/imageModels/google'
import { selectProvider, RequestParams } from '../utils/providerSelector'
import { getGeminiApiKey, getGoogleAccessToken, validateGoogleConfig } from './googleAuth'
import { R2StorageService } from '../lib/storage'
import { extractWidthHeight } from '../lib/imageHelpers'
import { ImageGenerationRequest, ImageGenerationResponse } from '../lib/validation'

export interface ImageGenerationParams extends ImageGenerationRequest {
  files?: {
    image?: File[]
    mask?: File[]
  }
  imagesData?: any[]
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
  c: Context<{ Bindings: CloudflareBindings }>,
  params: ImageGenerationParams,
  userId: string
): Promise<GenerationResult> {
  const startTime = Date.now()
  
  // Get model configuration
  const modelConfig = googleImageModels[params.model]
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
    default:
      throw new Error(`Provider '${selectedProvider.id}' not implemented`)
  }

  result.latency = Date.now() - startTime

  // Process through storage service if not a test model
  if (!params.model.includes('test')) {
    const storageService = new R2StorageService(c.env.STORAGE_BUCKET)
    result = await processImageResult(result, storageService, userId, params.response_format || 'url')
  }

  return result
}

/**
 * Generate images using Google Gemini API
 */
async function generateGemini(
  c: Context<{ Bindings: CloudflareBindings }>,
  params: ImageGenerationParams & { model: string },
  userId: string
): Promise<GenerationResult> {
  const providerKey = getGeminiApiKey(params.model, c.env)
  const providerUrl = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${providerKey}`

  const parts: any[] = [{ text: params.prompt }]

  // Add image data if available (for image editing)
  if (params.imagesData && params.imagesData.length > 0) {
    for (const imageData of params.imagesData) {
      const arrayBuffer = await imageData.blob.arrayBuffer()
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      parts.push({
        inline_data: {
          mime_type: imageData.blob.type,
          data: base64Data
        }
      })
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
  c: Context<{ Bindings: CloudflareBindings }>,
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
  c: Context<{ Bindings: CloudflareBindings }>,
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
async function processImageResult(
  result: GenerationResult,
  storageService: R2StorageService,
  userId: string,
  responseFormat: 'url' | 'b64_json'
): Promise<GenerationResult> {
  if (responseFormat === 'b64_json') {
    return result // Return as-is for base64 format
  }

  // Convert base64 images to URLs via storage
  const processedData = await Promise.all(
    result.data.map(async (item, index) => {
      if (item.b64_json) {
        try {
          const imageBuffer = Uint8Array.from(atob(item.b64_json), c => c.charCodeAt(0))
          const key = storageService.generateKey(`image_${Date.now()}_${index}.png`, userId)
          const url = await storageService.uploadFile(key, imageBuffer.buffer, {
            contentType: 'image/png'
          })
          
          return {
            url: url,
            revised_prompt: item.revised_prompt
          }
        } catch (error) {
          console.error('Failed to upload image to storage:', error)
          return {
            b64_json: item.b64_json,
            revised_prompt: item.revised_prompt
          }
        }
      }
      return item
    })
  )

  return {
    ...result,
    data: processedData
  }
}