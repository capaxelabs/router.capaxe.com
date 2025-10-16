/**
 * Runware Service - REST API implementation
 * Using the Runware REST API v1
 *
 * @see https://docs.runware.ai/en/image-inference/api-reference
 * @see https://api.runware.ai/v1
 */

/**
 * Runware service configuration
 */
export interface RunwareConfig {
  apiKey: string
  baseUrl?: string
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
 * Runware REST API Response
 */
interface RunwareResponse {
  data: Array<{
    taskUUID: string
    imageURL?: string
    videoURL?: string
    imageUUID?: string
    videoUUID?: string
    cost?: number
    NSFWContent?: boolean
  }>
  error?: string
}

/**
 * Runware Service Class
 * Handles both image and video generation using REST API
 */
export class RunwareService {
  private apiKey: string
  private baseUrl: string

  constructor(config: RunwareConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl || 'https://api.runware.ai/v1'
  }

  /**
   * Make REST API request to Runware
   */
  private async makeRequest(tasks: any[]): Promise<RunwareResponse> {
    console.log(`[Runware REST] Making request to ${this.baseUrl}`)
    console.log(`[Runware REST] Number of tasks: ${tasks.length}`)
    
    // Log each task's structure for debugging
    tasks.forEach((task, index) => {
      console.log(`[Runware REST] Task ${index} type: ${task.taskType}`)
      console.log(`[Runware REST] Task ${index} fields:`, Object.keys(task).join(', '))
      
      // Check for invalid fields that shouldn't be there
      // NOTE: taskUUID is REQUIRED by Runware API, so it's NOT in this list
      const invalidFields = ['taskId', 'response_format', 'userId', 'apiKeyId', 'ip']
      const foundInvalid = invalidFields.filter(field => field in task)
      if (foundInvalid.length > 0) {
        console.error(`[Runware REST] WARNING: Found invalid fields in task: ${foundInvalid.join(', ')}`)
      }
    })
    
    console.log(`[Runware REST] Full request body:`, JSON.stringify(tasks, null, 2))

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tasks)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Runware REST] Error response (${response.status}):`, errorText)
      throw new Error(`Runware API error (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    console.log(`[Runware REST] Success response:`, JSON.stringify(result, null, 2))

    return result
  }

  /**
   * Generate images using Runware REST API
   */
  async generateImage(params: RunwareImageParams): Promise<{
    created: number
    data: Array<{ url?: string; b64_json?: string; revised_prompt?: string | null }>
    cost?: number
  }> {
    console.log(`[Runware Generate] Starting REST API image generation`)
    console.log(`[Runware Generate] Received params keys:`, Object.keys(params).join(', '))
    console.log(`[Runware Generate] Model: ${params.model}, Prompt: ${params.prompt.substring(0, 100)}...`)

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

    // Generate a proper UUID v4 for this Runware task (REQUIRED by Runware API)
    const taskUUID = crypto.randomUUID()
    
    // Build Runware REST API request - ONLY include valid Runware fields
    const task: any = {
      taskType: 'imageInference',
      taskUUID: taskUUID, // REQUIRED by Runware API - must be UUID v4
      positivePrompt: params.prompt,
      model: params.model,
      width,
      height,
      numberResults: params.n || 1,
      outputFormat: 'PNG',
      outputType: ['URL'],
      includeCost: params.includeCost ?? true
    }
    
    console.log(`[Runware Generate] Generated taskUUID for Runware: ${taskUUID}`)

    // Add optional parameters
    if (params.negativePrompt) task.negativePrompt = params.negativePrompt
    if (params.steps) task.steps = params.steps
    if (params.seed) task.seed = params.seed
    if (params.guidance) task.CFGScale = params.guidance
    if (params.scheduler) task.scheduler = params.scheduler
    if (params.lora) task.lora = params.lora

    // Image-to-image
    if (params.inputImage) {
      task.seedImage = params.inputImage
      task.strength = params.strength || 0.8
    }

    // Inpainting
    if (params.maskImage) {
      task.maskImage = params.maskImage
    }

    // ControlNet
    if (params.controlNet) {
      task.controlNet = params.controlNet
    }

    try {
      const result = await this.makeRequest([task])

      if (!result.data || result.data.length === 0) {
        throw new Error('No images returned from Runware API')
      }

      // Transform to OpenAI-compatible format
      return {
        created: Math.floor(Date.now() / 1000),
        data: result.data.map(item => ({
          url: item.imageURL,
          revised_prompt: null
        })),
        cost: result.data[0]?.cost || 0
      }
    } catch (error) {
      console.error(`[Runware REST] Image generation failed:`, error)
      throw new Error(`Runware image generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate video using Runware REST API
   */
  async generateVideo(params: RunwareVideoParams): Promise<{
    created: number
    data: Array<{ url?: string; b64_json?: string; revised_prompt?: string | null }>
    cost?: number
  }> {
    console.log(`[Runware Video] Starting REST API video generation`)
    console.log(`[Runware Video] Model: ${params.model}, Duration: ${params.duration}s`)

    // Generate a proper UUID v4 for this Runware task (REQUIRED by Runware API)
    const taskUUID = crypto.randomUUID()
    
    // Build video request
    const task: any = {
      taskType: 'videoInference',
      taskUUID: taskUUID, // REQUIRED by Runware API - must be UUID v4
      positivePrompt: params.prompt,
      model: params.model,
      duration: params.duration,
      width: params.width || 864,
      height: params.height || 480,
      fps: params.fps || 24,
      outputFormat: 'mp4',
      numberResults: 1,
      includeCost: params.includeCost ?? true,
      outputQuality: 85
    }
    
    console.log(`[Runware Video] Generated taskUUID for Runware: ${taskUUID}`)

    // Add optional parameters
    if (params.negativePrompt) task.negativePrompt = params.negativePrompt
    if (params.seed) task.seed = params.seed
    
    // Add frameImages for image-to-video
    if (params.frameImages && params.frameImages.length > 0) {
      task.referenceImages = params.frameImages.map(f => f.inputImage)
    }
    
    // Add provider-specific settings
    if (params.providerSettings) {
      task.providerSettings = params.providerSettings
    }

    try {
      const result = await this.makeRequest([task])

      if (!result.data || result.data.length === 0) {
        throw new Error('No videos returned from Runware API')
      }

      return {
        created: Math.floor(Date.now() / 1000),
        data: result.data.map(item => ({
          url: item.videoURL,
          revised_prompt: null
        })),
        cost: result.data[0]?.cost || 0
      }
    } catch (error) {
      console.error(`[Runware REST] Video generation failed:`, error)
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

    const taskUUID = crypto.randomUUID()
    const task = {
      taskType: 'imageBackgroundRemoval',
      taskUUID: taskUUID,
      inputImage: params.inputImage,
      outputFormat: 'PNG',
      outputType: ['URL'],
      includeCost: params.includeCost ?? true
    }

    try {
      const result = await this.makeRequest([task])

      return {
        created: Math.floor(Date.now() / 1000),
        data: result.data.map(item => ({
          url: item.imageURL,
          revised_prompt: null
        })),
        cost: result.data[0]?.cost || 0
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

    const taskUUID = crypto.randomUUID()
    const task = {
      taskType: 'imageUpscale',
      taskUUID: taskUUID,
      inputImage: params.inputImage,
      upscaleFactor: params.upscaleFactor || 4,
      outputFormat: 'PNG',
      outputType: ['URL'],
      includeCost: params.includeCost ?? true
    }

    try {
      const result = await this.makeRequest([task])

      return {
        created: Math.floor(Date.now() / 1000),
        data: result.data.map(item => ({
          url: item.imageURL,
          revised_prompt: null
        })),
        cost: result.data[0]?.cost || 0
      }
    } catch (error) {
      throw new Error(`Runware upscaling failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Extract text from image (OCR/Image-to-text)
   */
  async imageToText(inputImage: string): Promise<string> {
    const taskUUID = crypto.randomUUID()
    const task = {
      taskType: 'imageCaption',
      taskUUID: taskUUID,
      inputImage
    }

    try {
      const result = await this.makeRequest([task])
      return (result.data[0] as any)?.text || ''
    } catch (error) {
      throw new Error(`Runware image-to-text failed: ${error instanceof Error ? error.message : String(error)}`)
    }
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
 * Reuses instance across requests (no connection needed with REST API)
 */
let runwareInstance: RunwareService | null = null

/**
 * Get or create Runware service instance
 * Singleton pattern for Cloudflare Workers environment
 */
export function getRunwareService(apiKey: string, config?: Partial<RunwareConfig>): RunwareService {
  if (!runwareInstance) {
    console.log('[Runware Service] Creating new REST API service instance')
    runwareInstance = createRunwareService(apiKey, config)
  }
  return runwareInstance
}
