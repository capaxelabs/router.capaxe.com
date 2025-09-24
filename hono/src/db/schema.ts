import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  credits: integer('credits').default(0).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
})

// API Keys table
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  name: text('name').notNull(),
  key: text('key').unique().notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  userId: text('user_id').references(() => users.id).notNull(),
}, (table) => ({
  userIdIdx: index('api_keys_user_id_idx').on(table.userId),
}))

// API Usage table
export const apiUsage = sqliteTable('api_usage', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  model: text('model').notNull(),
  provider: text('provider').notNull(),
  prompt: text('prompt').notNull(),
  cost: integer('cost').notNull(), // in 1e-4 USD units
  speedMs: integer('speed_ms').notNull(),
  imageSize: text('image_size').notNull(),
  quality: text('quality', { enum: ['auto', 'low', 'medium', 'high'] }),
  status: text('status').notNull(),
  error: text('error'),
  metadata: text('metadata'), // JSON string
  apiKeyTempJwt: integer('api_key_temp_jwt', { mode: 'boolean' }).default(false).notNull(),
  ip: text('ip'),
  outputUrls: text('output_urls').default('[]').notNull(), // JSON array string
  apiKeyId: text('api_key_id').references(() => apiKeys.id),
  userId: text('user_id').references(() => users.id).notNull(),
}, (table) => ({
  apiKeyIdIdx: index('api_usage_api_key_id_idx').on(table.apiKeyId),
  createdAtIdx: index('api_usage_created_at_idx').on(table.createdAt),
  userIdIdx: index('api_usage_user_id_idx').on(table.userId),
}))

// Type exports for use in the application
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
export type ApiUsage = typeof apiUsage.$inferSelect
export type NewApiUsage = typeof apiUsage.$inferInsert