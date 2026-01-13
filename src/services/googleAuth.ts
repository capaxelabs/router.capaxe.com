import { CloudflareBindings } from '../types/env'

/**
 * Google Service Account Token for Vertex AI authentication
 */
export interface GoogleAccessToken {
  access_token: string
  expires_in: number
  token_type: 'Bearer'
}

interface GoogleServiceAccountCredentials {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
  auth_provider_x509_cert_url: string
  client_x509_cert_url: string
}

// Token cache to avoid generating new tokens for every request
let cachedToken: { token: GoogleAccessToken; expiresAt: number } | null = null

/**
 * Get Google Service Account credentials from environment
 */
export function getGoogleServiceAccountCredentials(env: CloudflareBindings): GoogleServiceAccountCredentials {
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured')
  }

  try {
    const decodedKey = atob(env.GOOGLE_SERVICE_ACCOUNT_KEY)
    return JSON.parse(decodedKey)
  } catch (error) {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY format - must be base64 encoded JSON')
  }
}

/**
 * Convert PEM private key to CryptoKey for Web Crypto API
 */
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // Remove PEM headers and whitespace
  const pemContents = pemKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  // Decode base64 to ArrayBuffer
  const binaryString = atob(pemContents)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // Import the key using Web Crypto API
  return await crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  )
}

/**
 * Base64URL encode (URL-safe base64 without padding)
 */
function base64UrlEncode(data: string | ArrayBuffer): string {
  let base64: string

  if (typeof data === 'string') {
    base64 = btoa(data)
  } else {
    const bytes = new Uint8Array(data)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    base64 = btoa(binary)
  }

  // Convert to URL-safe base64 and remove padding
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Generate JWT for Google Service Account authentication
 * Uses Web Crypto API for RS256 signing (Cloudflare Workers compatible)
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
    exp: now + 3600,
    iat: now
  }

  // Encode header and payload
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const unsignedToken = `${headerB64}.${payloadB64}`

  // Import private key and sign
  const cryptoKey = await importPrivateKey(privateKey)
  const encoder = new TextEncoder()
  const data = encoder.encode(unsignedToken)

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    data
  )

  const signatureB64 = base64UrlEncode(signature)

  return `${unsignedToken}.${signatureB64}`
}

/**
 * Get Google Access Token for Vertex AI API
 * Implements proper OAuth2 service account authentication
 */
export async function getGoogleAccessToken(env: CloudflareBindings): Promise<GoogleAccessToken> {
  // Check cache first (with 5 minute buffer before expiry)
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 300000) {
    return cachedToken.token
  }

  try {
    const credentials = getGoogleServiceAccountCredentials(env)

    // Generate JWT
    const jwt = await generateGoogleJWT(
      credentials.client_email,
      credentials.private_key,
      'https://www.googleapis.com/auth/cloud-platform'
    )

    // Exchange JWT for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OAuth2 token exchange failed (${response.status}): ${errorText}`)
    }

    const tokenData = await response.json() as {
      access_token: string
      expires_in: number
      token_type: string
    }

    const token: GoogleAccessToken = {
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      token_type: 'Bearer'
    }

    // Cache the token
    cachedToken = {
      token,
      expiresAt: now + (tokenData.expires_in * 1000)
    }

    return token
  } catch (error) {
    // Clear cache on error
    cachedToken = null
    throw new Error(`Failed to get Google access token: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Clear the token cache (useful for testing or when credentials change)
 */
export function clearTokenCache(): void {
  cachedToken = null
}

/**
 * Get Google Gemini API key based on model and environment variables
 */
export function getGeminiApiKey(model: string, env: CloudflareBindings): string {
  const geminiKeyString = env.GEMINI_API_KEY
  let geminiKeyArray: string[] = []

  if (geminiKeyString) {
    geminiKeyArray = geminiKeyString.split(',').filter((key: string) => key.trim() !== '')
  }

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
