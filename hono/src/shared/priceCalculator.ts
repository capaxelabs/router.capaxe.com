import { googleImageModels } from './imageModels/google'
import { googleVideoModels } from './videoModels/google'
import { PRICING_TYPES } from './PricingScheme'

const models = {
  ...googleImageModels,
  ...googleVideoModels
}

/**
 * Convert USD price to database format (multiply by 10000 to get 4 decimal places)
 */
export function convertPriceToDbFormat(usdPrice: number): number {
  return Math.ceil(usdPrice * 10000)
}

/**
 * Pre-calculate the price for the model. This is used to deduct credits before generation.
 * If the price cannot be calculated before generation, return the max price.
 */
export function preCalcPrice(modelName: string, size?: string, quality?: string, providerIndex?: number): number {
  const modelConfig = models[modelName]
  if (!modelConfig) {
    throw new Error(`Model '${modelName}' not found in price calculator`)
  }

  if (providerIndex === undefined || !modelConfig.providers[providerIndex]) {
    throw new Error(`Invalid provider index ${providerIndex} for model '${modelName}'`)
  }

  const pricing = modelConfig.providers[providerIndex].pricing

  switch (pricing.type) {
    case PRICING_TYPES.FIXED:
      return pricing.value || 0
    case PRICING_TYPES.CALCULATED:
      if (typeof pricing.calcFunction === 'function') {
        return pricing.calcFunction(quality)
      }
      throw new Error(`Model '${modelName}' has calculated pricing but no calcFunction`)
    case PRICING_TYPES.POST_GENERATION:
      return pricing.range?.max ?? pricing.value ?? 0
    default:
      throw new Error(`Invalid pricing type for model '${modelName}', please contact support`)
  }
}

/**
 * Post-calculate the price for models that cannot be estimated before generation.
 */
export function postCalcPrice(
  modelName: string, 
  size?: string, 
  quality?: string, 
  generationResult?: any, 
  providerIndex?: number
): number {
  const modelConfig = models[modelName]
  if (!modelConfig) {
    throw new Error(`Model '${modelName}' not found in price calculator`)
  }

  if (providerIndex === undefined || !modelConfig.providers[providerIndex]) {
    throw new Error(`Invalid provider index ${providerIndex} for model '${modelName}'`)
  }

  const pricing = modelConfig.providers[providerIndex].pricing

  if (pricing.type === PRICING_TYPES.POST_GENERATION) {
    if (typeof pricing.postCalcFunction === 'function') {
      return pricing.postCalcFunction(generationResult)
    }
    // If no post calc function, use range min or value
    return pricing.range?.min ?? pricing.value ?? 0
  }

  // Default to pre-calculated price
  return preCalcPrice(modelName, size, quality, providerIndex)
}