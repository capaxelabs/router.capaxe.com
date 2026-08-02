import { Hono } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { validateApiKey } from '../middleware/apiKeyMiddleware'
import { aiRunOptions } from '../services/cloudflareAI'
import { truncateDeep } from '../lib/logSanitizer'

const embeddings = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

embeddings.use('/*', validateApiKey)

interface EmbeddingRequest {
  model: string
  input: string | string[]
  encoding_format?: 'float'
}

// Workers AI bills @cf/ models in neurons: $0.011 per 1,000 neurons
const USD_PER_NEURON = 0.011 / 1000

// Workers AI text-embeddings accept at most 100 inputs per call
const MAX_INPUTS = 100

const roundUsd = (n: number) => Math.round(n * 1e6) / 1e6

// Known Workers AI embedding models. Not stored in the models table (which
// holds image/video/text), so they are listed here for GET /v1/embeddings/models.
const EMBEDDING_MODELS = [
  { id: '@cf/baai/bge-base-en-v1.5', dimensions: 768, description: 'BGE base English v1.5 - balanced quality and speed.' },
  { id: '@cf/baai/bge-small-en-v1.5', dimensions: 384, description: 'BGE small English v1.5 - fastest, smallest vectors.' },
  { id: '@cf/baai/bge-large-en-v1.5', dimensions: 1024, description: 'BGE large English v1.5 - highest quality.' },
  { id: '@cf/baai/bge-m3', dimensions: 1024, description: 'BGE M3 - multilingual.' },
]

/**
 * Log an embedding call to api_usage with truncated request/response.
 */
async function logEmbeddingCall(c: any, entry: {
  model: string
  inputCount: number
  firstInput: string
  usage: any
  status: 'success' | 'error'
  error?: string
  startTime: number
}): Promise<void> {
  try {
    const db = c.get('db')
    const user = c.get('authenticatedUser')
    if (!db || !user) return

    const { apiUsage } = await import('../db/schema')

    await db.insert(apiUsage).values({
      id: crypto.randomUUID(),
      taskId: `emb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      model: entry.model,
      provider: 'workers-ai',
      prompt: entry.firstInput.slice(0, 300),
      cost: Math.round((entry.usage?.cost || 0) * 10000), // 1e-4 USD units
      speedMs: Date.now() - entry.startTime,
      imageSize: 'n/a',
      status: entry.status,
      error: entry.error ? String(entry.error).slice(0, 500) : null,
      userId: user.id,
      apiKeyId: user.apiKeyId,
      apiKeyTempJwt: user.isTemporaryJwt,
      metadata: JSON.stringify({
        request: truncateDeep({ model: entry.model, input_count: entry.inputCount }),
        usage: entry.usage || null,
      }),
    })
  } catch (logError) {
    console.error('Failed to log embedding call:', logError)
  }
}

/**
 * Pull the vector list out of a Workers AI response.
 * Binding shape: { shape: [n, dim], data: [[...], ...] }
 * REST wrapper:  { result: { shape, data }, success: true }
 */
function extractVectors(aiResponse: any): number[][] | null {
  const data = aiResponse?.data ?? aiResponse?.result?.data
  if (!Array.isArray(data) || data.length === 0) return null
  if (!Array.isArray(data[0])) return null
  return data as number[][]
}

// POST /v1/embeddings - OpenAI-compatible embeddings
embeddings.post('/', async (c) => {
  const startTime = Date.now()

  let body: EmbeddingRequest
  try {
    body = await c.req.json<EmbeddingRequest>()
  } catch {
    return c.json({
      error: { message: 'Invalid JSON body', type: 'invalid_request_error' }
    }, 400)
  }

  const { model, input } = body

  if (!model || input === undefined || input === null) {
    return c.json({
      error: {
        message: 'Missing required fields: model and input',
        type: 'invalid_request_error',
      }
    }, 400)
  }

  const inputs = Array.isArray(input) ? input : [input]

  if (inputs.length === 0) {
    return c.json({
      error: { message: 'input must contain at least one string', type: 'invalid_request_error', param: 'input' }
    }, 400)
  }

  if (inputs.length > MAX_INPUTS) {
    return c.json({
      error: {
        message: `input accepts at most ${MAX_INPUTS} items per request, got ${inputs.length}. Split into smaller batches.`,
        type: 'invalid_request_error',
        param: 'input',
      }
    }, 400)
  }

  if (inputs.some(t => typeof t !== 'string')) {
    return c.json({
      error: { message: 'input must be a string or an array of strings', type: 'invalid_request_error', param: 'input' }
    }, 400)
  }

  if (!c.env.AI) {
    return c.json({
      error: { message: 'AI binding not configured', type: 'configuration_error' }
    }, 503)
  }

  const firstInput = inputs[0] || ''

  try {
    const aiResponse = await (c.env.AI as any).run(model, { text: inputs }, aiRunOptions(c.env))

    const vectors = extractVectors(aiResponse)
    if (!vectors) {
      throw new Error(`Model '${model}' returned no embedding data. Confirm it is a text-embeddings model.`)
    }
    if (vectors.length !== inputs.length) {
      throw new Error(`Expected ${inputs.length} embeddings, model returned ${vectors.length}`)
    }

    const rawUsage = aiResponse?.usage || aiResponse?.result?.usage || {}
    const usage: Record<string, any> = {
      prompt_tokens: rawUsage.prompt_tokens ?? 0,
      total_tokens: rawUsage.total_tokens ?? rawUsage.prompt_tokens ?? 0,
    }
    if (typeof rawUsage.neurons === 'number') {
      usage.neurons = rawUsage.neurons
      usage.cost = roundUsd(rawUsage.neurons * USD_PER_NEURON)
      usage.cost_source = 'neurons'
    }

    const response = {
      object: 'list',
      data: vectors.map((embedding, index) => ({
        object: 'embedding',
        index,
        embedding,
      })),
      model,
      usage,
    }

    c.executionCtx.waitUntil(logEmbeddingCall(c, {
      model,
      inputCount: inputs.length,
      firstInput,
      usage,
      status: 'success',
      startTime,
    }))

    return c.json(response)

  } catch (error: any) {
    console.error('Embedding error:', error)

    c.executionCtx.waitUntil(logEmbeddingCall(c, {
      model,
      inputCount: inputs.length,
      firstInput,
      usage: null,
      status: 'error',
      error: error.message || String(error),
      startTime,
    }))

    return c.json({
      error: {
        message: error.message || 'Internal server error',
        type: 'internal_error',
      }
    }, 500)
  }
})

// GET /v1/embeddings/models - List available embedding models
embeddings.get('/models', (c) => {
  return c.json({
    object: 'list',
    data: EMBEDDING_MODELS.map(m => ({
      id: m.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'workers-ai',
      dimensions: m.dimensions,
      description: m.description,
    }))
  })
})

export default embeddings
