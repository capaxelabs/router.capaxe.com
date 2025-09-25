import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { createVideoGenerationHandler } from '../services/generationWrapper'
import { ipLimiter } from '../middleware/rateLimiting'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
import { parseMultipartFormData } from '../middleware/uploadMiddleware'
import { VideoGenerationRequest, VideoGenerationResponse, validateVideoRequest } from '../lib/validation'
import { createQueueService } from '../services/queueService'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

// Create the generation handler with usage logging
const videoGenerationHandler = createVideoGenerationHandler()

/**
 * POST /v1/openai/videos/generations
 * Generate videos using Google models with usage logging
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
      return validateVideoRequest(processedRequestData)
    }
    
    return validateVideoRequest(value)
  }),
  async (c) => {
    try {
      const validatedData = c.req.valid('json') as VideoGenerationRequest
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
      
      // Process uploaded files (fallback for legacy multipart uploads)
      const legacyFiles = c.get('parsedFiles')
      if (legacyFiles?.image && legacyFiles.image.length > 0 && !requestData.imagesData) {
        const legacyImagesData = []
        for (const imageFile of legacyFiles.image) {
          legacyImagesData.push({
            blob: imageFile,
            filename: imageFile.name || 'image.png'
          })
        }
        requestData.imagesData = legacyImagesData
        requestData.files = legacyFiles
      }

      if (isAsync) {
        // ASYNC MODE: Create task and return immediately
        try {
          const queueService = createQueueService(c)
          const { taskId } = await queueService.createAsyncTask('video', authenticatedUser!.id, {
            model: validatedData.model,
            prompt: validatedData.prompt,
            imageSize: validatedData.size,
            quality: 'auto', // Videos don't have quality parameter typically
            apiKeyId: authenticatedUser!.apiKeyId,
            ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
            ...requestData // Include all request data
          })

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
              message: 'Failed to create async video task. Please try synchronous generation or try again.',
              type: 'async_creation_error'
            }
          }, 500)
        }
        
      } else {
        // SYNC MODE: Process immediately (existing behavior)
        const result = await videoGenerationHandler(c, requestData)

        // Return in OpenAI-compatible format
        const response: VideoGenerationResponse = {
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

export default app