import { eq, and } from 'drizzle-orm'
import { Database } from '../db'
import { apiUsage, NewApiUsage } from '../db/schema'
import { generateTaskId, isValidTaskId, getTaskType } from './taskIdGenerator'

/**
 * Database service for async task management
 * Uses existing api_usage table with additional async fields
 */
export class AsyncTaskDatabase {
  constructor(private db: Database) {}

  /**
   * Create initial async task record in database
   * This creates the api_usage record with task status = 'pending'
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
    }
  ): Promise<string> {
    const taskId = generateTaskId(type, userId)

    // Create initial record in api_usage table
    const newUsage: NewApiUsage = {
      id: `usage_${taskId}`, // Link usage ID to task ID
      model: request.model,
      provider: 'pending', // Will be updated when processing starts
      prompt: request.prompt,
      cost: 0, // Will be updated when completed
      speedMs: 0, // Will be calculated when completed
      imageSize: request.imageSize || '1024x1024',
      quality: request.quality as any || 'auto',
      status: 'pending', // Initial status
      outputUrls: '[]', // Empty array initially
      userId,
      apiKeyId: request.apiKeyId,
      ip: request.ip,
      
      // Async-specific fields (if extending schema):
      taskId,
      taskStatus: 'pending',
      taskProgress: 0,
      isAsync: true,
      taskStartedAt: null,
      taskCompletedAt: null,
    }

    await this.db.insert(apiUsage).values(newUsage)
    
    return taskId
  }

  /**
   * Update task progress and status
   */
  async updateTaskProgress(
    taskId: string,
    updates: {
      taskStatus?: 'pending' | 'processing' | 'completed' | 'failed'
      taskProgress?: number
      provider?: string
      error?: string
      taskStartedAt?: Date
      taskCompletedAt?: Date
    }
  ): Promise<void> {
    if (!isValidTaskId(taskId)) {
      throw new Error(`Invalid task ID: ${taskId}`)
    }

    const updateData: any = {}

    if (updates.taskStatus) updateData.taskStatus = updates.taskStatus
    if (updates.taskProgress !== undefined) updateData.taskProgress = updates.taskProgress
    if (updates.provider) updateData.provider = updates.provider
    if (updates.error) updateData.error = updates.error
    if (updates.taskStartedAt) updateData.taskStartedAt = Math.floor(updates.taskStartedAt.getTime() / 1000)
    if (updates.taskCompletedAt) updateData.taskCompletedAt = Math.floor(updates.taskCompletedAt.getTime() / 1000)

    await this.db
      .update(apiUsage)
      .set(updateData)
      .where(eq(apiUsage.taskId, taskId))
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
    if (!isValidTaskId(taskId)) {
      throw new Error(`Invalid task ID: ${taskId}`)
    }

    await this.db
      .update(apiUsage)
      .set({
        taskStatus: result.status === 'success' ? 'completed' : 'failed',
        taskProgress: result.status === 'success' ? 100 : 0,
        taskCompletedAt: Math.floor(Date.now() / 1000),
        outputUrls: JSON.stringify(result.outputUrls),
        cost: result.cost,
        speedMs: result.speedMs,
        provider: result.provider,
        status: result.status === 'success' ? 'completed' : 'failed',
        error: result.error || null
      })
      .where(eq(apiUsage.taskId, taskId))
  }

  /**
   * Get task status and details
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus | null> {
    if (!isValidTaskId(taskId)) {
      return null
    }

    const result = await this.db
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.taskId, taskId))
      .limit(1)

    const record = result[0]
    if (!record) return null

    const outputUrls = record.outputUrls ? JSON.parse(record.outputUrls) : []
    
    return {
      taskId: record.taskId!,
      type: getTaskType(taskId)!,
      status: record.taskStatus as any || 'pending',
      progress: record.taskProgress || 0,
      createdAt: record.createdAt.getTime(),
      updatedAt: record.updatedAt?.getTime() || record.createdAt.getTime(),
      startedAt: record.taskStartedAt ? record.taskStartedAt * 1000 : undefined,
      completedAt: record.taskCompletedAt ? record.taskCompletedAt * 1000 : undefined,
      
      // Request details
      model: record.model,
      prompt: record.prompt,
      imageSize: record.imageSize,
      quality: record.quality,
      
      // Results (if completed)
      result: record.taskStatus === 'completed' ? {
        created: Math.floor(record.createdAt.getTime() / 1000),
        data: outputUrls.map((url: string) => ({ url })),
        cost: record.cost / 10000 // Convert back to USD
      } : undefined,
      
      // Error (if failed)
      error: record.error || undefined,
      
      // Estimated time remaining
      estimatedTimeRemaining: this.calculateEstimatedTime(record)
    }
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
      type?: 'image' | 'video'
    } = {}
  ): Promise<TaskStatus[]> {
    const { limit = 10, offset = 0, status, type } = options

    let query = this.db
      .select()
      .from(apiUsage)
      .where(
        and(
          eq(apiUsage.userId, userId),
          eq(apiUsage.isAsync, true)
        )
      )

    // Add filters
    if (status) {
      query = query.where(eq(apiUsage.taskStatus, status))
    }

    // For type filter, we'd need to parse taskId or add type column
    
    const results = await query
      .orderBy(apiUsage.createdAt) // Newest first
      .limit(limit)
      .offset(offset)

    const tasks: TaskStatus[] = []
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
   * Calculate estimated time remaining
   */
  private calculateEstimatedTime(record: any): number | undefined {
    if (record.taskStatus !== 'processing') return undefined
    
    const now = Date.now()
    const started = record.taskStartedAt ? record.taskStartedAt * 1000 : record.createdAt.getTime()
    const elapsed = now - started
    
    // Typical generation times
    const taskType = getTaskType(record.taskId!)
    const estimatedTotal = taskType === 'image' ? 15000 : 60000 // 15s for images, 60s for videos
    
    const progress = record.taskProgress || 0
    if (progress > 0) {
      const estimatedRemaining = (elapsed / progress) * (100 - progress)
      return Math.max(0, Math.min(estimatedRemaining, estimatedTotal - elapsed))
    }
    
    return Math.max(0, estimatedTotal - elapsed)
  }
}

/**
 * Task status interface for API responses
 */
export interface TaskStatus {
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
 * Factory function to create AsyncTaskDatabase
 */
export function createAsyncTaskDatabase(db: Database): AsyncTaskDatabase {
  return new AsyncTaskDatabase(db)
}