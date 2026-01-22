import { ImageRouterChatModel, ImageRouterChatModelConfig } from './chat-model'
import { ImageRouterImageModel, ImageRouterImageModelConfig } from './image-model'
import { ImageRouterVideoModel, ImageRouterVideoModelConfig } from './video-model'

export interface ImageRouterConfig {
  apiKey: string
  baseURL?: string
  headers?: Record<string, string>
  pollInterval?: number
  maxPollAttempts?: number
}

export interface ImageRouterProvider {
  chat: (modelId: string) => ImageRouterChatModel
  image: (modelId: string) => ImageRouterImageModel
  video: (modelId: string) => ImageRouterVideoModel
}

export function createImageRouter(config: ImageRouterConfig): ImageRouterProvider {
  const baseURL = config.baseURL || 'https://api.imagerouter.capaxe.com'

  const chatConfig: ImageRouterChatModelConfig = {
    baseURL,
    apiKey: config.apiKey,
    headers: config.headers,
  }

  const imageConfig: ImageRouterImageModelConfig = {
    baseURL,
    apiKey: config.apiKey,
    headers: config.headers,
    pollInterval: config.pollInterval,
    maxPollAttempts: config.maxPollAttempts,
  }

  const videoConfig: ImageRouterVideoModelConfig = {
    baseURL,
    apiKey: config.apiKey,
    headers: config.headers,
    pollInterval: config.pollInterval || 5000,
    maxPollAttempts: config.maxPollAttempts || 300,
  }

  return {
    chat: (modelId: string) => new ImageRouterChatModel(modelId, chatConfig),
    image: (modelId: string) => new ImageRouterImageModel(modelId, imageConfig),
    video: (modelId: string) => new ImageRouterVideoModel(modelId, videoConfig),
  }
}

export { ImageRouterChatModel } from './chat-model'
export { ImageRouterImageModel } from './image-model'
export { ImageRouterVideoModel } from './video-model'
export type { ImageRouterChatModelConfig } from './chat-model'
export type { ImageRouterImageModelConfig } from './image-model'
export type { ImageRouterVideoModelConfig, VideoGenerationOptions, VideoGenerationResult } from './video-model'
