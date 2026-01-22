import type {
  ImageModelV1,
  ImageModelV1CallOptions,
  ImageModelV1CallWarning,
} from '@ai-sdk/provider'

export interface ImageRouterImageModelConfig {
  baseURL: string
  apiKey: string
  headers?: Record<string, string>
  pollInterval?: number
  maxPollAttempts?: number
}

interface TaskStatusResponse {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  result?: {
    data: Array<{ url: string }>
    cost?: number
  }
  error?: string
}

export class ImageRouterImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1' as const
  readonly provider = 'imagerouter'
  readonly modelId: string
  readonly maxImagesPerCall = 4

  private config: ImageRouterImageModelConfig

  constructor(modelId: string, config: ImageRouterImageModelConfig) {
    this.modelId = modelId
    this.config = config
  }

  private async pollTaskStatus(taskId: string, signal?: AbortSignal): Promise<TaskStatusResponse> {
    const pollInterval = this.config.pollInterval || 2000
    const maxAttempts = this.config.maxPollAttempts || 150

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) {
        throw new Error('Request aborted')
      }

      const response = await fetch(`${this.config.baseURL}/v1/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...this.config.headers,
        },
        signal,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to get task status: ${error}`)
      }

      const status = await response.json() as TaskStatusResponse

      if (status.status === 'completed') {
        return status
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Image generation failed')
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error('Image generation timed out')
  }

  async doGenerate(options: ImageModelV1CallOptions): Promise<{
    images: Array<string> | Array<Uint8Array>
    warnings: Array<ImageModelV1CallWarning>
    response: {
      timestamp: Date
      modelId: string
      headers: Record<string, string> | undefined
    }
  }> {
    const timestamp = new Date()
    const warnings: ImageModelV1CallWarning[] = []

    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
      n: options.n || 1,
    }

    if (options.size) {
      requestBody.size = options.size
    }

    if (options.aspectRatio) {
      requestBody.aspect_ratio = options.aspectRatio
    }

    if (options.seed !== undefined) {
      requestBody.seed = options.seed
    }

    if (options.providerOptions?.imagerouter) {
      const providerOpts = options.providerOptions.imagerouter as Record<string, unknown>
      if (providerOpts.quality) requestBody.quality = providerOpts.quality
      if (providerOpts.style) requestBody.style = providerOpts.style
      if (providerOpts.response_format) requestBody.response_format = providerOpts.response_format
    }

    const response = await fetch(`${this.config.baseURL}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify(requestBody),
      signal: options.abortSignal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`ImageRouter API error: ${error}`)
    }

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    const data = await response.json() as {
      taskId?: string
      data?: Array<{ url?: string; b64_json?: string }>
    }

    if (data.taskId) {
      const taskResult = await this.pollTaskStatus(data.taskId, options.abortSignal)

      if (!taskResult.result?.data) {
        throw new Error('No images returned from task')
      }

      const images: Uint8Array[] = await Promise.all(
        taskResult.result.data.map(async (img) => {
          const imageResponse = await fetch(img.url, { signal: options.abortSignal })
          if (!imageResponse.ok) {
            throw new Error(`Failed to download image from ${img.url}`)
          }
          const arrayBuffer = await imageResponse.arrayBuffer()
          return new Uint8Array(arrayBuffer)
        })
      )

      return {
        images,
        warnings,
        response: {
          timestamp,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      }
    }

    if (data.data) {
      const images: Uint8Array[] = await Promise.all(
        data.data.map(async (img) => {
          if (img.b64_json) {
            const binaryString = atob(img.b64_json)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            return bytes
          }

          if (img.url) {
            const imageResponse = await fetch(img.url, { signal: options.abortSignal })
            if (!imageResponse.ok) {
              throw new Error(`Failed to download image from ${img.url}`)
            }
            const arrayBuffer = await imageResponse.arrayBuffer()
            return new Uint8Array(arrayBuffer)
          }

          throw new Error('Invalid image response: missing url or b64_json')
        })
      )

      return {
        images,
        warnings,
        response: {
          timestamp,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      }
    }

    throw new Error('Invalid response format from ImageRouter API')
  }
}
