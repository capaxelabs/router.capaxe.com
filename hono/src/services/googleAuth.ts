import { CloudflareBindings } from '../types/env'

/**
 * Google Service Account Token for Vertex AI authentication
 */
export interface GoogleAccessToken {
  access_token: string
  expires_in: number
  token_type: 'Bearer'
}

/**
 * Get Google Service Account credentials from environment
 */
export function getGoogleServiceAccountCredentials(env: CloudflareBindings) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured')
  }

  try {
    // Decode base64 service account key
    const decodedKey = atob(env.GOOGLE_SERVICE_ACCOUNT_KEY)
    return JSON.parse(decodedKey)
  } catch (error) {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY format')
  }
}

/**
 * Generate JWT for Google Service Account authentication
 * Simplified implementation for Cloudflare Workers
 */
export async function generateGoogleJWT(
  serviceAccountEmail: string,
  privateKey: string,
  scope: string = 'https://www.googleapis.com/auth/cloud-platform'
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }
  
  const payload = {
    iss: serviceAccountEmail,
    scope: scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, // 1 hour
    iat: now
  }
  
  // For production, implement proper JWT signing with RSA256
  // For now, this is a placeholder that would need proper crypto implementation
  // You would use the Web Crypto API available in Cloudflare Workers
  
  const headerB64 = btoa(JSON.stringify(header))
  const payloadB64 = btoa(JSON.stringify(payload))
  
  // TODO: Implement proper RSA256 signing with Web Crypto API
  // This is a simplified placeholder
  console.warn('JWT signing not fully implemented - implement proper RSA256 signing')
  
  return `${headerB64}.${payloadB64}.signature_placeholder`
}

/**
 * Get Google Access Token for Vertex AI API
 */
export async function getGoogleAccessToken(env: CloudflareBindings): Promise<GoogleAccessToken> {
  try {
    const credentials = getGoogleServiceAccountCredentials(env)
    
    // For now, return a mock token - implement proper OAuth2 flow
    // TODO: Implement proper Google OAuth2 service account authentication
    console.warn('Google access token generation not fully implemented')
    
    return {
      access_token: 'mock_access_token',
      expires_in: 3600,
      token_type: 'Bearer'
    }
  } catch (error) {
    throw new Error(`Failed to get Google access token: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get Google Gemini API key based on model and environment variables
 */
export function getGeminiApiKey(model: string, env: CloudflareBindings): string {
  const geminiKeyString = env.GEMINI_API_KEY || env.GOOGLE_GEMINI_API_KEY
  let geminiKeyArray: string[] = []
  
  if (geminiKeyString) {
    geminiKeyArray = geminiKeyString.split(',').filter(key => key.trim() !== '')
  }
  
  // Make sure we have at least one key
  if (!geminiKeyArray.length) {
    throw new Error('No Google Gemini API key found')
  }
  
  // Use random API key for free models; use the first key for paid models
  if (model === 'gemini-2.0-flash-exp-image-generation' && geminiKeyArray.length > 1) {
    return geminiKeyArray[Math.floor(Math.random() * geminiKeyArray.length)]
  } else {
    return geminiKeyArray[0]
  }
}

/**
 * Validate Google Cloud configuration
 */
export function validateGoogleConfig(env: CloudflareBindings): void {
  const requiredVars = [
    'GOOGLE_CLOUD_PROJECT_ID',
    'GOOGLE_SERVICE_ACCOUNT_KEY'
  ]
  
  const missing = requiredVars.filter(varName => !env[varName as keyof CloudflareBindings])
  
  if (missing.length > 0) {
    throw new Error(`Missing required Google Cloud configuration: ${missing.join(', ')}`)
  }
}