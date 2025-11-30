/**
 * Cloudflare Queue-based async processing
 * Uses Cloudflare Queues to handle background tasks
 */

import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'

export interface QueueMessage {
  taskId: string
  type: 'image' | 'video'
  userId: string
  request: any
  timestamp: number
}

/**
 * Queue a task for background processing
 */
export async function queueAsyncTask(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  taskId: string,
  type: 'image' | 'video',
  userId: string,
  request: any
): Promise<void> {
  const message: QueueMessage = {
    taskId,
    type,
    userId,
    request,
    timestamp: Date.now()
  }

  // Send to Cloudflare Queue (if configured)
  if (c.env.ASYNC_QUEUE) {
    await c.env.ASYNC_QUEUE.send(message)
  } else {
    console.error('ASYNC_QUEUE not configured - queue service is required for all operations')
    throw new Error('Queue service unavailable: ASYNC_QUEUE binding not configured')
  }
}

/**
 * Queue consumer function (runs in separate worker)
 * This function is called by Cloudflare when a message is available in the queue
 */
export async function consumeQueueMessage(
  batch: MessageBatch<QueueMessage>,
  env: CloudflareBindings
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processQueuedTask(message.body, env)
      message.ack() // Acknowledge successful processing
    } catch (error) {
      console.error('Failed to process queued task:', error)
      message.retry() // Retry the message
    }
  }
}

/**
 * Process a single queued task
 */
async function processQueuedTask(
  taskData: QueueMessage,
  env: CloudflareBindings
): Promise<void> {
  try {
    // Update task status to processing
    await updateTaskInDatabase(env, taskData.taskId, 'processing', 10)
    
    // Process based on type
    let result: any
    if (taskData.type === 'image') {
      result = await processImageTask(taskData, env)
    } else {
      result = await processVideoTask(taskData, env)
    }
    
    // Update task to completed
    await updateTaskInDatabase(env, taskData.taskId, 'completed', 100, result)
    
  } catch (error) {
    console.error(`Queued task ${taskData.taskId} failed:`, error)
    await updateTaskInDatabase(env, taskData.taskId, 'failed', 0, null, error)
  }
}

async function processImageTask(taskData: QueueMessage, env: CloudflareBindings): Promise<any> {
  // Import generation service
  const { generateImage } = await import('./imageService')
  
  // Create mock context for the generation service
  const mockContext = {
    env,
    get: () => null,
    set: () => {},
  } as any
  
  await updateTaskInDatabase(env, taskData.taskId, 'processing', 30)
  
  const result = await generateImage(mockContext, taskData.request, taskData.userId)
  
  await updateTaskInDatabase(env, taskData.taskId, 'processing', 80)
  
  return result
}

async function processVideoTask(taskData: QueueMessage, env: CloudflareBindings): Promise<any> {
  // Similar implementation for video
  const { generateVideo } = await import('./videoService')
  
  const mockContext = {
    env,
    get: () => {},
    set: () => {},
  } as any
  
  await updateTaskInDatabase(env, taskData.taskId, 'processing', 30)
  const result = await generateVideo(mockContext, taskData.request, taskData.userId)
  await updateTaskInDatabase(env, taskData.taskId, 'processing', 80)
  
  return result
}

async function updateTaskInDatabase(
  env: CloudflareBindings,
  taskId: string,
  status: string,
  progress: number,
  result?: any,
  error?: any
): Promise<void> {
  try {
    // Create database connection
    const { createDatabase } = await import('../db')
    const { apiUsage } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = createDatabase({
      TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN
    })

    const updateData: any = {
      taskStatus: status,
      taskProgress: progress,
      updatedAt: new Date()
    }

    if (status === 'processing' && progress === 10) {
      updateData.taskStartedAt = Math.floor(Date.now() / 1000)
    }

    if (status === 'completed') {
      updateData.taskCompletedAt = Math.floor(Date.now() / 1000)
      updateData.status = 'completed'
      
      if (result) {
        updateData.outputUrls = JSON.stringify(
          result.data?.map((item: any) => item.url || item.b64_json) || []
        )
        updateData.cost = Math.round((result.cost || 0) * 10000) // Convert to 1e-4 USD units
        updateData.speedMs = result.latency || 0
      }
    }

    if (status === 'failed') {
      updateData.taskCompletedAt = Math.floor(Date.now() / 1000)
      updateData.status = 'failed'
      updateData.error = error instanceof Error ? error.message : String(error)
    }

    await db
      .update(apiUsage)
      .set(updateData)
      .where(eq(apiUsage.taskId, taskId))

    console.log(`Updated task ${taskId}: ${status} (${progress}%)`)
    
  } catch (updateError) {
    console.error('Failed to update task in database:', updateError)
    throw updateError
  }
}