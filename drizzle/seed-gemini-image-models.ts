import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { models } from '../src/db/schema'
import 'dotenv/config'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const db = drizzle(client)

async function seedGeminiImageModels() {
  console.log('🌱 Seeding Gemini image models...')

  const geminiImageModels = [
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
            type: 'FIXED',
            price: 0.003, // $30 per 1M tokens / 1290 tokens per image = ~$0.03864 per image
          },
          maxRetries: 3,
          timeoutSeconds: 120,
        },
      ]),

      // Model metadata
      arenaScore: null,
      releaseDate: '2025-01-15',
      description: 'Fast and efficient image generation model optimized for high-volume, low-latency tasks. Generates 1024px resolution images.',

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
      tags: JSON.stringify(['fast', 'multimodal', 'text-to-image', 'image-editing', 'gemini']),
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
            type: 'CALCULATED', // Varies by resolution: 1K=1210 tokens, 2K=1210 tokens, 4K=2000 tokens
            price: 0.003, // Base price per image
          },
          maxRetries: 3,
          timeoutSeconds: 300, // Longer timeout for thinking process
        },
      ]),

      // Model metadata
      arenaScore: null,
      releaseDate: '2025-01-15',
      description: 'State-of-the-art image generation model with advanced reasoning, Google Search grounding, and up to 4K output. Features thinking mode for complex prompts and supports up to 14 reference images.',

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
        maxHumanImages: 5,  // Up to 5 "human" for character/face consistency

        supportsTextToImage: true,
        supportsImageToImage: true,
        supportsMultiTurn: true,
        supportsGoogleSearch: true,
        supportsThinkingMode: true,
        defaultResolution: '1024x1024',
        resolutionOptions: ['1K', '2K', '4K'],
      }),

      // Tags
      tags: JSON.stringify(['advanced', 'multimodal', 'text-to-image', 'image-editing', 'google-search', 'thinking', 'high-res', 'beta', 'gemini']),
      category: 'text-to-image',

      // Examples
      examples: JSON.stringify([
        {
          prompt: 'Create a vibrant infographic that explains photosynthesis as a recipe',
          parameters: { aspect_ratio: '16:9', image_size: '2K' },
        },
      ]),
    },
  ]

  try {
    for (const model of geminiImageModels) {
      await db.insert(models).values(model).onConflictDoUpdate({
        target: models.id,
        set: {
          name: model.name,
          providers: model.providers,
          capabilities: model.capabilities,
          description: model.description,
          tags: model.tags,
          updatedAt: new Date(),
        },
      })
      console.log(`✅ Inserted/Updated: ${model.id}`)
    }

    console.log('✨ Gemini image models seeded successfully!')
  } catch (error) {
    console.error('❌ Error seeding models:', error)
    throw error
  } finally {
    client.close()
  }
}

// Run the seed
seedGeminiImageModels()
  .then(() => {
    console.log('Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
