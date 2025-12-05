import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { ipLimiter } from '../middleware/rateLimiting'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
import { ImageGenerationRequest, validateImageRequest, convertAspectRatioToSize } from '../lib/validation'
import type { NewApiUsage } from '../db/schema'
import { createQueueService } from '../services/queueService'
import { getModelService } from '../services/modelService'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

/**
 * POST /v1/images/generations  
 * Generate images using async queue (Google & Runware models)
 * Always returns immediately with task ID for status polling
 */

/**
 * POST /v1/images/generations
 * Generate images using Google models with usage logging
 */
app.post('/generations', 
  ipLimiter,
  validateApiKey,
  async (c, next) => {
    const jsonBody = await c.req.json()
    c.set('processedRequestData', jsonBody)
    
    await next()
  },
  validator('json', (value, c) => {
    // If we have processed form data with base64, use that instead
    const processedRequestData = c.get('processedRequestData')
    
    if (processedRequestData) {
      return validateImageRequest(processedRequestData)
    }
    
    return validateImageRequest(value)
  }),
  async (c) => {
    try {
      const validatedData = c.req.valid('json') as ImageGenerationRequest
      const parsedFiles = c.get('parsedFiles')
      const authenticatedUser = c.get('authenticatedUser')

      // Create request with potential file data or base64 data
      const requestData: any = { ...validatedData }

      // Convert aspect ratio to pixel dimensions if needed
      if (requestData.size && typeof requestData.size === 'string') {
        requestData.size = convertAspectRatioToSize(requestData.size)
      }

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
      
      if (parsedFiles) {
        requestData.files = parsedFiles
      }

      // ASYNC MODE ONLY: Validate model exists before creating task
      const db = c.get('db')
      const modelService = getModelService(db)
      const allImageModels = await modelService.getActiveModelsAsObject('image')
      
      if (!allImageModels[validatedData.model]) {
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
          'image',
          authenticatedUser!.id,
          {
            model: validatedData.model,
            prompt: validatedData.prompt,
            imageSize: requestData.size, // Use converted size (aspect ratio → pixels)
            quality: validatedData.quality,
            n: validatedData.n,
            apiKeyId: authenticatedUser!.apiKeyId,
            ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
            imagesData: requestData.imagesData // Pass input images
          },
          storageService // Pass storage service for uploading source images
        )

        return c.json({
          taskId,
          status: 'pending',
          type: 'image',
          createdAt: Date.now(),
          message: 'Image generation task created. Use GET /v1/tasks/:taskId to check status.'
        })

      } catch (queueError) {
        console.error('Failed to create async task:', queueError)
        
        // Log the error to database if possible
        try {
          const db = c.get('db')
          if (db) {
            const { generateTaskId } = await import('../services/taskIdGenerator')
            const { apiUsage } = await import('../db/schema')
            
            const taskId = generateTaskId('image', authenticatedUser!.id)
            const errorUsage: NewApiUsage = {
              id: `usage_${taskId}`,
              model: validatedData.model,
              provider: 'error',
              prompt: validatedData.prompt,
              cost: 0,
              speedMs: 0,
              imageSize: validatedData.size || '1024x1024',
              quality: validatedData.quality as any || 'auto',
              status: 'failed',
              error: `Async queue not available: ${(queueError as Error).message}`,
              outputUrls: '[]',
              userId: authenticatedUser!.id,
              apiKeyId: authenticatedUser!.apiKeyId,
              ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
              taskId,
              taskStatus: 'failed',
              taskProgress: 0,
              isAsync: true,
            }
            
            await db.insert(apiUsage).values(errorUsage)
            console.log(`Logged async error for task ${taskId}`)
          }
        } catch (dbError) {
          console.error('Failed to log async error to database:', dbError)
        }
        
        return c.json({
          error: {
            message: 'Failed to queue image generation task. The queue service is unavailable.',
            type: 'queue_unavailable',
            details: (queueError as Error).message
          }
        }, 503) // Service Unavailable
      }

    } catch (error: unknown) {
      console.error('Image generation error:', error)

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
            message: error instanceof Error ? error.message : 'Image generation failed',
            type: 'image_generation_error'
          }
        }
      }

      const status = errorResponse.status || 500
      return c.json(errorResponse, status as any)
    }
  }
)

/**
 * POST /v1/images/edits
 * Edit images using Google models (for models that support it)
 */
app.post('/edits',
  ipLimiter,
  validateApiKey,
  async (c, next) => {
    const body = await c.req.json().catch(() => ({}))
    c.set('parsedFields', body)
    await next()
  },
  validator('json', (_, c) => {
    const parsedFields = c.get('parsedFields')
    
    return validateImageRequest(parsedFields)
  }),
  async (c) => {
    try {
      const validatedData = c.req.valid('json') as ImageGenerationRequest
      const parsedFiles = c.get('parsedFiles')
      const authenticatedUser = c.get('authenticatedUser')

      // Create request with potential file data or base64 data
      const requestWithImages: any = { ...validatedData }
      
      // Convert structured base64 image data to imagesData format
      if (validatedData.image) {
        if (typeof validatedData.image === 'object' && !Array.isArray(validatedData.image) && 'data' in validatedData.image) {
          // Single structured base64 image
          requestWithImages.imagesData = [validatedData.image]
        } else if (Array.isArray(validatedData.image) && validatedData.image[0] && typeof validatedData.image[0] === 'object' && 'data' in validatedData.image[0]) {
          // Multiple structured base64 images
          requestWithImages.imagesData = validatedData.image
        }
        // Remove the raw image field to avoid confusion
        delete requestWithImages.image
      }

      const legacyImagesData = []
      if (parsedFiles?.image) {
        for (const imageFile of parsedFiles.image) {
          legacyImagesData.push({
            blob: imageFile,
            filename: imageFile.name || 'image.png'
          })
        }
        // If we have legacy file uploads and no base64 data, use legacy format
        if (!requestWithImages.imagesData) {
          requestWithImages.imagesData = legacyImagesData
        }
      }

      if (parsedFiles) {
        requestWithImages.files = parsedFiles
      }

      // Create async task and return immediately
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
          'image',
          authenticatedUser!.id,
          {
            model: validatedData.model,
            prompt: validatedData.prompt,
            imageSize: validatedData.size,
            quality: validatedData.quality,
            apiKeyId: authenticatedUser!.apiKeyId,
            ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
            imagesData: requestWithImages.imagesData // Pass input images
          },
          storageService
        )

        return c.json({
          taskId,
          status: 'pending',
          type: 'image',
          createdAt: Date.now(),
          message: 'Image editing task created. Use GET /v1/tasks/:taskId to check status.'
        })

      } catch (queueError) {
        console.error('Failed to create async image editing task:', queueError)
        throw queueError // Rethrow to be caught by outer error handler
      }

    } catch (error: unknown) {
      console.error('Image editing error:', error)

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
            message: error instanceof Error ? error.message : 'Image editing failed',
            type: 'image_editing_error'
          }
        }
      }

      const status = errorResponse.status || 500
      return c.json(errorResponse, status as any)
    }
  }
)

/**
 * POST /v1/images/variations
 * Create variations of images (placeholder for future implementation)
 */
app.post('/variations', async (c) => {
  return c.json({
    error: {
      message: 'Image variations endpoint not implemented yet',
      type: 'not_implemented'
    }
  }, 501)
})

/**
 * GET /v1/images/user/list
 * Get user's generated images with pagination and filtering
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
      const { eq, and, desc, like, or, isNull } = await import('drizzle-orm')

      // Build query conditions - filter for images only (taskId starts with 'img_' or no taskId)
      const conditions = [
        eq(apiUsage.userId, authenticatedUser.id),
        or(
          like(apiUsage.taskId, 'img_%'),
          isNull(apiUsage.taskId)
        )
      ]

      if (status) {
        conditions.push(eq(apiUsage.taskStatus, status))
      }

      if (model) {
        conditions.push(eq(apiUsage.model, model))
      }

      // Fetch images with pagination
      const images = await db
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
          taskCompletedAt: apiUsage.taskCompletedAt
        })
        .from(apiUsage)
        .where(and(...conditions))
        .orderBy(desc(apiUsage.createdAt))
        .limit(limit)
        .offset(offset)

      // Parse outputUrls from JSON strings and format response
      const formattedImages = images.map((img: any) => ({
        id: img.id,
        taskId: img.taskId,
        model: img.model,
        provider: img.provider,
        prompt: img.prompt,
        imageSize: img.imageSize,
        quality: img.quality,
        images: img.outputUrls ? JSON.parse(img.outputUrls) : [],
        cost: img.cost / 10000, // Convert to USD
        status: img.status,
        taskStatus: img.taskStatus,
        taskProgress: img.taskProgress,
        error: img.error,
        createdAt: img.createdAt.getTime(),
        completedAt: img.taskCompletedAt?.getTime()
      }))

      return c.json({
        data: formattedImages,
        pagination: {
          limit,
          offset,
          count: formattedImages.length,
          hasMore: formattedImages.length === limit
        }
      })

    } catch (error) {
      console.error('User images list error:', error)
      return c.json({
        error: {
          message: 'Failed to get user images',
          type: 'internal_error'
        }
      }, 500)
    }
  }
)

export default app