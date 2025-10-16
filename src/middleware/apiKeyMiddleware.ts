import { Context, Next } from 'hono'
import { eq } from 'drizzle-orm'
import { Database, apiKeys, users } from '../db'
import { CloudflareBindings } from '../types/env'

// JWT validation utilities (simplified for Cloudflare Workers)
function validateTempToken(token: string, jwtSecret: string): { userId: string } | null {
  try {
    // For now, disable JWT validation to avoid global scope issues
    // TODO: Implement with @tsndr/cloudflare-worker-jwt or similar
    console.warn('JWT validation is disabled - implement proper JWT validation for production')
    return null
  } catch (error) {
    return null
  }
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
    const apiKeyString = authHeader.slice(7).trim() // Remove 'Bearer ' prefix and trim whitespace
    const db = c.get('db') as Database

    let authenticatedUser: AuthenticatedUser | null = null

    if (apiKeyString.length === 64) {
      // API key validation
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

    } else if (apiKeyString.length === 192) {
      // JWT token validation
      const jwtResult = validateTempToken(apiKeyString, c.env.JWT_SECRET)
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
          message: `Invalid authorization token length: ${apiKeyString.length}`,
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