import { Hono } from 'hono'
import { CloudflareBindings, ContextVariables } from './types/env'
import { getDb } from './middleware/database'
// Import middleware
import { corsMiddleware, securityHeaders, apiSecurityHeaders, requestLogger, errorHandler, notFoundHandler, healthCheck } from './middleware/security'
import { generalLimiter } from './middleware/rateLimiting'

// Create Hono app with proper typing
const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

// Global middleware setup
app.use('*', requestLogger)
app.use('*', errorHandler)
app.use('*', corsMiddleware)
app.use('*', securityHeaders)
app.use('*', apiSecurityHeaders)

// Apply general rate limiting to all routes
app.use('*', generalLimiter)

// Database connection middleware
app.use('*', getDb())

// Health check endpoint
app.get('/health', healthCheck)

// IP debug endpoint
app.get('/ip', (c) => {
  const proxyCount = Number(c.env.PROXY_COUNT || 0)
  const clientIp = proxyCount > 0 
    ? c.req.header('cf-connecting-ip') 
    : c.req.header('x-forwarded-for') || 'unknown'
  
  return c.json({ ip: clientIp })
})

// API version info
app.get('/', (c) => {
  return c.json({
    name: 'ImageRouter API',
    version: '1.0.0',
    description: 'A unified API for image and video generation models',
    framework: 'Hono + Cloudflare Workers',
    docs: 'https://docs.imagerouter.capaxe.com'
  })
})

// Import routes
import modelsRoutes from './routes/models'
import imageRoutes from './routes/images'
import videoRoutes from './routes/videos'
import adminRoutes from './routes/admin'
import taskRoutes from './routes/tasks'
import tasksPage from './routes/tasksPage'

// Models listing endpoint (Google models only for Phase 2)
app.route('/v1/models', modelsRoutes)

// Models HTML page at /models
app.route('/models', modelsRoutes)

// Image generation routes
app.route('/v1/openai/images', imageRoutes)

// Video generation routes
app.route('/v1/openai/videos', videoRoutes)

// Task management routes for async processing
app.route('/v1/tasks', taskRoutes)

// Tasks web page for viewing all tasks
app.route('/tasks', tasksPage)

// Admin routes for database seeding and management
app.route('/admin', adminRoutes)

// Placeholder routes for Phase 3 (Bytedance models) and authentication
// These will be implemented in the next phases

// app.route('/v1/auth', authRoutes)

// Handle 404s
app.notFound(notFoundHandler)

// Export the main app and queue consumer
export default {
  fetch: app.fetch,
  
  // Queue consumer for async processing
  async queue(batch: any, env: CloudflareBindings): Promise<void> {
    const { consumeQueue } = await import('./services/queueConsumer')
    return consumeQueue(batch, env)
  }
}
