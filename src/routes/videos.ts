import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { createVideoGenerationHandler } from '../services/generationWrapper'
import { ipLimiter } from '../middleware/rateLimiting'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
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
      
      // Check if sync mode is requested (async is now default)
      const isSync = c.req.query('sync') === 'true'
      const isAsync = !isSync
      
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
      
      // TEST MODE: Return mock response for development
      if (validatedData.test === true) {
        const { generateTaskId } = await import('../services/taskIdGenerator')
        const taskId = generateTaskId('video', authenticatedUser!.id)
        const estimatedTime = Date.now() + (validatedData.duration || 5) * 60 * 1000 // duration in minutes
        
        // Create a mock database entry for test mode (completed immediately)
        try {
          const db = c.get('db')
          if (db) {
            const { apiUsage } = await import('../db/schema')
            const mockVideoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
            const now = new Date()
            
            await db.insert(apiUsage).values({
              id: crypto.randomUUID(),
              taskId: taskId,
              userId: authenticatedUser!.id,
              apiKeyId: authenticatedUser!.apiKeyId,
              model: validatedData.model,
              prompt: validatedData.prompt,
              inputTokens: Math.floor(validatedData.prompt.length / 4), // Rough token estimate
              outputTokens: 0,
              totalTokens: Math.floor(validatedData.prompt.length / 4),
              imageSize: validatedData.size,
              imageCount: 1,
              requestCost: 0.01, // Mock cost
              cost: 0.0001, // Total cost in cents
              speedMs: 100, // Mock speed value for test mode
              status: 'completed', // Completed immediately for test mode
              outputUrls: JSON.stringify([mockVideoUrl]), // Mock video URL
              taskType: 'video',
              taskStatus: 'completed', // Completed immediately
              taskProgress: 100, // 100% complete
              taskStartedAt: now,
              taskCompletedAt: now,
              isAsync: true,
              provider: 'test', // Required field - set to 'test' for test mode
              metadata: JSON.stringify({
                test_mode: true,
                model: validatedData.model,
                duration: validatedData.duration,
                aspect_ratio: validatedData.aspect_ratio,
                resolution: validatedData.resolution,
                provider: 'test'
              }),
              ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
            })
          }
        } catch (dbError) {
          console.warn('Failed to create test database entry:', dbError)
        }
        
        return c.json({
          taskId,
          status: 'completed',
          type: 'video',
          createdAt: Date.now(),
          message: 'Test video generation completed immediately. Use GET /v1/tasks/:taskId to retrieve results.',
          result: {
            created: Math.floor(Date.now() / 1000),
            data: [{ url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' }],
            cost: 1
          }
        })
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
              message: 'Failed to create async video task. Please add ?sync=true for synchronous generation or try again.',
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