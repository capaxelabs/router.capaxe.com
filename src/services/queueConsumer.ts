/**
 * Queue Consumer for processing async image/video generation tasks
 * This runs as a separate worker invocation when messages arrive in the queue
 */

import { createDatabase } from '../db'
import { CloudflareBindings } from '../types/env'
import { QueueMessage, QueueService, createPollingMessage } from './queueService'

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
  const { taskId, type, userId, request } = message.body

  // Create database connection
  const db = createDatabase({
    TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN
  })

  // Create queue service for database updates
  const queueService = new QueueService(
    null as any, // We don't need to send messages, only update DB
    db
  )

  try {
    // Update status to processing
    await queueService.updateTaskProgress(taskId, {
      taskStatus: 'processing',
      taskProgress: 10,
      taskStartedAt: Date.now()
    })

    // Process based on task type
    let result: any
    const startTime = Date.now()

    if (type === 'image') {
      result = await processImageTask(request, userId, env, queueService, taskId)
    } else if (type === 'video') {
      result = await processVideoTask(request, userId, env, queueService, taskId)
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
      speedMs: Date.now() - new Date().getTime(),
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
  taskId: string
): Promise<any> {
  // Import image service dynamically
  const { generateImage } = await import('./imageService')
  
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
      if (key === 'db') {
        return createDatabase({
          TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
          TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN
        })
      }
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
  taskId: string
): Promise<any> {
  // Import video service dynamically
  const { generateVideoAsync } = await import('./videoService')
  
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
      if (key === 'db') {
        return createDatabase({
          TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
          TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN
        })
      }
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
  const result = await generateVideoAsync(mockContext, request, userId)

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

  const queueService = new QueueService(null as any, db)

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

  // Route to provider-specific polling handler
  switch (provider) {
    case 'google':
      await pollGoogleOperation(message, env, queueService)
      break
    case 'replicate':
      await pollReplicateOperation(message, env, queueService)
      break
    case 'runpod':
      await pollRunpodOperation(message, env, queueService)
      break
    case 'fal':
      await pollFalOperation(message, env, queueService)
      break
    case 'luma':
      await pollLumaOperation(message, env, queueService)
      break
    default:
      throw new Error(`Unsupported polling provider: ${provider}`)
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
  const providerKey = env.GOOGLE_GEMINI_API_KEY
  
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
              console.log(`[Queue Video] Environment check - STORAGE_BUCKET: ${env.STORAGE_BUCKET ? 'available' : 'MISSING'}, R2_BUCKET_NAME: ${env.R2_BUCKET_NAME || 'MISSING'}, R2_CUSTOM_PUBLIC_URL: ${env.R2_CUSTOM_PUBLIC_URL || 'MISSING'}`)
              
              // Upload video to R2 instead of storing as base64
              const { R2StorageService } = await import('../lib/storage')
              const storageService = new R2StorageService(
                env.STORAGE_BUCKET,
                env.R2_BUCKET_NAME,
                env.R2_CUSTOM_PUBLIC_URL
              )
              
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

/**
 * Poll Replicate operation status
 */
async function pollReplicateOperation(
  message: QueueMessage,
  env: CloudflareBindings,
  queueService: QueueService
): Promise<void> {
  const { taskId, userId, usageId, pollingData } = message
  if (!pollingData) throw new Error('No polling data')

  const { operationId, pollAttempt, maxPollAttempts, pollInterval = 10 } = pollingData
  
  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${operationId}`, {
      headers: {
        'Authorization': `Token ${env.REPLICATE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    const prediction = await response.json()
    console.log(`Polling Replicate task ${taskId}, attempt ${pollAttempt}, status: ${prediction.status}`)

    if (prediction.status === 'succeeded') {
      await queueService.completeTask(taskId, {
        outputUrls: prediction.output || [],
        cost: Math.round(3.2 * 10000),
        speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'replicate',
        status: 'success'
      })
    } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
      await queueService.completeTask(taskId, {
        outputUrls: [],
        cost: 0,
        speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'replicate',
        status: 'error',
        error: prediction.error || `Replicate prediction ${prediction.status}`
      })
    } else if (pollAttempt >= maxPollAttempts) {
      await queueService.completeTask(taskId, {
        outputUrls: [],
        cost: 0,
        speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'replicate',
        status: 'error',
        error: `Replicate timeout after ${maxPollAttempts} attempts`
      })
    } else {
      // Continue polling
      await createPollingMessage(
        env.ASYNC_QUEUE, taskId, userId, usageId,
        'replicate', operationId, pollAttempt + 1, maxPollAttempts, pollInterval
      )
      
      const progressPercent = Math.min(90, 10 + (pollAttempt * 2))
      await queueService.updateTaskProgress(taskId, { taskProgress: progressPercent })
    }
  } catch (error) {
    console.error(`Replicate polling error:`, error)
    if (pollAttempt < maxPollAttempts) {
      await createPollingMessage(
        env.ASYNC_QUEUE, taskId, userId, usageId,
        'replicate', operationId, pollAttempt + 1, maxPollAttempts, pollInterval
      )
    } else {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'replicate', status: 'error',
        error: `Replicate polling failed: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }
}

/**
 * Poll Runpod operation status  
 */
async function pollRunpodOperation(
  message: QueueMessage,
  env: CloudflareBindings,
  queueService: QueueService
): Promise<void> {
  const { taskId, userId, usageId, pollingData } = message
  if (!pollingData) throw new Error('No polling data')

  const { operationId, pollAttempt, maxPollAttempts, pollInterval = 15, operationUrl } = pollingData
  
  try {
    const statusUrl = operationUrl || `https://api.runpod.ai/v2/status/${operationId}`
    
    const response = await fetch(statusUrl, {
      headers: {
        'Authorization': `Bearer ${env.RUNPOD_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()
    console.log(`Polling Runpod task ${taskId}, attempt ${pollAttempt}, status: ${result.status}`)

    if (result.status === 'COMPLETED') {
      await queueService.completeTask(taskId, {
        outputUrls: result.output?.videos || result.output || [],
        cost: Math.round(3.2 * 10000),
        speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'runpod',
        status: 'success'
      })
    } else if (result.status === 'FAILED') {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'runpod', status: 'error',
        error: result.error || 'Runpod job failed'
      })
    } else if (pollAttempt >= maxPollAttempts) {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'runpod', status: 'error',
        error: `Runpod timeout after ${maxPollAttempts} attempts`
      })
    } else {
      await createPollingMessage(
        env.ASYNC_QUEUE, taskId, userId, usageId,
        'runpod', operationId, pollAttempt + 1, maxPollAttempts, pollInterval,
        operationUrl
      )
      
      const progressPercent = Math.min(90, 10 + (pollAttempt * 2))
      await queueService.updateTaskProgress(taskId, { taskProgress: progressPercent })
    }
  } catch (error) {
    console.error(`Runpod polling error:`, error)
    if (pollAttempt < maxPollAttempts) {
      await createPollingMessage(
        env.ASYNC_QUEUE, taskId, userId, usageId,
        'runpod', operationId, pollAttempt + 1, maxPollAttempts, pollInterval,
        operationUrl
      )
    } else {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'runpod', status: 'error',
        error: `Runpod polling failed: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }
}

/**
 * Poll Fal.ai operation status
 */
async function pollFalOperation(
  message: QueueMessage,
  env: CloudflareBindings,
  queueService: QueueService
): Promise<void> {
  const { taskId, userId, usageId, pollingData } = message
  if (!pollingData) throw new Error('No polling data')

  const { operationId, pollAttempt, maxPollAttempts, pollInterval = 5 } = pollingData
  
  try {
    const response = await fetch(`https://fal.run/fal-ai/fast-svd/requests/${operationId}/status`, {
      headers: {
        'Authorization': `Key ${env.FAL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()
    console.log(`Polling Fal task ${taskId}, attempt ${pollAttempt}, status: ${result.status}`)

    if (result.status === 'COMPLETED') {
      await queueService.completeTask(taskId, {
        outputUrls: result.video ? [result.video.url] : [],
        cost: Math.round(3.2 * 10000),
        speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'fal',
        status: 'success'
      })
    } else if (result.status === 'FAILED') {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'fal', status: 'error',
        error: result.error || 'Fal.ai job failed'
      })
    } else if (pollAttempt >= maxPollAttempts) {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'fal', status: 'error',
        error: `Fal.ai timeout after ${maxPollAttempts} attempts`
      })
    } else {
      await createPollingMessage(
        env.ASYNC_QUEUE, taskId, userId, usageId,
        'fal', operationId, pollAttempt + 1, maxPollAttempts, pollInterval
      )
      
      const progressPercent = Math.min(90, 10 + (pollAttempt * 2))
      await queueService.updateTaskProgress(taskId, { taskProgress: progressPercent })
    }
  } catch (error) {
    console.error(`Fal polling error:`, error)
    if (pollAttempt < maxPollAttempts) {
      await createPollingMessage(
        env.ASYNC_QUEUE, taskId, userId, usageId,
        'fal', operationId, pollAttempt + 1, maxPollAttempts, pollInterval
      )
    } else {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'fal', status: 'error',
        error: `Fal polling failed: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }
}

/**
 * Poll Luma operation status
 */
async function pollLumaOperation(
  message: QueueMessage,
  env: CloudflareBindings,
  queueService: QueueService
): Promise<void> {
  const { taskId, userId, usageId, pollingData } = message
  if (!pollingData) throw new Error('No polling data')

  const { operationId, pollAttempt, maxPollAttempts, pollInterval = 20 } = pollingData
  
  try {
    const response = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${operationId}`, {
      headers: {
        'Authorization': `Bearer ${env.LUMA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()
    console.log(`Polling Luma task ${taskId}, attempt ${pollAttempt}, state: ${result.state}`)

    if (result.state === 'completed') {
      await queueService.completeTask(taskId, {
        outputUrls: result.video ? [result.video.url] : [],
        cost: Math.round(3.2 * 10000),
        speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'luma',
        status: 'success'
      })
    } else if (result.state === 'failed') {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'luma', status: 'error',
        error: result.failure_reason || 'Luma generation failed'
      })
    } else if (pollAttempt >= maxPollAttempts) {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'luma', status: 'error',
        error: `Luma timeout after ${maxPollAttempts} attempts`
      })
    } else {
      await createPollingMessage(
        env.ASYNC_QUEUE, taskId, userId, usageId,
        'luma', operationId, pollAttempt + 1, maxPollAttempts, pollInterval
      )
      
      const progressPercent = Math.min(90, 10 + (pollAttempt * 2))
      await queueService.updateTaskProgress(taskId, { taskProgress: progressPercent })
    }
  } catch (error) {
    console.error(`Luma polling error:`, error)
    if (pollAttempt < maxPollAttempts) {
      await createPollingMessage(
        env.ASYNC_QUEUE, taskId, userId, usageId,
        'luma', operationId, pollAttempt + 1, maxPollAttempts, pollInterval
      )
    } else {
      await queueService.completeTask(taskId, {
        outputUrls: [], cost: 0, speedMs: Date.now() - (message.timestamp || Date.now()),
        provider: 'luma', status: 'error',
        error: `Luma polling failed: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }
}