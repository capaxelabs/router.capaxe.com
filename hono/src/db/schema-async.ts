import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Extend existing api_usage table with async task support
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
  apiKeyId: text('api_key_id'),
  userId: text('user_id').notNull(),
  
  // NEW ASYNC FIELDS:
  taskId: text('task_id'), // Links to async task
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
  taskIdIdx: index('api_usage_task_id_idx').on(table.taskId), // NEW INDEX
  taskStatusIdx: index('api_usage_task_status_idx').on(table.taskStatus), // NEW INDEX
}))

// Alternative: Separate tasks table (cleaner separation)
export const asyncTasks = sqliteTable('async_tasks', {
  id: text('id').primaryKey(), // This is the taskId
  type: text('type', { enum: ['image', 'video'] }).notNull(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull(),
  progress: integer('progress').default(0).notNull(), // 0-100
  
  // Request data
  model: text('model').notNull(),
  prompt: text('prompt').notNull(),
  requestData: text('request_data').notNull(), // JSON string of full request
  
  // Result data  
  resultData: text('result_data'), // JSON string of generation result
  outputUrls: text('output_urls'), // JSON array of generated URLs
  cost: integer('cost'), // in 1e-4 USD units
  error: text('error'), // Error message if failed
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  
  // User tracking
  userId: text('user_id').notNull(),
  apiKeyId: text('api_key_id'),
  ip: text('ip'),
  
  // Link to api_usage record
  apiUsageId: text('api_usage_id').references(() => apiUsage.id),
  
}, (table) => ({
  userIdIdx: index('async_tasks_user_id_idx').on(table.userId),
  statusIdx: index('async_tasks_status_idx').on(table.status),
  createdAtIdx: index('async_tasks_created_at_idx').on(table.createdAt),
  typeIdx: index('async_tasks_type_idx').on(table.type),
}))

export type AsyncTask = typeof asyncTasks.$inferSelect
export type NewAsyncTask = typeof asyncTasks.$inferInsert