/**
 * Verify Models in Database
 * 
 * Quick script to verify that models were migrated correctly
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { models } from '../schema'
import { eq } from 'drizzle-orm'

async function verifyModels() {
  console.log('🔍 Verifying models in database...\n')

  const dbUrl = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!dbUrl || !authToken) {
    throw new Error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
  }

  const client = createClient({ url: dbUrl, authToken })
  const db = drizzle(client)

  // Get all models
  const allModels = await db.select().from(models).all()

  console.log(`📦 Total models: ${allModels.length}\n`)

  // Group by type
  const imageModels = allModels.filter(m => m.type === 'image')
  const videoModels = allModels.filter(m => m.type === 'video')

  console.log(`🖼️  Image models: ${imageModels.length}`)
  console.log(`🎬 Video models: ${videoModels.length}\n`)

  // Group by status
  const activeModels = allModels.filter(m => m.status === 'active')
  const inactiveModels = allModels.filter(m => m.status === 'inactive')

  console.log(`✅ Active models: ${activeModels.length}`)
  console.log(`❌ Inactive models: ${inactiveModels.length}\n`)

  // Show sample model data
  console.log('📄 Sample Model (google/gemini-2.5-flash):')
  const sampleModel = await db
    .select()
    .from(models)
    .where(eq(models.id, 'google/gemini-2.5-flash'))
    .get()

  if (sampleModel) {
    console.log(`   ID: ${sampleModel.id}`)
    console.log(`   Name: ${sampleModel.name}`)
    console.log(`   Type: ${sampleModel.type}`)
    console.log(`   Status: ${sampleModel.status}`)
    console.log(`   Slug: ${sampleModel.slug}`)
    console.log(`   Release Date: ${sampleModel.releaseDate}`)
    console.log(`   Arena Score: ${sampleModel.arenaScore}`)
    console.log(`   Apply Image Fn: ${sampleModel.applyImageFn}`)
    console.log(`   Post Calc Price Fn: ${sampleModel.postCalcPriceFn}`)
    
    const providers = JSON.parse(sampleModel.providers)
    console.log(`   Providers: ${providers.length}`)
    console.log(`      - ${providers[0].id}: ${providers[0].model_name}`)
    console.log(`      - Pricing: ${providers[0].pricing.type} - $${providers[0].pricing.value}`)
    
    const capabilities = JSON.parse(sampleModel.capabilities)
    console.log(`   Capabilities:`)
    console.log(`      - Supports Image: ${capabilities.supportsImage}`)
    console.log(`      - Aspect Ratios: ${capabilities.aspectRatios?.join(', ')}`)
    
    const tags = JSON.parse(sampleModel.tags)
    console.log(`   Tags: ${tags.join(', ')}`)
  }

  console.log('\n✨ Verification complete!')
}

verifyModels().catch(console.error)
