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
  
  // Async task fields
  taskId: text('task_id'), // Links to async task
  taskType: text('task_type', { 
    enum: ['imageInference', 'videoInference', 'imageBackgroundRemoval', 'imageUpscale', 'imageCaption'] 
  }), // Type of generation task
  taskStatus: text('task_status', { 
    enum: ['sync', 'pending', 'processing', 'completed', 'failed'] 
  }).default('sync').notNull(),
  taskProgress: integer('task_progress').default(0), // 0-100
  taskStartedAt: integer('task_started_at', { mode: 'timestamp' }),
  taskCompletedAt: integer('task_completed_at', { mode: 'timestamp' }),
  isAsync: integer('is_async', { mode: 'boolean' }).default(false).notNull(),
}, (table) => ({
  apiKeyIdIdx: index('api_usage_api_key_id_idx').on(table.apiKeyId),
  createdAtIdx: index('api_usage_created_at_idx').on(table.createdAt),
  userIdIdx: index('api_usage_user_id_idx').on(table.userId),
  taskIdIdx: index('api_usage_task_id_idx').on(table.taskId), // New index for async tasks
  taskStatusIdx: index('api_usage_task_status_idx').on(table.taskStatus), // New index for status queries
}))

// Models table (for database-driven model management)
export const models = sqliteTable('models', {
  // Identification
  id: text('id').primaryKey(), // 'google/gemini-2.5-flash'
  name: text('name').notNull(), // 'Gemini 2.5 Flash'
  slug: text('slug').notNull().unique(), // 'gemini-25-flash'
  type: text('type', { enum: ['image', 'video'] }).notNull(),
  
  // Status & Visibility
  status: text('status', { 
    enum: ['active', 'inactive', 'deprecated', 'beta'] 
  }).default('active').notNull(),
  isPublic: integer('is_public', { mode: 'boolean' }).default(true).notNull(),
  
  // Provider Configuration (JSON array)
  providers: text('providers').notNull(), 
  // JSON: [{ id, model_name, pricing: { type, value }, requiresAuth, maxRetries, timeoutSeconds }]
  
  // Model Metadata
  arenaScore: integer('arena_score'),
  releaseDate: text('release_date').notNull(), // ISO 8601 date
  description: text('description'),
  
  // Examples (JSON array)
  examples: text('examples').default('[]').notNull(),
  // JSON: [{ image, video, prompt, parameters }]
  
  // Capabilities (JSON object)
  capabilities: text('capabilities').default('{}').notNull(),
  // JSON: { supportsImage, supportsMask, supportsQuality, aspectRatios, maxResolution, etc. }
  
  // Function References (for custom behaviors - references to MODEL_FUNCTIONS registry)
  applyImageFn: text('apply_image_fn'),
  applyMaskFn: text('apply_mask_fn'),
  applyQualityFn: text('apply_quality_fn'),
  postCalcPriceFn: text('post_calc_price_fn'),
  validateParamsFn: text('validate_params_fn'),
  
  // Tags & Categorization (JSON array)
  tags: text('tags').default('[]').notNull(), // ["fast", "cheap", "beta"]
  category: text('category'), // "text-to-image", "image-to-video", etc.
  
  // Usage Limits (optional)
  maxRequestsPerDay: integer('max_requests_per_day'),
  requiresWhitelist: integer('requires_whitelist', { mode: 'boolean' }).default(false).notNull(),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  deprecatedAt: integer('deprecated_at', { mode: 'timestamp' }),
}, (table) => ({
  typeIdx: index('models_type_idx').on(table.type),
  statusIdx: index('models_status_idx').on(table.status),
  slugIdx: index('models_slug_idx').on(table.slug),
}))

// Type exports for use in the application
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
export type ApiUsage = typeof apiUsage.$inferSelect
export type NewApiUsage = typeof apiUsage.$inferInsert
export type Model = typeof models.$inferSelect
export type NewModel = typeof models.$inferInsert