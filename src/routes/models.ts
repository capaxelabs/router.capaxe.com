import { Hono } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { ModelService } from '../services/modelService'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

/**
 * Get all available models from database
 * GET /v1/models
 */
app.get('/', async (c) => {
  const db = c.get('db')
  const modelService = new ModelService(db)

  const type = c.req.query('type') as 'image' | 'video' | undefined
  const status = c.req.query('status') as 'active' | 'inactive' | 'deprecated' | 'beta' | undefined
  const provider = c.req.query('provider')

  const filters: any = {
    status: status || 'active',
    type,
    provider,
    isPublic: true,
  }

  try {
    const modelsArray = await modelService.listModels(filters)

    const allModels: any = {}

    for (const model of modelsArray) {
      const sanitizedModel = {
        id: model.id,
        providers: model.providers.map((p: any) => ({
          id: p.id,
          model_name: p.model_name,
          pricing: {
            type: p.pricing.type,
            value: p.pricing.value,
            range: p.pricing.range,
          }
        })),
        arena_score: model.arenaScore,
        release_date: model.releaseDate,
        examples: model.examples,
        type: model.type,
        name: model.name,
        description: model.description,
        capabilities: model.capabilities,
        tags: model.tags,
        category: model.category,
      }

      allModels[model.id] = sanitizedModel
    }

    return c.json(allModels)
  } catch (error) {
    console.error('Error fetching models:', error)
    return c.json({ error: 'Failed to fetch models' }, 500)
  }
})

/**
 * GET /v1/models/ui - Redirect to unified SPA
 */
app.get('/ui', (c) => {
  return c.redirect('/')
})

export default app
