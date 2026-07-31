export interface CloudflareBindings {
  // Cloudflare AI (all model inference goes through this binding + AI Gateway)
  AI: Ai
  // AI Gateway to route through (optional - defaults to the auto-created 'default' gateway)
  CF_AI_GATEWAY_ID?: string

  // Database (Cloudflare D1)
  DB: D1Database

  // Storage
  STORAGE_BUCKET: R2Bucket
  R2_BUCKET_NAME: string
  R2_CUSTOM_PUBLIC_URL: string
  R2_ACCOUNT_ID: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string

  // Application settings
  ENVIRONMENT: string
  JWT_SECRET: string
  PROXY_COUNT: string
  ADMIN_API_KEY: string

  // Async processing
  ASYNC_QUEUE: Queue
}

// Context variables for file uploads and parsing
export interface ContextVariables {
  parsedFields?: Record<string, string>
  parsedFiles?: {
    image?: File[]
    mask?: File[]
    [key: string]: File[] | undefined
  }
  processedRequestData?: Record<string, any>
  db?: any
  secureHeadersNonce?: string
  authenticatedUser?: {
    id: string
    apiKeyId: string | null
    isActive: boolean
    credits: number
    isTemporaryJwt: boolean
  }
}
