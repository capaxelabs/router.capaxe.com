/**
 * Admin Authentication Middleware
 *
 * Protects admin endpoints with a separate admin API key.
 * Set ADMIN_API_KEY environment variable to enable admin access.
 */

import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'

export interface AdminAuthEnv {
  ADMIN_API_KEY?: string
}

// In-memory rate limit store (per worker instance)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 60 // Max requests per window per IP

/**
 * Middleware to verify admin API key
 *
 * Usage:
 *   app.use('/admin/*', adminAuth)
 *   app.post('/admin/models', createModel)
 */
export async function adminAuth(c: Context, next: Next) {
  const adminKey = c.env.ADMIN_API_KEY

  // Check if admin key is configured
  if (!adminKey) {
    throw new HTTPException(503, {
      message: 'Admin API is not configured. Set ADMIN_API_KEY environment variable.',
    })
  }

  // Get authorization header
  const authHeader = c.req.header('Authorization')

  if (!authHeader) {
    throw new HTTPException(401, {
      message: 'Missing Authorization header',
    })
  }

  // Extract token (supports both "Bearer token" and direct token)
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader

  // Verify admin key
  if (token !== adminKey) {
    throw new HTTPException(403, {
      message: 'Invalid admin API key',
    })
  }

  // Continue to next handler
  await next()
}

/**
 * Rate limiting middleware for admin endpoints
 * Uses in-memory store per worker instance (stateless across workers)
 * For distributed rate limiting, use Cloudflare KV or Durable Objects
 */
export async function adminRateLimit(c: Context, next: Next) {
  // Get client identifier (IP or API key)
  const clientIp = c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'

  const now = Date.now()
  const key = `admin:${clientIp}`

  // Clean up old entries periodically (every 100 requests)
  if (Math.random() < 0.01) {
    cleanupRateLimitStore(now)
  }

  // Get or create rate limit entry
  let entry = rateLimitStore.get(key)

  if (!entry || now >= entry.resetTime) {
    // Create new window
    entry = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    }
    rateLimitStore.set(key, entry)
  } else {
    // Increment counter
    entry.count++

    // Check if limit exceeded
    if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000)

      c.header('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString())
      c.header('X-RateLimit-Remaining', '0')
      c.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString())
      c.header('Retry-After', retryAfter.toString())

      throw new HTTPException(429, {
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      })
    }
  }

  // Add rate limit headers
  c.header('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString())
  c.header('X-RateLimit-Remaining', (RATE_LIMIT_MAX_REQUESTS - entry.count).toString())
  c.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString())

  await next()
}

/**
 * Combined middleware: auth + rate limit
 */
export async function adminAuthWithRateLimit(c: Context, next: Next) {
  await adminRateLimit(c, async () => {
    await adminAuth(c, next)
  })
}

/**
 * Clean up expired rate limit entries
 */
function cleanupRateLimitStore(now: number): void {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}
