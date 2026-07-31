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

// Workers AI bills @cf/ models in neurons: $0.011 per 1,000 neurons
const USD_PER_NEURON = 0.011 / 1000

const roundUsd = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * Dollar cost for a completion. Exact from neurons for @cf/ models;
 * estimated from output tokens x the DB per-1M-token price otherwise.
 */
function computeCost(
  usage: any,
  pricing: { value?: number; unit?: string } | null
): { cost: number; cost_source: 'neurons' | 'estimated_tokens' } | null {
  if (!usage) return null
  if (typeof usage.neurons === 'number') {
    return { cost: roundUsd(usage.neurons * USD_PER_NEURON), cost_source: 'neurons' }
  }
  if (pricing?.unit === 'per_1m_tokens' && typeof pricing.value === 'number' && typeof usage.completion_tokens === 'number') {
    return { cost: roundUsd((usage.completion_tokens / 1e6) * pricing.value), cost_source: 'estimated_tokens' }
  }
  return null
}

async function getTextModelPricing(c: any, modelId: string): Promise<{ value?: number; unit?: string } | null> {
  try {
    const { ModelService } = await import('../services/modelService')
    const model = await new ModelService(c.get('db')).getModelById(modelId)
    return (model as any)?.providers?.[0]?.pricing || null
  } catch {
    return null
  }
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
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      ...usage,
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
        let lastUsage: any = null

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

              if (parsed.usage) lastUsage = parsed.usage

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

        if (lastUsage) {
          const pricing = typeof lastUsage.neurons === 'number' ? null : await getTextModelPricing(c, model)
          const costInfo = computeCost(lastUsage, pricing)
          if (costInfo) lastUsage = { ...lastUsage, ...costInfo }
        }

        await sseStream.writeSSE({
          data: JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            ...(lastUsage && { usage: lastUsage }),
          })
        })
        await sseStream.writeSSE({ data: '[DONE]' })
      })
    }

    // Non-streaming response
    const aiResponse = await (c.env.AI as any).run(model, inputs, aiRunOptions(c.env))
    const openaiResponse = toOpenAIResponse(aiResponse, model)

    if (openaiResponse.usage) {
      const pricing = typeof openaiResponse.usage.neurons === 'number' ? null : await getTextModelPricing(c, model)
      const costInfo = computeCost(openaiResponse.usage, pricing)
      if (costInfo) Object.assign(openaiResponse.usage, costInfo)
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
