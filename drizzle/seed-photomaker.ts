import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { models } from '../src/db/schema'
import 'dotenv/config'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const db = drizzle(client)

async function seedPhotoMaker() {
  console.log('🌱 Seeding PhotoMaker model...')

  const photoMakerModel = {
    // Model Identification
    id: 'runware/photomaker',
    name: 'PhotoMaker',
    slug: 'photomaker',
    type: 'image' as const,
    status: 'active' as const,
    isPublic: true,

    // Provider Configuration
    // PhotoMaker is a special taskType in Runware API
    // API call uses: { "taskType": "photoMaker", ... }
    providers: JSON.stringify([
      {
        id: 'runware',
        model_name: 'photoMaker', // Special taskType identifier
        pricing: {
          type: 'calculated', // Cost varies based on SDXL model used
          value: 0.0013, // Average cost per image
        },
        maxRetries: 3,
        timeoutSeconds: 120,
        requiresAuth: true,
      },
    ]),

    // Model Metadata
    arenaScore: null,
    releaseDate: '2024-12-01',
    description:
      'Instant subject personalization technology that maintains subject fidelity while applying various styles. Upload up to 4 reference images to generate new images that preserve identity across different scenes and compositions. Supports 11 artistic styles with precise control over transformation strength.',

    // Capabilities
    capabilities: JSON.stringify({
      // Core Features
      supportsImage: true, // Requires 1-4 reference images
      supportsMask: false,
      supportsQuality: true,

      // Dimensions
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      maxResolution: '2048x2048',
      minResolution: '128x128', // Must be divisible by 64
      defaultResolution: '1024x1024',

      // Generation Types
      supportsTextToImage: true,
      supportsImageToImage: true,
      supportsNegativePrompt: true,

      // PhotoMaker Specific
      requiresSDXL: true, // Only works with SDXL-based models
      maxInputImages: 4, // Up to 4 reference images
      minInputImages: 1, // At least 1 reference image
      triggerWord: 'rwre', // Required in prompt (auto-prepended if missing)

      // Style Options
      supportedStyles: [
        'No style', // Maximum subject fidelity
        'Cinematic',
        'Disney Character',
        'Digital Art',
        'Photographic',
        'Fantasy art',
        'Neonpunk',
        'Enhance',
        'Comic book',
        'Lowpoly',
        'Line art',
      ],

      // Parameter Ranges
      stepsRange: {
        min: 1,
        max: 100,
        default: 20,
      },
      guidanceRange: {
        // CFGScale
        min: 0,
        max: 50,
        default: 7,
      },
      strengthRange: {
        // Balance between fidelity and transformation
        min: 15, // More fidelity
        max: 50, // More transformation
        default: 15,
      },
      clipSkipRange: {
        min: 0,
        max: 2,
      },
      seedRange: {
        min: 1,
        max: 9223372036854776000,
      },
    }),

    // Tags
    tags: JSON.stringify([
      'photomaker',
      'personalization',
      'subject-fidelity',
      'style-transfer',
      'portrait',
      'multi-image',
      'runware',
      'sdxl',
    ]),
    category: 'image-personalization',

    // Examples
    examples: JSON.stringify([
      {
        prompt: 'rwre wearing a professional suit, corporate headshot',
        parameters: {
          inputImages: ['uuid-1', 'uuid-2', 'uuid-3'], // Reference images
          style: 'Photographic',
          strength: 15,
          width: 1024,
          height: 1024,
        },
      },
      {
        prompt: 'rwre as a Disney character, animated style',
        parameters: {
          inputImages: ['uuid-1', 'uuid-2'],
          style: 'Disney Character',
          strength: 25,
          width: 1024,
          height: 1024,
        },
      },
      {
        prompt: 'rwre in a fantasy landscape, epic composition',
        parameters: {
          inputImages: ['uuid-1', 'uuid-2', 'uuid-3', 'uuid-4'],
          style: 'Fantasy art',
          strength: 30,
          width: 1024,
          height: 1024,
        },
      },
    ]),

    // Function References
    applyImageFn: null, // Special handling for PhotoMaker
    applyMaskFn: null,
    applyQualityFn: null,
    postCalcPriceFn: null,
    validateParamsFn: null,

    // Usage Limits
    maxRequestsPerDay: null,
    requiresWhitelist: false,
  }

  try {
    await db
      .insert(models)
      .values(photoMakerModel)
      .onConflictDoUpdate({
        target: models.id,
        set: {
          name: photoMakerModel.name,
          providers: photoMakerModel.providers,
          capabilities: photoMakerModel.capabilities,
          description: photoMakerModel.description,
          tags: photoMakerModel.tags,
          examples: photoMakerModel.examples,
          updatedAt: new Date(),
        },
      })

    console.log(`✅ Inserted/Updated: ${photoMakerModel.id}`)
    console.log('\n✨ PhotoMaker model seeded successfully!')
    console.log('\n📋 Model Details:')
    console.log('   • Provider: Runware')
    console.log('   • Task Type: photoMaker')
    console.log('   • Reference Images: 1-4')
    console.log('   • Styles: 11 options')
    console.log('   • Requires: SDXL-based model')
    console.log('   • Trigger Word: rwre')
  } catch (error) {
    console.error('❌ Error seeding PhotoMaker model:', error)
    throw error
  } finally {
    client.close()
  }
}

// Run the seed
seedPhotoMaker()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
