import { Hono } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { Database, users, apiKeys } from '../db'
import { eq } from 'drizzle-orm'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

/**
 * POST /admin/seed
 * Create test user and API key for database testing
 */
app.post('/seed', async (c) => {
  try {
    const db = c.get('db') as Database
    if (!db) {
      return c.json({ error: 'Database not available' }, 500)
    }

    // Create test user
    const testUserId = 'test-user-123'
    
    // Check if test user already exists
    const existingUser = await db.select().from(users).where(eq(users.id, testUserId)).limit(1)
    
    if (existingUser.length === 0) {
      // Insert test user
      await db.insert(users).values({
        id: testUserId,
        credits: 1000000, // $100 in credits (100 * 10000)
      })
      console.log('✅ Created test user with ID:', testUserId)
    }

    // Create test API key (64 characters long)
    const testApiKey = 'test-api-key-1234567890abcdef1234567890abcdef1234567890abcdef123'
    
    // Check if test API key already exists
    const existingApiKey = await db.select().from(apiKeys).where(eq(apiKeys.key, testApiKey)).limit(1)
    
    if (existingApiKey.length === 0) {
      // Insert test API key
      await db.insert(apiKeys).values({
        id: 'test-api-key-id-124',
        name: 'Test API Key (64 chars)',
        key: testApiKey,
        userId: testUserId,
        isActive: true,
      })
      console.log('✅ Created test API key:', testApiKey)
    }

    return c.json({
      success: true,
      message: 'Database seeded successfully',
      testApiKey: testApiKey,
      testUserId: testUserId
    })

  } catch (error) {
    console.error('❌ Error seeding database:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * GET /admin/users
 * List all users for debugging
 */
app.get('/users', async (c) => {
  try {
    const db = c.get('db') as Database
    if (!db) {
      return c.json({ error: 'Database not available' }, 500)
    }

    const allUsers = await db.select().from(users)
    const allApiKeys = await db.select().from(apiKeys)

    return c.json({
      users: allUsers,
      apiKeys: allApiKeys.map(key => ({ ...key, key: key.key.substring(0, 8) + '...' })) // Hide full keys
    })

  } catch (error) {
    console.error('❌ Error fetching users:', error)
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

export default app