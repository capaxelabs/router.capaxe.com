export interface ImageRouterVideoModelConfig {
  baseURL: string
  apiKey: string
  headers?: Record<string, string>
  pollInterval?: number
  maxPollAttempts?: number
}

export interface VideoGenerationOptions {
  prompt: string
  duration?: number
  resolution?: '720p' | '1080p'
  aspectRatio?: string
  image?: {
    data: string
    type: string
  }
  abortSignal?: AbortSignal
}

export interface VideoGenerationResult {
  videos: Array<{ url: string }>
  warnings: Array<{ type: 'other'; message: string }>
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

export class ImageRouterVideoModel {
  readonly provider = 'imagerouter'
  readonly modelId: string

  private config: ImageRouterVideoModelConfig

  constructor(modelId: string, config: ImageRouterVideoModelConfig) {
    this.modelId = modelId
    this.config = config
  }

  private async pollTaskStatus(taskId: string, signal?: AbortSignal): Promise<TaskStatusResponse> {
    const pollInterval = this.config.pollInterval || 5000
    const maxAttempts = this.config.maxPollAttempts || 300

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
        throw new Error(status.error || 'Video generation failed')
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error('Video generation timed out')
  }

  async generate(options: VideoGenerationOptions): Promise<VideoGenerationResult> {
    const warnings: Array<{ type: 'other'; message: string }> = []

    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
    }

    if (options.duration !== undefined) {
      requestBody.duration = options.duration
    }

    if (options.resolution) {
      requestBody.resolution = options.resolution
    }

    if (options.aspectRatio) {
      requestBody.aspect_ratio = options.aspectRatio
    }

    if (options.image) {
      requestBody.image = options.image
    }

    const response = await fetch(`${this.config.baseURL}/v1/videos/generations`, {
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

    const data = await response.json() as {
      taskId?: string
      data?: Array<{ url: string }>
    }

    if (data.taskId) {
      const taskResult = await this.pollTaskStatus(data.taskId, options.abortSignal)

      if (!taskResult.result?.data) {
        throw new Error('No videos returned from task')
      }

      return {
        videos: taskResult.result.data,
        warnings,
      }
    }

    if (data.data) {
      return {
        videos: data.data,
        warnings,
      }
    }

    throw new Error('Invalid response format from ImageRouter API')
  }
}
