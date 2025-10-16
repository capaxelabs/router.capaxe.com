/**
 * Model Function Registry
 * 
 * This registry stores all custom transformation, validation, and pricing functions
 * that were previously embedded in model class methods. By extracting them here,
 * we can reference them from database records using function names.
 * 
 * Usage:
 *   const fn = MODEL_FUNCTIONS[model.applyImageFn]
 *   const result = await fn(params)
 */

import { processSingleOrMultipleFiles, processSingleFile } from '../../lib/imageHelpers'

// ============================================================================
// Type Definitions
// ============================================================================

export type ModelFunction = (...args: any[]) => any | Promise<any>

export interface ModelFunctionRegistry {
  [key: string]: ModelFunction
}

// ============================================================================
// Image Processing Functions
// ============================================================================

/**
 * Gemini 2.5 Flash - Process single or multiple image files
 */
export async function gemini25FlashApplyImage(params: any): Promise<any> {
  const processedImages = await processSingleOrMultipleFiles(params.files.image)
  params.imagesData = Array.isArray(processedImages) ? processedImages : [processedImages]
  return params
}

/**
 * Gemini 2.0 Flash Exp - Process images for experimental model
 */
export async function gemini20FlashExpApplyImage(params: any): Promise<any> {
  const processedImages = await processSingleOrMultipleFiles(params.files.image)
  params.imagesData = Array.isArray(processedImages) ? processedImages : [processedImages]
  return params
}

/**
 * Gemini 2.0 Flash Previous - Process images
 */
export async function gemini20FlashPrevApplyImage(params: any): Promise<any> {
  const processedImages = await processSingleOrMultipleFiles(params.files.image)
  params.imagesData = Array.isArray(processedImages) ? processedImages : [processedImages]
  return params
}

/**
 * Veo 2 - Process single image file for video generation
 */
export async function veo2ApplyImage(params: any): Promise<any> {
  if (params.files?.image) {
    params.image = await processSingleFile(params.files.image)
    delete params.files.image
  }

  // Validate and set Veo 2 specific parameters
  veo2ValidateParams(params)
  
  return params
}

/**
 * Veo 3 - Process single image file for video generation
 */
export async function veo3ApplyImage(params: any): Promise<any> {
  if (params.files?.image) {
    params.image = await processSingleFile(params.files.image)
    delete params.files.image
  }

  // Validate and set Veo 3 specific parameters
  veo3ValidateParams(params)
  
  return params
}

/**
 * Veo 3 Fast - Process single image file for video generation
 */
export async function veo3FastApplyImage(params: any): Promise<any> {
  if (params.files?.image) {
    params.image = await processSingleFile(params.files.image)
    delete params.files.image
  }

  // Validate and set Veo 3 Fast specific parameters
  veo3FastValidateParams(params)
  
  return params
}

// ============================================================================
// Pricing Functions
// ============================================================================

/**
 * Gemini 2.5 Flash - Calculate price based on number of images generated
 */
export function gemini25FlashPostCalc(imageResult: { data?: any[] }): number {
  const pricePerImage = 0.0272
  const numberOfImages = imageResult.data ? imageResult.data.length : 1
  return pricePerImage * numberOfImages
}

/**
 * Gemini 2.0 Flash Exp - Calculate price based on number of images
 */
export function gemini20FlashExpPostCalc(imageResult: { data?: any[] }): number {
  const pricePerImage = 0.0272
  const numberOfImages = imageResult.data ? imageResult.data.length : 1
  return pricePerImage * numberOfImages
}

/**
 * Gemini 2.0 Flash Prev - Calculate price based on number of images
 */
export function gemini20FlashPrevPostCalc(imageResult: { data?: any[] }): number {
  const pricePerImage = 0.0272
  const numberOfImages = imageResult.data ? imageResult.data.length : 1
  return pricePerImage * numberOfImages
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Veo 2 - Validate and set parameters
 */
export function veo2ValidateParams(params: any): void {
  // Veo 2 supports both 16:9 and 9:16 aspect ratios
  if (params.aspect_ratio && !['16:9', '9:16'].includes(params.aspect_ratio)) {
    throw new Error('Veo 2 supports aspect ratios: "16:9", "9:16"')
  }

  // Veo 2 does not support 1080p resolution - always 720p
  if (params.resolution === '1080p') {
    console.warn('Veo 2 does not support 1080p resolution, using 720p instead')
    params.resolution = '720p'
  }

  // Person generation validation for Veo 2
  if (params.person_generation) {
    if (params.image) {
      // Image-to-video: allow_adult and dont_allow
      if (!['allow_adult', 'dont_allow'].includes(params.person_generation)) {
        console.warn('Veo 2 image-to-video supports person_generation: "allow_adult", "dont_allow", adjusting to allow_adult')
        params.person_generation = 'allow_adult'
      }
    } else {
      // Text-to-video: allow_all, allow_adult, dont_allow
      if (!['allow_all', 'allow_adult', 'dont_allow'].includes(params.person_generation)) {
        console.warn('Veo 2 text-to-video supports person_generation: "allow_all", "allow_adult", "dont_allow", adjusting to allow_all')
        params.person_generation = 'allow_all'
      }
    }
  }

  // Set defaults
  params.aspect_ratio = params.aspect_ratio || '16:9'
  params.resolution = '720p' // Always 720p for Veo 2
  params.person_generation = params.person_generation || (params.image ? 'allow_adult' : 'allow_all')
}

/**
 * Veo 3 - Validate and set parameters
 */
export function veo3ValidateParams(params: any): void {
  // Veo 3 supports 16:9, 9:16, and 1:1 aspect ratios
  if (params.aspect_ratio && !['16:9', '9:16', '1:1'].includes(params.aspect_ratio)) {
    throw new Error('Veo 3 supports aspect ratios: "16:9", "9:16", "1:1"')
  }

  // Veo 3 supports both 720p and 1080p
  if (params.resolution && !['720p', '1080p'].includes(params.resolution)) {
    throw new Error('Veo 3 supports resolutions: "720p", "1080p"')
  }

  // Person generation validation for Veo 3 - stricter than Veo 2
  if (params.person_generation) {
    if (params.image) {
      // Image-to-video: only dont_allow
      if (params.person_generation !== 'dont_allow') {
        console.warn('Veo 3 image-to-video only supports person_generation: "dont_allow", adjusting')
        params.person_generation = 'dont_allow'
      }
    } else {
      // Text-to-video: allow_all, allow_adult, dont_allow
      if (!['allow_all', 'allow_adult', 'dont_allow'].includes(params.person_generation)) {
        console.warn('Veo 3 text-to-video supports person_generation: "allow_all", "allow_adult", "dont_allow", adjusting to allow_all')
        params.person_generation = 'allow_all'
      }
    }
  }

  // Set defaults
  params.aspect_ratio = params.aspect_ratio || '16:9'
  params.resolution = params.resolution || '1080p' // Default to 1080p for Veo 3
  params.person_generation = params.person_generation || (params.image ? 'dont_allow' : 'allow_all')
}

/**
 * Veo 3 Fast - Validate and set parameters
 */
export function veo3FastValidateParams(params: any): void {
  // Veo 3 Fast has same validation as Veo 3
  veo3ValidateParams(params)
}

// ============================================================================
// Registry Export
// ============================================================================

/**
 * Main function registry - maps function names to implementations
 */
export const MODEL_FUNCTIONS: ModelFunctionRegistry = {
  // Image processing functions
  gemini25FlashApplyImage,
  gemini20FlashExpApplyImage,
  gemini20FlashPrevApplyImage,
  veo2ApplyImage,
  veo3ApplyImage,
  veo3FastApplyImage,

  // Pricing functions
  gemini25FlashPostCalc,
  gemini20FlashExpPostCalc,
  gemini20FlashPrevPostCalc,

  // Validation functions
  veo2ValidateParams,
  veo3ValidateParams,
  veo3FastValidateParams,
} as const

/**
 * Type-safe function name type
 */
export type ModelFunctionName = keyof typeof MODEL_FUNCTIONS

/**
 * Helper to execute a function from the registry with error handling
 */
export async function executeModelFunction(
  functionName: string | null | undefined,
  ...args: any[]
): Promise<any> {
  if (!functionName) {
    return args[0] // Return first arg unchanged if no function
  }

  const fn = MODEL_FUNCTIONS[functionName]
  if (!fn) {
    throw new Error(`Model function not found in registry: ${functionName}`)
  }

  try {
    return await fn(...args)
  } catch (error) {
    console.error(`Error executing model function ${functionName}:`, error)
    throw error
  }
}
