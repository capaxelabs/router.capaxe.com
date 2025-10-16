import { Hono } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
import { ipLimiter } from '../middleware/rateLimiting'
import { createQueueService } from '../services/queueService'
import { isValidTaskId } from '../services/taskIdGenerator'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

/**
 * GET /v1/tasks/:taskId
 * Get status of a specific async task
 */
app.get('/:taskId', 
  ipLimiter,
  validateApiKey,
  async (c) => {
    try {
      const taskId = c.req.param('taskId')
      const authenticatedUser = c.get('authenticatedUser')

      // Validate task ID format
      if (!isValidTaskId(taskId)) {
        return c.json({
          error: {
            message: 'Invalid task ID format',
            type: 'invalid_request'
          }
        }, 400)
      }

      const queueService = createQueueService(c)
      const taskStatus = await queueService.getTaskStatus(taskId)

      if (!taskStatus) {
        return c.json({
          error: {
            message: 'Task not found',
            type: 'not_found'
          }
        }, 404)
      }

      // Check if user has access to this task (basic security)
      // In a production system, you'd want more robust access control
      if (authenticatedUser && taskStatus.taskId) {
        // For now, we'll allow access if user is authenticated
        // You could add user ownership checks here
      }

      return c.json(taskStatus)

    } catch (error) {
      console.error('Task status error:', error)
      return c.json({
        error: {
          message: 'Failed to get task status',
          type: 'internal_error'
        }
      }, 500)
    }
  }
)

/**
 * GET /v1/tasks/user/list
 * Get user's async tasks with pagination and filtering
 */
app.get('/user/list',
  ipLimiter, 
  validateApiKey,
  async (c) => {
    try {
      const authenticatedUser = c.get('authenticatedUser')
      if (!authenticatedUser) {
        return c.json({
          error: {
            message: 'Authentication required',
            type: 'unauthorized'
          }
        }, 401)
      }

      // Parse query parameters
      const limit = Math.min(Number(c.req.query('limit')) || 10, 50) // Max 50 items
      const offset = Number(c.req.query('offset')) || 0
      const status = c.req.query('status') as 'pending' | 'processing' | 'completed' | 'failed' | undefined

      // Validate status parameter
      if (status && !['pending', 'processing', 'completed', 'failed'].includes(status)) {
        return c.json({
          error: {
            message: 'Invalid status parameter. Must be one of: pending, processing, completed, failed',
            type: 'invalid_request'
          }
        }, 400)
      }

      const queueService = createQueueService(c)
      const tasks = await queueService.getUserTasks(authenticatedUser.id, {
        limit,
        offset,
        status
      })

      return c.json({
        data: tasks,
        pagination: {
          limit,
          offset,
          count: tasks.length,
          hasMore: tasks.length === limit // Simple hasMore logic
        }
      })

    } catch (error) {
      console.error('User tasks error:', error)
      return c.json({
        error: {
          message: 'Failed to get user tasks',
          type: 'internal_error'
        }
      }, 500)
    }
  }
)

/**
 * GET /v1/tasks/stats
 * Get overall task statistics for the user
 */
app.get('/stats',
  ipLimiter,
  validateApiKey,
  async (c) => {
    try {
      const authenticatedUser = c.get('authenticatedUser')
      if (!authenticatedUser) {
        return c.json({
          error: {
            message: 'Authentication required', 
            type: 'unauthorized'
          }
        }, 401)
      }

      const queueService = createQueueService(c)

      // Get counts for each status
      const pendingTasks = await queueService.getUserTasks(authenticatedUser.id, { 
        status: 'pending', limit: 1000 
      })
      const processingTasks = await queueService.getUserTasks(authenticatedUser.id, { 
        status: 'processing', limit: 1000 
      })
      const completedTasks = await queueService.getUserTasks(authenticatedUser.id, { 
        status: 'completed', limit: 1000 
      })
      const failedTasks = await queueService.getUserTasks(authenticatedUser.id, { 
        status: 'failed', limit: 1000 
      })

      const stats = {
        pending: pendingTasks.length,
        processing: processingTasks.length,
        completed: completedTasks.length,
        failed: failedTasks.length,
        total: pendingTasks.length + processingTasks.length + completedTasks.length + failedTasks.length
      }

      return c.json(stats)

    } catch (error) {
      console.error('Task stats error:', error)
      return c.json({
        error: {
          message: 'Failed to get task statistics',
          type: 'internal_error'
        }
      }, 500)
    }
  }
)

/**
 * DELETE /v1/tasks/:taskId
 * Cancel a pending or processing task (if possible)
 */
app.delete('/:taskId',
  ipLimiter,
  validateApiKey,
  async (c) => {
    try {
      const taskId = c.req.param('taskId')
      const authenticatedUser = c.get('authenticatedUser')

      if (!isValidTaskId(taskId)) {
        return c.json({
          error: {
            message: 'Invalid task ID format',
            type: 'invalid_request'
          }
        }, 400)
      }

      const queueService = createQueueService(c)
      const taskStatus = await queueService.getTaskStatus(taskId)

      if (!taskStatus) {
        return c.json({
          error: {
            message: 'Task not found',
            type: 'not_found'
          }
        }, 404)
      }

      // Check if task can be cancelled
      if (taskStatus.status === 'completed' || taskStatus.status === 'failed') {
        return c.json({
          error: {
            message: `Cannot cancel task with status: ${taskStatus.status}`,
            type: 'invalid_request'
          }
        }, 400)
      }

      // Mark task as failed (cancelled)
      await queueService.updateTaskProgress(taskId, {
        taskStatus: 'failed',
        taskProgress: 0,
        error: 'Task cancelled by user',
        taskCompletedAt: new Date()
      })

      return c.json({
        message: 'Task cancelled successfully',
        taskId
      })

    } catch (error) {
      console.error('Task cancellation error:', error)
      return c.json({
        error: {
          message: 'Failed to cancel task',
          type: 'internal_error'
        }
      }, 500)
    }
  }
)

export default app