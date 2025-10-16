import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface TaskData {
  id: string
  status: TaskStatus
  type: 'image' | 'video'
  createdAt: number
  updatedAt: number
  userId: string
  request: any
  result?: any
  error?: string
  progress?: number
}

export interface TaskResponse {
  taskId: string
  status: TaskStatus
  type: 'image' | 'video'
  createdAt: number
  updatedAt: number
  progress?: number
  result?: any
  error?: string
  estimatedTimeRemaining?: number
}

/**
 * Task Manager for handling async image and video generation
 * Uses KV storage for task persistence in Cloudflare Workers
 */
export class TaskManager {
  private kv: KVNamespace | null
  private memoryStore: Map<string, TaskData>

  constructor(kv?: KVNamespace) {
    this.kv = kv || null
    this.memoryStore = new Map()
  }

  /**
   * Generate a unique task ID
   */
  generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Create a new task
   */
  async createTask(
    type: 'image' | 'video',
    userId: string,
    request: any
  ): Promise<string> {
    const taskId = this.generateTaskId()
    const now = Date.now()

    const taskData: TaskData = {
      id: taskId,
      status: 'pending',
      type,
      createdAt: now,
      updatedAt: now,
      userId,
      request,
      progress: 0
    }

    await this.storeTask(taskData)
    return taskId
  }

  /**
   * Update task status and data
   */
  async updateTask(
    taskId: string,
    updates: Partial<Omit<TaskData, 'id' | 'createdAt'>>
  ): Promise<void> {
    const existingTask = await this.getTask(taskId)
    if (!existingTask) {
      throw new Error(`Task ${taskId} not found`)
    }

    const updatedTask: TaskData = {
      ...existingTask,
      ...updates,
      updatedAt: Date.now()
    }

    await this.storeTask(updatedTask)
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<TaskData | null> {
    // Try KV storage first
    if (this.kv) {
      try {
        const stored = await this.kv.get(`task:${taskId}`)
        if (stored) {
          return JSON.parse(stored) as TaskData
        }
      } catch (error) {
        console.warn('KV storage error, falling back to memory:', error)
      }
    }

    // Fallback to memory storage
    return this.memoryStore.get(taskId) || null
  }

  /**
   * Store task data
   */
  private async storeTask(task: TaskData): Promise<void> {
    // Store in KV if available
    if (this.kv) {
      try {
        // Store with 24 hour expiration
        await this.kv.put(`task:${task.id}`, JSON.stringify(task), {
          expirationTtl: 24 * 60 * 60 // 24 hours
        })
      } catch (error) {
        console.warn('KV storage error, using memory store:', error)
        this.memoryStore.set(task.id, task)
      }
    } else {
      // Fallback to memory storage
      this.memoryStore.set(task.id, task)
    }
  }

  /**
   * Get public task response (filtered data)
   */
  async getTaskStatus(taskId: string): Promise<TaskResponse | null> {
    const task = await this.getTask(taskId)
    if (!task) {
      return null
    }

    const response: TaskResponse = {
      taskId: task.id,
      status: task.status,
      type: task.type,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      progress: task.progress
    }

    if (task.result) {
      response.result = task.result
    }

    if (task.error) {
      response.error = task.error
    }

    // Estimate time remaining based on typical generation times
    if (task.status === 'processing' && task.progress) {
      const elapsed = Date.now() - task.createdAt
      const estimated = task.type === 'image' ? 15000 : 60000 // 15s for images, 60s for videos
      const remaining = Math.max(0, estimated - elapsed)
      if (remaining > 0) {
        response.estimatedTimeRemaining = remaining
      }
    }

    return response
  }

  /**
   * List tasks for a user (with pagination)
   */
  async getUserTasks(
    userId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<TaskResponse[]> {
    // This is simplified for memory store - in production with KV,
    // you'd want to use list operations or a secondary index
    const allTasks: TaskData[] = []

    if (this.kv) {
      // In a real implementation, you'd maintain an index of user tasks
      // For now, this is a simplified version
      console.warn('KV list operations not implemented in this demo')
    }

    // Memory store implementation
    for (const task of this.memoryStore.values()) {
      if (task.userId === userId) {
        allTasks.push(task)
      }
    }

    // Sort by creation date (newest first)
    allTasks.sort((a, b) => b.createdAt - a.createdAt)

    // Apply pagination
    const paginatedTasks = allTasks.slice(offset, offset + limit)

    // Convert to public responses
    const responses: TaskResponse[] = []
    for (const task of paginatedTasks) {
      const response = await this.getTaskStatus(task.id)
      if (response) {
        responses.push(response)
      }
    }

    return responses
  }

  /**
   * Clean up expired tasks (for memory store)
   */
  cleanupExpiredTasks(): void {
    const now = Date.now()
    const expirationTime = 24 * 60 * 60 * 1000 // 24 hours

    for (const [taskId, task] of this.memoryStore.entries()) {
      if (now - task.createdAt > expirationTime) {
        this.memoryStore.delete(taskId)
      }
    }
  }
}

/**
 * Factory function to create TaskManager instance
 */
export function createTaskManager(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>
): TaskManager {
  // Use RATE_LIMIT_REDIS KV namespace for task storage if available
  const kv = c.env.RATE_LIMIT_REDIS
  return new TaskManager(kv)
}

/**
 * Background task processor function
 * This runs the actual generation and updates the task status
 */
export async function processTask(
  taskManager: TaskManager,
  taskId: string,
  processor: () => Promise<any>
): Promise<void> {
  try {
    // Update to processing status
    await taskManager.updateTask(taskId, {
      status: 'processing',
      progress: 10
    })

    // Run the actual generation
    const result = await processor()

    // Update to completed status
    await taskManager.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      result
    })

  } catch (error) {
    console.error(`Task ${taskId} failed:`, error)
    
    // Update to failed status
    await taskManager.updateTask(taskId, {
      status: 'failed',
      progress: 0,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}