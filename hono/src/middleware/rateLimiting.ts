import { Context, Next } from 'hono'
import { CloudflareBindings } from '../types/env'
import { AuthenticatedUser } from './apiKeyMiddleware'

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyGenerator?: (c: Context) => string
  message?: {
    error: {
      message: string
      type: string
    }
  }
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

/**
 * Simple in-memory rate limiter for Cloudflare Workers
 * In production, you'd use Cloudflare KV or Durable Objects for persistence
 */
class InMemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>()
  
  async check(key: string, windowMs: number, maxRequests: number): Promise<{
    allowed: boolean
    remaining: number
    resetTime: number
  }> {
    const now = Date.now()
    
    // Cleanup expired entries on each check (instead of using setInterval)
    this.cleanup()
    
    const entry = this.store.get(key)
    
    if (!entry || entry.resetTime <= now) {
      // Create new window
      const resetTime = now + windowMs
      this.store.set(key, { count: 1, resetTime })
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime
      }
    }
    
    if (entry.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime
      }
    }
    
    // Increment counter
    entry.count++
    this.store.set(key, entry)
    
    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetTime: entry.resetTime
    }
  }
  
  // Clean up expired entries
  cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key)
      }
    }
  }
}

const globalRateLimiter = new InMemoryRateLimiter()

/**
 * Get client IP address considering Cloudflare headers
 */
function getClientIP(c: Context<{ Bindings: CloudflareBindings }>): string {
  const proxyCount = Number(c.env.PROXY_COUNT || 0)
  
  if (proxyCount > 0) {
    return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  }
  
  return c.req.header('x-forwarded-for') || 'unknown'
}

/**
 * Create a rate limiting middleware
 */
export function createRateLimit(config: RateLimitConfig) {
  return async (c: Context<{ Bindings: CloudflareBindings }>, next: Next) => {
    const key = config.keyGenerator ? config.keyGenerator(c) : getClientIP(c)
    
    const result = await globalRateLimiter.check(
      key,
      config.windowMs,
      config.maxRequests
    )
    
    // Set rate limit headers
    c.res.headers.set('X-RateLimit-Limit', config.maxRequests.toString())
    c.res.headers.set('X-RateLimit-Remaining', result.remaining.toString())
    c.res.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())
    
    if (!result.allowed) {
      return c.json(config.message || {
        error: {
          message: 'Too many requests, please try again later.',
          type: 'rate_limit_error'
        }
      }, 429)
    }
    
    await next()
  }
}

/**
 * General rate limiter (20 requests per second)
 */
export const generalLimiter = createRateLimit({
  windowMs: 1000, // 1 second
  maxRequests: 20,
  message: {
    error: {
      message: 'Too many requests, please try again later.',
      type: 'rate_limit_error'
    }
  }
})

/**
 * IP-based rate limiter (6000 requests per minute = ~100/sec average)
 */
export const ipLimiter = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 6000,
  message: {
    error: {
      message: 'Too many image generation requests, please try again later.',
      type: 'rate_limit_error'
    }
  }
})

/**
 * User-based image generation rate limiter
 * Rate limit based on user balance: balanceUSD * 4 (min 6, max 100)
 */
export const userImageLimiter = createRateLimit({
  windowMs: 1000, // 1 second
  maxRequests: 100, // Will be dynamically calculated
  keyGenerator: (c) => {
    const user = c.get('authenticatedUser') as AuthenticatedUser
    return user?.id || 'anonymous'
  },
  message: {
    error: {
      message: 'API key rate limit exceeded, please try again later.',
      type: 'rate_limit_error'
    }
  }
})

/**
 * Enhanced user image limiter that calculates limit based on balance
 */
export const dynamicUserImageLimiter = async (c: Context<{ Bindings: CloudflareBindings }>, next: Next) => {
  const user = c.get('authenticatedUser') as AuthenticatedUser
  
  if (!user) {
    await next()
    return
  }
  
  // Calculate dynamic limit based on user balance
  const credits = user.credits || 0
  const usdBalance = credits / 10000 // Convert from 1e-4 USD units
  const proposedLimit = Math.floor(usdBalance * 4)
  const dynamicLimit = Math.max(6, Math.min(100, proposedLimit))
  
  const result = await globalRateLimiter.check(
    user.id,
    1000, // 1 second window
    dynamicLimit
  )
  
  // Set rate limit headers
  c.res.headers.set('X-RateLimit-Limit', dynamicLimit.toString())
  c.res.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  c.res.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())
  
  if (!result.allowed) {
    return c.json({
      error: {
        message: 'API key rate limit exceeded, please try again later.',
        type: 'rate_limit_error'
      }
    }, 429)
  }
  
  await next()
}

/**
 * User-based video generation rate limiter
 * Rate limit based on user balance: balanceUSD / 6 (min 1, max 20)
 */
export const dynamicUserVideoLimiter = async (c: Context<{ Bindings: CloudflareBindings }>, next: Next) => {
  const user = c.get('authenticatedUser') as AuthenticatedUser
  
  if (!user) {
    await next()
    return
  }
  
  // Calculate dynamic limit based on user balance
  const credits = user.credits || 0
  const usdBalance = credits / 10000 // Convert from 1e-4 USD units
  const proposedLimit = Math.floor(usdBalance / 6)
  const dynamicLimit = Math.max(1, Math.min(20, proposedLimit))
  
  const result = await globalRateLimiter.check(
    user.id,
    1000, // 1 second window
    dynamicLimit
  )
  
  // Set rate limit headers
  c.res.headers.set('X-RateLimit-Limit', dynamicLimit.toString())
  c.res.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  c.res.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())
  
  if (!result.allowed) {
    return c.json({
      error: {
        message: 'API key rate limit exceeded, please try again later.',
        type: 'rate_limit_error'
      }
    }, 429)
  }
  
  await next()
}