import cuid from 'cuid'

interface R2UploadResult {
  success: boolean
  url: string
  buffer?: Buffer
}

interface R2Credentials {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  publicUrl: string
}

export class R2StorageService {
  private credentials: R2Credentials
  private endpoint: string

  constructor(credentials: R2Credentials) {
    this.credentials = credentials
    this.endpoint = `https://${credentials.accountId}.r2.cloudflarestorage.com/${credentials.bucketName}`

    console.log('[R2StorageService] Initialized with REST API:')
    console.log(`  - AccountID: ${credentials.accountId ? 'provided' : 'EMPTY'}`)
    console.log(`  - BucketName: ${credentials.bucketName || 'EMPTY'}`)
    console.log(`  - PublicURL: ${credentials.publicUrl || 'EMPTY'}`)
    console.log(`  - Endpoint: ${this.endpoint}`)
    console.log(`  - isEnabled: ${this.isEnabled()}`)
  }

  isEnabled(): boolean {
    return !!(this.credentials.accountId && this.credentials.accessKeyId &&
      this.credentials.secretAccessKey && this.credentials.bucketName)
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

  // Generate AWS Signature V4
  private async generateSignature(method: string, key: string, contentType: string, date: string, payloadHash: string): Promise<string> {
    const region = 'auto'
    const service = 's3'

    // Create canonical request
    const canonicalUri = `/${this.credentials.bucketName}/${key}`
    const canonicalHeaders = `content-type:${contentType}\nhost:${this.credentials.accountId}.r2.cloudflarestorage.com\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\n`
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
    const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`

    // Hash canonical request
    const encoder = new TextEncoder()
    const canonicalRequestHash = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest))
    const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash)).map(b => b.toString(16).padStart(2, '0')).join('')

    // Create string to sign
    const dateStamp = date.substring(0, 8)
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
    const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n${canonicalRequestHashHex}`

    // Calculate signature
    const kDate = await this.hmac(`AWS4${this.credentials.secretAccessKey}`, dateStamp)
    const kRegion = await this.hmac(kDate, region)
    const kService = await this.hmac(kRegion, service)
    const kSigning = await this.hmac(kService, 'aws4_request')
    const signature = await this.hmac(kSigning, stringToSign)

    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  private async hmac(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder()
    const keyData = typeof key === 'string' ? encoder.encode(key) : key
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
  }

  private async sha256(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Internal helper that handles the actual R2 put request via REST API
  private async _uploadBody(body: ArrayBuffer | ReadableStream | string, contentType: string, type: 'image' | 'video' = 'image'): Promise<R2UploadResult> {
    console.log(`[R2 Upload] Starting upload - type: ${type}, contentType: ${contentType}`)

    if (!this.isEnabled()) {
      console.error('[R2 Upload] ERROR: R2 credentials not configured')
      throw new Error('R2 credentials not configured')
    }

    const fileName = this.generateFileName(contentType, type)
    console.log(`[R2 Upload] Generated filename: ${fileName}`)

    try {
      // Convert body to ArrayBuffer if needed
      let bodyBuffer: ArrayBuffer
      if (body instanceof ArrayBuffer) {
        bodyBuffer = body
      } else if (body instanceof ReadableStream) {
        const response = new Response(body)
        bodyBuffer = await response.arrayBuffer()
      } else {
        const encoder = new TextEncoder()
        bodyBuffer = encoder.encode(body)
      }

      // Calculate payload hash
      const payloadHash = await this.sha256(bodyBuffer)

      // Generate timestamp
      const now = new Date()
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
      const dateStamp = amzDate.substring(0, 8)

      // Generate signature
      const signature = await this.generateSignature('PUT', fileName, contentType, amzDate, payloadHash)

      // Create authorization header
      const credentialScope = `${dateStamp}/auto/s3/aws4_request`
      const authorization = `AWS4-HMAC-SHA256 Credential=${this.credentials.accessKeyId}/${credentialScope}, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${signature}`

      // Upload to R2
      const url = `${this.endpoint}/${fileName}`
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': amzDate,
          'Authorization': authorization
        },
        body: bodyBuffer
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[R2 Upload] ERROR: Upload failed - ${response.status} ${response.statusText}`, errorText)
        throw new Error(`Failed to upload to R2: ${response.status} ${response.statusText}`)
      }

      console.log(`[R2 Upload] Successfully uploaded to R2: ${fileName}`)

      // Preserve buffer if needed for b64_json fallback
      const maybeBuffer = Buffer.from(bodyBuffer)

      const publicUrl = `${this.credentials.publicUrl}/${fileName}`
      console.log(`[R2 Upload] Generated public URL: ${publicUrl}`)

      return {
        success: true,
        url: publicUrl,
        buffer: maybeBuffer
      }
    } catch (error) {
      console.error(`[R2 Upload] ERROR during upload:`, error)
      throw error
    }
  }

  async downloadAndUpload(url: string, contentType: string, type: 'image' | 'video' = 'image', needBuffer = false): Promise<R2UploadResult> {
    console.log(`[R2 Download] Starting download from: ${url}`)
    console.log(`[R2 Download] Storage enabled: ${this.isEnabled()}, bucketName: ${this.credentials.bucketName}, publicUrl: ${this.credentials.publicUrl}`)

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

  /**
   * NOTE: uploadSourceImage() has been removed
   * Source images are now uploaded by the client (shootflo) before calling ImageRouter
   * This service only handles output/result image processing
   */

  async uploadBase64(base64Data: string, contentType: string, type: 'image' | 'video' = 'image'): Promise<R2UploadResult> {
    console.log(`[R2 Base64] Starting base64 upload - type: ${type}, contentType: ${contentType}`)
    console.log(`[R2 Base64] Storage enabled: ${this.isEnabled()}`)

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

  // Legacy method for compatibility - now uses S3 REST API
  async uploadFile(
    key: string,
    data: ArrayBuffer | ReadableStream | string,
    options?: {
      contentType?: string
      metadata?: Record<string, string>
      customMetadata?: Record<string, string>
    }
  ): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('R2 credentials not configured')
    }

    const contentType = options?.contentType || 'application/octet-stream'

    // Convert data to ArrayBuffer if needed
    let bodyBuffer: ArrayBuffer
    if (data instanceof ArrayBuffer) {
      bodyBuffer = data
    } else if (data instanceof ReadableStream) {
      const response = new Response(data)
      bodyBuffer = await response.arrayBuffer()
    } else {
      const encoder = new TextEncoder()
      bodyBuffer = encoder.encode(data)
    }

    // Calculate payload hash
    const payloadHash = await this.sha256(bodyBuffer)

    // Generate timestamp
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateStamp = amzDate.substring(0, 8)

    // Generate signature
    const signature = await this.generateSignature('PUT', key, contentType, amzDate, payloadHash)

    // Create authorization header
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.credentials.accessKeyId}/${credentialScope}, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${signature}`

    // Upload to R2
    const url = `${this.endpoint}/${key}`
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorization
      },
      body: bodyBuffer
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to upload to R2: ${response.status} ${response.statusText} - ${errorText}`)
    }

    return `${this.credentials.publicUrl}/${key}`
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

// Factory function to create storage service from R2 credentials
export function createStorageService(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucketName: string,
  publicUrl: string
): R2StorageService | null {
  console.log('[createStorageService] Creating storage service with:')
  console.log(`  - accountId: ${accountId || 'EMPTY'}`)
  console.log(`  - accessKeyId: ${accessKeyId ? 'provided' : 'EMPTY'}`)
  console.log(`  - secretAccessKey: ${secretAccessKey ? 'provided' : 'EMPTY'}`)
  console.log(`  - bucketName: ${bucketName || 'EMPTY'}`)
  console.log(`  - publicUrl: ${publicUrl || 'EMPTY'}`)

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    console.warn('[createStorageService] WARNING: Missing required R2 credentials. Storage service will be disabled.')
    console.warn(`  Missing: ${!accountId ? 'accountId ' : ''}${!accessKeyId ? 'accessKeyId ' : ''}${!secretAccessKey ? 'secretAccessKey ' : ''}${!bucketName ? 'bucketName ' : ''}${!publicUrl ? 'publicUrl' : ''}`)
    return null
  }

  const credentials: R2Credentials = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl
  }

  return new R2StorageService(credentials)
}