import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { models } from '../src/db/schema'
import 'dotenv/config'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const db = drizzle(client)

async function seedReplicateModels() {
  console.log('Seeding Replicate models...')

  const replicateModels = [
    // ============================================================================
    // VIDEO MODELS
    // ============================================================================

    {
      id: 'replicate/kling-v2.5-turbo-pro',
      name: 'Kling v2.5 Turbo Pro',
      slug: 'kling-v25-turbo-pro',
      type: 'video' as const,
      status: 'active' as const,
      isPublic: true,

      providers: JSON.stringify([
        {
          id: 'replicate',
          model_name: 'kwaivgi/kling-v2.5-turbo-pro',
          pricing: {
            type: 'fixed',
            value: 0.10,
          },
          maxRetries: 2,
          timeoutSeconds: 600,
        },
      ]),

      arenaScore: null,
      releaseDate: '2025-06-01',
      description: 'Kling v2.5 Turbo Pro video generation model by Kuaishou. Supports text-to-video and image-to-video with 5s or 10s duration. High quality cinematic output.',

      capabilities: JSON.stringify({
        supportsImage: true,
        supportsMask: false,
        supportsQuality: false,
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        aspectRatios: ['16:9', '9:16', '1:1'],
        durations: [5, 10],
        defaultDuration: 5,
        defaultAspectRatio: '16:9',
        supportsNegativePrompt: true,
        supportsStartImage: true,
        supportsEndImage: true,
        supportsGuidanceScale: true,
      }),

      tags: JSON.stringify(['video', 'kling', 'kuaishou', 'text-to-video', 'image-to-video', 'replicate']),
      category: 'text-to-video',

      examples: JSON.stringify([
        {
          prompt: 'A man in a trench coat holding a black umbrella walks through the streets of Tokyo on a rainy night',
          parameters: { duration: 5, aspect_ratio: '16:9', guidance_scale: 0.5 },
        },
      ]),
    },

    // ============================================================================
    // IMAGE MODELS
    // ============================================================================

    {
      id: 'replicate/remove-background',
      name: 'BRIA Remove Background',
      slug: 'remove-background',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      providers: JSON.stringify([
        {
          id: 'replicate',
          model_name: 'bria/remove-background',
          pricing: {
            type: 'fixed',
            value: 0.01,
          },
          maxRetries: 2,
          timeoutSeconds: 120,
        },
      ]),

      arenaScore: null,
      releaseDate: '2024-01-01',
      description: 'BRIA background removal model. Removes backgrounds from images with alpha channel support and partial transparency preservation.',

      capabilities: JSON.stringify({
        supportsImage: true,
        supportsMask: false,
        supportsQuality: false,
        supportsTextToImage: false,
        supportsImageToImage: true,
        supportsBackgroundRemoval: true,
        supportsAlphaChannel: true,
      }),

      tags: JSON.stringify(['background-removal', 'bria', 'alpha', 'cutout', 'replicate']),
      category: 'background-removal',

      examples: JSON.stringify([
        {
          prompt: 'Remove background from product image',
          parameters: { preserve_alpha: true, content_moderation: false, preserve_partial_alpha: true },
        },
      ]),
    },

    {
      id: 'replicate/crystal-upscaler',
      name: 'Crystal Upscaler',
      slug: 'crystal-upscaler',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      providers: JSON.stringify([
        {
          id: 'replicate',
          model_name: 'philz1337x/crystal-upscaler',
          pricing: {
            type: 'fixed',
            value: 0.03,
          },
          maxRetries: 2,
          timeoutSeconds: 300,
        },
      ]),

      arenaScore: null,
      releaseDate: '2024-06-01',
      description: 'AI image upscaler with creativity control. Scales images up to 6x while enhancing details. Supports PNG and WEBP output.',

      capabilities: JSON.stringify({
        supportsImage: true,
        supportsMask: false,
        supportsQuality: false,
        supportsTextToImage: false,
        supportsImageToImage: true,
        supportsUpscaling: true,
        maxScaleFactor: 6,
        defaultScaleFactor: 4,
        outputFormats: ['png', 'webp'],
      }),

      tags: JSON.stringify(['upscaler', 'enhance', 'super-resolution', 'replicate']),
      category: 'upscaler',

      examples: JSON.stringify([
        {
          prompt: 'Upscale image with creativity 0 for faithful enlargement',
          parameters: { scale_factor: 4, creativity: 0, output_format: 'png' },
        },
      ]),
    },

    {
      id: 'replicate/google-upscaler',
      name: 'Google Upscaler',
      slug: 'google-upscaler',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      providers: JSON.stringify([
        {
          id: 'replicate',
          model_name: 'google/upscaler',
          pricing: {
            type: 'fixed',
            value: 0.02,
          },
          maxRetries: 2,
          timeoutSeconds: 300,
        },
      ]),

      arenaScore: null,
      releaseDate: '2024-01-01',
      description: 'Google image upscaler with up to 4x scaling. Preserves details with adjustable compression quality.',

      capabilities: JSON.stringify({
        supportsImage: true,
        supportsMask: false,
        supportsQuality: false,
        supportsTextToImage: false,
        supportsImageToImage: true,
        supportsUpscaling: true,
        upscaleFactors: ['x2', 'x4'],
        defaultUpscaleFactor: 'x4',
      }),

      tags: JSON.stringify(['upscaler', 'google', 'super-resolution', 'replicate']),
      category: 'upscaler',

      examples: JSON.stringify([
        {
          prompt: 'Upscale image 4x with compression quality 80',
          parameters: { upscale_factor: 'x4', compression_quality: 80 },
        },
      ]),
    },
  ]

  try {
    for (const model of replicateModels) {
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
      console.log(`  Inserted/Updated: ${model.id}`)
    }

    console.log('\nAll Replicate models seeded successfully!')
    console.log('  - replicate/kling-v2.5-turbo-pro (kwaivgi/kling-v2.5-turbo-pro) [video]')
    console.log('  - replicate/remove-background (bria/remove-background) [image]')
    console.log('  - replicate/crystal-upscaler (philz1337x/crystal-upscaler) [image]')
    console.log('  - replicate/google-upscaler (google/upscaler) [image]')
  } catch (error) {
    console.error('Error seeding Replicate models:', error)
    throw error
  } finally {
    client.close()
  }
}

seedReplicateModels()
  .then(() => {
    console.log('\nDone!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
