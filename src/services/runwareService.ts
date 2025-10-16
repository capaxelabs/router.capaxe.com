/**
 * Runware Service - Shared implementation for image and video generation
 * Using the official @runware/sdk-js library with WebSocket-based API
 *
 * @see https://runware.ai/docs/en/libraries/javascript
 * @see https://github.com/Runware/sdk-js
 */

import { Runware } from '@runware/sdk-js'
import type {
  IImageInference,
  IImage,
  IError,
  IUpscaleGan,
  IRemoveImageBackground,
  IImageToText
} from '@runware/sdk-js'

/**
 * Video generation request interface
 * Based on Runware's video inference API
 */
export interface IVideoInference {
  positivePrompt: string
  model: string
  duration: number
  width?: number
  height?: number
  negativePrompt?: string
  seed?: number
  outputFormat?: 'mp4' | 'webm'
  includeCost?: boolean
  taskUUID?: string
  retry?: number
}

/**
 * Video generation response
 */
export interface IVideo {
  taskUUID: string
  videoURL: string
  cost?: number
  NSFWContent?: boolean
}

/**
 * Runware service configuration
 */
export interface RunwareConfig {
  apiKey: string
  shouldReconnect?: boolean
  globalMaxRetries?: number
  timeoutDuration?: number
  url?: string
}

/**
 * Image generation parameters (OpenAI-compatible format)
 */
export interface RunwareImageParams {
  model: string
  prompt: string
  negativePrompt?: string
  size?: string
  width?: number
  height?: number
  n?: number
  steps?: number
  seed?: number
  guidance?: number
  scheduler?: string
  lora?: Array<{ model: string; weight: number }>
  response_format?: 'url' | 'b64_json'
  includeCost?: boolean
  // Image-to-image
  inputImage?: string
  strength?: number
  // Inpainting
  maskImage?: string
  // Background removal
  removeBackground?: boolean
  // Upscaling
  upscale?: boolean
  upscaleFactor?: number
  // ControlNet
  controlNet?: Array<{
    model: string
    weight: number
    preprocessor?: string
    guideImage: string
  }>
}

/**
 * Video generation parameters (OpenAI-compatible format)
 */
export interface RunwareVideoParams {
  model: string
  prompt: string
  negativePrompt?: string
  duration: number
  width?: number
  height?: number
  seed?: number
  fps?: number
  includeCost?: boolean
  response_format?: 'url' | 'b64_json'
  // Image-to-video support
  frameImages?: Array<{
    inputImage: string
  }>
  // Provider-specific settings
  providerSettings?: {
    google?: {
      generateAudio?: boolean
      enhancePrompt?: boolean
    }
    bytedance?: {
      cameraFixed?: boolean
    }
  }
}

/**
 * Runware Service Class
 * Handles both image and video generation using the official SDK
 */
export class RunwareService {
  private runware: Runware
  private isConnected: boolean = false
  private connectionPromise: Promise<void> | null = null

  constructor(config: RunwareConfig) {
    this.runware = new Runware({
      apiKey: config.apiKey,
      shouldReconnect: config.shouldReconnect ?? true,
      globalMaxRetries: config.globalMaxRetries ?? 3,
      timeoutDuration: config.timeoutDuration ?? 90000, // 90 seconds default
      ...(config.url && { url: config.url })
    })
  }

  /**
   * Ensure connection is established
   * Uses singleton pattern to prevent multiple connection attempts
   */
  async ensureConnection(): Promise<void> {
    if (this.isConnected) {
      return
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = (async () => {
      try {
        await this.runware.ensureConnection()
        this.isConnected = true
        console.log('Runware WebSocket connection established')
      } catch (error) {
        this.connectionPromise = null
        throw new Error(`Failed to connect to Runware: ${error}`)
      }
    })()

    return this.connectionPromise
  }

  /**
   * Generate images using Runware SDK
   * Supports progressive delivery via onPartialImages callback
   */
  async generateImage(params: RunwareImageParams): Promise<{
    created: number
    data: Array<{ url?: string; b64_json?: string; revised_prompt?: string | null }>
    cost?: number
  }> {
    await this.ensureConnection()

    // Handle special operations first
    if (params.removeBackground && params.inputImage) {
      return this.removeBackground(params)
    }

    if (params.upscale && params.inputImage) {
      return this.upscaleImage(params)
    }

    // Extract dimensions from size parameter
    let width = params.width || 1024
    let height = params.height || 1024

    if (params.size) {
      const match = params.size.match(/(\d+)x(\d+)/)
      if (match) {
        width = parseInt(match[1])
        height = parseInt(match[2])
      }
    }

    // Build Runware request
    const request: IImageInference = {
      positivePrompt: params.prompt,
      model: params.model,
      width,
      height,
      numberResults: params.n || 1,
      outputFormat: 'PNG',
      includeCost: params.includeCost ?? true
    }

    // Add optional parameters
    if (params.negativePrompt) request.negativePrompt = params.negativePrompt
    if (params.steps) request.steps = params.steps
    if (params.seed) request.seed = params.seed
    if (params.guidance) request.CFGScale = params.guidance
    if (params.scheduler) request.scheduler = params.scheduler as any
    if (params.lora) request.lora = params.lora

    // Image-to-image
    if (params.inputImage) {
      request.seedImage = params.inputImage
      request.strength = params.strength || 0.8
    }

    // Inpainting
    if (params.maskImage) {
      request.maskImage = params.maskImage
    }

    // ControlNet
    if (params.controlNet) {
      request.controlNet = params.controlNet.map(cn => ({
        model: cn.model,
        weight: cn.weight,
        preprocessor: cn.preprocessor as any,
        guideImage: cn.guideImage
      }))
    }

    try {
      // Use SDK's requestImages method with progressive delivery support
      const images: IImage[] = await this.runware.requestImages(request)

      // Transform to OpenAI-compatible format
      return {
        created: Math.floor(Date.now() / 1000),
        data: images.map(img => ({
          url: img.imageURL,
          revised_prompt: null
        })),
        cost: images[0]?.cost || 0
      }
    } catch (error) {
      throw new Error(`Runware image generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate images with progressive delivery
   * Calls onPartialImages callback as images complete
   */
  async generateImageWithProgress(
    params: RunwareImageParams,
    onPartialImages: (images: IImage[], error: IError | null) => void
  ): Promise<{
    created: number
    data: Array<{ url?: string; b64_json?: string; revised_prompt?: string | null }>
    cost?: number
  }> {
    await this.ensureConnection()

    // Extract dimensions
    let width = params.width || 1024
    let height = params.height || 1024

    if (params.size) {
      const match = params.size.match(/(\d+)x(\d+)/)
      if (match) {
        width = parseInt(match[1])
        height = parseInt(match[2])
      }
    }

    // Build request
    const request: IImageInference = {
      positivePrompt: params.prompt,
      model: params.model,
      width,
      height,
      numberResults: params.n || 1,
      outputFormat: 'PNG',
      includeCost: params.includeCost ?? true,
      onPartialImages
    }

    // Add optional parameters
    if (params.negativePrompt) request.negativePrompt = params.negativePrompt
    if (params.steps) request.steps = params.steps
    if (params.seed) request.seed = params.seed
    if (params.guidance) request.CFGScale = params.guidance

    try {
      const images: IImage[] = await this.runware.requestImages(request)

      return {
        created: Math.floor(Date.now() / 1000),
        data: images.map(img => ({
          url: img.imageURL,
          revised_prompt: null
        })),
        cost: images[0]?.cost || 0
      }
    } catch (error) {
      throw new Error(`Runware image generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate video using Runware SDK
   * Automatically handles async processing and polling
   * Supports text-to-video and image-to-video (frameImages)
   */
  async generateVideo(params: RunwareVideoParams): Promise<{
    created: number
    data: Array<{ url?: string; b64_json?: string; revised_prompt?: string | null }>
    cost?: number
  }> {
    await this.ensureConnection()

    // Build video request
    const request: IVideoInference = {
      positivePrompt: params.prompt,
      model: params.model,
      duration: params.duration,
      width: params.width || 1280,
      height: params.height || 720,
      outputFormat: 'mp4',
      includeCost: params.includeCost ?? true
    }

    // Add optional parameters
    if (params.negativePrompt) request.negativePrompt = params.negativePrompt
    if (params.seed) request.seed = params.seed
    
    // Add frameImages for image-to-video
    if (params.frameImages && params.frameImages.length > 0) {
      // Cast to any to bypass type restrictions (SDK may not have this typed yet)
      (request as any).frameImages = params.frameImages
    }
    
    // Add FPS if specified
    if (params.fps) {
      (request as any).fps = params.fps
    }
    
    // Add provider-specific settings
    if (params.providerSettings) {
      (request as any).providerSettings = params.providerSettings
    }

    try {
      // SDK handles all async complexity automatically
      const videos: IVideo[] = await this.runware.videoInference(request)

      return {
        created: Math.floor(Date.now() / 1000),
        data: videos.map(video => ({
          url: video.videoURL,
          revised_prompt: null
        })),
        cost: videos[0]?.cost || 0
      }
    } catch (error) {
      throw new Error(`Runware video generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Remove background from image
   */
  private async removeBackground(params: RunwareImageParams): Promise<{
    created: number
    data: Array<{ url?: string; b64_json?: string; revised_prompt?: string | null }>
    cost?: number
  }> {
    if (!params.inputImage) {
      throw new Error('inputImage is required for background removal')
    }

    const request: IRemoveImageBackground = {
      inputImage: params.inputImage,
      outputFormat: 'PNG',
      includeCost: params.includeCost ?? true
    }

    try {
      const images: IImage[] = await this.runware.removeImageBackground(request)

      return {
        created: Math.floor(Date.now() / 1000),
        data: images.map(img => ({
          url: img.imageURL,
          revised_prompt: null
        })),
        cost: images[0]?.cost || 0
      }
    } catch (error) {
      throw new Error(`Runware background removal failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Upscale image using GAN
   */
  private async upscaleImage(params: RunwareImageParams): Promise<{
    created: number
    data: Array<{ url?: string; b64_json?: string; revised_prompt?: string | null }>
    cost?: number
  }> {
    if (!params.inputImage) {
      throw new Error('inputImage is required for upscaling')
    }

    const request: IUpscaleGan = {
      inputImage: params.inputImage,
      upscaleFactor: params.upscaleFactor || 4,
      outputFormat: 'PNG',
      includeCost: params.includeCost ?? true
    }

    try {
      const images: IImage[] = await this.runware.upscaleGan(request)

      return {
        created: Math.floor(Date.now() / 1000),
        data: images.map(img => ({
          url: img.imageURL,
          revised_prompt: null
        })),
        cost: images[0]?.cost || 0
      }
    } catch (error) {
      throw new Error(`Runware upscaling failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Extract text from image (OCR/Image-to-text)
   */
  async imageToText(inputImage: string): Promise<string> {
    await this.ensureConnection()

    const request: IImageToText = {
      inputImage
    }

    try {
      const results = await this.runware.requestImageToText(request)
      return results[0]?.text || ''
    } catch (error) {
      throw new Error(`Runware image-to-text failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Disconnect from Runware
   * Clean shutdown of WebSocket connection
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.runware.disconnect()
      this.isConnected = false
      this.connectionPromise = null
      console.log('Runware WebSocket connection closed')
    }
  }

  /**
   * Check if connection is active
   */
  get connected(): boolean {
    return this.isConnected
  }
}

/**
 * Create a Runware service instance
 * Factory function for easy instantiation
 */
export function createRunwareService(apiKey: string, config?: Partial<RunwareConfig>): RunwareService {
  return new RunwareService({
    apiKey,
    ...config
  })
}

/**
 * Singleton instance for Cloudflare Workers
 * Reuses connection across requests
 */
let runwareInstance: RunwareService | null = null

/**
 * Get or create Runware service instance
 * Singleton pattern for Cloudflare Workers environment
 */
export function getRunwareService(apiKey: string, config?: Partial<RunwareConfig>): RunwareService {
  if (!runwareInstance || !runwareInstance.connected) {
    runwareInstance = createRunwareService(apiKey, config)
  }
  return runwareInstance
}
