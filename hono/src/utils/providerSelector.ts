/**
 * Provider interface
 */
export interface Provider {
  id: string
  model_name: string
  pricing: {
    type: string
    value?: number
    range?: { min: number; average: number; max: number }
    postCalcFunction?: (params: any) => number
  }
  applyImage?: (params: any) => Promise<any>
  applyMask?: (params: any) => Promise<any>
  applyQuality?: (params: any) => any
}

/**
 * Request parameters interface
 */
export interface RequestParams {
  model?: string
  image?: string
  files?: {
    image?: any[]
    'image[]'?: any[]
    mask?: any[]
    'mask[]'?: any[]
  }
  [key: string]: any
}

/**
 * Utility to select a provider from the available list.
 *
 * For now this simply returns the first provider in the list, but keeping this
 * logic isolated in one place makes it easy to introduce more sophisticated
 * selection strategies (e.g. random, weighted, availability-based, user tier)
 * later without touching the callers.
 *
 * @param providers - Ordered list of provider implementations.
 * @param requestParams - Optional request parameters for provider selection.
 * @returns Index of the selected provider in the `providers` array.
 */
export function selectProvider(providers: Provider[], requestParams: RequestParams = {}): number {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error('No providers supplied to selectProvider()')
  }

  // Detect model identifier (can be plain or namespaced like 'openai/gpt-image-1')
  const modelId = requestParams.model || ''

  // Heuristic to detect whether the caller supplied an input image (file upload or URL/B64)
  const hasInputImage = Boolean(
    requestParams.image ||
    (requestParams.files && (requestParams.files.image || requestParams.files['image[]']))
  )

  // Determine desired provider ID under special-case rules
  let desiredProviderId = providers[0].id

  // Special-case selection for GPT-Image-1
  if (modelId === 'openai/gpt-image-1') {
    // If an input image is provided we need the OpenAI provider (supports edits),
    // otherwise we prefer NanoGPT which is cheaper for pure text-to-image.
    desiredProviderId = hasInputImage ? 'openai' : 'nanogpt'
  }
  // Special-case selection for Seedream-3/4
  if (modelId === 'bytedance/seedream-v3' || modelId === 'bytedance/seedream-v4') {
    // Prefer NanoGPT for pure text-to-image; use RunWare when an input image is supplied
    desiredProviderId = hasInputImage ? 'runware' : 'nanogpt'
  }

  // Find index of desired provider; fallback to 0 if not found
  const idx = providers.findIndex(p => p.id === desiredProviderId)
  return idx === -1 ? 0 : idx
}

export default selectProvider