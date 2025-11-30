/**
 * Media Routes - Unified endpoint for images and videos
 * 
 * GET /v1/media - Get user's generated images and videos
 */

import { Hono } from 'hono'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
import { ipLimiter } from '../middleware/rateLimiting'
import { apiUsage } from '../db/schema'
import { eq, and, desc, like, or, isNull } from 'drizzle-orm'

const app = new Hono()

/**
 * GET /v1/media
 * Get user's generated media (images and videos) with pagination and filtering
 */
app.get('/',
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
      const limit = Math.min(Number(c.req.query('limit')) || 20, 100) // Max 100 items
      const offset = Number(c.req.query('offset')) || 0
      const type = c.req.query('type') as 'image' | 'video' | 'all' | undefined
      const status = c.req.query('status') as 'completed' | 'failed' | 'pending' | 'processing' | undefined
      const model = c.req.query('model') // Optional model filter

      // Validate parameters
      if (type && !['image', 'video', 'all'].includes(type)) {
        return c.json({
          error: {
            message: 'Invalid type parameter. Must be one of: image, video, all',
            type: 'invalid_request'
          }
        }, 400)
      }

      if (status && !['completed', 'failed', 'pending', 'processing'].includes(status)) {
        return c.json({
          error: {
            message: 'Invalid status parameter. Must be one of: completed, failed, pending, processing',
            type: 'invalid_request'
          }
        }, 400)
      }

      const db = c.get('db')
      if (!db) {
        console.error('[Media] Database connection not available')
        throw new Error('Database connection not available')
      }

      console.log('[Media] User ID:', authenticatedUser.id)
      console.log('[Media] Filters - type:', type, 'status:', status, 'model:', model)

      

      // Build query conditions
      const conditions: any[] = [
        eq(apiUsage.userId, authenticatedUser.id)
      ]

      // Filter by type
      if (type === 'image') {
        conditions.push(
          or(
            like(apiUsage.taskId, 'img_%'),
            isNull(apiUsage.taskId)
          )
        )
      } else if (type === 'video') {
        conditions.push(like(apiUsage.taskId, 'vid_%'))
      }
      // If type === 'all' or undefined, don't filter by type

      // Filter by status
      if (status) {
        conditions.push(eq(apiUsage.taskStatus, status))
      }

      // Filter by model
      if (model) {
        conditions.push(eq(apiUsage.model, model))
      }

      console.log('[Media] Query conditions count:', conditions.length)

      // Filter out any undefined/null conditions
      const validConditions = conditions.filter(c => c !== undefined && c !== null)
      console.log('[Media] Valid conditions count:', validConditions.length)

      // Fetch media items with pagination
      let query = db
        .select({
          id: apiUsage.id,
          taskId: apiUsage.taskId,
          model: apiUsage.model,
          provider: apiUsage.provider,
          prompt: apiUsage.prompt,
          imageSize: apiUsage.imageSize,
          quality: apiUsage.quality,
          outputUrls: apiUsage.outputUrls,
          cost: apiUsage.cost,
          status: apiUsage.status,
          taskStatus: apiUsage.taskStatus,
          taskProgress: apiUsage.taskProgress,
          error: apiUsage.error,
          createdAt: apiUsage.createdAt,
          taskCompletedAt: apiUsage.taskCompletedAt,
          speedMs: apiUsage.speedMs,
        })
        .from(apiUsage)


      

      // Apply where clause only if we have valid conditions

      console.log("Error ")


      if (validConditions.length > 0) {
        query = query.where(and(...validConditions))
      }
      
      const items = await query
        .orderBy(desc(apiUsage.createdAt))
        .limit(limit)
        .offset(offset)

      

      console.log(`[Media] Fetched ${items?.length || 0} items for user ${authenticatedUser.id}`)
      console.log('[Media] Items type:', typeof items, 'Is array:', Array.isArray(items))

      // Handle case where no items are returned
      if (!items || !Array.isArray(items)) {
        console.error('[Media] Items is not an array:', items)
        return c.json({
          success: true,
          data: [],
          pagination: {
            limit,
            offset,
            count: 0,
            hasMore: false
          },
          filters: {
            type: type || 'all',
            status: status || 'all',
            model: model || null
          }
        })
      }

      // Format response - determine type from taskId if not specified in taskType
      let formattedItems
      try {
        formattedItems = items.map((item: any, index: number) => {
          try {
            const isVideo = item.taskId?.startsWith('vid_') || item.taskType === 'videoInference'
            const mediaUrls = item.outputUrls ? JSON.parse(item.outputUrls) : []

            return {
            id: item.id,
            taskId: item.taskId,
            type: isVideo ? 'video' : 'image',
            model: item.model,
            provider: item.provider,
            prompt: item.prompt,
            imageSize: item.imageSize,
            quality: item.quality,
            media: mediaUrls, // Generic name for both images and videos
            images: isVideo ? [] : mediaUrls, // For backward compatibility
            videos: isVideo ? mediaUrls : [], // For backward compatibility
            cost: (item.cost || 0) / 10000, // Convert to USD
            status: item.status,
            taskStatus: item.taskStatus,
            taskProgress: item.taskProgress || 0,
            error: item.error,
            createdAt: item.createdAt?.getTime() || Date.now(),
            completedAt: item.taskCompletedAt?.getTime() || null,
            durationMs: item.speedMs || null
          }
        } catch (itemError) {
          console.error('[Media] Error formatting item:', itemError, 'Item data:', item)
          // Return a minimal fallback object
          return {
            id: item.id || 'unknown',
            taskId: item.taskId || null,
            type: 'image',
            model: item.model || 'unknown',
            provider: item.provider || 'unknown',
            prompt: item.prompt || '',
            imageSize: item.imageSize || null,
            quality: item.quality || null,
            media: [],
            images: [],
            videos: [],
            cost: 0,
            status: item.status || 'unknown',
            taskStatus: item.taskStatus || 'unknown',
            taskProgress: 0,
            error: 'Error formatting item',
            createdAt: Date.now(),
            completedAt: null,
            durationMs: null
          }
          }
        })
      } catch (mapError) {
        console.error('[Media] Error in items.map():', mapError)
        console.error('[Media] Error stack:', mapError instanceof Error ? mapError.stack : 'No stack')
        throw new Error(`Failed to format items: ${mapError instanceof Error ? mapError.message : 'Unknown error'}`)
      }

      // Check if there are more results for pagination
      const hasMore = items.length === limit

      return c.json({
        success: true,
        data: formattedItems,
        pagination: {
          limit,
          offset,
          count: items.length,
          hasMore
        },
        filters: {
          type: type || 'all',
          status: status || 'all',
          model: model || null
        }
      })
    } catch (error) {

      

      console.error('Failed to fetch media:', error)
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })

      
      
      return c.json({
        error: {
          message: 'Failed to fetch media items',
          type: 'internal_error',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      }, 500)
    }
  }
)

export default app
