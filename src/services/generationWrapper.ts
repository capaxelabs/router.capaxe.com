import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { AuthenticatedUser } from '../middleware/apiKeyMiddleware'
import { preLogUsage, refundUsage, postLogUsage, GenerationParams } from './usageLogger'
import { generateImage, ImageGenerationParams } from './imageService'
import { generateVideo, VideoGenerationParams } from './videoService'
import { selectProvider } from '../utils/providerSelector'
import { googleImageModels } from '../shared/imageModels/google'
import { googleVideoModels } from '../shared/videoModels/google'
import { runwareImageModels } from '../shared/imageModels/runware'
import { runwareVideoModels } from '../shared/videoModels/runware'

const models = {
  ...googleImageModels,
  ...googleVideoModels,
  ...runwareImageModels,
  ...runwareVideoModels
}

interface GenerationResult {
  created: number
  data: Array<{
    url?: string
    b64_json?: string
    _uploadedUrl?: string
    revised_prompt?: string | null
  }>
  latency?: number
  cost?: number
}

/**
 * Clean up internal fields from result before returning to user
 */
function cleanupInternalFields(result: GenerationResult): void {
  if (result?.data && Array.isArray(result.data)) {
    result.data.forEach(item => {
      delete item._uploadedUrl
    })
  }
}

/**
 * Create generation handler with usage logging for images
 */
export function createImageGenerationHandler() {
  return async function imageGenerationHandler(
    c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
    params: ImageGenerationParams & GenerationParams
  ): Promise<GenerationResult> {
    const authenticatedUser = c.get('authenticatedUser') as AuthenticatedUser
    
    if (!authenticatedUser) {
      throw new Error('Authentication required')
    }

    // Get model configuration and select provider
    const modelConfig = models[params.model]
    if (!modelConfig) {
      throw new Error(`Model '${params.model}' not found`)
    }

    const providerIndex = selectProvider(modelConfig.providers, params)
    let usageLogEntry

    try {
      // Pre-log usage and deduct credits
      usageLogEntry = await preLogUsage(c, params, authenticatedUser, providerIndex)

      let generationResult: GenerationResult
      try {
        // Generate image with a clean copy of params to prevent side effects
        const fetchParams = structuredClone(params)
        generationResult = await generateImage(c, fetchParams, authenticatedUser.id)
        
        // Add usage log ID for URL shortening
        if (generationResult.data && Array.isArray(generationResult.data)) {
          generationResult.data.forEach(item => {
            if (item.url) {
              item._uploadedUrl = item.url
            }
          })
        }
        
      } catch (error) {
        // Generation failed, refund the credits
        const errorToLog = (error as any)?.errorResponse?.error?.message || 
                          (error as Error)?.message || 
                          'unknown error'
        await refundUsage(c, authenticatedUser, usageLogEntry, errorToLog)
        throw error
      }

      // Post-log usage with actual cost
      const postPriceInt = await postLogUsage(c, params, authenticatedUser, usageLogEntry, generationResult, providerIndex)
      generationResult.cost = postPriceInt / 10000

      // Clean up internal fields
      cleanupInternalFields(generationResult)

      return generationResult

    } catch (error) {
      console.error('Image generation error:', error)
      
      // If the error is already formatted, preserve it
      if ((error as any)?.errorResponse) {
        throw error
      }

      // Format error for consistent API response
      const formattedError = {
        errorResponse: {
          error: {
            message: (error as Error).message || 'Failed to generate image',
            type: 'generation_error'
          }
        },
        status: 500
      }
      throw formattedError
    }
  }
}

/**
 * Create generation handler with usage logging for videos
 */
export function createVideoGenerationHandler() {
  return async function videoGenerationHandler(
    c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
    params: VideoGenerationParams & GenerationParams
  ): Promise<GenerationResult> {
    const authenticatedUser = c.get('authenticatedUser') as AuthenticatedUser
    
    if (!authenticatedUser) {
      throw new Error('Authentication required')
    }

    // Get model configuration and select provider
    const modelConfig = models[params.model]
    if (!modelConfig) {
      throw new Error(`Model '${params.model}' not found`)
    }

    const providerIndex = selectProvider(modelConfig.providers, params)
    let usageLogEntry

    try {
      // Pre-log usage and deduct credits
      usageLogEntry = await preLogUsage(c, params, authenticatedUser, providerIndex)

      let generationResult: GenerationResult
      try {
        // Generate video with a clean copy of params to prevent side effects
        const fetchParams = structuredClone(params)
        generationResult = await generateVideo(c, fetchParams, authenticatedUser.id)
        
        // Add usage log ID for URL shortening
        if (generationResult.data && Array.isArray(generationResult.data)) {
          generationResult.data.forEach(item => {
            if (item.url) {
              item._uploadedUrl = item.url
            }
          })
        }
        
      } catch (error) {
        // Generation failed, refund the credits
        const errorToLog = (error as any)?.errorResponse?.error?.message || 
                          (error as Error)?.message || 
                          'unknown error'
        await refundUsage(c, authenticatedUser, usageLogEntry, errorToLog)
        throw error
      }

      // Post-log usage with actual cost
      const postPriceInt = await postLogUsage(c, params, authenticatedUser, usageLogEntry, generationResult, providerIndex)
      generationResult.cost = postPriceInt / 10000

      // Clean up internal fields
      cleanupInternalFields(generationResult)

      return generationResult

    } catch (error) {
      console.error('Video generation error:', error)
      
      // If the error is already formatted, preserve it
      if ((error as any)?.errorResponse) {
        throw error
      }

      // Format error for consistent API response
      const formattedError = {
        errorResponse: {
          error: {
            message: (error as Error).message || 'Failed to generate video',
            type: 'generation_error'
          }
        },
        status: 500
      }
      throw formattedError
    }
  }
}