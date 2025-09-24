export class R2StorageService {
  constructor(private bucket: R2Bucket) {}

  async uploadFile(
    key: string,
    data: ArrayBuffer | ReadableStream | string,
    options?: {
      contentType?: string
      metadata?: Record<string, string>
      customMetadata?: Record<string, string>
    }
  ): Promise<string> {
    const object = await this.bucket.put(key, data, {
      httpMetadata: {
        contentType: options?.contentType || 'application/octet-stream',
        ...options?.metadata,
      },
      customMetadata: options?.customMetadata,
    })

    if (!object) {
      throw new Error('Failed to upload file to R2')
    }

    // Return the public URL for the uploaded file
    return `https://storage.imagerouter.io/${key}`
  }

  async uploadFileFromUrl(
    key: string,
    url: string,
    options?: {
      contentType?: string
      metadata?: Record<string, string>
      customMetadata?: Record<string, string>
    }
  ): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch file from URL: ${response.statusText}`)
    }

    const contentType = options?.contentType || response.headers.get('content-type') || 'application/octet-stream'
    
    return this.uploadFile(key, response.body!, {
      ...options,
      contentType,
    })
  }

  async getFile(key: string): Promise<R2ObjectBody | null> {
    return this.bucket.get(key)
  }

  async deleteFile(key: string): Promise<void> {
    await this.bucket.delete(key)
  }

  async listFiles(prefix?: string, limit = 1000): Promise<R2Objects> {
    return this.bucket.list({
      prefix,
      limit,
    })
  }

  generateKey(filename: string, userId?: string): string {
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
    
    if (userId) {
      return `users/${userId}/${timestamp}_${randomSuffix}_${cleanFilename}`
    }
    
    return `temp/${timestamp}_${randomSuffix}_${cleanFilename}`
  }
}