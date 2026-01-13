import { Context, Next } from 'hono'
import { eq } from 'drizzle-orm'
import { Database, apiKeys, users } from '../db'
import { CloudflareBindings } from '../types/env'

interface JwtPayload {
  userId: string
  exp: number
  iat: number
}

/**
 * Base64URL decode (handles URL-safe base64 without padding)
 */
function base64UrlDecode(str: string): string {
  // Add padding if needed
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  return atob(base64)
}

/**
 * Validate JWT token using HMAC-SHA256
 * Cloudflare Workers compatible using Web Crypto API
 */
async function validateTempToken(token: string, jwtSecret: string): Promise<{ userId: string } | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [headerB64, payloadB64, signatureB64] = parts

    // Decode and parse header
    const header = JSON.parse(base64UrlDecode(headerB64))
    if (header.alg !== 'HS256') {
      console.warn('JWT uses unsupported algorithm:', header.alg)
      return null
    }

    // Decode and parse payload
    const payload: JwtPayload = JSON.parse(base64UrlDecode(payloadB64))

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      console.warn('JWT token has expired')
      return null
    }

    // Verify signature using Web Crypto API
    const encoder = new TextEncoder()
    const data = encoder.encode(`${headerB64}.${payloadB64}`)

    // Import the secret key
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    // Decode the signature from base64url
    let signatureBase64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/')
    const padding = signatureBase64.length % 4
    if (padding) {
      signatureBase64 += '='.repeat(4 - padding)
    }
    const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0))

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      data
    )

    if (!isValid) {
      console.warn('JWT signature verification failed')
      return null
    }

    // Validate required fields
    if (!payload.userId) {
      console.warn('JWT missing userId field')
      return null
    }

    return { userId: payload.userId }
  } catch (error) {
    console.error('JWT validation error:', error)
    return null
  }
}

/**
 * Generate a temporary JWT token (for internal use)
 */
export async function generateTempToken(userId: string, jwtSecret: string, expiresInSeconds: number = 3600): Promise<string> {
  const encoder = new TextEncoder()
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    userId,
    iat: now,
    exp: now + expiresInSeconds
  }

  // Base64URL encode header and payload
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const unsignedToken = `${headerB64}.${payloadB64}`

  // Sign with HMAC-SHA256
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(unsignedToken)
  )

  // Base64URL encode signature
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return `${unsignedToken}.${signatureB64}`
}

export interface AuthenticatedUser {
  id: string
  apiKeyId: string | null
  isActive: boolean
  credits: number
  isTemporaryJwt: boolean
}

/**
 * API Key validation middleware for Hono/Cloudflare Workers
 */
export const validateApiKey = async (c: Context<{ Bindings: CloudflareBindings }>, next: Next) => {
  const authHeader = c.req.header('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      error: {
        message: 'Authorization header must be provided as Bearer token',
        type: 'unauthorized'
      }
    }, 401)
  }

  try {
    const apiKeyString = authHeader.slice(7).trim()
    const db = c.get('db') as Database

    if (!db) {
      console.error('Database not available in context')
      return c.json({
        error: {
          message: 'Internal server error',
          type: 'internal_error'
        }
      }, 500)
    }

    let authenticatedUser: AuthenticatedUser | null = null

    if (apiKeyString.length === 64) {
      // API key validation (64 character hex string)
      const result = await db
        .select({
          keyId: apiKeys.id,
          isActive: apiKeys.isActive,
          userId: apiKeys.userId,
          userCredits: users.credits,
        })
        .from(apiKeys)
        .innerJoin(users, eq(apiKeys.userId, users.id))
        .where(eq(apiKeys.key, apiKeyString))
        .limit(1)

      const apiKeyData = result[0]
      if (apiKeyData) {
        authenticatedUser = {
          id: apiKeyData.userId,
          apiKeyId: apiKeyData.keyId,
          isActive: apiKeyData.isActive,
          credits: apiKeyData.userCredits,
          isTemporaryJwt: false
        }
      }

    } else if (apiKeyString.includes('.') && apiKeyString.split('.').length === 3) {
      // JWT token validation (contains dots and has 3 parts)
      const jwtResult = await validateTempToken(apiKeyString, c.env.JWT_SECRET)
      if (!jwtResult || !jwtResult.userId) {
        return c.json({
          error: {
            message: 'Invalid or expired JWT token',
            type: 'unauthorized'
          }
        }, 401)
      }

      const result = await db
        .select({
          id: users.id,
          credits: users.credits,
        })
        .from(users)
        .where(eq(users.id, jwtResult.userId))
        .limit(1)

      const userData = result[0]
      if (userData) {
        authenticatedUser = {
          id: userData.id,
          apiKeyId: null,
          isActive: true,
          credits: userData.credits,
          isTemporaryJwt: true
        }
      }

    } else {
      return c.json({
        error: {
          message: 'Invalid authorization token format',
          type: 'unauthorized'
        }
      }, 401)
    }

    if (!authenticatedUser) {
      return c.json({
        error: {
          message: 'Invalid authorization token',
          type: 'unauthorized'
        }
      }, 401)
    }

    if (!authenticatedUser.isActive) {
      return c.json({
        error: {
          message: 'API key is inactive',
          type: 'unauthorized'
        }
      }, 401)
    }

    // Store authenticated user data in context
    c.set('authenticatedUser', authenticatedUser)
    await next()

  } catch (error) {
    console.error('Error validating API key:', error)
    return c.json({
      error: {
        message: 'Error validating API key',
        type: 'internal_error'
      }
    }, 500)
  }
}
