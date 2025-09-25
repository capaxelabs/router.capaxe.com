// Simple, clean OpenAPI document for the ImageRouter API
export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'ImageRouter API',
    version: '1.0.0',
    description: 'A unified API for image and video generation using AI models. Supports both synchronous and asynchronous processing.',
    contact: {
      name: 'ImageRouter Support',
      url: 'https://docs.imagerouter.capaxe.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    { 
      url: 'https://imagerouter.capaxe.com',
      description: 'Production server'
    },
    { 
      url: 'http://localhost:8787',
      description: 'Development server'
    }
  ],
  security: [
    { apiKey: [] }
  ],
  components: {
    securitySchemes: {
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'API key authentication. Use format: Bearer YOUR_API_KEY'
      }
    },
    schemas: {
      ImageGenerationRequest: {
        type: 'object',
        required: ['model', 'prompt'],
        properties: {
          model: { type: 'string', description: 'AI model to use for generation' },
          prompt: { type: 'string', description: 'Text description of desired image' },
          n: { type: 'integer', minimum: 1, maximum: 16, default: 1, description: 'Number of images to generate' },
          size: { type: 'string', default: 'auto', description: 'Image dimensions (e.g., 1024x1024)' },
          quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'], description: 'Image quality' },
          style: { type: 'string', enum: ['vivid', 'natural'], description: 'Image style' },
          response_format: { type: 'string', enum: ['url', 'b64_json'], default: 'url', description: 'Response format' },
          user: { type: 'string', description: 'User identifier' }
        }
      },
      VideoGenerationRequest: {
        type: 'object',
        required: ['model', 'prompt'],
        properties: {
          model: { type: 'string', description: 'AI model to use for generation' },
          prompt: { type: 'string', description: 'Text description of desired video' },
          size: { type: 'string', default: 'auto', description: 'Video dimensions (e.g., 1024x1024)' },
          quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'], description: 'Video quality' },
          duration: { type: 'number', minimum: 1, maximum: 10, default: 5, description: 'Video duration in seconds' },
          fps: { type: 'integer', minimum: 12, maximum: 60, default: 24, description: 'Frames per second' },
          response_format: { type: 'string', enum: ['url', 'b64_json'], default: 'url', description: 'Response format' },
          negative_prompt: { type: 'string', description: 'What to avoid in generation' },
          user: { type: 'string', description: 'User identifier' }
        }
      },
      GenerationResponse: {
        type: 'object',
        properties: {
          created: { type: 'number', description: 'Creation timestamp' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'URL to generated content' },
                b64_json: { type: 'string', description: 'Base64 encoded content' },
                revised_prompt: { type: 'string', description: 'Revised prompt used' }
              }
            }
          },
          cost: { type: 'number', description: 'Generation cost in USD' }
        }
      },
      AsyncTaskResponse: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Unique task identifier' },
          status: { type: 'string', enum: ['pending'], description: 'Task status' },
          type: { type: 'string', enum: ['image', 'video'], description: 'Task type' },
          createdAt: { type: 'number', description: 'Creation timestamp' },
          message: { type: 'string', description: 'Status message' },
          estimatedCompletionTime: { type: 'number', description: 'Estimated completion timestamp' }
        }
      },
      TaskStatusResponse: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Unique task identifier' },
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'], description: 'Task status' },
          type: { type: 'string', enum: ['image', 'video'], description: 'Task type' },
          createdAt: { type: 'number', description: 'Creation timestamp' },
          completedAt: { type: 'number', description: 'Completion timestamp' },
          progress: { type: 'number', minimum: 0, maximum: 100, description: 'Progress percentage' },
          result: { $ref: '#/components/schemas/GenerationResponse' },
          error: { type: 'string', description: 'Error message if failed' },
          message: { type: 'string', description: 'Status message' }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Error description' },
              type: { type: 'string', description: 'Error type' },
              code: { type: 'string', description: 'Error code' },
              param: { type: 'string', description: 'Invalid parameter' }
            }
          }
        }
      }
    }
  },
  tags: [
    { name: 'Core', description: 'Core API endpoints for health checks and information' },
    { name: 'Models', description: 'AI model listing and information' },
    { name: 'Images', description: 'Image generation and editing endpoints' },
    { name: 'Videos', description: 'Video generation and proxy endpoints' },
    { name: 'Tasks', description: 'Async task management and status tracking' },
    { name: 'Admin', description: 'Administrative endpoints for development' },
    { name: 'Debug', description: 'Debug and development utilities' }
  ],
  externalDocs: {
    description: 'Full API Documentation',
    url: 'https://docs.imagerouter.capaxe.com'
  }
} 