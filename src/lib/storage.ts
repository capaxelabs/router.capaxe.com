import cuid from 'cuid'

interface R2UploadResult {
  success: boolean
  url: string
  buffer?: Buffer
}

export class R2StorageService {
  private bucket: R2Bucket | null = null
  private bucketName: string
  private publicUrl: string

  constructor(bucket: R2Bucket, bucketName: string, publicUrl: string) {
    this.bucket = bucket
    this.bucketName = bucketName
    this.publicUrl = publicUrl
    
    console.log('[R2StorageService] Initialized with:')
    console.log(`  - Bucket: ${bucket ? 'provided' : 'NULL/UNDEFINED'}`)
    console.log(`  - BucketName: ${bucketName || 'EMPTY'}`)
    console.log(`  - PublicURL: ${publicUrl || 'EMPTY'}`)
    console.log(`  - isEnabled: ${this.isEnabled()}`)
  }

  isEnabled(): boolean {
    return this.bucket !== null && !!this.bucketName
  }

  generateFileName(contentType: string, type: 'image' | 'video' = 'image'): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    
    const dateFolder = `${year}/${month}/${day}`
    const uniqueId = cuid()
    const extension = this.getExtensionFromContentType(contentType)
    
    return `${type}s/${dateFolder}/${uniqueId}${extension}`
  }

  getExtensionFromContentType(contentType: string): string {
    const typeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov'
    }
    return typeMap[contentType] || ''
  }

  // Internal helper that handles the actual R2 put request
  private async _uploadBody(body: ArrayBuffer | ReadableStream | string, contentType: string, type: 'image' | 'video' = 'image'): Promise<R2UploadResult> {
    console.log(`[R2 Upload] Starting upload - type: ${type}, contentType: ${contentType}`)
    
    if (!this.bucket) {
      console.error('[R2 Upload] ERROR: R2 bucket not available')
      throw new Error('R2 bucket not available')
    }

    const fileName = this.generateFileName(contentType, type)
    console.log(`[R2 Upload] Generated filename: ${fileName}`)

    try {
      const object = await this.bucket.put(fileName, body, {
        httpMetadata: {
          contentType: contentType
        }
      })

      if (!object) {
        console.error(`[R2 Upload] ERROR: bucket.put() returned null/undefined for ${fileName}`)
        throw new Error('Failed to upload file to R2')
      }

      console.log(`[R2 Upload] Successfully uploaded to R2: ${fileName}, key: ${object.key}, size: ${object.size} bytes`)

      // Preserve buffer if it's available for b64_json fallback
      const maybeBuffer = body instanceof ArrayBuffer ? Buffer.from(body) : null

      const publicUrl = this.publicUrl ? `${this.publicUrl}/${fileName}` : fileName
      console.log(`[R2 Upload] Generated public URL: ${publicUrl}`)

      return {
        success: true,
        url: publicUrl,
        buffer: maybeBuffer
      }
    } catch (error) {
      console.error(`[R2 Upload] ERROR during bucket.put():`, error)
      throw error
    }
  }

  async downloadAndUpload(url: string, contentType: string, type: 'image' | 'video' = 'image', needBuffer = false): Promise<R2UploadResult> {
    console.log(`[R2 Download] Starting download from: ${url}`)
    console.log(`[R2 Download] Storage enabled: ${this.isEnabled()}, bucket: ${this.bucket ? 'available' : 'null'}, bucketName: ${this.bucketName}, publicUrl: ${this.publicUrl}`)
    
    if (!this.isEnabled()) {
      console.error('[R2 Download] ERROR: Storage service is not configured')
      throw new Error('Storage service is not configured')
    }

    try {
      console.log(`[R2 Download] Fetching content from ${url}...`)
      const response = await fetch(url)
      if (!response.ok) {
        console.error(`[R2 Download] ERROR: Failed to download - status: ${response.status} ${response.statusText}`)
        throw new Error(`Failed to download content: ${response.statusText}`)
      }

      const contentLength = response.headers.get('content-length')
      console.log(`[R2 Download] Download successful - Content-Length: ${contentLength || 'unknown'} bytes`)

      // For R2, we can use the response body directly or convert to ArrayBuffer
      let body: ArrayBuffer | ReadableStream
      if (needBuffer || !response.body) {
        console.log('[R2 Download] Converting to ArrayBuffer...')
        body = await response.arrayBuffer()
        console.log(`[R2 Download] ArrayBuffer size: ${(body as ArrayBuffer).byteLength} bytes`)
      } else {
        console.log('[R2 Download] Using ReadableStream directly')
        body = response.body
      }

      return await this._uploadBody(body, contentType, type)
    } catch (error) {
      console.error('[R2 Download] ERROR:', error)
      throw new Error(`Failed to upload to storage: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async uploadBase64(base64Data: string, contentType: string, type: 'image' | 'video' = 'image'): Promise<R2UploadResult> {
    console.log(`[R2 Base64] Starting base64 upload - type: ${type}, contentType: ${contentType}`)
    console.log(`[R2 Base64] Storage enabled: ${this.isEnabled()}, bucket: ${this.bucket ? 'available' : 'null'}`)
    
    if (!this.isEnabled()) {
      console.error('[R2 Base64] ERROR: Storage service is not configured')
      throw new Error('Storage service is not configured')
    }

    try {
      const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '')
      console.log(`[R2 Base64] Base64 content length: ${base64Content.length} chars`)
      
      if (!base64Content) {
        console.error('[R2 Base64] ERROR: Invalid base64 data - empty content')
        throw new Error('Invalid base64 data: empty content')
      }
      
      // Convert base64 to ArrayBuffer for R2
      console.log('[R2 Base64] Converting base64 to ArrayBuffer...')
      const binaryString = atob(base64Content)
      const buffer = new ArrayBuffer(binaryString.length)
      const view = new Uint8Array(buffer)
      for (let i = 0; i < binaryString.length; i++) {
        view[i] = binaryString.charCodeAt(i)
      }
      console.log(`[R2 Base64] ArrayBuffer created: ${buffer.byteLength} bytes`)
      
      return await this._uploadBody(buffer, contentType, type)
    } catch (error) {
      console.error('[R2 Base64] ERROR:', error)
      throw new Error(`Failed to upload base64 to storage: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async processContent(content: any, responseFormat = 'url', type: 'image' | 'video' = 'image'): Promise<any> {
    console.log(`[R2 Process] Processing content - type: ${type}, responseFormat: ${responseFormat}`)
    console.log(`[R2 Process] Content has URL: ${!!content.url}, has b64_json: ${!!content.b64_json}`)
    
    if (!this.isEnabled()) {
      console.warn('[R2 Process] Storage not enabled, returning content as-is')
      return content
    }

    try {
      if (!content.url && !content.b64_json) {
        console.log('[R2 Process] No URL or base64 data, skipping')
        return content
      }

      let uploadResult: R2UploadResult | undefined

      if (content.url) {
        const contentType = this.detectContentType(content.url)
        console.log(`[R2 Process] Detected content type from URL: ${contentType}`)
        const needBuffer = responseFormat === 'b64_json'
        uploadResult = await this.downloadAndUpload(content.url, contentType, type, needBuffer)
      } else if (content.b64_json) {  
        const contentType = this.detectContentTypeFromBase64(content.b64_json)
        console.log(`[R2 Process] Detected content type from base64: ${contentType}`)
        uploadResult = await this.uploadBase64(content.b64_json, contentType, type)
      }

      if (!uploadResult) {
        console.warn('[R2 Process] No upload result, returning original content')
        return content
      }

      console.log(`[R2 Process] Upload successful! URL: ${uploadResult.url}`)

      if (responseFormat === 'b64_json') {
        // Use the buffer from upload result instead of re-downloading
        const base64Data = uploadResult.buffer ? uploadResult.buffer.toString('base64') : content.b64_json
        const result = {
          ...content,
          b64_json: base64Data,
          // Always preserve the uploaded URL for logging purposes
          _uploadedUrl: uploadResult.url
        }
        delete result.url
        console.log(`[R2 Process] Returning b64_json response with _uploadedUrl: ${uploadResult.url}`)
        return result
      } else {
        const result = {
          ...content,
          url: uploadResult.url
        }
        delete result.b64_json
        console.log(`[R2 Process] Returning URL response: ${uploadResult.url}`)
        return result
      }
    } catch (error) {
      console.error('[R2 Process] ERROR during content processing:', error)
      // Return original content as fallback
      return content
    }
  }

  detectContentType(url: string): string {
    const urlLower = url.toLowerCase()
    
    // Video formats
    if (urlLower.includes('.mp4')) return 'video/mp4'
    if (urlLower.includes('.webm')) return 'video/webm'
    if (urlLower.includes('.mov') || urlLower.includes('.quicktime')) return 'video/quicktime'
    if (urlLower.includes('.avi')) return 'video/avi'
    
    // Image formats
    if (urlLower.includes('.png')) return 'image/png'
    if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 'image/jpeg'
    if (urlLower.includes('.webp')) return 'image/webp'
    if (urlLower.includes('.gif')) return 'image/gif'
    if (urlLower.includes('.svg')) return 'image/svg+xml'
    
    // Fallback based on context
    if (urlLower.includes('video')) return 'video/mp4'
    return 'image/png'
  }

  detectContentTypeFromBase64(base64Data: string): string {
    if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/^data:([^;]+);base64,/)
      if (match) return match[1]
    }
    
    const header = base64Data.substring(0, 20)
    if (header.startsWith('/9j/')) return 'image/jpeg'
    if (header.startsWith('iVBOR')) return 'image/png'
    if (header.startsWith('UklGR')) return 'image/webp'
    if (header.startsWith('R0lGOD')) return 'image/gif'
    
    return 'image/jpeg'
  }

  async processImageResult(result: any, userId: string, responseFormat = 'url'): Promise<any> {
    if (!result || !result.data) return result

    const processedData = await Promise.all(
      result.data.map(async (item: any) => {
        return await this.processContent(item, responseFormat, 'image')
      })
    )

    return {
      ...result,
      data: processedData
    }
  }

  async processVideoResult(result: any, userId: string, responseFormat = 'url'): Promise<any> {
    if (!result || !result.data) return result

    const processedData = await Promise.all(
      result.data.map(async (item: any) => {
        return await this.processContent(item, responseFormat, 'video')
      })
    )

    return {
      ...result,
      data: processedData
    }
  }

  // Legacy methods for compatibility with existing R2 API
  async uploadFile(
    key: string,
    data: ArrayBuffer | ReadableStream | string,
    options?: {
      contentType?: string
      metadata?: Record<string, string>
      customMetadata?: Record<string, string>
    }
  ): Promise<string> {
    if (!this.bucket) {
      throw new Error('R2 bucket not available')
    }

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

    return this.publicUrl ? `${this.publicUrl}/${key}` : key
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

// Factory function to create storage service from environment and R2 bucket
export function createStorageService(
  bucket: R2Bucket | undefined,
  bucketName?: string,
  publicUrl?: string
): R2StorageService | null {
  console.log('[createStorageService] Creating storage service with:')
  console.log(`  - bucket: ${bucket ? 'provided' : 'NULL/UNDEFINED'}`)
  console.log(`  - bucketName: ${bucketName || 'EMPTY'}`)
  console.log(`  - publicUrl: ${publicUrl || 'EMPTY'}`)
  
  if (!bucket || !bucketName || !publicUrl) {
    console.warn('[createStorageService] WARNING: R2 bucket, bucket name, or public URL not provided. Storage service will be disabled.')
    console.warn(`  Missing: ${!bucket ? 'bucket ' : ''}${!bucketName ? 'bucketName ' : ''}${!publicUrl ? 'publicUrl' : ''}`)
    return null
  }

  return new R2StorageService(bucket, bucketName, publicUrl)
}