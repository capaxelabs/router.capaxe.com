/**
 * Model Migration Script
 * 
 * Migrates all existing model definitions from TypeScript files to the database.
 * Run this once to populate the models table.
 * 
 * Usage:
 *   npm run seed-models
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { models } from '../schema'

// Google Image Models
import Gemini25Flash from '../../shared/imageModels/google/gemini-2.5-flash'
import Gemini20FlashExp from '../../shared/imageModels/google/gemini-2.0-flash-exp'
import Gemini20FlashPrev from '../../shared/imageModels/google/gemini-2.0-flash-prev'
import Imagen3 from '../../shared/imageModels/google/imagen-3'
import Imagen3Fast from '../../shared/imageModels/google/imagen-3-fast'
import Imagen4 from '../../shared/imageModels/google/imagen-4'
import Imagen4Fast from '../../shared/imageModels/google/imagen-4-fast'
import Imagen4Ultra from '../../shared/imageModels/google/imagen-4-ultra'
import Imagen40520 from '../../shared/imageModels/google/imagen-4-05-20'
import Imagen40520Ultra from '../../shared/imageModels/google/imagen-4-05-20-ultra'
import Imagen40606 from '../../shared/imageModels/google/imagen-4-06-06'
import Imagen40606Fast from '../../shared/imageModels/google/imagen-4-06-06-fast'
import Imagen40606Ultra from '../../shared/imageModels/google/imagen-4-06-06-ultra'

// Google Video Models
import Veo2 from '../../shared/videoModels/google/veo-2'
import Veo2Mock from '../../shared/videoModels/google/veo-2-mock'
import Veo3 from '../../shared/videoModels/google/veo-3'
import Veo3Fast from '../../shared/videoModels/google/veo-3-fast'

// Runware Image Models
import FluxPro from '../../shared/imageModels/runware/flux-pro'
import SourcefulFlux from '../../shared/imageModels/runware/sourceful-flux-v1'
import BytedanceSeedreamV3 from '../../shared/imageModels/runware/bytedance-seedream-v3'
import BytedanceSeedreamV5 from '../../shared/imageModels/runware/bytedance-seedream-v5'
import GoogleImagen4 from '../../shared/imageModels/runware/google-imagen-4'

// ============================================================================
// Model Metadata Mapping
// ============================================================================

interface ModelMetadata {
  instance: any
  name: string
  slug: string
  type: 'image' | 'video'
  status: 'active' | 'inactive' | 'deprecated' | 'beta'
  description?: string
  category?: string
  tags?: string[]
  applyImageFn?: string
  applyMaskFn?: string
  applyQualityFn?: string
  postCalcPriceFn?: string
  validateParamsFn?: string
  capabilities?: Record<string, any>
}

const MODEL_METADATA: ModelMetadata[] = [
  // Google Image Models
  {
    instance: new Gemini25Flash(),
    name: 'Gemini 2.5 Flash',
    slug: 'gemini-25-flash',
    type: 'image',
    status: 'active',
    description: 'Fast image generation with Gemini 2.5 Flash model',
    category: 'text-to-image',
    tags: ['fast', 'multi-modal', 'google'],
    applyImageFn: 'gemini25FlashApplyImage',
    postCalcPriceFn: 'gemini25FlashPostCalc',
    capabilities: {
      supportsImage: true,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Gemini20FlashExp(),
    name: 'Gemini 2.0 Flash Experimental',
    slug: 'gemini-20-flash-exp',
    type: 'image',
    status: 'active',
    description: 'Experimental Gemini 2.0 Flash model',
    category: 'text-to-image',
    tags: ['experimental', 'multi-modal', 'google'],
    applyImageFn: 'gemini20FlashExpApplyImage',
    postCalcPriceFn: 'gemini20FlashExpPostCalc',
    capabilities: {
      supportsImage: true,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Gemini20FlashPrev(),
    name: 'Gemini 2.0 Flash Previous',
    slug: 'gemini-20-flash-prev',
    type: 'image',
    status: 'active',
    description: 'Previous version of Gemini 2.0 Flash',
    category: 'text-to-image',
    tags: ['multi-modal', 'google'],
    applyImageFn: 'gemini20FlashPrevApplyImage',
    postCalcPriceFn: 'gemini20FlashPrevPostCalc',
    capabilities: {
      supportsImage: true,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen3(),
    name: 'Imagen 3',
    slug: 'imagen-3',
    type: 'image',
    status: 'active',
    description: 'Google Imagen 3 image generation',
    category: 'text-to-image',
    tags: ['imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen3Fast(),
    name: 'Imagen 3 Fast',
    slug: 'imagen-3-fast',
    type: 'image',
    status: 'active',
    description: 'Fast variant of Google Imagen 3',
    category: 'text-to-image',
    tags: ['fast', 'imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen4(),
    name: 'Imagen 4',
    slug: 'imagen-4',
    type: 'image',
    status: 'active',
    description: 'Google Imagen 4 image generation',
    category: 'text-to-image',
    tags: ['imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen4Fast(),
    name: 'Imagen 4 Fast',
    slug: 'imagen-4-fast',
    type: 'image',
    status: 'active',
    description: 'Fast variant of Google Imagen 4',
    category: 'text-to-image',
    tags: ['fast', 'imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen4Ultra(),
    name: 'Imagen 4 Ultra',
    slug: 'imagen-4-ultra',
    type: 'image',
    status: 'active',
    description: 'Ultra quality Google Imagen 4',
    category: 'text-to-image',
    tags: ['ultra', 'high-quality', 'imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen40520(),
    name: 'Imagen 4 (2024-05-20)',
    slug: 'imagen-4-05-20',
    type: 'image',
    status: 'active',
    description: 'Imagen 4 release from May 20, 2024',
    category: 'text-to-image',
    tags: ['imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen40520Ultra(),
    name: 'Imagen 4 Ultra (2024-05-20)',
    slug: 'imagen-4-05-20-ultra',
    type: 'image',
    status: 'active',
    description: 'Ultra quality Imagen 4 from May 20, 2024',
    category: 'text-to-image',
    tags: ['ultra', 'high-quality', 'imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen40606(),
    name: 'Imagen 4 (2024-06-06)',
    slug: 'imagen-4-06-06',
    type: 'image',
    status: 'active',
    description: 'Imagen 4 release from June 6, 2024',
    category: 'text-to-image',
    tags: ['imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen40606Fast(),
    name: 'Imagen 4 Fast (2024-06-06)',
    slug: 'imagen-4-06-06-fast',
    type: 'image',
    status: 'active',
    description: 'Fast variant of Imagen 4 from June 6, 2024',
    category: 'text-to-image',
    tags: ['fast', 'imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },
  {
    instance: new Imagen40606Ultra(),
    name: 'Imagen 4 Ultra (2024-06-06)',
    slug: 'imagen-4-06-06-ultra',
    type: 'image',
    status: 'active',
    description: 'Ultra quality Imagen 4 from June 6, 2024',
    category: 'text-to-image',
    tags: ['ultra', 'high-quality', 'imagen', 'google'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: true,
      aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    },
  },

  // Google Video Models
  {
    instance: new Veo2(),
    name: 'Veo 2',
    slug: 'veo-2',
    type: 'video',
    status: 'active',
    description: 'Google Veo 2 video generation',
    category: 'video-generation',
    tags: ['video', 'image-to-video', 'google'],
    applyImageFn: 'veo2ApplyImage',
    validateParamsFn: 'veo2ValidateParams',
    capabilities: {
      supportsImage: true,
      aspectRatios: ['16:9', '9:16'],
      resolutions: ['720p'],
      maxDurationSeconds: 8,
    },
  },
  {
    instance: new Veo2Mock(),
    name: 'Veo 2 Mock',
    slug: 'veo-2-mock',
    type: 'video',
    status: 'inactive',
    description: 'Mock version of Veo 2 for testing',
    category: 'video-generation',
    tags: ['video', 'mock', 'testing', 'google'],
    capabilities: {
      supportsImage: true,
      aspectRatios: ['16:9', '9:16'],
      resolutions: ['720p'],
    },
  },
  {
    instance: new Veo3(),
    name: 'Veo 3',
    slug: 'veo-3',
    type: 'video',
    status: 'active',
    description: 'Google Veo 3 video generation with 1080p support',
    category: 'video-generation',
    tags: ['video', 'image-to-video', 'high-quality', 'google'],
    applyImageFn: 'veo3ApplyImage',
    validateParamsFn: 'veo3ValidateParams',
    capabilities: {
      supportsImage: true,
      aspectRatios: ['16:9', '9:16', '1:1'],
      resolutions: ['720p', '1080p'],
      maxDurationSeconds: 8,
    },
  },
  {
    instance: new Veo3Fast(),
    name: 'Veo 3 Fast',
    slug: 'veo-3-fast',
    type: 'video',
    status: 'active',
    description: 'Fast variant of Google Veo 3',
    category: 'video-generation',
    tags: ['video', 'fast', 'google'],
    applyImageFn: 'veo3FastApplyImage',
    validateParamsFn: 'veo3FastValidateParams',
    capabilities: {
      supportsImage: true,
      aspectRatios: ['16:9', '9:16', '1:1'],
      resolutions: ['720p', '1080p'],
      maxDurationSeconds: 8,
    },
  },

  // Runware Models
  {
    instance: new FluxPro(),
    name: 'Flux Pro',
    slug: 'flux-pro',
    type: 'image',
    status: 'active',
    description: 'Flux Pro image generation via Runware',
    category: 'text-to-image',
    tags: ['flux', 'runware'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: false,
    },
  },
  {
    instance: new SourcefulFlux(),
    name: 'Sourceful Flux V1',
    slug: 'sourceful-flux-v1',
    type: 'image',
    status: 'active',
    description: 'Sourceful Flux V1 via Runware',
    category: 'text-to-image',
    tags: ['flux', 'runware'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: false,
    },
  },
  {
    instance: new BytedanceSeedreamV3(),
    name: 'ByteDance Seedream V3',
    slug: 'bytedance-seedream-v3',
    type: 'image',
    status: 'active',
    description: 'ByteDance Seedream V3 via Runware',
    category: 'text-to-image',
    tags: ['bytedance', 'runware'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: false,
    },
  },
  {
    instance: new BytedanceSeedreamV5(),
    name: 'ByteDance Seedream V5',
    slug: 'bytedance-seedream-v5',
    type: 'image',
    status: 'active',
    description: 'ByteDance Seedream V5 via Runware',
    category: 'text-to-image',
    tags: ['bytedance', 'runware'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: false,
    },
  },
  {
    instance: new GoogleImagen4(),
    name: 'Google Imagen 4 (Runware)',
    slug: 'google-imagen-4-runware',
    type: 'image',
    status: 'active',
    description: 'Google Imagen 4 via Runware',
    category: 'text-to-image',
    tags: ['imagen', 'google', 'runware'],
    capabilities: {
      supportsImage: false,
      supportsMask: false,
      supportsQuality: false,
    },
  },
]

// ============================================================================
// Migration Function
// ============================================================================

async function migrateModels() {
  console.log('🚀 Starting model migration to database...\n')

  // Initialize database
  const dbUrl = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!dbUrl || !authToken) {
    throw new Error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables')
  }

  const client = createClient({ url: dbUrl, authToken })
  const db = drizzle(client)

  let successCount = 0
  let errorCount = 0

  // Migrate each model
  for (const metadata of MODEL_METADATA) {
    try {
      const modelData = metadata.instance.getData()

      // Prepare database record
      const dbRecord = {
        id: modelData.id,
        name: metadata.name,
        slug: metadata.slug,
        type: metadata.type,
        status: metadata.status,
        isPublic: true,
        providers: JSON.stringify(
          modelData.providers.map((p: any) => ({
            id: p.id,
            model_name: p.model_name,
            pricing: p.pricing,
          }))
        ),
        arenaScore: modelData.arena_score || null,
        releaseDate: modelData.release_date,
        description: metadata.description || null,
        examples: JSON.stringify(modelData.examples || []),
        capabilities: JSON.stringify(metadata.capabilities || {}),
        applyImageFn: metadata.applyImageFn || null,
        applyMaskFn: metadata.applyMaskFn || null,
        applyQualityFn: metadata.applyQualityFn || null,
        postCalcPriceFn: metadata.postCalcPriceFn || null,
        validateParamsFn: metadata.validateParamsFn || null,
        tags: JSON.stringify(metadata.tags || []),
        category: metadata.category || null,
        maxRequestsPerDay: null,
        requiresWhitelist: false,
      }

      // Insert into database
      await db.insert(models).values(dbRecord)

      console.log(`✅ Migrated: ${modelData.id}`)
      successCount++
    } catch (error: any) {
      console.error(`❌ Failed to migrate ${metadata.name}:`, error.message)
      errorCount++
    }
  }

  console.log(`\n📊 Migration Summary:`)
  console.log(`   ✅ Success: ${successCount}`)
  console.log(`   ❌ Errors: ${errorCount}`)
  console.log(`   📦 Total: ${MODEL_METADATA.length}`)
  console.log('\n✨ Migration complete!')
}

// ============================================================================
// Execute Migration
// ============================================================================

migrateModels().catch((error) => {
  console.error('💥 Migration failed:', error)
  process.exit(1)
})
