import type {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider'

export interface ImageRouterChatModelConfig {
  baseURL: string
  apiKey: string
  headers?: Record<string, string>
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class ImageRouterChatModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1' as const
  readonly provider = 'imagerouter'
  readonly modelId: string
  readonly defaultObjectGenerationMode = 'json' as const

  private config: ImageRouterChatModelConfig

  constructor(modelId: string, config: ImageRouterChatModelConfig) {
    this.modelId = modelId
    this.config = config
  }

  private convertPrompt(prompt: LanguageModelV1CallOptions['prompt']): ChatMessage[] {
    const messages: ChatMessage[] = []

    for (const message of prompt) {
      if (message.role === 'system') {
        messages.push({
          role: 'system',
          content: message.content,
        })
      } else if (message.role === 'user') {
        const content = message.content
          .map((part) => {
            if (part.type === 'text') return part.text
            if (part.type === 'image') {
              // Handle image content - convert to text description for now
              // Full image support would require base64 encoding
              return '[Image]'
            }
            return ''
          })
          .join('')

        messages.push({ role: 'user', content })
      } else if (message.role === 'assistant') {
        const content = message.content
          .map((part) => {
            if (part.type === 'text') return part.text
            if (part.type === 'tool-call') return `[Tool Call: ${part.toolName}]`
            return ''
          })
          .join('')

        messages.push({ role: 'assistant', content })
      } else if (message.role === 'tool') {
        // Convert tool results to user messages
        const content = message.content
          .map((part) => `Tool result for ${part.toolCallId}: ${JSON.stringify(part.result)}`)
          .join('\n')

        messages.push({ role: 'user', content })
      }
    }

    return messages
  }

  private mapFinishReason(reason: string | null): LanguageModelV1FinishReason {
    switch (reason) {
      case 'stop':
        return 'stop'
      case 'length':
        return 'length'
      case 'tool_calls':
        return 'tool-calls'
      case 'content_filter':
        return 'content-filter'
      default:
        return 'stop'
    }
  }

  async doGenerate(options: LanguageModelV1CallOptions): Promise<{
    text?: string
    toolCalls?: Array<{
      toolCallType: 'function'
      toolCallId: string
      toolName: string
      args: string
    }>
    finishReason: LanguageModelV1FinishReason
    usage: { promptTokens: number; completionTokens: number }
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> }
    rawResponse?: { headers?: Record<string, string> }
    warnings?: Array<{ type: 'other'; message: string }>
  }> {
    const messages = this.convertPrompt(options.prompt)

    const requestBody = {
      model: this.modelId,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stopSequences,
      stream: false,
    }

    const response = await fetch(`${this.config.baseURL}/v1/chat/completions`, {
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
      id: string
      choices: Array<{
        message: { role: string; content: string; tool_calls?: Array<any> }
        finish_reason: string
      }>
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    const choice = data.choices[0]
    const toolCalls = choice.message.tool_calls?.map((tc: any) => ({
      toolCallType: 'function' as const,
      toolCallId: tc.id,
      toolName: tc.function.name,
      args: tc.function.arguments,
    }))

    return {
      text: choice.message.content || undefined,
      toolCalls,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
      },
      rawCall: {
        rawPrompt: messages,
        rawSettings: requestBody,
      },
    }
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> }
    rawResponse?: { headers?: Record<string, string> }
    warnings?: Array<{ type: 'other'; message: string }>
  }> {
    const messages = this.convertPrompt(options.prompt)

    const requestBody = {
      model: this.modelId,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stopSequences,
      stream: true,
    }

    const response = await fetch(`${this.config.baseURL}/v1/chat/completions`, {
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

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    let promptTokens = 0
    let completionTokens = 0

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      async pull(controller) {
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens, completionTokens },
            })
            controller.close()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim() || line.startsWith(':')) continue

            const dataMatch = line.match(/^data: (.+)$/)
            if (!dataMatch) continue

            const data = dataMatch[1]
            if (data === '[DONE]') {
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
                usage: { promptTokens, completionTokens },
              })
              controller.close()
              return
            }

            try {
              const parsed = JSON.parse(data) as {
                choices: Array<{
                  delta: { content?: string; role?: string }
                  finish_reason: string | null
                }>
                usage?: { prompt_tokens: number; completion_tokens: number }
              }

              const choice = parsed.choices[0]

              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens
                completionTokens = parsed.usage.completion_tokens
              }

              if (choice.delta.content) {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: choice.delta.content,
                })
              }

              if (choice.finish_reason) {
                controller.enqueue({
                  type: 'finish',
                  finishReason: choice.finish_reason === 'stop' ? 'stop' : 'stop',
                  usage: { promptTokens, completionTokens },
                })
                controller.close()
                return
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      },
    })

    return {
      stream,
      rawCall: {
        rawPrompt: messages,
        rawSettings: requestBody,
      },
    }
  }
}
