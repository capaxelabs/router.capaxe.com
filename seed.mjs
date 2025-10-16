import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'

// Define schema inline for simplicity
const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  credits: integer('credits').default(0).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
})

const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  key: text('key').unique().notNull(),
  userId: text('user_id').references(() => users.id).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index('api_keys_user_id_idx').on(table.userId),
}))

async function seed() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set')
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  const db = drizzle(client)

  console.log('🌱 Seeding database...')

  // Create test user
  const testUserId = 'test-user-123'
  
  try {
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
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    throw error
  }
}

seed().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})