import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
import { aiRunOptions } from '../services/cloudflareAI'

const chat = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

// Apply API key validation
chat.use('/*', validateApiKey)

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  name?: string
}

interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  top_p?: number
  stop?: string | string[]
  stream?: boolean
}

/**
 * Flatten OpenAI-style content parts to plain text (Workers AI expects strings).
 */
function normalizeMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string'
      ? m.content
      : m.content.map(part => part.text || '').filter(Boolean).join('\n')
  }))
}

function toOpenAIResponse(aiResponse: any, model: string): any {
  // Third-party catalog models may already return OpenAI shape
  if (aiResponse?.choices) return aiResponse
  if (aiResponse?.result?.choices) return aiResponse.result

  const content = aiResponse?.response
    ?? aiResponse?.result?.response
    ?? ''

  const usage = aiResponse?.usage || aiResponse?.result?.usage || {}

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
    },
  }
}

// POST /v1/chat/completions
chat.post('/completions', async (c) => {
  let body: ChatCompletionRequest
  try {
    body = await c.req.json<ChatCompletionRequest>()
  } catch {
    return c.json({
      error: { message: 'Invalid JSON body', type: 'invalid_request_error' }
    }, 400)
  }

  const { model, messages, stream } = body

  if (!model || !messages || messages.length === 0) {
    return c.json({
      error: {
        message: 'Missing required fields: model and messages',
        type: 'invalid_request_error',
      }
    }, 400)
  }

  if (!c.env.AI) {
    return c.json({
      error: { message: 'AI binding not configured', type: 'configuration_error' }
    }, 503)
  }

  const inputs: Record<string, any> = {
    messages: normalizeMessages(messages)
  }
  if (body.max_tokens !== undefined) inputs.max_tokens = body.max_tokens
  if (body.temperature !== undefined) inputs.temperature = body.temperature
  if (body.top_p !== undefined) inputs.top_p = body.top_p

  try {
    if (stream) {
      const aiStream = await (c.env.AI as any).run(
        model,
        { ...inputs, stream: true },
        aiRunOptions(c.env)
      )

      return streamSSE(c, async (sseStream) => {
        const reader = (aiStream as ReadableStream).getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const dataMatch = line.match(/^data: (.+)$/)
            if (!dataMatch) continue

            const data = dataMatch[1]
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)

              // Already OpenAI chunk format - pass through
              if (parsed.choices) {
                await sseStream.writeSSE({ data: JSON.stringify(parsed) })
                continue
              }

              // Workers AI format: { response: '<delta text>' }
              if (typeof parsed.response === 'string' && parsed.response.length > 0) {
                await sseStream.writeSSE({
                  data: JSON.stringify({
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model,
                    choices: [{
                      index: 0,
                      delta: { content: parsed.response },
                      finish_reason: null,
                    }],
                  })
                })
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }

        await sseStream.writeSSE({
          data: JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })
        })
        await sseStream.writeSSE({ data: '[DONE]' })
      })
    }

    // Non-streaming response
    const aiResponse = await (c.env.AI as any).run(model, inputs, aiRunOptions(c.env))
    return c.json(toOpenAIResponse(aiResponse, model))

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

// GET /v1/chat/models - List available chat models (from DB, type='text')
chat.get('/models', async (c) => {
  const { ModelService } = await import('../services/modelService')
  const db = c.get('db')
  const modelService = new ModelService(db)

  try {
    const models = await modelService.listModels({ status: 'active', type: 'text', isPublic: true })

    return c.json({
      object: 'list',
      data: models.map((m: any) => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.id.startsWith('@') ? 'workers-ai' : 'unified-billing',
        description: m.description,
      }))
    })
  } catch (error) {
    console.error('Error fetching chat models:', error)
    return c.json({ error: { message: 'Failed to fetch models', type: 'internal_error' } }, 500)
  }
})

export default chat
