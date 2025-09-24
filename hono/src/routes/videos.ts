import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { createVideoGenerationHandler } from '../services/generationWrapper'
import { ipLimiter } from '../middleware/rateLimiting'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
import { parseMultipartFormData, combineFieldsAndFiles } from '../middleware/uploadMiddleware'
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
  // Parse multipart form data if present
  async (c, next) => {
    if (c.req.header('content-type')?.includes('multipart/form-data')) {
      const { fields, files } = await parseMultipartFormData(c)
      
      // Store parsed data in context
      c.set('parsedFields', fields)
      c.set('parsedFiles', files)
    }
    await next()
  },
  validator('json', (value, c) => {
    // If we have parsed form data, use that instead
    const parsedFields = c.get('parsedFields')
    const parsedFiles = c.get('parsedFiles')
    
    if (parsedFields && parsedFiles) {
      const combinedData = combineFieldsAndFiles(parsedFields, parsedFiles)
      return validateVideoRequest(combinedData)
    }
    
    return validateVideoRequest(value)
  }),
  async (c) => {
    try {
      const validatedData = c.req.valid('json') as VideoGenerationRequest
      const parsedFiles = c.get('parsedFiles')
      const authenticatedUser = c.get('authenticatedUser')
      
      // Check if async mode is requested
      const isAsync = c.req.query('async') === 'true'
      
      // Create request with potential file data
      const requestData: any = { ...validatedData }

      // Process uploaded images if present (for image-to-video)
      if (parsedFiles?.image && parsedFiles.image.length > 0) {
        const imagesData = []
        for (const imageFile of parsedFiles.image) {
          imagesData.push({
            blob: imageFile,
            filename: imageFile.name || 'image.png'
          })
        }
        
        // Add images data to the request
        requestData.imagesData = imagesData
        requestData.files = parsedFiles
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