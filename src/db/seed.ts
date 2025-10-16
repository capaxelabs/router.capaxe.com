#!/usr/bin/env tsx
import { createDatabase } from './index'
import { users, apiKeys } from './schema'
import { eq } from 'drizzle-orm'

async function seed() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set')
  }

  const db = createDatabase({
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN
  })

  console.log('🌱 Seeding database...')

  // Create test user
  const testUserId = 'test-user-123'
  
  // Check if test user already exists
  const existingUser = await db.select().from(users).where(eq(users.id, testUserId)).limit(1)
  
  if (existingUser.length === 0) {
    // Insert test user
    await db.insert(users).values({
      id: testUserId,
      credits: 1000000, // $100 in credits (100 * 10000)
      isActive: true,
    })
    console.log('✅ Created test user with ID:', testUserId)
  } else {
    console.log('✅ Test user already exists')
  }

  // Create test API key (64 characters long)
  const testApiKey = 'test-api-key-1234567890abcdef1234567890abcdef1234567890abcdef12'
  
  // Check if test API key already exists
  const existingApiKey = await db.select().from(apiKeys).where(eq(apiKeys.key, testApiKey)).limit(1)
  
  if (existingApiKey.length === 0) {
    // Insert test API key
    await db.insert(apiKeys).values({
      id: 'test-api-key-id-123',
      key: testApiKey,
      userId: testUserId,
      isActive: true,
    })
    console.log('✅ Created test API key:', testApiKey)
  } else {
    console.log('✅ Test API key already exists')
  }

  console.log('🎉 Database seeding completed!')
  console.log('💡 You can now test API calls using the test API key:', testApiKey)
}

seed().catch((error) => {
  console.error('❌ Error seeding database:', error)
  process.exit(1)
})