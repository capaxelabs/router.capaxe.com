/**
 * Queue Consumer for processing async image/video generation tasks
 * This runs as a separate worker invocation when messages arrive in the queue
 */

import { createDatabase, Database } from '../db'
import { CloudflareBindings } from '../types/env'
import { QueueMessage, QueueService, createPollingMessage } from './queueService'
import { getGeminiApiKey } from './googleAuth'

/**
 * Process a batch of queue messages
 * This is the main entry point called by Cloudflare Workers queue system
 */
export async function consumeQueue(
  batch: MessageBatch<QueueMessage>,
  env: CloudflareBindings
): Promise<void> {
  console.log(`Processing batch of ${batch.messages.length} messages`)

  for (const message of batch.messages) {
    try {
      await processQueueMessage(message, env)
      message.ack() // Acknowledge successful processing
      console.log(`Successfully processed task ${message.body.taskId}`)
    } catch (error) {
      console.error(`Failed to process task ${message.body.taskId}:`, error)
      
      // Retry the message (up to max_retries from wrangler.toml)
      message.retry()
    }
  }
}

/**
 * Process a single queue message
 */
async function processQueueMessage(
  message: Message<QueueMessage>,
  env: CloudflareBindings
): Promise<void> {
  const { taskId, type, userId } = message.body

  // Create database connection
  const db = createDatabase({
    TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN
  })

  // Fetch task data from database
  const { apiUsage } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')
  
  const taskRecords = await db.select().from(apiUsage).where(eq(apiUsage.taskId, taskId)).limit(1)
  if (!taskRecords || taskRecords.length === 0) {
    throw new Error(`Task ${taskId} not found in database`)
  }

  const task = taskRecords[0]
  console.log(`[Queue Consumer] Fetched task from database: model=${task.model}, prompt=${task.prompt?.substring(0, 50)}...`)

  // Parse metadata to get input image URLs and other params
  const metadata = task.metadata ? JSON.parse(task.metadata) : {}
  const inputImageUrls = metadata.inputImageUrls || []
  const originalRequest = metadata.originalRequest || {}

  console.log(`[Queue Consumer] Task has ${inputImageUrls.length} input images`)

  // Helper function to convert ArrayBuffer to base64 (handles large files)
  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    const chunkSize = 8192 // Process in chunks to avoid stack overflow
    let binary = ''
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    
    return btoa(binary)
  }

  // Fetch input images from R2 if provided
  let imagesData: Array<{ data: string; type: string; filename?: string }> = []
  if (inputImageUrls.length > 0) {
    console.log(`[Queue Consumer] Downloading ${inputImageUrls.length} source images from R2...`)
    for (const url of inputImageUrls) {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch source image: ${response.status}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        console.log(`[Queue Consumer] Downloaded image ${url.split('/').pop()}: ${arrayBuffer.byteLength} bytes`)
        
        const base64 = arrayBufferToBase64(arrayBuffer)
        const contentType = response.headers.get('content-type') || 'image/png'
        
        imagesData.push({
          data: base64,
          type: contentType,
          filename: url.split('/').pop()
        })
        console.log(`[Queue Consumer] Converted to base64: ${base64.length} chars`)
      } catch (error) {
        console.error(`[Queue Consumer] Failed to download source image ${url}:`, error)
        throw error
      }
    }
    console.log(`[Queue Consumer] Downloaded ${imagesData.length} source images`)
  }

  // Build request object from database task
  const request = {
    model: task.model,
    prompt: task.prompt,
    size: task.imageSize,
    quality: task.quality,
    n: originalRequest.n || 1,
    duration: originalRequest.duration,
    resolution: originalRequest.resolution,
    imagesData: imagesData.length > 0 ? imagesData : undefined
  }

  // Create queue service for database updates (pass db only, queue not needed for updates)
  const queueService = new QueueService(db)

  // Track start time for speed calculation
  const startTime = Date.now()

  try {
    // Update status to processing
    await queueService.updateTaskProgress(taskId, {
      taskStatus: 'processing',
      taskProgress: 10,
      taskStartedAt: startTime
    })

    // Process based on task type
    let result: any

    if (type === 'image') {
      result = await processImageTask(request, task.userId, env, queueService, taskId, db)
    } else if (type === 'video') {
      result = await processVideoTask(request, task.userId, env, queueService, taskId, db)
    } else if (type === 'video_poll') {
      result = await processVideoPollTask(message.body, env, queueService)
      return // Don't complete the task yet, just poll
    } else {
      throw new Error(`Unknown task type: ${type}`)
    }

    const processingTime = Date.now() - startTime

    // Complete the task
    await queueService.completeTask(taskId, {
      // Extract R2 URLs (use _uploadedUrl for b64_json response format)
      outputUrls: result.data?.map((item: any) => item.url || item._uploadedUrl) || [],
      cost: Math.round((result.cost || 0) * 10000), // Convert to 1e-4 USD units
      speedMs: processingTime,
      provider: result.provider || 'unknown',
      status: 'success'
    })

  } catch (error) {
    console.error(`Task ${taskId} processing failed:`, error)
    
    // Check if this is a Google operation that needs continued polling
    const errorMessage = error instanceof Error ? error.message : String(error)
    const operationMatch = errorMessage.match(/Operation: (.*?)\. /)
    
    if (operationMatch && errorMessage.includes('still in progress')) {
      const googleOperationName = operationMatch[1]
      console.log(`Video still processing, starting polling for operation: ${googleOperationName}`)
      
      // Create initial polling message
      await createPollingMessage(
        env.ASYNC_QUEUE,
        taskId,
        userId,
        message.body.usageId,
        'google',
        googleOperationName,
        1,
        40,
        30
      )
      
      // Update task to show it's polling
      await queueService.updateTaskProgress(taskId, {
        taskStatus: 'processing',
        taskProgress: 30,
        provider: 'google-veo'
      })
      
      return // Don't mark as failed, polling will continue
    }
    
    // Mark task as failed for other errors
    await queueService.completeTask(taskId, {
      outputUrls: [],
      cost: 0,
      speedMs: Date.now() - startTime,
      provider: 'unknown',
      status: 'error',
      error: errorMessage
    })

    throw error // Re-throw to trigger retry
  }
}

/**
 * Process an image generation task
 */
async function processImageTask(
  request: any,
  userId: string,
  env: CloudflareBindings,
  queueService: QueueService,
  taskId: string,
  db: Database
): Promise<any> {
  // Import required services
  const { generateImage } = await import('./imageService')
  const { getModelService } = await import('./modelService')
  const { setModelsCache } = await import('../shared/priceCalculator')

  // Load models from database and initialize price calculator cache
  const modelService = getModelService(db)
  const models = await modelService.getActiveModelsAsObject('image')
  setModelsCache(models)
  
  // Create mock context for the generation service
  const mockContext = {
    env,
    req: {
      query: (key: string) => {
        // Default to url response format for async tasks
        if (key === 'response_format') return request.response_format || 'url'
        if (key === 'async') return 'true'
        return request[key]
      }
    },
    get: (key: string) => {
      // Provide necessary context variables
      if (key === 'db') return db
      return null
    },
    set: () => {}
  } as any

  // Update progress
  await queueService.updateTaskProgress(taskId, {
    taskProgress: 30,
    provider: 'google' // Assuming Google provider
  })

  // Run the actual image generation
  const result = await generateImage(mockContext, request, userId)

  // Update progress
  await queueService.updateTaskProgress(taskId, {
    taskProgress: 80
  })

  return result
}

/**
 * Process a video generation task
 */
async function processVideoTask(
  request: any,
  userId: string,
  env: CloudflareBindings,
  queueService: QueueService,
  taskId: string,
  db: Database
): Promise<any> {
  // Import required services
  const { generateVideo } = await import('./videoService')
  const { getModelService } = await import('./modelService')
  const { setModelsCache } = await import('../shared/priceCalculator')

  // Load models from database and initialize price calculator cache
  const modelService = getModelService(db)
  const models = await modelService.getActiveModelsAsObject('video')
  setModelsCache(models)
  
  // Create mock context for the generation service
  const mockContext = {
    env,
    req: {
      query: (key: string) => {
        // Default to url response format for async tasks
        if (key === 'response_format') return request.response_format || 'url'
        if (key === 'async') return 'true'
        return request[key]
      }
    },
    get: (key: string) => {
      if (key === 'db') return db
      return null
    },
    set: () => {}
  } as any

  // Update progress
  await queueService.updateTaskProgress(taskId, {
    taskProgress: 20,
    provider: 'google'
  })

  // Run the actual video generation
  const result = await generateVideo(mockContext, request, userId)

  // Update progress  
  await queueService.updateTaskProgress(taskId, {
    taskProgress: 80
  })

  return result
}

/**
 * Dead letter queue handler (for failed messages)
 */
export async function handleFailedMessages(
  batch: MessageBatch<QueueMessage>,
  env: CloudflareBindings
): Promise<void> {
  console.log(`Processing ${batch.messages.length} failed messages`)

  const db = createDatabase({
    TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN
  })

  const queueService = new QueueService(db)

  for (const message of batch.messages) {
    try {
      const { taskId } = message.body
      
      // Mark task as permanently failed
      await queueService.completeTask(taskId, {
        outputUrls: [],
        cost: 0,
        speedMs: 0,
        provider: 'failed',
        status: 'error',
        error: 'Task failed after maximum retries and moved to dead letter queue'
      })

      message.ack()
      console.log(`Marked task ${taskId} as permanently failed`)

    } catch (error) {
      console.error('Failed to process dead letter message:', error)
      message.retry() // Even DLQ messages can be retried
    }
  }
}

/**
 * Process a video polling task (supports any provider)
 */
async function processVideoPollTask(
  message: QueueMessage,
  env: CloudflareBindings,
  queueService: QueueService
): Promise<void> {
  const { taskId, userId, usageId, pollingData } = message

  if (!pollingData) {
    throw new Error('No polling data provided for video poll task')
  }

  const { provider, operationId, pollAttempt, maxPollAttempts, pollInterval = 30 } = pollingData

  // Route to provider-specific polling handler (only Google supported)
  switch (provider) {
    case 'google':
      await pollGoogleOperation(message, env, queueService)
      break
    default:
      throw new Error(`Unsupported polling provider: ${provider}. Only 'google' is supported.`)
  }
}

/**
 * Poll Google Veo operation status
 */
async function pollGoogleOperation(
  message: QueueMessage,
  env: CloudflareBindings,
  queueService: QueueService
): Promise<void> {
  const { taskId, userId, usageId, pollingData } = message
  
  if (!pollingData) {
    throw new Error('No polling data provided')
  }

  const { operationId, pollAttempt, maxPollAttempts, pollInterval = 30 } = pollingData

  // Import Google GenAI SDK
  const { GoogleGenAI } = await import('@google/genai')
  const providerKey = getGeminiApiKey('veo', env)

  if (!providerKey) {
    throw new Error('Google API key not configured')
  }

  const ai = new GoogleGenAI({ apiKey: providerKey })

  try {
    // Check operation status
    const operation = await ai.operations.getVideosOperation({ 
      operation: { name: operationId } 
    })

    console.log(`Polling Google task ${taskId}, attempt ${pollAttempt}/${maxPollAttempts}, done: ${operation.done}`)

    if (operation.done) {
      // Operation completed - process the result
      if (operation.error) {
        // Failed
        await queueService.completeTask(taskId, {
          outputUrls: [],
          cost: 0,
          speedMs: Date.now() - (message.timestamp || Date.now()),
          provider: 'google-veo',
          status: 'error',
          error: `Google Veo generation failed: ${JSON.stringify(operation.error)}`
        })
        console.log(`Task ${taskId} failed: ${JSON.stringify(operation.error)}`)
      } else {
        // Success - download and process video
        const videoData = operation.response?.generatedVideos?.[0]
        if (videoData?.videoUri) {
          try {
            const videoResponse = await fetch(videoData.videoUri, {
              headers: { 'x-goog-api-key': providerKey }
            })
            
            let outputUrls: string[] = []
            if (videoResponse.ok) {
              console.log(`[Queue Video] Video download successful, preparing R2 upload...`)
              console.log(`[Queue Video] Environment check - R2_ACCOUNT_ID: ${env.R2_ACCOUNT_ID || 'MISSING'}, R2_BUCKET_NAME: ${env.R2_BUCKET_NAME || 'MISSING'}, R2_CUSTOM_PUBLIC_URL: ${env.R2_CUSTOM_PUBLIC_URL || 'MISSING'}`)
              
              // Upload video to R2 instead of storing as base64
              const { createStorageService } = await import('../lib/storage')
              const storageService = createStorageService(
                env.R2_ACCOUNT_ID,
                env.R2_ACCESS_KEY_ID,
                env.R2_SECRET_ACCESS_KEY,
                env.R2_BUCKET_NAME,
                env.R2_CUSTOM_PUBLIC_URL
              )
              
              if (!storageService) {
                throw new Error('Storage service not configured - cannot upload video')
              }
              
              console.log(`[Queue Video] Uploading video from ${videoData.videoUri}`)
              const videoBuffer = await videoResponse.arrayBuffer()
              console.log(`[Queue Video] Video buffer size: ${videoBuffer.byteLength} bytes`)
              
              const uploadResult = await storageService.downloadAndUpload(
                videoData.videoUri,
                'video/mp4',
                'video'
              )
              
              outputUrls = [uploadResult.url]
              console.log(`[Queue Video] ✓ Successfully uploaded video to R2: ${uploadResult.url}`)
            } else {
              console.error(`[Queue Video] Video response not OK: ${videoResponse.status} ${videoResponse.statusText}`)
            }

            await queueService.completeTask(taskId, {
              outputUrls,
              cost: Math.round(3.2 * 10000), // $3.20 in 1e-4 USD units
              speedMs: Date.now() - (message.timestamp || Date.now()),
              provider: 'google-veo',
              status: 'success'
            })
            console.log(`Task ${taskId} completed successfully`)
          } catch (downloadError) {
            console.error(`Failed to download video for task ${taskId}:`, downloadError)
            await queueService.completeTask(taskId, {
              outputUrls: [],
              cost: Math.round(3.2 * 10000),
              speedMs: Date.now() - (message.timestamp || Date.now()),
              provider: 'google-veo',
              status: 'error',
              error: 'Failed to download generated video'
            })
          }
        } else {
          await queueService.completeTask(taskId, {
            outputUrls: [],
            cost: 0,
            speedMs: Date.now() - (message.timestamp || Date.now()),
            provider: 'google-veo',
            status: 'error',
            error: 'No video URI in completed Google operation'
          })
        }
      }
    } else {
      // Still processing - check if we should continue polling
      if (pollAttempt >= maxPollAttempts) {
        // Max attempts reached - mark as failed
        await queueService.completeTask(taskId, {
          outputUrls: [],
          cost: 0,
          speedMs: Date.now() - (message.timestamp || Date.now()),
          provider: 'google-veo',
          status: 'error',
          error: `Video generation timed out after ${maxPollAttempts} polling attempts (${Math.round(maxPollAttempts * 30 / 60)} minutes)`
        })
        console.log(`Task ${taskId} timed out after ${pollAttempt} attempts`)
      } else {
        // Continue polling - re-queue with delay
        await createPollingMessage(
          env.ASYNC_QUEUE,
          taskId,
          userId,
          usageId,
          'google',
          operationId,
          pollAttempt + 1,
          maxPollAttempts,
          pollInterval
        )

        // Update progress
        const progressPercent = Math.min(90, 10 + (pollAttempt * 2)) // Gradual progress increase
        await queueService.updateTaskProgress(taskId, {
          taskProgress: progressPercent
        })
      }
    }
  } catch (error) {
    console.error(`Error polling Google operation for task ${taskId}:`, error)
    
    // If this is not the last attempt, continue polling
    if (pollAttempt < maxPollAttempts) {
      await createPollingMessage(
        env.ASYNC_QUEUE,
        taskId,
        userId,
        usageId,
        'google',
        operationId,
        pollAttempt + 1,
        maxPollAttempts,
        pollInterval
      )
    } else {
      // Mark as failed
      await queueService.completeTask(taskId, {
        outputUrls: [],
        cost: 0,
        speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'google-veo',
        status: 'error',
        error: `Polling failed: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }
}