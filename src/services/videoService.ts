import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { getModelService } from './modelService'
import { selectProvider, RequestParams } from '../utils/providerSelector'
import { getGeminiApiKey, getGoogleAccessToken, validateGoogleConfig } from './googleAuth'
import { createStorageService } from '../lib/storage'
import { VideoGenerationRequest, VideoGenerationResponse } from '../lib/validation'
import {R2StorageService} from '../lib/storage'


export interface VideoGenerationParams extends VideoGenerationRequest {
  files?: {
    image?: File[]
  }
  imagesData?: Array<{
    data: string
    type?: string
    filename?: string
  }>
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
  provider?: string
}
/**
 * Generate videos for async processing (used by queue consumer)
 * This bypasses the async check and uses real APIs
 */
export async function generateVideo(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams,
  userId: string
): Promise<VideoGenerationResult & { provider?: string }> {
  const startTime = Date.now()

  // Get model configuration from database
  const db = c.get('db')
  const modelService = getModelService(db)
  const allVideoModels = await modelService.getActiveModelsAsObject('video')
  const modelConfig = allVideoModels[params.model]
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
      // Use real Google GenAI API for async processing
      result = await generateGeminiVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'vertex':
      result = await generateVertexVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    case 'runware':
      // Runware video generation
      result = await generateRunwareVideo(c, { ...processedParams, model: actualModel }, userId)
      break
    default:
      throw new Error(`Provider '${selectedProvider.id}' not implemented`)
  }

  result.latency = Date.now() - startTime

  // Process through storage service if not a test model
  if (!params.model.includes('test')) {
    const storageService = createStorageService(
      c.env.R2_ACCOUNT_ID,
      c.env.R2_ACCESS_KEY_ID,
      c.env.R2_SECRET_ACCESS_KEY,
      c.env.R2_BUCKET_NAME,
      c.env.R2_CUSTOM_PUBLIC_URL
    )
    if (storageService) {
      result = await processVideoResult(result, storageService, userId, params.response_format || 'url')
    }
  }

  return { ...result, provider: selectedProvider.id }
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
  const { eq } = await import('drizzle-orm')
  
  const providerKey = getGeminiApiKey(params.model, c.env)
  const ai = new GoogleGenAI({ apiKey: providerKey })
  
  // Get database connection
  const db = c.get('db')
  if (!db) {
    throw new Error('Database connection not available')
  }
  
  // Use the correct Veo model name
  const veoModel = params.model.includes('veo-3') ? 'veo-3.0-generate-001' : 'veo-2.0-generate-001'

  // Build generation parameters
  const generateOptions: any = {
    model: veoModel,
    prompt: params.prompt
  }

  // Use validated Veo parameters from request
  if (params.aspect_ratio) {
    generateOptions.aspectRatio = params.aspect_ratio
  }
  
  if (params.resolution) {
    generateOptions.resolution = params.resolution
  }
  
  // Fallback to size parameter if aspect_ratio not provided
  if (!params.aspect_ratio && params.size) {
    const [width, height] = params.size.split('x').map(Number)
    if (width && height) {
      if (width > height) {
        generateOptions.aspectRatio = '16:9'
      } else if (height > width) {
        generateOptions.aspectRatio = '9:16'
      } else {
        generateOptions.aspectRatio = '16:9' // Default for square
      }
    }
  }
  
  // Fallback resolution based on model capabilities
  if (!params.resolution) {
    if (params.model.includes('veo-3') && generateOptions.aspectRatio === '16:9') {
      generateOptions.resolution = '1080p'
    } else {
      generateOptions.resolution = '720p'
    }
  }

  // Add negative prompt if available
  if (params.negative_prompt) {
    generateOptions.negativePrompt = params.negative_prompt
  }

  // Add image for image-to-video
  if (params.imagesData && params.imagesData.length > 0) {
    const imageData = params.imagesData[0]
    console.log('[Video Service] Processing input image:', {
      hasData: !!imageData.data,
      hasType: !!imageData.type,
      dataLength: imageData.data?.length || 0,
      type: imageData.type
    })
    
    let base64Data: string
    
    if (imageData.data) {
      // Use structured base64 data directly
      base64Data = imageData.data
    } else {
      throw new Error('Invalid image data format: missing data field')
    }
    
    const mimeType = imageData.type || (imageData as any).blob?.type || 'image/png'
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('Invalid image data: empty base64 string')
    }
    
    if (!mimeType) {
      throw new Error('Invalid image data: missing mimeType')
    }
    
    console.log('[Video Service] Setting image for Gemini:', {
      mimeType,
      base64Length: base64Data.length,
      hasValidBase64: /^[A-Za-z0-9+/=]+$/.test(base64Data),
      first50Chars: base64Data.substring(0, 50)
    })
    
    // Set image for image-to-video generation
    // IMPORTANT: The SDK expects "imageBytes" NOT "bytesBase64Encoded"!
    // Based on the official example: image: { imageBytes: ..., mimeType: "image/png" }
    generateOptions.image = {
      imageBytes: base64Data,
      mimeType: mimeType
    }
    
    // IMPORTANT: Remove aspectRatio if not explicitly set by user when using input image
    // Some models don't support aspectRatio with image input
    if (!params.aspect_ratio && !params.size) {
      delete generateOptions.aspectRatio
    }
  }

  // Set person generation parameter (use validated value from request)
  if (params.person_generation) {
    generateOptions.personGeneration = params.person_generation
  } else {
    // Default based on whether image is provided
    generateOptions.personGeneration = params.imagesData && params.imagesData.length > 0 ? 'allow_adult' : 'allow_all'
  }

  // Add seed parameter if provided
  if (params.seed) {
    generateOptions.seed = params.seed
  }

  try {
    // Log the complete request being sent to Gemini
    console.log('[Video Service] Sending request to Gemini API:', {
      model: generateOptions.model,
      prompt: generateOptions.prompt?.substring(0, 100),
      hasImage: !!generateOptions.image,
      imageStructure: generateOptions.image ? {
        hasImageBytes: !!generateOptions.image.imageBytes,
        hasMimeType: !!generateOptions.image.mimeType,
        mimeType: generateOptions.image.mimeType,
        imageBytesLength: generateOptions.image.imageBytes?.length || 0
      } : null,
      aspectRatio: generateOptions.aspectRatio,
      resolution: generateOptions.resolution,
      allKeys: Object.keys(generateOptions)
    })
    
    // Log the full generateOptions structure (without base64 data)
    const logOptions = { ...generateOptions }
    if (logOptions.image?.imageBytes) {
      logOptions.image = {
        ...logOptions.image,
        imageBytes: `[${logOptions.image.imageBytes.length} chars]`
      }
    }
    console.log('[Video Service] Full generateOptions:', JSON.stringify(logOptions, null, 2))
    
    // Start the video generation operation
    let operation = await ai.models.generateVideos(generateOptions)
    
    // Store operation details in database for persistent polling
    const operationData = {
      operationName: operation.name,
      model: veoModel,
      startTime: Date.now(),
      maxWaitTime: 20 * 60 * 1000, // 20 minutes max
      pollInterval: 30 * 1000, // 30 seconds between polls
      status: operation.done ? 'completed' : 'processing',
      providerKey: providerKey, // Store for downloading video later
      generateOptions: generateOptions, // Store original request for debugging
      lastPollTime: Date.now(),
      pollAttempts: 0,
      maxPollAttempts: 40 // 40 * 30s = 20 minutes
    }

    // Find current task in database to store operation data
    const currentTask = await findCurrentVideoTask(db, userId, params.prompt)
    if (currentTask) {
      // Update the task with Google operation metadata
      await updateTaskWithOperationData(db, currentTask.taskId, operationData)
      console.log(`Stored Google operation ${operation.name} for task ${currentTask.taskId}`)
    } else {
      console.warn('Could not find current task to store operation data')
    }
    
    // Check if already completed (unlikely but possible)
    if (operation.done) {
      if (currentTask) {
        await updateOperationStatus(db, currentTask.taskId, 'completed', operation)
      }
      return await handleCompletedOperation(operation, providerKey, c.env)
    }
    
    // For long-running operations, we need to implement polling via re-queuing
    // Store operation data in database for persistent state management
    
    // Limited polling for Cloudflare Workers (max 2 minutes to stay safe)
    const maxPollTime = 2 * 60 * 1000 // 2 minutes
    const pollStart = Date.now()
    let pollAttempts = 0
    
    while (!operation.done && (Date.now() - pollStart < maxPollTime)) {
      await new Promise((resolve) => setTimeout(resolve, 10000)) // Wait 10 seconds
      operation = await ai.operations.getVideosOperation({ operation })
      pollAttempts++
      
      // Update polling status in database
      if (currentTask) {
        await updatePollingStatus(db, currentTask.taskId, pollAttempts, operation.done || false)
      }
    }
    
    if (operation.done) {
      // Completed within worker timeout
      if (currentTask) {
        await updateOperationStatus(db, currentTask.taskId, 'completed', operation)
      }
      return await handleCompletedOperation(operation, providerKey, c.env)
    } else {
      // Still processing - update database with current status and re-queue for continued polling
      if (currentTask) {
        await updateOperationStatus(db, currentTask.taskId, 'polling_required', operation, pollAttempts)
      }
      throw new Error(`Video generation still in progress after 2 minutes. Operation: ${operation.name}. Use async processing for proper handling.`)
    }
    
  } catch (error) {
    // Update database with error status
    const currentTask = await findCurrentVideoTask(db, userId, params.prompt)
    if (currentTask) {
      await updateOperationStatus(db, currentTask.taskId, 'error', null, 0, error)
    }

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
 * Handle completed Google operation
 */
async function handleCompletedOperation(operation: any, providerKey: string, env?: any) {
  if (operation.error) {
    throw new Error(`Veo generation failed: ${JSON.stringify(operation.error)}`)
  }

  // Log the full operation response structure for debugging
  console.log('[Video Service] ========== OPERATION RESPONSE ==========')
  console.log('[Video Service] Full operation object keys:', Object.keys(operation))
  console.log('[Video Service] operation.response keys:', operation.response ? Object.keys(operation.response) : 'null')
  console.log('[Video Service] operation.response:', JSON.stringify(operation.response, null, 2))
  console.log('[Video Service] =======================================')

  // Extract video data from the response
  const videoData = operation.response?.generatedVideos?.[0]
  console.log('[Video Service] videoData:', JSON.stringify(videoData, null, 2))
  
  if (videoData) {
    console.log('[Video Service] videoData keys:', Object.keys(videoData))
    console.log('[Video Service] videoData.video keys:', videoData.video ? Object.keys(videoData.video) : 'null')
  }
  
  // Try multiple possible locations for the video URI/file
  const videoUri = videoData?.video?.uri || videoData?.videoUri || videoData?.video?.url
  const videoFile = videoData?.video // This might be a File object from the SDK
  
  console.log('[Video Service] Extracted videoUri:', videoUri)
  console.log('[Video Service] Extracted videoFile:', videoFile ? JSON.stringify(videoFile, null, 2) : 'null')
  
  // If we have a videoFile object, it might be a File reference from the SDK
  // According to the SDK docs, videoData.video is a File object that needs to be downloaded
  if (videoFile && typeof videoFile === 'object') {
    console.log('[Video Service] Video is a File object, attempting SDK download...')
    
    // The SDK example shows: client.files.download(file=video.video)
    // But in Node.js SDK, files are typically returned with a URI we need to fetch
    // Let's try to get the URI from the file object
    const fileUri = videoFile.uri || videoFile.url || videoFile.path
    console.log('[Video Service] File URI from object:', fileUri)
    
    if (fileUri) {
      const videoResponse = await fetch(fileUri, {
        headers: {
          'x-goog-api-key': providerKey
        }
      })
      
      if (videoResponse.ok) {
      // Store video in R2 storage instead of converting to base64
      const storageService = createStorageService(
        env?.R2_ACCOUNT_ID || '',
        env?.R2_ACCESS_KEY_ID || '',
        env?.R2_SECRET_ACCESS_KEY || '',
        env?.R2_BUCKET_NAME || '',
        env?.R2_CUSTOM_PUBLIC_URL || ''
      )
      
      if (!storageService) {
        throw new Error('Storage service not configured')
      }
      
      const videoBuffer = await videoResponse.arrayBuffer()
      
      // Upload to storage and get public URL with proper CUID + date structure
      const fileName = storageService.generateFileName('video/mp4', 'video')
      const publicUrl = await storageService.uploadFile(fileName, videoBuffer, {
        contentType: 'video/mp4'
      })
      
        return {
          created: Math.floor(Date.now() / 1000),
          data: [{
            url: publicUrl,
            revised_prompt: null
          }]
        }
      } else {
        throw new Error(`Failed to download generated video from file URI. Status: ${videoResponse.status} ${videoResponse.statusText}`)
      }
    } else {
      throw new Error(`Video file object found but no URI available. File object keys: ${Object.keys(videoFile).join(', ')}`)
    }
  } else {
    // No URI found - log the full structure and throw descriptive error
    const errorDetails = {
      hasResponse: !!operation.response,
      hasGeneratedVideos: !!operation.response?.generatedVideos,
      generatedVideosLength: operation.response?.generatedVideos?.length || 0,
      videoDataStructure: videoData ? Object.keys(videoData) : 'null',
      fullResponse: JSON.stringify(operation.response, null, 2)
    }
    
    console.error('[Video Service] Failed to find video URI. Details:', errorDetails)
    
    throw new Error(`No video URI found in completed operation. Response structure: ${JSON.stringify(errorDetails)}`)
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

  // Get access token using proper OAuth2 service account authentication
  const tokenResponse = await getGoogleAccessToken(c.env)
  const accessToken = tokenResponse.access_token

  const providerUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${params.model}:predict`

  const requestBody = {
    instances: [{
      prompt: params.prompt
    }],
    parameters: {
      sampleCount: 1,
      safetySetting: 'block_only_high',
      // Add Veo parameters if provided
      ...(params.aspect_ratio && { aspectRatio: params.aspect_ratio }),
      ...(params.resolution && { resolution: params.resolution }),
      ...(params.person_generation && { personGeneration: params.person_generation }),
      ...(params.seed && { seed: params.seed })
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

  const data = await response.json() as any

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
          const fileName = storageService.generateFileName('video/mp4', 'video')
          const url = await storageService.uploadFile(fileName, videoBuffer.buffer, {
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

/**
 * Database helper functions for Google operation management
 */

/**
 * Find the current video task for a user and prompt
 */
async function findCurrentVideoTask(db: any, userId: string, prompt: string) {
  try {
    const { apiUsage } = await import('../db/schema')
    const { eq, and, desc } = await import('drizzle-orm')
    
    // Find the most recent video task for this user with this prompt
    const recentTasks = await db
      .select()
      .from(apiUsage)
      .where(
        and(
          eq(apiUsage.userId, userId),
          eq(apiUsage.prompt, prompt),
          eq(apiUsage.isAsync, true),
          eq(apiUsage.taskStatus, 'processing')
        )
      )
      .orderBy(desc(apiUsage.createdAt))
      .limit(1)
    
    return recentTasks[0] || null
  } catch (error) {
    console.error('Error finding current video task:', error)
    return null
  }
}

/**
 * Update task with Google operation metadata
 */
async function updateTaskWithOperationData(db: any, taskId: string, operationData: any) {
  try {
    const { apiUsage } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    
    await db
      .update(apiUsage)
      .set({
        metadata: JSON.stringify({
          googleOperation: operationData,
          lastUpdated: Date.now()
        }),
        provider: 'google-veo'
      })
      .where(eq(apiUsage.taskId, taskId))
    
    console.log(`Updated task ${taskId} with Google operation metadata`)
  } catch (error) {
    console.error('Error updating task with operation data:', error)
  }
}

/**
 * Update operation status in database
 */
async function updateOperationStatus(
  db: any, 
  taskId: string, 
  status: string, 
  operation?: any, 
  pollAttempts: number = 0, 
  error?: any
) {
  try {
    const { apiUsage } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    
    // Get current metadata
    const currentRecord = await db
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.taskId, taskId))
      .limit(1)
    
    if (currentRecord.length === 0) {
      console.warn(`Task ${taskId} not found for status update`)
      return
    }
    
    let currentMetadata = {}
    try {
      currentMetadata = JSON.parse(currentRecord[0].metadata || '{}')
    } catch (e) {
      console.warn('Could not parse existing metadata')
    }
    
    // Update metadata with new status
    const existingGoogleOp = (currentMetadata as any)?.googleOperation || {}
    const updatedMetadata = {
      ...currentMetadata,
      googleOperation: {
        ...existingGoogleOp,
        status,
        lastPollTime: Date.now(),
        pollAttempts,
        operationDone: operation?.done || false,
        operationData: operation ? {
          name: operation.name,
          done: operation.done,
          error: operation.error || null
        } : null,
        error: error ? (error instanceof Error ? error.message : String(error)) : null
      },
      lastUpdated: Date.now()
    }
    
    await db
      .update(apiUsage)
      .set({
        metadata: JSON.stringify(updatedMetadata)
      })
      .where(eq(apiUsage.taskId, taskId))
    
    console.log(`Updated operation status for task ${taskId}: ${status}`)
  } catch (error) {
    console.error('Error updating operation status:', error)
  }
}

/**
 * Update polling status in database
 */
async function updatePollingStatus(db: any, taskId: string, pollAttempts: number, isDone: boolean) {
  try {
    const { apiUsage } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    
    // Get current metadata
    const currentRecord = await db
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.taskId, taskId))
      .limit(1)
    
    if (currentRecord.length === 0) return
    
    let currentMetadata = {}
    try {
      currentMetadata = JSON.parse(currentRecord[0].metadata || '{}')
    } catch (e) {
      console.warn('Could not parse existing metadata for polling update')
    }
    
    // Update polling information
    const existingGoogleOp = (currentMetadata as any)?.googleOperation || {}
    const updatedMetadata = {
      ...currentMetadata,
      googleOperation: {
        ...existingGoogleOp,
        pollAttempts,
        lastPollTime: Date.now(),
        operationDone: isDone
      },
      lastUpdated: Date.now()
    }
    
    await db
      .update(apiUsage)
      .set({
        metadata: JSON.stringify(updatedMetadata),
        taskProgress: Math.min(95, 20 + (pollAttempts * 2)) // Gradual progress
      })
      .where(eq(apiUsage.taskId, taskId))
    
  } catch (error) {
    console.error('Error updating polling status:', error)
  }
}

/**
 * Generate video using Runware SDK
 */
async function generateRunwareVideo(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams & { model: string },
  userId: string
): Promise<VideoGenerationResult> {
  const providerKey = c.env.RUNWARE_API_KEY

  if (!providerKey) {
    throw new Error('RUNWARE_API_KEY environment variable is required')
  }

  try {
    // Import Runware service
    const { getRunwareService } = await import('./runwareService')

    console.log('[Runware Video] Creating REST API service instance...')
    
    // Get or create Runware service instance (REST API - no connection needed)
    const runwareService = getRunwareService(providerKey)
    
    console.log('[Runware Video] REST API service instance ready')

    // Build Runware video request parameters
    const runwareParams: any = {
      model: params.model,
      prompt: params.prompt,
      duration: params.duration || 5, // Default 5 seconds
      width: params.width || 864,
      height: params.height || 480,
      fps: 24,
      includeCost: true,
      response_format: params.response_format || 'url'
    }

    // Add optional parameters
    if (params.negativePrompt) runwareParams.negativePrompt = params.negativePrompt
    if (params.seed) runwareParams.seed = params.seed

    // Generate video using Runware REST API
    console.log('[Runware Video] Calling runwareService.generateVideo()...')
    const result = await runwareService.generateVideo(runwareParams)
    console.log(`[Runware Video] ✓ Generation successful, received ${result.data.length} videos`)

    return result
  } catch (error) {
    console.error('Runware video generation error:', error)
    throw new Error(`Runware video generation failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}