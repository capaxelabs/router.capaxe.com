import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { generateImage } from '../services/imageService'
import { ipLimiter } from '../middleware/rateLimiting'
import { parseMultipartFormData, combineFieldsAndFiles } from '../middleware/uploadMiddleware'
import { ImageGenerationRequest, ImageGenerationResponse, validateImageRequest } from '../lib/validation'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

/**
 * POST /v1/openai/images/generations
 * Generate images using Google models
 */
app.post('/generations', 
  ipLimiter,
  // Parse multipart form data
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
      return validateImageRequest(combinedData)
    }
    
    return validateImageRequest(value)
  }),
  async (c) => {
    try {
      const validatedData = c.req.valid('json') as ImageGenerationRequest
      const parsedFiles = c.get('parsedFiles')
      
      // Create request with potential file data
      const requestData: any = { ...validatedData }
      
      if (parsedFiles) {
        requestData.files = parsedFiles
      }

      // For now, use a mock user ID since authentication is not fully implemented
      const userId = 'mock-user-id'

      const result = await generateImage(c, requestData, userId)

      // Return in OpenAI-compatible format
      const response: ImageGenerationResponse = {
        created: result.created,
        data: result.data.map(item => ({
          url: item.url,
          b64_json: item.b64_json,
          revised_prompt: item.revised_prompt || undefined
        }))
      }

      return c.json(response)

    } catch (error: unknown) {
      console.error('Image generation error:', error)

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
  // Parse multipart form data (required for image editing)
  async (c, next) => {
    const { fields, files } = await parseMultipartFormData(c)
    
    // Store parsed data in context
    c.set('parsedFields', fields)
    c.set('parsedFiles', files)
    await next()
  },
  validator('json', (value, c) => {
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

      // Process uploaded images
      const imagesData = []
      if (parsedFiles?.image) {
        for (const imageFile of parsedFiles.image) {
          imagesData.push({
            blob: imageFile,
            filename: imageFile.name || 'image.png'
          })
        }
      }

      // Add images data to the request
      const requestWithImages: any = {
        ...validatedData,
        files: parsedFiles,
        imagesData
      }

      // For now, use a mock user ID since authentication is not fully implemented
      const userId = 'mock-user-id'

      const result = await generateImage(c, requestWithImages, userId)

      // Return in OpenAI-compatible format
      const response: ImageGenerationResponse = {
        created: result.created,
        data: result.data.map(item => ({
          url: item.url,
          b64_json: item.b64_json,
          revised_prompt: item.revised_prompt || undefined
        }))
      }

      return c.json(response)

    } catch (error: unknown) {
      console.error('Image editing error:', error)

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