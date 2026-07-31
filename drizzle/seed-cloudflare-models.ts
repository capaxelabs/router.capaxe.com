import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { models } from '../src/db/schema'
import 'dotenv/config'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const db = drizzle(client)

async function seedCloudflareModels() {
  console.log('Seeding Cloudflare AI models...')

  const cloudflareModels = [
    // ============================================================================
    // IMAGE MODELS - Workers AI (@cf/ prefix, Workers AI pricing)
    // ============================================================================

    {
      id: '@cf/black-forest-labs/flux-1-schnell',
      name: 'FLUX.1 [schnell]',
      slug: 'flux-1-schnell',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      providers: JSON.stringify([
        {
          id: 'workers-ai',
          model_name: '@cf/black-forest-labs/flux-1-schnell',
          pricing: {
            type: 'fixed',
            value: 0.0005,
          },
          maxRetries: 2,
          timeoutSeconds: 120,
        },
      ]),

      arenaScore: null,
      releaseDate: '2024-08-01',
      description: 'FLUX.1 [schnell] text-to-image on Workers AI. Fast, high-quality generation, returns base64 image.',

      capabilities: JSON.stringify({
        supportsImage: false,
        supportsMask: false,
        supportsQuality: false,
        supportsTextToImage: true,
        maxSteps: 8,
      }),

      tags: JSON.stringify(['flux', 'text-to-image', 'workers-ai']),
      category: 'text-to-image',

      examples: JSON.stringify([
        { prompt: 'a cyberpunk lizard, neon lights, cinematic' },
      ]),
    },

    {
      id: '@cf/black-forest-labs/flux-2-klein-4b',
      name: 'FLUX.2 [klein] 4B',
      slug: 'flux-2-klein-4b',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      providers: JSON.stringify([
        {
          id: 'workers-ai',
          model_name: '@cf/black-forest-labs/flux-2-klein-4b',
          pricing: {
            type: 'fixed',
            value: 0.002,
          },
          maxRetries: 2,
          timeoutSeconds: 180,
        },
      ]),

      arenaScore: null,
      releaseDate: '2026-01-15',
      description: 'FLUX.2 [klein] 4B on Workers AI. Text-to-image with multi-reference image support (up to 4 input images under 512x512).',

      capabilities: JSON.stringify({
        supportsImage: true,
        supportsMask: false,
        supportsQuality: false,
        supportsTextToImage: true,
        supportsImageToImage: true,
      }),

      tags: JSON.stringify(['flux', 'text-to-image', 'image-to-image', 'workers-ai']),
      category: 'text-to-image',

      examples: JSON.stringify([
        { prompt: 'product photo of a watch on a marble table, studio lighting' },
      ]),
    },

    // ============================================================================
    // IMAGE MODELS - Catalog (Unified Billing, no provider keys)
    // ============================================================================

    {
      id: 'google/imagen-4',
      name: 'Imagen 4',
      slug: 'imagen-4',
      type: 'image' as const,
      status: 'active' as const,
      isPublic: true,

      providers: JSON.stringify([
        {
          id: 'workers-ai',
          model_name: 'google/imagen-4',
          pricing: {
            type: 'fixed',
            value: 0.04,
          },
          maxRetries: 2,
          timeoutSeconds: 300,
        },
      ]),

      arenaScore: null,
      releaseDate: '2025-05-20',
      description: 'Google Imagen 4 via Cloudflare AI catalog (Unified Billing). Returns a hosted image URL, re-uploaded to R2.',

      capabilities: JSON.stringify({
        supportsImage: false,
        supportsMask: false,
        supportsQuality: false,
        supportsTextToImage: true,
        aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      }),

      tags: JSON.stringify(['imagen', 'google', 'text-to-image', 'unified-billing']),
      category: 'text-to-image',

      examples: JSON.stringify([
        { prompt: 'A golden retriever puppy playing in autumn leaves' },
      ]),
    },

    // ============================================================================
    // VIDEO MODELS - Catalog (Unified Billing, no provider keys)
    // ============================================================================

    {
      id: 'google/veo-3.1',
      name: 'Veo 3.1',
      slug: 'veo-3-1',
      type: 'video' as const,
      status: 'active' as const,
      isPublic: true,

      providers: JSON.stringify([
        {
          id: 'workers-ai',
          model_name: 'google/veo-3.1',
          pricing: {
            type: 'fixed',
            value: 3.2,
          },
          maxRetries: 1,
          timeoutSeconds: 600,
        },
      ]),

      arenaScore: null,
      releaseDate: '2025-10-01',
      description: 'Google Veo 3.1 via Cloudflare AI catalog (Unified Billing). Text-to-video with audio, up to 1080p.',

      capabilities: JSON.stringify({
        supportsImage: true,
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        aspectRatios: ['16:9', '9:16'],
        durations: ['4s', '6s', '8s'],
        defaultDuration: '8s',
        resolutions: ['720p', '1080p'],
        supportsNegativePrompt: true,
        supportsAudio: true,
      }),

      tags: JSON.stringify(['veo', 'google', 'text-to-video', 'unified-billing']),
      category: 'text-to-video',

      examples: JSON.stringify([
        {
          prompt: 'A majestic eagle soaring over snow-capped mountains',
          parameters: { aspect_ratio: '16:9', duration: '8s', resolution: '1080p' },
        },
      ]),
    },

    {
      id: 'bytedance/seedance-2.0-mini',
      name: 'Seedance 2.0 Mini',
      slug: 'seedance-2-mini',
      type: 'video' as const,
      status: 'active' as const,
      isPublic: true,

      providers: JSON.stringify([
        {
          id: 'workers-ai',
          model_name: 'bytedance/seedance-2.0-mini',
          pricing: {
            type: 'fixed',
            value: 0.15,
          },
          maxRetries: 1,
          timeoutSeconds: 600,
        },
      ]),

      arenaScore: null,
      releaseDate: '2026-01-01',
      description: 'ByteDance Seedance 2.0 Mini via Cloudflare AI catalog (Unified Billing). Affordable text-to-video and image-to-video.',

      capabilities: JSON.stringify({
        supportsImage: true,
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        aspectRatios: ['16:9', '9:16', '1:1'],
        durations: [5, 10],
        defaultDuration: 5,
        resolutions: ['480p', '720p'],
      }),

      tags: JSON.stringify(['seedance', 'bytedance', 'text-to-video', 'unified-billing']),
      category: 'text-to-video',

      examples: JSON.stringify([
        {
          prompt: 'A cat sitting on a windowsill watching raindrops fall',
          parameters: { aspect_ratio: '16:9', duration: 5, resolution: '720p' },
        },
      ]),
    },
  ]

  try {
    for (const model of cloudflareModels) {
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
            status: model.status,
            tags: model.tags,
            category: model.category,
            examples: model.examples,
          },
        })
      console.log(`  ✓ ${model.id}`)
    }

    console.log(`Seeded ${cloudflareModels.length} Cloudflare AI models`)
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  }
}

seedCloudflareModels()
