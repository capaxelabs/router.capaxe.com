import { z } from 'zod'

// Quality enum validation
export const QualitySchema = z.enum(['auto', 'low', 'medium', 'high'])

// Size validation (e.g., "1024x1024", "auto", or aspect ratio "16:9")
export const SizeSchema = z.union([
  z.string().regex(/^\d+x\d+$/, 'Size must be in format WIDTHxHEIGHT (e.g., 1024x1024)'),
  z.string().regex(/^\d+:\d+$/, 'Aspect ratio must be in format WIDTH:HEIGHT (e.g., 16:9)'),
  z.literal('auto')
])

// Base image generation request schema
export const BaseImageRequestSchema = z.object({
  model: z.string().min(1, 'Model is required'),
  prompt: z.string().min(1, 'Prompt is required').max(4000, 'Prompt too long'),
  n: z.number().int().min(1).max(16).default(1),
  size: SizeSchema.default('auto'),
  quality: QualitySchema.optional(),
  style: z.enum(['vivid', 'natural']).optional(),
  response_format: z.enum(['url', 'b64_json']).default('url'),
  user: z.string().optional()
})

// Supported image MIME types
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heif',
  'image/heic',
] as const

// Base64 image data schema with MIME type validation
const Base64ImageSchema = z.object({
  data: z.string().min(1, 'Base64 image data required'),
  type: z.enum(SUPPORTED_IMAGE_TYPES as any, {
    errorMap: () => ({
      message: `Unsupported image type. Supported formats: JPEG, PNG, WebP, HEIF, HEIC.`
    })
  }).optional(),
  filename: z.string().optional()
})

// Image generation with base64 image inputs (preferred method)
export const ImageGenerationRequestSchema = BaseImageRequestSchema.extend({
  image: z.union([
    z.string(),  // Legacy: Base64 string or URL
    Base64ImageSchema, // Preferred: Structured base64 object
    z.array(Base64ImageSchema) // Multiple images
  ]).optional(),
  mask: z.union([
    z.string(),  // Legacy: Base64 string or URL  
    Base64ImageSchema // Structured base64 object
  ]).optional()
})

// Video generation request schema
export const VideoGenerationRequestSchema = z.object({
  model: z.string().min(1, 'Model is required'),
  prompt: z.string().min(1, 'Prompt is required').max(4000, 'Prompt too long'),
  size: SizeSchema.default('auto'),
  quality: QualitySchema.optional(),
  duration: z.number().min(1).max(10).default(5),
  fps: z.number().int().min(12).max(60).default(24),
  response_format: z.enum(['url', 'b64_json']).default('url'),
  negative_prompt: z.string().optional(),
  user: z.string().optional(),
  // Aspect ratio (Veo supports 16:9/9:16, Kling also supports 1:1)
  aspect_ratio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  resolution: z.enum(['720p', '1080p']).default('720p'),
  person_generation: z.enum(['allow_all', 'allow_adult', 'dont_allow']).default('allow_all'),
  seed: z.number().int().optional(),
  guidance_scale: z.number().min(0).max(1).optional(),
  start_image: z.string().url().optional(),
  end_image: z.string().url().optional(),
  image: z.union([
    z.string(),  // Legacy: Base64 string or URL
    Base64ImageSchema, // Preferred: Structured base64 object  
    z.array(Base64ImageSchema) // Multiple images for video
  ]).optional()
})

// Model list response schema
export const ModelResponseSchema = z.record(z.object({
  id: z.string(),
  providers: z.array(z.object({
    id: z.string(),
    model_name: z.string(),
    pricing: z.object({
      type: z.enum(['fixed', 'calculated', 'post_generation']),
      value: z.number().optional(),
      range: z.object({
        min: z.number(),
        average: z.number(),
        max: z.number()
      }).optional()
    })
  })),
  arena_score: z.number().optional(),
  release_date: z.string().optional(),
  examples: z.array(z.object({
    image: z.string().optional(),
    video: z.string().optional()
  })).optional()
}))

// Error response schema
export const ErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string().optional(),
    param: z.string().optional()
  })
})

// Success response schemas
export const ImageGenerationResponseSchema = z.object({
  created: z.number(),
  data: z.array(z.object({
    url: z.string().optional(),
    b64_json: z.string().optional(),
    revised_prompt: z.string().optional()
  })),
  cost: z.number().optional()
})

export const VideoGenerationResponseSchema = z.object({
  created: z.number(),
  data: z.array(z.object({
    url: z.string().optional(),
    b64_json: z.string().optional(),
    revised_prompt: z.string().optional()
  })),
  cost: z.number().optional()
})

// Type exports
export type ImageGenerationRequest = z.infer<typeof ImageGenerationRequestSchema>
export type VideoGenerationRequest = z.infer<typeof VideoGenerationRequestSchema>
export type ImageGenerationResponse = z.infer<typeof ImageGenerationResponseSchema>
export type VideoGenerationResponse = z.infer<typeof VideoGenerationResponseSchema>
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
export type Quality = z.infer<typeof QualitySchema>

// Aspect ratio to pixel dimensions converter
export function convertAspectRatioToSize(aspectRatio: string, defaultResolution: number = 1024): string {
  // If it's already in pixel format, return as-is
  if (/^\d+x\d+$/.test(aspectRatio)) {
    return aspectRatio
  }

  // If it's "auto", return as-is
  if (aspectRatio === 'auto') {
    return aspectRatio
  }

  // Parse aspect ratio (e.g., "16:9")
  const match = aspectRatio.match(/^(\d+):(\d+)$/)
  if (!match) {
    return aspectRatio // Return original if not recognized
  }

  const [, widthRatio, heightRatio] = match
  const width = parseInt(widthRatio)
  const height = parseInt(heightRatio)

  // Common aspect ratio mappings to standard resolutions
  const aspectRatioMap: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '1024x768',
    '3:4': '768x1024',
    '21:9': '2048x896',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '4:5': '1024x1280',
    '5:4': '1280x1024'
  }

  // Check if we have a predefined mapping
  if (aspectRatioMap[aspectRatio]) {
    return aspectRatioMap[aspectRatio]
  }

  // Calculate dimensions while maintaining aspect ratio
  // Use defaultResolution as the longer side
  if (width > height) {
    const calculatedHeight = Math.round((defaultResolution * height) / width)
    // Round to nearest 64 (many models require dimensions divisible by 64)
    const roundedHeight = Math.round(calculatedHeight / 64) * 64
    return `${defaultResolution}x${roundedHeight}`
  } else {
    const calculatedWidth = Math.round((defaultResolution * width) / height)
    const roundedWidth = Math.round(calculatedWidth / 64) * 64
    return `${roundedWidth}x${defaultResolution}`
  }
}

// Validation helper functions
export function validateImageRequest(data: unknown): ImageGenerationRequest {
  try {
    return ImageGenerationRequestSchema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0]
      throw new Error(`Validation error: ${firstError.message} at ${firstError.path.join('.')}`)
    }
    throw error
  }
}

export function validateVideoRequest(data: unknown): VideoGenerationRequest {
  try {
    return VideoGenerationRequestSchema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0]
      throw new Error(`Validation error: ${firstError.message} at ${firstError.path.join('.')}`)
    }
    throw error
  }
}

// Model validation helpers
export function validateModelExists(modelId: string, availableModels: Record<string, any>): void {
  if (!availableModels[modelId]) {
    const availableIds = Object.keys(availableModels).join(', ')
    throw new Error(`Invalid model '${modelId}'. Available models: ${availableIds}`)
  }
}

export function validateProviderExists(modelConfig: any, providerIndex: number): void {
  if (!modelConfig.providers || !modelConfig.providers[providerIndex]) {
    throw new Error(`Invalid provider index ${providerIndex} for model`)
  }
}