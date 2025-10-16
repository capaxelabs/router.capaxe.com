


export interface ModelData {
  id: string
  providers: Provider[]
  arena_score?: number
  release_date?: string
  examples?: Array<{ image?: string; video?: string }>
}

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
  provider?: string  // Allow explicit provider selection
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

  // Special-case selection based on user preferences or request parameters
  if (requestParams.provider) {
    // Allow explicit provider selection via API parameter
    const idx = providers.findIndex(p => p.id === requestParams.provider)
    if (idx !== -1) {
      return idx
    }
  }

  // Default: return first provider (Google or Runware based on model definition)
  return 0
}

export default selectProvider