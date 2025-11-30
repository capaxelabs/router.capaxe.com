import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { ipLimiter } from '../middleware/rateLimiting'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
import { VideoGenerationRequest, validateVideoRequest } from '../lib/validation'
import { createQueueService } from '../services/queueService'
import { getModelService } from '../services/modelService'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

/**
 * POST /v1/videos/generations
 * Generate videos using async queue (Google & Runware models)
 * Always returns immediately with task ID for status polling
 */
app.post('/generations',
  ipLimiter,
  validateApiKey,
  async (c, next) => {
    // For JSON requests, the data is already in the correct format
    const jsonBody = await c.req.json()
    c.set('processedRequestData', jsonBody)
    
    await next()
  },
  validator('json', (value, c) => {
    // If we have processed form data with base64, use that instead
    const processedRequestData = c.get('processedRequestData')
    
    if (processedRequestData) {
      return validateVideoRequest(processedRequestData)
    }
    
    return validateVideoRequest(value)
  }),
  async (c) => {
    try {
      const validatedData = c.req.valid('json') as VideoGenerationRequest
      const authenticatedUser = c.get('authenticatedUser')
      
      // Create request with potential file data or base64 data
      const requestData: any = { ...validatedData }
      
      // Convert structured base64 image data to imagesData format
      if (validatedData.image) {
        if (typeof validatedData.image === 'object' && !Array.isArray(validatedData.image) && 'data' in validatedData.image) {
          // Single structured base64 image
          requestData.imagesData = [validatedData.image]
        } else if (Array.isArray(validatedData.image) && validatedData.image[0] && typeof validatedData.image[0] === 'object' && 'data' in validatedData.image[0]) {
          // Multiple structured base64 images
          requestData.imagesData = validatedData.image
        }
        // Remove the raw image field to avoid confusion
        delete requestData.image
      }
      
      // ASYNC MODE ONLY: Validate model exists before creating task
      const db = c.get('db')
      const modelService = getModelService(db)
      const allVideoModels = await modelService.getActiveModelsAsObject('video')
      
      if (!allVideoModels[validatedData.model]) {
        return c.json({
          error: {
            message: `Model '${validatedData.model}' not found. Use GET /v1/models to see available models.`,
            type: 'invalid_model',
            param: 'model'
          }
        }, 400)
      }
      
      // Create task and return immediately
      try {
          // Create storage service for uploading source images
          const { createStorageService } = await import('../lib/storage')
          const storageService = createStorageService(
            c.env.R2_ACCOUNT_ID,
            c.env.R2_ACCESS_KEY_ID,
            c.env.R2_SECRET_ACCESS_KEY,
            c.env.R2_BUCKET_NAME,
            c.env.R2_CUSTOM_PUBLIC_URL
          )

          const queueService = createQueueService(c)
          const { taskId } = await queueService.createAsyncTask(
            'video',
            authenticatedUser!.id,
            {
              model: validatedData.model,
              prompt: validatedData.prompt,
              imageSize: validatedData.size,
              quality: 'auto',
              duration: validatedData.duration,
              resolution: validatedData.resolution,
              apiKeyId: authenticatedUser!.apiKeyId,
              ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
              imagesData: requestData.imagesData // Pass input images
            },
            storageService
          )

          return c.json({
            taskId,
            status: 'pending',
            type: 'video',
            createdAt: Date.now(),
            message: 'Video generation task created. Use GET /v1/tasks/:taskId to check status.',
            estimatedCompletionTime: Date.now() + 60000 // 60 seconds estimate
          })

      } catch (queueError) {
        console.error('Failed to create async video task:', queueError)
        return c.json({
          error: {
            message: 'Failed to queue video generation task. The queue service is unavailable.',
            type: 'queue_unavailable',
            details: (queueError as Error).message
          }
        }, 503)
      }

    } catch (error: unknown) {
      console.error('Video generation error:', error)

      // Handle formatted errors from generation wrapper
      if ((error as any)?.errorResponse) {
        const formattedError = (error as any)
        return c.json(formattedError.errorResponse, formattedError.status)
      }

      // Try to parse structured error from service
      let errorResponse
      try {
        const errorMessage = error instanceof Error ? error.message : String(error)
        errorResponse = JSON.parse(errorMessage)
      } catch {
        errorResponse = {
          error: {
            message: error instanceof Error ? error.message : 'Video generation failed',
            type: 'video_generation_error'
          }
        }
      }

      const status = errorResponse.status || 500
      return c.json(errorResponse, status as any)
    }
  }
)

/**
 * GET /proxy/video
 * Proxy video files from Google APIs without exposing API keys
 */
app.get('/proxy', async (c) => {
  try {
    const url = c.req.query('url')
    const model = c.req.query('model')
    
    if (!url || !model) {
      return c.json({
        error: {
          message: 'Missing required parameters: url and model',
          type: 'invalid_request'
        }
      }, 400)
    }

    // Validate that the url matches the allowed endpoint pattern
    const allowedPattern = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/files\/[^:]+:download\?alt=media$/
    if (!allowedPattern.test(url)) {
      return c.json({
        error: {
          message: 'Invalid URL provided. Only URLs matching the allowed endpoint are permitted.',
          type: 'invalid_url'
        }
      }, 400)
    }

    // Get the appropriate API key for the model
    const { getGeminiApiKey } = await import('../services/googleAuth')
    const providerKey = getGeminiApiKey(model, c.env)
    
    // Fetch the video with the API key
    const videoResponse = await fetch(`${url}&key=${providerKey}`)
    
    if (!videoResponse.ok) {
      return c.json({
        error: {
          message: 'Failed to fetch video',
          type: 'video_fetch_error'
        }
      }, videoResponse.status as any)
    }

    // Set appropriate headers
    c.header('Content-Type', videoResponse.headers.get('content-type') || 'video/mp4')
    const contentLength = videoResponse.headers.get('content-length')
    if (contentLength) {
      c.header('Content-Length', contentLength)
    }
    
    // Return the video content
    return new Response(videoResponse.body, {
      headers: c.res.headers
    })
    
  } catch (error) {
    console.error('Video proxy error:', error)
    return c.json({
      error: {
        message: 'Internal server error while fetching video',
        type: 'internal_error'
      }
    }, 500)
  }
})

/**
 * GET /v1/videos/user/list
 * Get user's generated videos with pagination and filtering
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
      const limit = Math.min(Number(c.req.query('limit')) || 20, 100) // Max 100 items
      const offset = Number(c.req.query('offset')) || 0
      const status = c.req.query('status') as 'completed' | 'failed' | 'pending' | 'processing' | undefined
      const model = c.req.query('model') // Optional model filter

      // Validate status parameter
      if (status && !['completed', 'failed', 'pending', 'processing'].includes(status)) {
        return c.json({
          error: {
            message: 'Invalid status parameter. Must be one of: completed, failed, pending, processing',
            type: 'invalid_request'
          }
        }, 400)
      }

      const db = c.get('db')
      const { apiUsage } = await import('../db/schema')
      const { eq, and, desc, like } = await import('drizzle-orm')

      // Build query conditions - filter for videos only (taskId starts with 'vid_')
      const conditions = [
        eq(apiUsage.userId, authenticatedUser.id),
        like(apiUsage.taskId, 'vid_%')
      ]

      if (status) {
        conditions.push(eq(apiUsage.taskStatus, status))
      }

      if (model) {
        conditions.push(eq(apiUsage.model, model))
      }

      // Fetch videos with pagination
      const videos = await db
        .select({
          id: apiUsage.id,
          taskId: apiUsage.taskId,
          model: apiUsage.model,
          provider: apiUsage.provider,
          prompt: apiUsage.prompt,
          outputUrls: apiUsage.outputUrls,
          cost: apiUsage.cost,
          status: apiUsage.status,
          taskStatus: apiUsage.taskStatus,
          taskProgress: apiUsage.taskProgress,
          error: apiUsage.error,
          createdAt: apiUsage.createdAt,
          taskCompletedAt: apiUsage.taskCompletedAt,
          speedMs: apiUsage.speedMs
        })
        .from(apiUsage)
        .where(and(...conditions))
        .orderBy(desc(apiUsage.createdAt))
        .limit(limit)
        .offset(offset)

      // Parse outputUrls from JSON strings and format response
      const formattedVideos = videos.map((vid: any) => ({
        id: vid.id,
        taskId: vid.taskId,
        model: vid.model,
        provider: vid.provider,
        prompt: vid.prompt,
        videos: vid.outputUrls ? JSON.parse(vid.outputUrls) : [],
        cost: vid.cost / 10000, // Convert to USD
        status: vid.status,
        taskStatus: vid.taskStatus,
        taskProgress: vid.taskProgress,
        error: vid.error,
        createdAt: vid.createdAt.getTime(),
        completedAt: vid.taskCompletedAt?.getTime() || null,
        durationMs: vid.speedMs || null
      }))

      // Check if there are more results for pagination
      const hasMore = videos.length === limit

      return c.json({
        success: true,
        data: formattedVideos,
        pagination: {
          limit,
          offset,
          count: videos.length,
          hasMore
        }
      })
    } catch (error) {
      console.error('Failed to list user videos:', error)
      return c.json({
        error: {
          message: 'Failed to fetch videos',
          type: 'internal_error'
        }
      }, 500)
    }
  }
)

export default app