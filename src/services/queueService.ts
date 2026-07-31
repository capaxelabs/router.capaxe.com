import { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { apiUsage, NewApiUsage } from '../db/schema'
import { Database } from '../db'
import { generateTaskId } from './taskIdGenerator'

/**
 * Queue message format for async processing
 */
export interface QueueMessage {
  taskId: string
  type: 'image' | 'video' | 'video_poll'
  userId: string
  request: any
  timestamp: number
  usageId: string // Links to api_usage record

  // For video polling continuation (generic for any provider)
  pollingData?: {
    provider: 'google' | 'replicate' | 'runpod' | 'fal' | 'luma' | string
    operationId: string // Google operation name, Replicate prediction ID, etc.
    operationUrl?: string // Direct polling URL if available
    pollAttempt: number
    maxPollAttempts: number
    pollInterval?: number // Seconds between polls (default: 30)
    metadata?: Record<string, any> // Provider-specific data
  }
}

/**
 * Queue Service for handling async task management
 */
export class QueueService {
  private queue: Queue | null
  private db: Database

  constructor(db: Database, queue?: Queue | null) {
    this.db = db
    this.queue = queue || null
  }

  /**
   * Create an async task and queue it for processing
   */
  async createAsyncTask(
    type: 'image' | 'video',
    userId: string,
    request: {
      model: string
      prompt: string
      imageSize?: string
      quality?: string
      apiKeyId?: string
      ip?: string
      imageUrls?: string[]  // Changed from imagesData to imageUrls
      [key: string]: any
    },
    storageService?: any // R2StorageService instance (still needed for output processing)
  ): Promise<{ taskId: string; usageId: string }> {
    const taskId = generateTaskId(type, userId)
    const usageId = `usage_${taskId}`

    // Input images are now already uploaded to R2 by the client (shootflo)
    // We just store the URLs directly
    const inputImageUrls = request.imageUrls || []

    if (inputImageUrls.length > 0) {
      console.log(`[QueueService] Task created with ${inputImageUrls.length} reference image URLs`)
    }

    // Store metadata including input image URLs
    const { truncateDeep } = await import('../lib/logSanitizer')
    const { apiKeyId: _apiKeyId, ip: _ip, ...requestForLog } = request
    const metadata: any = {
      inputImageUrls: inputImageUrls.length > 0 ? inputImageUrls : undefined,
      originalRequest: {
        size: request.imageSize,
        quality: request.quality,
        n: request.n,
        duration: request.duration,
        resolution: request.resolution
      },
      // Full request copy for auditing (long strings truncated)
      request: truncateDeep(requestForLog)
    }

    // Create initial record in api_usage table
    const newUsage: NewApiUsage = {
      id: usageId,
      model: request.model,
      provider: 'pending', // Will be updated when processing starts
      prompt: request.prompt,
      cost: 0, // Will be updated when completed
      speedMs: 0, // Will be calculated when completed
      imageSize: request.imageSize || '1024x1024',
      quality: request.quality as any || 'auto',
      status: 'pending',
      outputUrls: '[]',
      userId,
      apiKeyId: request.apiKeyId,
      ip: request.ip,
      metadata: JSON.stringify(metadata), // Store input image URLs and other metadata

      // Async-specific fields
      taskId,
      taskType: type === 'image' ? 'imageInference' : 'videoInference',
      taskStatus: 'pending',
      taskProgress: 0,
      isAsync: true,
    }

    await this.db.insert(apiUsage).values(newUsage)

    // Queue ONLY the task ID (minimal payload to avoid size limits)
    const queueMessage: QueueMessage = {
      taskId,
      type,
      userId,
      request: {}, // Empty - will be fetched from database
      timestamp: Date.now(),
      usageId
    }

    if (!this.queue) {
      throw new Error('Queue not available - QueueService was initialized without a queue')
    }
    await this.queue.send(queueMessage)

    console.log(`[QueueService] Created task ${taskId}, uploaded ${inputImageUrls.length} source images, queued for processing`)

    return { taskId, usageId }
  }

  /**
   * Update task progress in database
   */
  async updateTaskProgress(
    taskId: string,
    updates: {
      taskStatus?: 'pending' | 'processing' | 'completed' | 'failed'
      taskProgress?: number
      provider?: string
      error?: string
      taskStartedAt?: Date | string | number
      taskCompletedAt?: Date | string | number
    }
  ): Promise<void> {
    const updateData: any = {}

    if (updates.taskStatus) updateData.taskStatus = updates.taskStatus
    if (updates.taskProgress !== undefined) updateData.taskProgress = updates.taskProgress
    if (updates.provider) updateData.provider = updates.provider
    if (updates.error) updateData.error = updates.error
    if (updates.taskStartedAt) {
      let date: Date
      if (updates.taskStartedAt instanceof Date) {
        date = updates.taskStartedAt
      } else if (typeof updates.taskStartedAt === 'number') {
        date = new Date(updates.taskStartedAt)
      } else {
        date = new Date(updates.taskStartedAt)
      }
      updateData.taskStartedAt = date
    }
    if (updates.taskCompletedAt) {
      let date: Date
      if (updates.taskCompletedAt instanceof Date) {
        date = updates.taskCompletedAt
      } else if (typeof updates.taskCompletedAt === 'number') {
        date = new Date(updates.taskCompletedAt)
      } else {
        date = new Date(updates.taskCompletedAt)
      }
      updateData.taskCompletedAt = date
    }

    await this.db
      .update(apiUsage)
      .set(updateData)
      .where(eq(apiUsage.taskId, taskId))

    console.log(`Updated task ${taskId}:`, updateData)
  }

  /**
   * Complete task with final results
   */
  async completeTask(
    taskId: string,
    result: {
      outputUrls: string[]
      cost: number
      speedMs: number
      provider: string
      status: 'success' | 'error'
      error?: string
    }
  ): Promise<void> {
    await this.db
      .update(apiUsage)
      .set({
        taskStatus: result.status === 'success' ? 'completed' : 'failed',
        taskProgress: result.status === 'success' ? 100 : 0,
        taskCompletedAt: new Date(),
        outputUrls: JSON.stringify(result.outputUrls),
        cost: result.cost,
        speedMs: result.speedMs,
        provider: result.provider,
        status: result.status === 'success' ? 'completed' : 'failed',
        error: result.error || null
      })
      .where(eq(apiUsage.taskId, taskId))

    console.log(`Completed task ${taskId}: ${result.status}`)
  }

  /**
   * Get task status by taskId
   */
  async getTaskStatus(taskId: string): Promise<TaskStatusResponse | null> {
    const result = await this.db
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.taskId, taskId))
      .limit(1)

    const record = result[0]
    if (!record) return null

    const outputUrls = record.outputUrls ? JSON.parse(record.outputUrls) : []

    const response: TaskStatusResponse = {
      taskId: record.taskId!,
      type: record.taskId!.startsWith('img_') ? 'image' : 'video',
      status: record.taskStatus as any,
      progress: record.taskProgress || 0,
      createdAt: record.createdAt.getTime(),
      updatedAt: record.createdAt.getTime(), // No updatedAt field in schema

      // Request details
      model: record.model,
      prompt: record.prompt,
      imageSize: record.imageSize,
      quality: record.quality || undefined,
    }

    // Add timestamps if available
    if (record.taskStartedAt) {
      response.startedAt = record.taskStartedAt.getTime()
    }
    if (record.taskCompletedAt) {
      response.completedAt = record.taskCompletedAt.getTime()
    }

    // Add results if completed
    if (record.taskStatus === 'completed' && outputUrls.length > 0) {
      response.result = {
        created: Math.floor(record.createdAt.getTime() / 1000),
        data: outputUrls.map((url: string) => ({ url })),
        cost: record.cost / 10000 // Convert back to USD
      }
    }

    // Add error if failed
    if (record.error) {
      response.error = record.error
    }

    // Calculate estimated time remaining
    if (record.taskStatus === 'processing') {
      response.estimatedTimeRemaining = this.calculateEstimatedTime(record)
    }

    return response
  }

  /**
   * Get user's async tasks with pagination
   */
  async getUserTasks(
    userId: string,
    options: {
      limit?: number
      offset?: number
      status?: 'pending' | 'processing' | 'completed' | 'failed'
    } = {}
  ): Promise<TaskStatusResponse[]> {
    const { limit = 10, offset = 0, status } = options

    let query = this.db
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.userId, userId))
      .where(eq(apiUsage.isAsync, true))

    if (status) {
      query = query.where(eq(apiUsage.taskStatus, status))
    }

    const results = await query
      .orderBy(apiUsage.createdAt) // Newest first
      .limit(limit)
      .offset(offset)

    const tasks: TaskStatusResponse[] = []
    for (const record of results) {
      if (record.taskId) {
        const taskStatus = await this.getTaskStatus(record.taskId)
        if (taskStatus) {
          tasks.push(taskStatus)
        }
      }
    }

    return tasks
  }

  /**
   * Calculate estimated time remaining for processing tasks
   */
  private calculateEstimatedTime(record: any): number | undefined {
    const now = Date.now()
    const started = record.taskStartedAt ? record.taskStartedAt.getTime() : record.createdAt.getTime()
    const elapsed = now - started

    // Typical generation times
    const isImage = record.taskId?.startsWith('img_')
    const estimatedTotal = isImage ? 15000 : 60000 // 15s for images, 60s for videos

    const progress = record.taskProgress || 0
    if (progress > 0) {
      const estimatedRemaining = (elapsed / progress) * (100 - progress)
      return Math.max(0, Math.min(estimatedRemaining, estimatedTotal - elapsed))
    }

    return Math.max(0, estimatedTotal - elapsed)
  }
}

/**
 * Task status response interface
 */
export interface TaskStatusResponse {
  taskId: string
  type: 'image' | 'video'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number // 0-100
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number

  // Request details
  model: string
  prompt: string
  imageSize: string
  quality?: string

  // Results (only if completed)
  result?: {
    created: number
    data: Array<{ url: string }>
    cost: number
  }

  // Error (only if failed)
  error?: string

  // Time estimation
  estimatedTimeRemaining?: number
}

/**
 * Factory function to create QueueService
 */
export function createQueueService(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>
): QueueService {
  const db = c.get('db') as Database

  if (!db) {
    throw new Error('Database not available - ensure database connection is configured')
  }

  const queue = c.env.ASYNC_QUEUE
  if (!queue) {
    console.error('[QueueService] ASYNC_QUEUE binding not found in environment')
    console.error('[QueueService] Available env keys:', Object.keys(c.env))
    throw new Error('ASYNC_QUEUE binding not configured in wrangler.jsonc. Please add the queue binding to enable task processing.')
  }

  return new QueueService(db, queue)
}

/**
 * Create a polling message for continued operation checking (any provider)
 */
export async function createPollingMessage(
  queue: Queue,
  taskId: string,
  userId: string,
  usageId: string,
  provider: string,
  operationId: string,
  pollAttempt: number = 1,
  maxPollAttempts: number = 40,
  pollInterval: number = 30, // seconds
  operationUrl?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const pollingMessage: QueueMessage = {
    taskId,
    type: 'video_poll',
    userId,
    request: {},
    timestamp: Date.now(),
    usageId,
    pollingData: {
      provider,
      operationId,
      operationUrl,
      pollAttempt,
      maxPollAttempts,
      pollInterval,
      metadata
    }
  }

  // Delay the message by the specified poll interval
  await queue.send(pollingMessage, {
    delaySeconds: pollInterval
  })

  console.log(`Created ${provider} polling message for task ${taskId}, attempt ${pollAttempt}/${maxPollAttempts}`)
}