export interface CloudflareBindings {
  // Database
  DB: D1Database
  TURSO_DATABASE_URL: string
  TURSO_AUTH_TOKEN: string
  
  // Storage
  STORAGE_BUCKET: R2Bucket
  R2_BUCKET_NAME: string
  R2_CUSTOM_PUBLIC_URL: string
  
  // Google Cloud
  GOOGLE_CLOUD_PROJECT_ID: string
  GOOGLE_CLOUD_LOCATION: string
  GOOGLE_SERVICE_ACCOUNT_KEY: string
  
  // API Keys for various providers
  GEMINI_API_KEY: string
  VERTEX_API_KEY: string
  FAL_API_KEY: string
  RUNWARE_API_KEY: string
  WAVESPEED_API_KEY: string
  
  // Application settings
  ENVIRONMENT: string
  JWT_SECRET: string
  PROXY_COUNT: string
  
  // Rate limiting
  RATE_LIMIT_REDIS?: KVNamespace
  
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