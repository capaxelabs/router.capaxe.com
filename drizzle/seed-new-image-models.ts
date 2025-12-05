import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { models } from '../src/db/schema'
import 'dotenv/config'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const db = drizzle(client)

async function seedNewImageModels() {
  console.log('🌱 Seeding new image models (Google Gemini + Runware)...')

  const newImageModels = [
    // ============================================================================
    // GOOGLE GEMINI IMAGE MODELS
    // ============================================================================

    {
      // Gemini 2.5 Flash Image (Fast model)
      id: 'google/gemini-2.5-flash-image',
      name: 'Gemini 2.5 Flash Image',
      slug: 'gemini-25-flash-image',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      // Provider configuration
      providers: JSON.stringify([
        {
          id: 'gemini',
          model_name: 'gemini-2.5-flash-image',
          pricing: {
            type: 'fixed',
            value: 0.02, // $0.02 per image
          },
          maxRetries: 3,
          timeoutSeconds: 120,
        },
      ]),

      // Model metadata
      arenaScore: null,
      releaseDate: '2025-01-15',
      description: 'Fast and efficient image generation model optimized for high-volume, low-latency tasks. Generates 1024px resolution images with support for up to 3 reference images.',

      // Capabilities
      capabilities: JSON.stringify({
        supportsImage: true, // Can accept image inputs
        supportsMask: false,
        supportsQuality: false,
        aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
        maxResolution: '1024x1024',
        maxInputImages: 3, // Maximum 3 reference images
        supportsTextToImage: true,
        supportsImageToImage: true,
        supportsMultiTurn: true,
        defaultResolution: '1024x1024',
      }),

      // Tags
      tags: JSON.stringify(['fast', 'multimodal', 'text-to-image', 'image-editing', 'gemini', 'google']),
      category: 'text-to-image',

      // Examples
      examples: JSON.stringify([
        {
          prompt: 'A photorealistic close-up portrait of an elderly Japanese ceramicist with deep wrinkles',
          parameters: { aspect_ratio: '1:1' },
        },
      ]),
    },

    {
      // Gemini 3 Pro Image Preview (Advanced model)
      id: 'google/gemini-3-pro-image-preview',
      name: 'Gemini 3 Pro Image Preview',
      slug: 'gemini-3-pro-image-preview',
      type: 'image' as const,
      status: 'beta' as const,
      isPublic: true,

      // Provider configuration
      providers: JSON.stringify([
        {
          id: 'gemini',
          model_name: 'gemini-3-pro-image-preview',
          pricing: {
            type: 'calculated', // Varies by resolution: 1K=1210 tokens, 2K=1210 tokens, 4K=2000 tokens
            value: 0.04, // Base price ~$0.036-$0.06 per image depending on resolution
          },
          maxRetries: 3,
          timeoutSeconds: 300, // Longer timeout for thinking process
        },
      ]),

      // Model metadata
      arenaScore: null,
      releaseDate: '2025-01-15',
      description: 'State-of-the-art image generation model with advanced reasoning, Google Search grounding, and up to 4K output. Features thinking mode for complex prompts and supports up to 14 reference images for high-fidelity consistency.',

      // Capabilities
      capabilities: JSON.stringify({
        supportsImage: true,
        supportsMask: false,
        supportsQuality: true, // Supports 1K, 2K, 4K
        aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
        maxResolution: '4096x4096',

        // Reference image limits
        maxInputImages: 14, // Maximum 14 reference images total
        maxObjectImages: 6, // Up to 6 "objects" for high-fidelity object consistency
        maxHumanImages: 5, // Up to 5 "human" for character/face consistency

        supportsTextToImage: true,
        supportsImageToImage: true,
        supportsMultiTurn: true,
        supportsGoogleSearch: true,
        supportsThinkingMode: true,
        defaultResolution: '1024x1024',
        resolutionOptions: ['1K', '2K', '4K'],
      }),

      // Tags
      tags: JSON.stringify([
        'advanced',
        'multimodal',
        'text-to-image',
        'image-editing',
        'google-search',
        'thinking',
        'high-res',
        'beta',
        'gemini',
        'google',
      ]),
      category: 'text-to-image',

      // Examples
      examples: JSON.stringify([
        {
          prompt: 'Create a vibrant infographic that explains photosynthesis as a recipe',
          parameters: { aspect_ratio: '16:9', image_size: '2K' },
        },
      ]),
    },

    // ============================================================================
    // RUNWARE MODELS
    // ============================================================================

    {
      // Runware - FLUX Pro (High Quality)
      id: 'runware/flux-pro-v1.1',
      name: 'FLUX Pro v1.1',
      slug: 'flux-pro-v11',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      // Provider configuration
      // Runware uses special model naming: {provider}:{version}@{variant}
      providers: JSON.stringify([
        {
          id: 'runware',
          model_name: 'runware:101@1', // Runware's FLUX Pro model identifier
          pricing: {
            type: 'fixed',
            value: 0.04, // $0.04 per image
          },
          maxRetries: 3,
          timeoutSeconds: 120,
        },
      ]),

      // Model metadata
      arenaScore: 1320,
      releaseDate: '2024-08-01',
      description: 'State-of-the-art text-to-image model with exceptional prompt adherence and image quality. Professional-grade results for creative projects.',

      // Capabilities
      capabilities: JSON.stringify({
        supportsImage: true, // Supports image-to-image
        supportsMask: true, // Supports inpainting
        supportsQuality: true,
        aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'],
        maxResolution: '1440x1440',
        defaultResolution: '1024x1024',
        supportsTextToImage: true,
        supportsImageToImage: true,
        supportsInpainting: true,
        supportsControlNet: true,
        supportsUpscaling: true,
        supportsNegativePrompt: true,
        stepsRange: { min: 1, max: 50, default: 20 },
        guidanceRange: { min: 0, max: 20, default: 7.5 },
      }),

      // Tags
      tags: JSON.stringify(['flux', 'high-quality', 'professional', 'text-to-image', 'runware']),
      category: 'text-to-image',

      // Examples
      examples: JSON.stringify([
        {
          prompt: 'A serene Japanese garden with cherry blossoms, koi pond, and traditional architecture',
          parameters: { width: 1024, height: 1024, steps: 20 },
        },
      ]),
    },

    {
      // Runware - Sourceful FLUX V1
      id: 'runware/sourceful-flux-v1',
      name: 'Sourceful FLUX V1',
      slug: 'sourceful-flux-v1',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      // Provider configuration
      providers: JSON.stringify([
        {
          id: 'runware',
          model_name: 'sourceful:1@1', // Runware model identifier
          pricing: {
            type: 'fixed',
            value: 0.035, // $0.035 per image
          },
          maxRetries: 3,
          timeoutSeconds: 120,
        },
      ]),

      // Model metadata
      arenaScore: null,
      releaseDate: '2024-09-15',
      description: 'High-quality image generation model optimized for artistic and creative workflows with excellent detail preservation.',

      // Capabilities
      capabilities: JSON.stringify({
        supportsImage: true,
        supportsMask: true,
        supportsQuality: true,
        aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        maxResolution: '1024x1024',
        defaultResolution: '1024x1024',
        supportsTextToImage: true,
        supportsImageToImage: true,
        supportsInpainting: true,
        supportsNegativePrompt: true,
        stepsRange: { min: 1, max: 50, default: 20 },
      }),

      // Tags
      tags: JSON.stringify(['flux', 'artistic', 'creative', 'text-to-image', 'runware']),
      category: 'text-to-image',

      // Examples
      examples: JSON.stringify([
        {
          prompt: 'Abstract watercolor painting of a sunset over mountains',
          parameters: { width: 1024, height: 1024 },
        },
      ]),
    },

    {
      // Runware - ByteDance Seedream V5
      id: 'runware/bytedance-seedream-v5',
      name: 'ByteDance Seedream V5',
      slug: 'bytedance-seedream-v5',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      // Provider configuration
      providers: JSON.stringify([
        {
          id: 'runware',
          model_name: 'bytedance:5@0', // Runware model identifier
          pricing: {
            type: 'fixed',
            value: 0.02, // $0.02 per image
          },
          maxRetries: 3,
          timeoutSeconds: 90,
        },
      ]),

      // Model metadata
      arenaScore: null,
      releaseDate: '2024-11-01',
      description: 'Fast and efficient image generation model from ByteDance with good prompt understanding and quick generation times.',

      // Capabilities
      capabilities: JSON.stringify({
        supportsImage: false, // Text-to-image only
        supportsMask: false,
        supportsQuality: false,
        aspectRatios: ['1:1', '16:9', '9:16'],
        maxResolution: '1024x1024',
        defaultResolution: '1024x1024',
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsNegativePrompt: true,
        stepsRange: { min: 1, max: 30, default: 20 },
      }),

      // Tags
      tags: JSON.stringify(['bytedance', 'fast', 'efficient', 'text-to-image', 'runware']),
      category: 'text-to-image',

      // Examples
      examples: JSON.stringify([
        {
          prompt: 'Futuristic cityscape at night with neon lights',
          parameters: { width: 1024, height: 1024 },
        },
      ]),
    },

    {
      // Runware - ByteDance Seedream V3
      id: 'runware/bytedance-seedream-v3',
      name: 'ByteDance Seedream V3',
      slug: 'bytedance-seedream-v3',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      // Provider configuration
      providers: JSON.stringify([
        {
          id: 'runware',
          model_name: 'bytedance:3@0', // Runware model identifier
          pricing: {
            type: 'fixed',
            value: 0.015, // $0.015 per image
          },
          maxRetries: 3,
          timeoutSeconds: 90,
        },
      ]),

      // Model metadata
      arenaScore: null,
      releaseDate: '2024-08-15',
      description: 'Previous generation ByteDance image generation model, optimized for cost-effective bulk generation.',

      // Capabilities
      capabilities: JSON.stringify({
        supportsImage: false,
        supportsMask: false,
        supportsQuality: false,
        aspectRatios: ['1:1', '16:9', '9:16'],
        maxResolution: '1024x1024',
        defaultResolution: '1024x1024',
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsNegativePrompt: true,
      }),

      // Tags
      tags: JSON.stringify(['bytedance', 'cost-effective', 'text-to-image', 'runware']),
      category: 'text-to-image',

      // Examples
      examples: JSON.stringify([
        {
          prompt: 'Simple product photograph on white background',
          parameters: { width: 1024, height: 1024 },
        },
      ]),
    },
  ]

  try {
    for (const model of newImageModels) {
      await db
        .insert(models)
        .values(model)
        .onConflictDoUpdate({
          target: models.id,
          set: {
            name: model.name,
            providers: model.providers,
            capabilities: model.capabilities,
            description: model.description,
            tags: model.tags,
            examples: model.examples,
            arenaScore: model.arenaScore,
            releaseDate: model.releaseDate,
            updatedAt: new Date(),
          },
        })
      console.log(`✅ Inserted/Updated: ${model.id}`)
    }

    console.log('\n✨ All new image models seeded successfully!')
    console.log('\n📊 Summary:')
    console.log('   • 2 Google Gemini models')
    console.log('   • 4 Runware models')
    console.log('   • Total: 6 new models')
  } catch (error) {
    console.error('❌ Error seeding models:', error)
    throw error
  } finally {
    client.close()
  }
}

// Run the seed
seedNewImageModels()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
