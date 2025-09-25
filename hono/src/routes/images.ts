import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { createImageGenerationHandler } from '../services/generationWrapper'
import { ipLimiter } from '../middleware/rateLimiting'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
import { parseMultipartFormData, combineFieldsAndFiles } from '../middleware/uploadMiddleware'
import { ImageGenerationRequest, ImageGenerationResponse, validateImageRequest } from '../lib/validation'
import type { NewApiUsage } from '../db/schema'
import { createQueueService } from '../services/queueService'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

// Create the generation handler with usage logging
const imageGenerationHandler = createImageGenerationHandler()

/**
 * POST /v1/openai/images/generations
 * Generate images using Google models with usage logging
 */
app.post('/generations', 
  ipLimiter,
  validateApiKey,
  // Parse multipart form data and convert to base64
  async (c, next) => {
    const contentType = c.req.header('content-type')
    
    if (contentType?.includes('multipart/form-data')) {
      const { fields, files } = await parseMultipartFormData(c)
      
      // Convert files to base64 immediately
      const processedData = { ...fields }
      
      if (files.image && files.image.length > 0) {
        if (files.image.length === 1) {
          // Single image
          const file = files.image[0]
          const arrayBuffer = await file.arrayBuffer()
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
          processedData.image = {
            data: base64,
            type: file.type,
            filename: file.name
          }
        } else {
          // Multiple images  
          const imageArray = []
          for (const file of files.image) {
            const arrayBuffer = await file.arrayBuffer()
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
            imageArray.push({
              data: base64,
              type: file.type,
              filename: file.name
            })
          }
          processedData.image = imageArray
        }
      }
      
      if (files.mask && files.mask.length > 0) {
        const file = files.mask[0]
        const arrayBuffer = await file.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        processedData.mask = {
          data: base64,
          type: file.type,
          filename: file.name
        }
      }
      
      // Store processed base64 data in context
      c.set('processedRequestData', processedData)
    } else if (contentType?.includes('application/json')) {
      // For JSON requests, the data is already in the correct format
      const jsonBody = await c.req.json()
      c.set('processedRequestData', jsonBody)
    }
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
      
      // Check if async mode is requested
      const isAsync = c.req.query('async') === 'true'
      
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
      
      if (parsedFiles) {
        requestData.files = parsedFiles
      }

      if (isAsync) {
        // ASYNC MODE: Create task and return immediately
        try {
          const queueService = createQueueService(c)
          const { taskId } = await queueService.createAsyncTask('image', authenticatedUser!.id, {
            model: validatedData.model,
            prompt: validatedData.prompt,
            imageSize: validatedData.size,
            quality: validatedData.quality,
            apiKeyId: authenticatedUser!.apiKeyId,
            ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
            ...requestData // Include all request data
          })

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
              message: 'Async processing not available in local development. Please try synchronous generation or deploy to Cloudflare.',
              type: 'async_unavailable',
              details: (queueError as Error).message
            }
          }, 503) // Service Unavailable
        }
        
      } else {
        // SYNC MODE: Process immediately (existing behavior)
        const result = await imageGenerationHandler(c, requestData)

        // Return in OpenAI-compatible format
        const response: ImageGenerationResponse = {
          created: result.created,
          data: result.data.map(item => ({
            url: item.url,
            b64_json: item.b64_json,
            revised_prompt: item.revised_prompt || undefined
          })),
          cost: result.cost
        }

        return c.json(response)
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
 * POST /v1/openai/images/edits
 * Edit images using Google models (for models that support it)
 */
app.post('/edits',
  ipLimiter,
  validateApiKey,
  // Parse multipart form data (required for image editing)
  async (c, next) => {
    const { fields, files } = await parseMultipartFormData(c)
    
    // Store parsed data in context
    c.set('parsedFields', fields)
    c.set('parsedFiles', files)
    await next()
  },
  validator('json', (_, c) => {
    const parsedFields = c.get('parsedFields')
    const parsedFiles = c.get('parsedFiles')
    
    if (!parsedFields || !parsedFiles) {
      throw new Error('Multipart form data required for image editing')
    }
    
    // Validate that we have required image file
    if (!parsedFiles.image || parsedFiles.image.length === 0) {
      throw new Error('Image file is required for image editing')
    }
    
    const combinedData = combineFieldsAndFiles(parsedFields, parsedFiles)
    return validateImageRequest(combinedData)
  }),
  async (c) => {
    try {
      const validatedData = c.req.valid('json') as ImageGenerationRequest
      const parsedFiles = c.get('parsedFiles')
      const authenticatedUser = c.get('authenticatedUser')
      
      // Check if async mode is requested
      const isAsync = c.req.query('async') === 'true'

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

      // Process uploaded files (fallback for multipart uploads)
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

      if (isAsync) {
        // ASYNC MODE: Create task and return immediately
        try {
          const queueService = createQueueService(c)
          const { taskId } = await queueService.createAsyncTask('image', authenticatedUser!.id, {
            model: validatedData.model,
            prompt: validatedData.prompt,
            imageSize: validatedData.size,
            quality: validatedData.quality,
            apiKeyId: authenticatedUser!.apiKeyId,
            ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
            ...requestWithImages // Include all request data including files
          })

          return c.json({
            taskId,
            status: 'pending',
            type: 'image',
            createdAt: Date.now(),
            message: 'Image editing task created. Use GET /v1/tasks/:taskId to check status.'
          })

        } catch (queueError) {
          console.error('Failed to create async image editing task:', queueError)
          return c.json({
            error: {
              message: 'Failed to create async image editing task. Please try synchronous generation or try again.',
              type: 'async_creation_error'
            }
          }, 500)
        }
        
      } else {
        // SYNC MODE: Process immediately (existing behavior)
        const result = await imageGenerationHandler(c, requestWithImages)

        // Return in OpenAI-compatible format
        const response: ImageGenerationResponse = {
          created: result.created,
          data: result.data.map(item => ({
            url: item.url,
            b64_json: item.b64_json,
            revised_prompt: item.revised_prompt || undefined
          })),
          cost: result.cost
        }

        return c.json(response)
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
 * POST /v1/openai/images/variations
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

export default app