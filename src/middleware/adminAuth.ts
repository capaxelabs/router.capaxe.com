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
 * Optional: Rate limiting for admin endpoints
 * Can be implemented later if needed
 */
export async function adminRateLimit(c: Context, next: Next) {
  // TODO: Implement rate limiting for admin operations
  // For now, just pass through
  await next()
}
