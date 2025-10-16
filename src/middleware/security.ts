import { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

/**
 * CORS configuration for the API
 */
export const corsMiddleware = cors({
  origin: '*', // In production, specify allowed origins
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposeHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  credentials: true,
  maxAge: 86400 // 24 hours
})

/**
 * Security headers middleware
 * Applies common security headers for API protection
 */
export const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"], // Only allow scripts from same origin (removed unsafe-inline)
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https:"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  },
  crossOriginEmbedderPolicy: false, // Disable for API usage
  crossOriginOpenerPolicy: false,   // Disable for API usage
  crossOriginResourcePolicy: false, // Disable for API usage
  originAgentCluster: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  xContentTypeOptions: true,
  xDNSPrefetchControl: false,
  xDownloadOptions: false,
  xFrameOptions: 'DENY',
  xPermittedCrossDomainPolicies: false,
  xXSSProtection: true
})

/**
 * Custom security middleware for API-specific headers
 */
export const apiSecurityHeaders = async (c: Context, next: Next) => {
  await next()
  
  // Add API-specific security headers
  c.res.headers.set('X-API-Version', '1.0')
  c.res.headers.set('X-Powered-By', 'Hono + Cloudflare Workers')
  
  // Remove potentially sensitive headers
  c.res.headers.delete('Server')
  c.res.headers.delete('X-Powered-By') // Remove default if exists
}

/**
 * Request logging middleware for debugging and monitoring
 */
export const requestLogger = async (c: Context, next: Next) => {
  const start = Date.now()
  const method = c.req.method
  const url = c.req.url
  const userAgent = c.req.header('user-agent') || 'unknown'
  const cfRay = c.req.header('cf-ray') || 'unknown'
  
  console.log(`[${new Date().toISOString()}] ${method} ${url} - ${userAgent} (CF-Ray: ${cfRay})`)
  
  await next()
  
  const end = Date.now()
  const duration = end - start
  const status = c.res.status
  
  console.log(`[${new Date().toISOString()}] ${method} ${url} - ${status} (${duration}ms)`)
}

/**
 * Error handling middleware
 */
export const errorHandler = async (c: Context, next: Next) => {
  try {
    await next()
  } catch (error) {
    console.error('Unhandled error:', error)
    
    // Don't expose internal errors to clients
    const isDevelopment = c.env?.ENVIRONMENT === 'development'
    
    return c.json({
      error: {
        message: isDevelopment && error instanceof Error 
          ? error.message 
          : 'Internal server error',
        type: 'internal_error',
        ...(isDevelopment && { stack: error instanceof Error ? error.stack : undefined })
      }
    }, 500)
  }
}

/**
 * 404 handler for unmatched routes
 */
export const notFoundHandler = (c: Context) => {
  return c.json({
    error: {
      message: 'The requested endpoint was not found',
      type: 'not_found',
      path: c.req.path
    }
  }, 404)
}

/**
 * Health check handler
 */
export const healthCheck = (c: Context) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: c.env?.ENVIRONMENT || 'unknown'
  })
}