import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { validateApiKey } from '../middleware/apiKeyMiddleware'

const chat = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

// Apply API key validation
chat.use('/*', validateApiKey)

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  name?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  stop?: string | string[]
  stream?: boolean
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters?: object
    }
  }>
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } }
}

type ProviderType = 'openai' | 'anthropic' | 'google'

function detectProvider(model: string): ProviderType {
  const modelLower = model.toLowerCase()

  if (modelLower.startsWith('gpt-') || modelLower.startsWith('o1') || modelLower.startsWith('o3') || modelLower.startsWith('chatgpt')) {
    return 'openai'
  }
  if (modelLower.startsWith('claude')) {
    return 'anthropic'
  }
  if (modelLower.startsWith('gemini') || modelLower.startsWith('google/')) {
    return 'google'
  }

  // Default to OpenAI for unknown models
  return 'openai'
}

async function callOpenAI(
  apiKey: string,
  request: ChatCompletionRequest,
  signal?: AbortSignal
): Promise<Response> {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  })
}

async function callAnthropic(
  apiKey: string,
  request: ChatCompletionRequest,
  signal?: AbortSignal
): Promise<Response> {
  // Convert OpenAI format to Anthropic format
  const systemMessage = request.messages.find(m => m.role === 'system')
  const nonSystemMessages = request.messages.filter(m => m.role !== 'system')

  const anthropicMessages = nonSystemMessages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : m.content.map(c => {
      if (c.type === 'text') return { type: 'text', text: c.text }
      if (c.type === 'image_url') return { type: 'image', source: { type: 'url', url: c.image_url?.url } }
      return c
    })
  }))

  const anthropicRequest: any = {
    model: request.model,
    messages: anthropicMessages,
    max_tokens: request.max_tokens || 4096,
    stream: request.stream,
  }

  if (systemMessage) {
    anthropicRequest.system = typeof systemMessage.content === 'string'
      ? systemMessage.content
      : systemMessage.content.map(c => c.text).join('\n')
  }
  if (request.temperature !== undefined) anthropicRequest.temperature = request.temperature
  if (request.top_p !== undefined) anthropicRequest.top_p = request.top_p
  if (request.stop) anthropicRequest.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop]

  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicRequest),
    signal,
  })
}

async function callGoogle(
  apiKey: string,
  request: ChatCompletionRequest,
  signal?: AbortSignal
): Promise<Response> {
  // Extract model name (remove google/ prefix if present)
  const modelName = request.model.replace('google/', '')

  // Convert OpenAI format to Google Gemini format
  const contents = request.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: typeof m.content === 'string'
        ? [{ text: m.content }]
        : m.content.map(c => {
            if (c.type === 'text') return { text: c.text }
            if (c.type === 'image_url') return { fileData: { fileUri: c.image_url?.url } }
            return { text: '' }
          })
    }))

  const systemMessage = request.messages.find(m => m.role === 'system')

  const geminiRequest: any = {
    contents,
    generationConfig: {
      maxOutputTokens: request.max_tokens || 8192,
    },
  }

  if (systemMessage) {
    geminiRequest.systemInstruction = {
      parts: [{ text: typeof systemMessage.content === 'string' ? systemMessage.content : systemMessage.content.map(c => c.text).join('\n') }]
    }
  }
  if (request.temperature !== undefined) geminiRequest.generationConfig.temperature = request.temperature
  if (request.top_p !== undefined) geminiRequest.generationConfig.topP = request.top_p
  if (request.stop) geminiRequest.generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop]

  const endpoint = request.stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`

  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiRequest),
    signal,
  })
}

function convertAnthropicToOpenAI(anthropicResponse: any, model: string): any {
  return {
    id: anthropicResponse.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: anthropicResponse.content?.[0]?.text || '',
      },
      finish_reason: anthropicResponse.stop_reason === 'end_turn' ? 'stop' : anthropicResponse.stop_reason,
    }],
    usage: {
      prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
      completion_tokens: anthropicResponse.usage?.output_tokens || 0,
      total_tokens: (anthropicResponse.usage?.input_tokens || 0) + (anthropicResponse.usage?.output_tokens || 0),
    },
  }
}

function convertGoogleToOpenAI(googleResponse: any, model: string): any {
  const candidate = googleResponse.candidates?.[0]
  const content = candidate?.content?.parts?.[0]?.text || ''

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content,
      },
      finish_reason: candidate?.finishReason === 'STOP' ? 'stop' : 'stop',
    }],
    usage: {
      prompt_tokens: googleResponse.usageMetadata?.promptTokenCount || 0,
      completion_tokens: googleResponse.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: googleResponse.usageMetadata?.totalTokenCount || 0,
    },
  }
}

// POST /v1/chat/completions
chat.post('/completions', async (c) => {
  const body = await c.req.json<ChatCompletionRequest>()
  const { model, messages, stream } = body

  if (!model || !messages || messages.length === 0) {
    return c.json({
      error: {
        message: 'Missing required fields: model and messages',
        type: 'invalid_request_error',
      }
    }, 400)
  }

  const provider = detectProvider(model)

  // Get API keys from environment
  const openaiKey = c.env.OPENAI_API_KEY
  const anthropicKey = c.env.ANTHROPIC_API_KEY
  const googleKey = c.env.GOOGLE_GEMINI_API_KEY

  // Validate provider key availability
  if (provider === 'openai' && !openaiKey) {
    return c.json({ error: { message: 'OpenAI API key not configured', type: 'configuration_error' } }, 503)
  }
  if (provider === 'anthropic' && !anthropicKey) {
    return c.json({ error: { message: 'Anthropic API key not configured', type: 'configuration_error' } }, 503)
  }
  if (provider === 'google' && !googleKey) {
    return c.json({ error: { message: 'Google API key not configured', type: 'configuration_error' } }, 503)
  }

  try {
    if (stream) {
      // Streaming response
      return streamSSE(c, async (sseStream) => {
        let providerResponse: Response

        if (provider === 'openai') {
          providerResponse = await callOpenAI(openaiKey!, { ...body, stream: true })
        } else if (provider === 'anthropic') {
          providerResponse = await callAnthropic(anthropicKey!, { ...body, stream: true })
        } else {
          providerResponse = await callGoogle(googleKey!, { ...body, stream: true })
        }

        if (!providerResponse.ok) {
          const error = await providerResponse.text()
          await sseStream.writeSSE({ data: JSON.stringify({ error: { message: error } }) })
          return
        }

        const reader = providerResponse.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim() || line.startsWith(':')) continue

            const dataMatch = line.match(/^data: (.+)$/)
            if (!dataMatch) continue

            const data = dataMatch[1]
            if (data === '[DONE]') {
              await sseStream.writeSSE({ data: '[DONE]' })
              continue
            }

            try {
              const parsed = JSON.parse(data)

              if (provider === 'openai') {
                // OpenAI format - pass through
                await sseStream.writeSSE({ data: JSON.stringify(parsed) })
              } else if (provider === 'anthropic') {
                // Convert Anthropic streaming format
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  await sseStream.writeSSE({
                    data: JSON.stringify({
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model,
                      choices: [{
                        index: 0,
                        delta: { content: parsed.delta.text },
                        finish_reason: null,
                      }],
                    })
                  })
                } else if (parsed.type === 'message_stop') {
                  await sseStream.writeSSE({
                    data: JSON.stringify({
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model,
                      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                    })
                  })
                }
              } else if (provider === 'google') {
                // Convert Google streaming format
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
                if (text) {
                  await sseStream.writeSSE({
                    data: JSON.stringify({
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model,
                      choices: [{
                        index: 0,
                        delta: { content: text },
                        finish_reason: parsed.candidates?.[0]?.finishReason === 'STOP' ? 'stop' : null,
                      }],
                    })
                  })
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }

        await sseStream.writeSSE({ data: '[DONE]' })
      })
    }

    // Non-streaming response
    let providerResponse: Response

    if (provider === 'openai') {
      providerResponse = await callOpenAI(openaiKey!, body)
    } else if (provider === 'anthropic') {
      providerResponse = await callAnthropic(anthropicKey!, body)
    } else {
      providerResponse = await callGoogle(googleKey!, body)
    }

    if (!providerResponse.ok) {
      const error = await providerResponse.text()
      return c.json({ error: { message: error, type: 'provider_error' } }, providerResponse.status as any)
    }

    const providerData = await providerResponse.json()

    // Convert response to OpenAI format
    let openaiResponse
    if (provider === 'openai') {
      openaiResponse = providerData
    } else if (provider === 'anthropic') {
      openaiResponse = convertAnthropicToOpenAI(providerData, model)
    } else {
      openaiResponse = convertGoogleToOpenAI(providerData, model)
    }

    return c.json(openaiResponse)

  } catch (error: any) {
    console.error('Chat completion error:', error)
    return c.json({
      error: {
        message: error.message || 'Internal server error',
        type: 'internal_error',
      }
    }, 500)
  }
})

// GET /v1/chat/models - List available chat models
chat.get('/models', async (c) => {
  const models = [
    // OpenAI models
    { id: 'gpt-4o', provider: 'openai', description: 'GPT-4o - Latest multimodal model' },
    { id: 'gpt-4o-mini', provider: 'openai', description: 'GPT-4o Mini - Fast and affordable' },
    { id: 'gpt-4-turbo', provider: 'openai', description: 'GPT-4 Turbo with vision' },
    { id: 'o1', provider: 'openai', description: 'O1 - Reasoning model' },
    { id: 'o1-mini', provider: 'openai', description: 'O1 Mini - Fast reasoning' },
    { id: 'o3-mini', provider: 'openai', description: 'O3 Mini - Latest reasoning' },
    // Anthropic models
    { id: 'claude-3-5-sonnet-20241022', provider: 'anthropic', description: 'Claude 3.5 Sonnet - Best balance' },
    { id: 'claude-3-5-haiku-20241022', provider: 'anthropic', description: 'Claude 3.5 Haiku - Fast' },
    { id: 'claude-3-opus-20240229', provider: 'anthropic', description: 'Claude 3 Opus - Most capable' },
    // Google models
    { id: 'gemini-2.0-flash-exp', provider: 'google', description: 'Gemini 2.0 Flash Experimental' },
    { id: 'gemini-2.0-flash', provider: 'google', description: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', provider: 'google', description: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', provider: 'google', description: 'Gemini 1.5 Flash' },
  ]

  return c.json({
    object: 'list',
    data: models.map(m => ({
      id: m.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: m.provider,
      description: m.description,
    }))
  })
})

export default chat
