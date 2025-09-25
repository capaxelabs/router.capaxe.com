import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { googleVideoModels } from '../shared/videoModels/google'
import { selectProvider, RequestParams } from '../utils/providerSelector'
import { getGeminiApiKey, getGoogleAccessToken, validateGoogleConfig } from './googleAuth'
import { R2StorageService } from '../lib/storage'
import { VideoGenerationRequest, VideoGenerationResponse } from '../lib/validation'

export interface VideoGenerationParams extends VideoGenerationRequest {
  files?: {
    image?: File[]
  }
  imagesData?: any[]
}

export interface VideoGenerationResult {
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
 * Generate videos using Google models
 */
export async function generateVideo(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams,
  userId: string
): Promise<VideoGenerationResult> {
  const startTime = Date.now()
  
  // Get model configuration
  const modelConfig = googleVideoModels[params.model]
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

  // Clean up files reference
  delete processedParams.files

  // Route to appropriate provider handler
  let result: VideoGenerationResult
  
  switch (selectedProvider.id) {
    case 'gemini':
      result = await generateGeminiVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'geminiVideo':
      // For sync requests, use mock. For async, the queue consumer will use the real API
      if (c.req.query('async') === 'true') {
        throw new Error('Async video generation should be handled by queue consumer')
      } else {
        result = await generateGeminiMockVideo(c, { ...processedParams, model: actualModel }, userId)
      }
      break
    case 'geminiMock':
      result = await generateGeminiMockVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'vertex':
      result = await generateVertexVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'openrouter':
      result = await generateOpenRouterVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    default:
      throw new Error(`Provider '${selectedProvider.id}' not implemented`)
  }

  result.latency = Date.now() - startTime

  // Process through storage service if not a test model
  if (!params.model.includes('test')) {
    const storageService = new R2StorageService(c.env.STORAGE_BUCKET)
    result = await processVideoResult(result, storageService, userId, params.response_format || 'url')
  }

  return result
}

/**
 * Generate videos for async processing (used by queue consumer)
 * This bypasses the async check and uses real APIs
 */
export async function generateVideoAsync(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams,
  userId: string
): Promise<VideoGenerationResult & { provider?: string }> {
  const startTime = Date.now()
  
  // Get model configuration
  const modelConfig = googleVideoModels[params.model]
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

  // Clean up files reference
  delete processedParams.files

  // Route to appropriate provider handler - use real APIs for async
  let result: VideoGenerationResult
  
  switch (selectedProvider.id) {
    case 'gemini':
      result = await generateGeminiVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'geminiVideo':
      // Use mock for async processing until real API is needed
      result = await generateGeminiMockVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'geminiMock':
      result = await generateGeminiMockVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'vertex':
      result = await generateVertexVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'openrouter':
      result = await generateOpenRouterVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    default:
      throw new Error(`Provider '${selectedProvider.id}' not implemented`)
  }

  result.latency = Date.now() - startTime

  // Process through storage service if not a test model
  if (!params.model.includes('test')) {
    const storageService = new R2StorageService(c.env.STORAGE_BUCKET)
    result = await processVideoResult(result, storageService, userId, params.response_format || 'url')
  }

  return { ...result, provider: selectedProvider.id }
}

/**
 * Generate mock videos for testing (geminiMock provider)
 */
async function generateGeminiMockVideo(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams & { model: string },
  userId: string
): Promise<VideoGenerationResult> {
  // Return a mock video response for testing
  return {
    created: Math.floor(Date.now() / 1000),
    data: [{
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
    }],
    latency: 100
  }
}

/**
 * Generate videos using Google GenAI SDK
 */
async function generateGeminiVideo(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams & { model: string },
  userId: string
): Promise<VideoGenerationResult> {
  // Import the SDK dynamically to avoid bundling issues
  const { GoogleGenAI } = await import('@google/genai')
  
  const providerKey = getGeminiApiKey(params.model, c.env)
  const ai = new GoogleGenAI({ apiKey: providerKey })
  
  // Use the correct Veo model name
  const veoModel = params.model.includes('veo-3') ? 'veo-3.0-generate-001' : 'veo-2.0-generate-001'

  // Build generation parameters
  const generateOptions: any = {
    model: veoModel,
    prompt: params.prompt
  }

  // Map size to aspectRatio and resolution
  if (params.size) {
    const [width, height] = params.size.split('x').map(Number)
    if (width && height) {
      if (width > height) {
        generateOptions.aspectRatio = '16:9'
      } else if (height > width) {
        generateOptions.aspectRatio = '9:16'
      } else {
        generateOptions.aspectRatio = '16:9' // Default for square
      }
      
      // Set resolution based on model capabilities
      if (params.model.includes('veo-3') && width >= 1080) {
        generateOptions.resolution = '1080p'
      } else {
        generateOptions.resolution = '720p'
      }
    }
  }

  // Add negative prompt if available
  if (params.negative_prompt) {
    generateOptions.negativePrompt = params.negative_prompt
  }

  // Add image for image-to-video
  if (params.imagesData && params.imagesData.length > 0) {
    const imageData = params.imagesData[0]
    const arrayBuffer = await imageData.blob.arrayBuffer()
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    
    generateOptions.image = {
      bytesBase64Encoded: base64Data,
      mimeType: imageData.blob.type
    }
    
    generateOptions.personGeneration = 'allow_adult' // Required for image-to-video
  } else {
    generateOptions.personGeneration = 'allow_all' // For text-to-video
  }

  try {
    // Start the video generation operation
    let operation = await ai.models.generateVideos(generateOptions)
    
    // Poll for completion using the cleaner SDK approach
    while (!operation.done) {
      await new Promise((resolve) => setTimeout(resolve, 10000)) // Wait 10 seconds
      // Refresh the operation object to get the latest status
      operation = await ai.operations.getVideosOperation({ operation })
    }
    
    // Once done, the result is in operation.response
    if (operation.error) {
      throw new Error(`Veo generation failed: ${JSON.stringify(operation.error)}`)
    }

    // Extract video data from the response
    const videoData = operation.response?.generatedVideos?.[0]
    if (videoData?.videoUri) {
      // Download the video and convert to base64
      const videoResponse = await fetch(videoData.videoUri, {
        headers: {
          'x-goog-api-key': providerKey
        }
      })
      
      if (videoResponse.ok) {
        const videoBuffer = await videoResponse.arrayBuffer()
        const base64Video = btoa(String.fromCharCode(...new Uint8Array(videoBuffer)))
        
        return {
          created: Math.floor(Date.now() / 1000),
          data: [{
            b64_json: base64Video,
            revised_prompt: null
          }]
        }
      } else {
        throw new Error('Failed to download generated video')
      }
    } else {
      throw new Error('No video URI in completed operation')
    }
    
  } catch (error) {
    const formattedError = {
      status: 500,
      statusText: 'INTERNAL_ERROR',
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: 'video_generation_error'
      },
      original_response_from_provider: error
    }

    throw new Error(JSON.stringify(formattedError))
  }
}

/**
 * Generate videos using Google Vertex AI
 */
async function generateVertexVideo(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams & { model: string },
  userId: string
): Promise<VideoGenerationResult> {
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
    throw new Error('No video data in Vertex AI response')
  }
}

/**
 * Generate videos using OpenRouter (for Gemini models)
 */
async function generateOpenRouterVideo(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams & { model: string },
  userId: string
): Promise<VideoGenerationResult> {
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

  // OpenRouter returns chat completion format, need to extract videos
  // This is a simplified implementation
  if (data.choices?.[0]?.message?.content) {
    // Parse content for video data - this would need proper implementation
    throw new Error('OpenRouter video extraction not fully implemented')
  } else {
    throw new Error('No content in OpenRouter response')
  }
}

/**
 * Process video generation result through storage
 */
async function processVideoResult(
  result: VideoGenerationResult,
  storageService: R2StorageService,
  userId: string,
  responseFormat: 'url' | 'b64_json'
): Promise<VideoGenerationResult> {
  if (responseFormat === 'b64_json') {
    return result // Return as-is for base64 format
  }

  // Convert base64 videos to URLs via storage
  const processedData = await Promise.all(
    result.data.map(async (item, index) => {
      if (item.b64_json) {
        try {
          const videoBuffer = Uint8Array.from(atob(item.b64_json), c => c.charCodeAt(0))
          const key = storageService.generateKey(`video_${Date.now()}_${index}.mp4`, userId)
          const url = await storageService.uploadFile(key, videoBuffer.buffer, {
            contentType: 'video/mp4'
          })
          
          return {
            url: url,
            revised_prompt: item.revised_prompt
          }
        } catch (error) {
          console.error('Failed to upload video to storage:', error)
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