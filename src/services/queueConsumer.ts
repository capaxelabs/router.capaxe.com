/**
 * Queue Consumer for processing async image/video generation tasks
 * This runs as a separate worker invocation when messages arrive in the queue
 */

import { createDatabase, Database } from '../db'
import { CloudflareBindings } from '../types/env'
import { QueueMessage, QueueService } from './queueService'

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

    const errorMessage = error instanceof Error ? error.message : String(error)

    // Mark task as failed
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
    provider: 'workers-ai'
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
    provider: 'workers-ai'
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

