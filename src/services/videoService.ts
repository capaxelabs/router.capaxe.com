import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { getModelService } from './modelService'
import { selectProvider, RequestParams } from '../utils/providerSelector'
import { createStorageService, R2StorageService } from '../lib/storage'
import { VideoGenerationRequest } from '../lib/validation'
import { runModel } from './cloudflareAI'


export interface VideoGenerationParams extends VideoGenerationRequest {
  files?: {
    image?: File[]
  }
  imagesData?: Array<{
    data: string
    type?: string
    filename?: string
  }>
}

export interface VideoGenerationResult {
  created: number
  data: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string | null
  }>
  latency?: number
  cost?: number
  provider?: string
}

/**
 * Generate videos via Cloudflare AI (catalog models like google/veo-3.1 or
 * bytedance/seedance-2.0-mini through the AI Gateway binding).
 * Called from the queue consumer; the binding waits for completion and
 * returns a URL, so no operation polling is needed.
 */
export async function generateVideo(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams,
  userId: string
): Promise<VideoGenerationResult & { provider?: string }> {
  const startTime = Date.now()

  // Get model configuration from database
  const db = c.get('db')
  const modelService = getModelService(db)
  const allVideoModels = await modelService.getActiveModelsAsObject('video')
  const modelConfig = allVideoModels[params.model]
  if (!modelConfig) {
    throw new Error(`Model '${params.model}' not found`)
  }

  // Select provider (all models route through Cloudflare AI)
  const providerIndex = selectProvider(modelConfig.providers, params as RequestParams)
  const selectedProvider = modelConfig.providers[providerIndex]

  if (!selectedProvider) {
    throw new Error('Invalid provider selected')
  }

  const actualModel = selectedProvider.model_name

  // Apply image processing if needed
  let processedParams = { ...params }
  if (params.files?.image && typeof selectedProvider.applyImage === 'function') {
    processedParams = await selectedProvider.applyImage(processedParams)
  }
  delete processedParams.files

  let result = await generateCloudflareVideo(c, { ...processedParams, model: actualModel }, selectedProvider)

  result.latency = Date.now() - startTime

  // Process through storage service if not a test model
  if (!params.model.includes('test')) {
    const storageService = createStorageService(
      c.env.R2_ACCOUNT_ID,
      c.env.R2_ACCESS_KEY_ID,
      c.env.R2_SECRET_ACCESS_KEY,
      c.env.R2_BUCKET_NAME,
      c.env.R2_CUSTOM_PUBLIC_URL
    )
    if (storageService) {
      result = await processVideoResult(result, storageService, userId, params.response_format || 'url')
    }
  }

  return { ...result, provider: 'workers-ai' }
}

/**
 * Run a video model through the Cloudflare AI binding.
 * Catalog response shape: { state: 'Completed', result: { video: '<url>' } }
 */
async function generateCloudflareVideo(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: VideoGenerationParams & { model: string },
  providerConfig: { inputImageParam?: string; durationFormat?: string } = {}
): Promise<VideoGenerationResult> {
  const inputs: Record<string, any> = {
    prompt: params.prompt
  }

  // Aspect ratio: explicit param wins, otherwise derive from size (e.g. '1280x720')
  if (params.aspect_ratio) {
    inputs.aspect_ratio = params.aspect_ratio
  } else if (params.size) {
    const [width, height] = params.size.split('x').map(Number)
    if (width && height) {
      inputs.aspect_ratio = width >= height ? '16:9' : '9:16'
    }
  }

  if (params.resolution) inputs.resolution = params.resolution
  if (params.duration) {
    // e.g. Veo expects '8s' strings; Seedance expects plain numbers
    inputs.duration = providerConfig.durationFormat === 'seconds-string' && typeof params.duration === 'number'
      ? `${params.duration}s`
      : params.duration
  }
  if (params.negative_prompt) inputs.negative_prompt = params.negative_prompt
  if (params.seed) inputs.seed = params.seed

  // Image-to-video: pass the reference image as a data URI
  // (catalog convention is 'image_input', e.g. google/veo-3.1)
  if (params.imagesData && params.imagesData.length > 0 && params.imagesData[0].data) {
    const first = params.imagesData[0]
    inputs[providerConfig.inputImageParam || 'image_input'] = `data:${first.type || 'image/png'};base64,${first.data}`
  }

  const response = await runModel(c.env, params.model, inputs)

  const videoUrl = response?.result?.video || response?.video
  if (!videoUrl || typeof videoUrl !== 'string') {
    throw new Error(`No video in Cloudflare AI response for model '${params.model}': ${JSON.stringify(response?.result || response || {})}`)
  }

  return {
    created: Math.floor(Date.now() / 1000),
    data: [{
      url: videoUrl,
      revised_prompt: null
    }]
  }
}

/**
 * Process video generation result through storage.
 * Provider URLs are ephemeral - always re-upload to R2.
 */
async function processVideoResult(
  result: VideoGenerationResult,
  storageService: R2StorageService,
  userId: string,
  responseFormat: 'url' | 'b64_json'
): Promise<VideoGenerationResult> {
  const processedData = await Promise.all(
    result.data.map(async (item) => {
      try {
        if (item.url) {
          const uploadResult = await storageService.downloadAndUpload(item.url, 'video/mp4', 'video')
          return {
            url: uploadResult.url,
            revised_prompt: item.revised_prompt
          }
        }

        if (item.b64_json && responseFormat === 'url') {
          const videoBuffer = Uint8Array.from(atob(item.b64_json), c => c.charCodeAt(0))
          const fileName = storageService.generateFileName('video/mp4', 'video')
          const url = await storageService.uploadFile(fileName, videoBuffer.buffer, {
            contentType: 'video/mp4'
          })
          return {
            url,
            revised_prompt: item.revised_prompt
          }
        }

        return item
      } catch (error) {
        // Surface the failure instead of storing an ephemeral provider URL
        throw new Error(`Failed to upload video to storage: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  )

  return {
    ...result,
    data: processedData
  }
}
