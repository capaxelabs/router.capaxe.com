/**
 * Queue Consumer for processing async image/video generation tasks
 * This runs as a separate worker invocation when messages arrive in the queue
 */

import { createDatabase } from '../db'
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
      taskStartedAt: new Date()
    })

    // Process based on task type
    let result: any
    const startTime = Date.now()

    if (type === 'image') {
      result = await processImageTask(request, userId, env, queueService, taskId)
    } else if (type === 'video') {
      result = await processVideoTask(request, userId, env, queueService, taskId)
    } else {
      throw new Error(`Unknown task type: ${type}`)
    }

    const processingTime = Date.now() - startTime

    // Complete the task
    await queueService.completeTask(taskId, {
      outputUrls: result.data?.map((item: any) => item.url || item.b64_json) || [],
      cost: Math.round((result.cost || 0) * 10000), // Convert to 1e-4 USD units
      speedMs: processingTime,
      provider: result.provider || 'unknown',
      status: 'success'
    })

  } catch (error) {
    console.error(`Task ${taskId} processing failed:`, error)
    
    // Mark task as failed
    await queueService.completeTask(taskId, {
      outputUrls: [],
      cost: 0,
      speedMs: Date.now() - new Date().getTime(),
      provider: 'unknown',
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
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
  const { generateVideo } = await import('./videoService')
  
  // Create mock context for the generation service
  const mockContext = {
    env,
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