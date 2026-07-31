import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { getModelService } from './modelService'
import { selectProvider, RequestParams } from '../utils/providerSelector'
import { createStorageService } from '../lib/storage'
import { extractWidthHeight } from '../lib/imageHelpers'
import { ImageGenerationRequest } from '../lib/validation'
import { runModel } from './cloudflareAI'


export interface ImageGenerationParams extends ImageGenerationRequest {
  files?: {
    image?: File[]
    mask?: File[]
  }
  imagesData?: Array<{
    data: string
    type?: string
    filename?: string
  }>
}

export interface GenerationResult {
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
 * Generate images via Cloudflare AI (Workers AI models and third-party
 * catalog models, both through the AI Gateway binding).
 */
export async function generateImage(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: ImageGenerationParams,
  userId: string
): Promise<GenerationResult> {
  const startTime = Date.now()

  // Get model configuration from database
  const db = c.get('db')
  const modelService = getModelService(db)
  const allImageModels = await modelService.getActiveModelsAsObject('image')
  const modelConfig = allImageModels[params.model]
  if (!modelConfig) {
    throw new Error(`Model '${params.model}' not found`)
  }

  // Select provider (all models route through Cloudflare AI)
  const providerIndex = selectProvider(modelConfig.providers, params as RequestParams)
  const selectedProvider = modelConfig.providers[providerIndex]

  if (!selectedProvider) {
    throw new Error('Invalid provider selected')
  }

  // The catalog model name, e.g. '@cf/black-forest-labs/flux-1-schnell' or 'google/imagen-4'
  const actualModel = selectedProvider.model_name

  // Apply image processing if needed
  let processedParams = { ...params }
  if (params.files?.image && typeof selectedProvider.applyImage === 'function') {
    processedParams = await selectedProvider.applyImage(processedParams)
  }

  // Apply mask processing if needed
  if (params.files?.mask && typeof selectedProvider.applyMask === 'function') {
    processedParams = await selectedProvider.applyMask(processedParams)
  }

  // Clean up files reference
  delete processedParams.files

  // Apply quality settings if available
  if (params.quality && typeof selectedProvider.applyQuality === 'function') {
    processedParams = selectedProvider.applyQuality(processedParams)
  }

  let result = await generateCloudflareImage(c, { ...processedParams, model: actualModel })

  result.latency = Date.now() - startTime
  result.provider = 'workers-ai'

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
      result = await storageService.processImageResult(result, userId, params.response_format || 'url')
    }
  }

  return result
}

/**
 * Run an image model through the Cloudflare AI binding and normalize
 * the response to the OpenAI-style result shape.
 */
async function generateCloudflareImage(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: ImageGenerationParams & { model: string }
): Promise<GenerationResult> {
  const { width, height } = extractWidthHeight(params.size || 'auto')

  const inputs: Record<string, any> = {
    prompt: params.prompt
  }

  if (width) inputs.width = width
  if (height) inputs.height = height
  if (params.n && params.n > 1) inputs.num_images = params.n
  if (params.seed) inputs.seed = params.seed
  if (params.steps) inputs.steps = params.steps
  if (params.negativePrompt) inputs.negative_prompt = params.negativePrompt
  if (params.aspect_ratio) inputs.aspect_ratio = params.aspect_ratio

  // Reference image input (image editing / img2img) as a data URI
  if (params.imagesData && params.imagesData.length > 0 && params.imagesData[0].data) {
    const first = params.imagesData[0]
    inputs.image = `data:${first.type || 'image/png'};base64,${first.data}`
  }

  const response = await runModel(c.env, params.model, inputs)

  let data: GenerationResult['data']
  if (response instanceof ReadableStream) {
    // Some Workers AI models stream raw image bytes
    data = [{ b64_json: await streamToBase64(response), revised_prompt: null }]
  } else {
    data = normalizeImageResponse(response)
  }

  if (data.length === 0) {
    throw new Error(`No image data in Cloudflare AI response for model '${params.model}'`)
  }

  return {
    created: Math.floor(Date.now() / 1000),
    data
  }
}

/**
 * Cloudflare AI image models return different shapes:
 * - Workers AI (@cf/...): { image: '<base64>' } or a binary ReadableStream
 * - Catalog models (e.g. google/imagen-4): { state, result: { image: '<url>' } }
 */
function normalizeImageResponse(response: any): GenerationResult['data'] {
  const items: GenerationResult['data'] = []

  const pushValue = (value: unknown) => {
    if (typeof value !== 'string' || value.length === 0) return
    if (value.startsWith('http://') || value.startsWith('https://')) {
      items.push({ url: value, revised_prompt: null })
    } else {
      items.push({ b64_json: value, revised_prompt: null })
    }
  }

  if (response) {
    pushValue(response.image)
    pushValue(response.result?.image)

    for (const value of response.images || []) pushValue(value)
    for (const value of response.result?.images || []) pushValue(value)
  }

  return items
}

/**
 * Binary image responses (some Workers AI models stream raw PNG bytes).
 */
async function streamToBase64(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  let binary = ''
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 8192) {
      binary += String.fromCharCode(...chunk.slice(i, i + 8192))
    }
  }

  return btoa(binary)
}
