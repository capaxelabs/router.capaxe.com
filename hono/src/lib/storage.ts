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
    if (!this.bucket) {
      throw new Error('R2 bucket not available')
    }

    const fileName = this.generateFileName(contentType, type)

    const object = await this.bucket.put(fileName, body, {
      httpMetadata: {
        contentType: contentType
      }
    })

    if (!object) {
      throw new Error('Failed to upload file to R2')
    }

    // Preserve buffer if it's available for b64_json fallback
    const maybeBuffer = body instanceof ArrayBuffer ? Buffer.from(body) : null

    const publicUrl = this.publicUrl ? `${this.publicUrl}/${fileName}` : fileName

    return {
      success: true,
      url: publicUrl,
      buffer: maybeBuffer
    }
  }

  async downloadAndUpload(url: string, contentType: string, type: 'image' | 'video' = 'image', needBuffer = false): Promise<R2UploadResult> {
    if (!this.isEnabled()) {
      throw new Error('Storage service is not configured')
    }

    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download content: ${response.statusText}`)
      }

      // For R2, we can use the response body directly or convert to ArrayBuffer
      let body: ArrayBuffer | ReadableStream
      if (needBuffer || !response.body) {
        body = await response.arrayBuffer()
      } else {
        body = response.body
      }

      return await this._uploadBody(body, contentType, type)
    } catch (error) {
      console.error('Storage upload error:', error)
      throw new Error(`Failed to upload to storage: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async uploadBase64(base64Data: string, contentType: string, type: 'image' | 'video' = 'image'): Promise<R2UploadResult> {
    if (!this.isEnabled()) {
      throw new Error('Storage service is not configured')
    }

    try {
      const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '')
      if (!base64Content) {
        throw new Error('Invalid base64 data: empty content')
      }
      
      // Convert base64 to ArrayBuffer for R2
      const binaryString = atob(base64Content)
      const buffer = new ArrayBuffer(binaryString.length)
      const view = new Uint8Array(buffer)
      for (let i = 0; i < binaryString.length; i++) {
        view[i] = binaryString.charCodeAt(i)
      }
      
      return await this._uploadBody(buffer, contentType, type)
    } catch (error) {
      console.error('Storage upload error:', error)
      throw new Error(`Failed to upload base64 to storage: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async processContent(content: any, responseFormat = 'url', type: 'image' | 'video' = 'image'): Promise<any> {
    if (!this.isEnabled()) {
      return content
    }

    try {
      if (!content.url && !content.b64_json) {
        return content
      }

      let uploadResult: R2UploadResult | undefined

      if (content.url) {
        const contentType = this.detectContentType(content.url)
        const needBuffer = responseFormat === 'b64_json'
        uploadResult = await this.downloadAndUpload(content.url, contentType, type, needBuffer)
      } else if (content.b64_json) {  
        const contentType = this.detectContentTypeFromBase64(content.b64_json)
        uploadResult = await this.uploadBase64(content.b64_json, contentType, type)
      }

      if (!uploadResult) {
        return content
      }

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
        return result
      } else {
        const result = {
          ...content,
          url: uploadResult.url
        }
        delete result.b64_json
        return result
      }
    } catch (error) {
      console.error('Content processing error:', error)
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
  if (!bucket || !bucketName || !publicUrl) {
    console.warn('R2 bucket, bucket name, or public URL not provided. Storage service will be disabled.')
    return null
  }

  return new R2StorageService(bucket, bucketName, publicUrl)
}