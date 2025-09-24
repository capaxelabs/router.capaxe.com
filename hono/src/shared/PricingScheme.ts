/**
 * Standard pricing types for image generation models
 */
export const PRICING_TYPES = {
  // Fixed price per image, regardless of size/quality
  FIXED: 'fixed',
  
  // Price calculated based on quality/size/parameters
  CALCULATED: 'calculated',
  
  // Price determined after generation (not calculable beforehand)
  POST_GENERATION: 'post_generation'
} as const

export type PricingType = typeof PRICING_TYPES[keyof typeof PRICING_TYPES]