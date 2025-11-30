/**
 * Runware Model Search API Routes
 * Provides endpoints for searching and discovering Runware models
 * 
 * Endpoints:
 * - POST /v1/runware/models/search - Search for models with filters
 */

import { Hono } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { getRunwareService, RunwareModelSearchParams } from '../services/runwareService'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

/**
 * POST /v1/runware/models/search
 * 
 * Search for models in the Runware catalog with various filters
 * 
 * Request body:
 * {
 *   "search": "realistic",              // Optional: search term
 *   "tags": ["photorealistic"],         // Optional: filter by tags
 *   "category": "checkpoint",            // Optional: checkpoint, lora, controlnet, etc.
 *   "type": "base",                      // Optional: base, inpainting, refiner
 *   "architecture": "sdxl",              // Optional: sdxl, flux1d, sd3, etc.
 *   "conditioning": "canny",             // Optional: for ControlNet models
 *   "visibility": "public",              // Optional: public, private, community, favorite (default: public)
 *   "offset": 0,                         // Optional: pagination offset (default: 0)
 *   "limit": 20                          // Optional: results per page (default: 20, max: 100)
 * }
 * 
 * Response:
 * {
 *   "taskUUID": "uuid-v4",
 *   "taskType": "modelSearch",
 *   "totalResults": 150,
 *   "results": [
 *     {
 *       "name": "Model Name",
 *       "air": "civitai:123456@789012",
 *       "tags": ["tag1", "tag2"],
 *       "heroImage": "https://...",
 *       "category": "checkpoint",
 *       "private": false,
 *       "version": "v1",
 *       "architecture": "sdxl",
 *       "type": "base",
 *       "defaultWidth": 1024,
 *       "defaultHeight": 1024,
 *       "defaultSteps": 20,
 *       "defaultScheduler": "Default",
 *       "defaultCFG": 7.5
 *     }
 *   ]
 * }
 */
app.post('/search', async (c) => {
  try {
    // Check if Runware API key is configured
    if (!c.env.RUNWARE_API_KEY) {
      return c.json({
        error: 'Runware API is not configured',
        message: 'RUNWARE_API_KEY environment variable is missing'
      }, 503)
    }

    // Parse request body
    const body = await c.req.json().catch(() => ({}))

    // Build search parameters
    const searchParams: RunwareModelSearchParams = {}

    // Add search term if provided
    if (body.search && typeof body.search === 'string') {
      searchParams.search = body.search
    }

    // Add tags if provided (must be array)
    if (body.tags && Array.isArray(body.tags)) {
      searchParams.tags = body.tags.filter((tag: any) => typeof tag === 'string')
    }

    // Add category filter if provided
    const validCategories = ['checkpoint', 'lora', 'lycoris', 'controlnet', 'vae', 'embeddings']
    if (body.category && validCategories.includes(body.category)) {
      searchParams.category = body.category
    }

    // Add type filter if provided
    const validTypes = ['base', 'inpainting', 'refiner']
    if (body.type && validTypes.includes(body.type)) {
      searchParams.type = body.type
    }

    // Add architecture filter if provided
    const validArchitectures = [
      'flux1s', 'flux1d', 'fluxpro', 'fluxultra', 'fluxkontextdev', 'fluxkontextpro', 'fluxkontextmax',
      'imagen3', 'imagen3fast', 'imagen4preview', 'imagen4ultra', 'imagen4fast',
      'gemini_2_5_flash_image', 'hidreamfast', 'hidreamdev', 'hidreamfull',
      'qwen_image', 'qwen_image_edit', 'flex_1_alpha',
      'ideogram1', 'ideogram2a', 'ideogram2', 'ideogram3',
      'sd1x', 'sdhyper', 'sd1xlcm', 'sdxl', 'sdxllcm', 'sdxldistilled', 'sdxlhyper', 'sdxllightning', 'sdxlturbo',
      'sd3', 'pony'
    ]
    if (body.architecture && validArchitectures.includes(body.architecture)) {
      searchParams.architecture = body.architecture
    }

    // Add conditioning filter if provided (for ControlNet)
    const validConditionings = [
      'blur', 'canny', 'depth', 'gray', 'hed', 'inpaint', 'inpaintdepth', 'lineart',
      'lowquality', 'normal', 'openmlsd', 'openpose', 'outfit', 'pix2pix', 'qrcode',
      'scribble', 'seg', 'shuffle', 'sketch', 'softedge', 'tile'
    ]
    if (body.conditioning && validConditionings.includes(body.conditioning)) {
      searchParams.conditioning = body.conditioning
    }

    // Add visibility filter if provided
    const validVisibilities = ['public', 'private', 'community', 'favorite']
    if (body.visibility && validVisibilities.includes(body.visibility)) {
      searchParams.visibility = body.visibility
    } else {
      searchParams.visibility = 'public' // Default
    }

    // Add pagination parameters
    if (typeof body.offset === 'number' && body.offset >= 0) {
      searchParams.offset = body.offset
    } else {
      searchParams.offset = 0
    }

    if (typeof body.limit === 'number' && body.limit > 0 && body.limit <= 100) {
      searchParams.limit = body.limit
    } else {
      searchParams.limit = 20 // Default
    }

    // Get Runware service and perform search
    const runwareService = getRunwareService(c.env.RUNWARE_API_KEY)
    const results = await runwareService.searchModels(searchParams)

    // Return results in the format specified by Runware API docs
    return c.json({
      data: [
        {
          ...results,
          // The response includes taskUUID, taskType, totalResults, and results array
        }
      ]
    })
  } catch (error) {
    console.error('[Runware Search API] Error:', error)
    
    return c.json({
      error: 'Model search failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }, 500)
  }
})

/**
 * GET /v1/runware/models/search
 * 
 * Alternative GET endpoint for simple searches using query parameters
 * Useful for quick searches without requiring POST body
 */
app.get('/search', async (c) => {
  try {
    // Check if Runware API key is configured
    if (!c.env.RUNWARE_API_KEY) {
      return c.json({
        error: 'Runware API is not configured',
        message: 'RUNWARE_API_KEY environment variable is missing'
      }, 503)
    }

    // Build search parameters from query string
    const searchParams: RunwareModelSearchParams = {}

    // Get query parameters
    const query = c.req.query()

    // Add search term
    if (query.search) {
      searchParams.search = query.search
    }

    // Add tags (comma-separated)
    if (query.tags) {
      searchParams.tags = query.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
    }

    // Add category
    const validCategories = ['checkpoint', 'lora', 'lycoris', 'controlnet', 'vae', 'embeddings']
    if (query.category && validCategories.includes(query.category)) {
      searchParams.category = query.category as any
    }

    // Add type
    const validTypes = ['base', 'inpainting', 'refiner']
    if (query.type && validTypes.includes(query.type)) {
      searchParams.type = query.type as any
    }

    // Add architecture
    const validArchitectures = [
      'flux1s', 'flux1d', 'fluxpro', 'fluxultra', 'sdxl', 'sd1x', 'sd3', 'pony',
      'imagen3', 'imagen3fast', 'imagen4preview', 'imagen4ultra', 'imagen4fast', 'gemini_2_5_flash_image'
    ]
    if (query.architecture && validArchitectures.includes(query.architecture)) {
      searchParams.architecture = query.architecture as any
    }

    // Add conditioning
    const validConditionings = [
      'blur', 'canny', 'depth', 'gray', 'hed', 'inpaint', 'lineart', 'normal', 
      'openpose', 'qrcode', 'scribble', 'sketch', 'softedge', 'tile'
    ]
    if (query.conditioning && validConditionings.includes(query.conditioning)) {
      searchParams.conditioning = query.conditioning as any
    }

    // Add visibility
    const validVisibilities = ['public', 'private', 'community', 'favorite']
    searchParams.visibility = (query.visibility && validVisibilities.includes(query.visibility)) 
      ? query.visibility as any 
      : 'public'

    // Add pagination
    searchParams.offset = query.offset ? parseInt(query.offset) : 0
    searchParams.limit = query.limit ? Math.min(parseInt(query.limit), 100) : 20

    // Get Runware service and perform search
    const runwareService = getRunwareService(c.env.RUNWARE_API_KEY)
    const results = await runwareService.searchModels(searchParams)

    // Return results
    return c.json({
      data: [results]
    })
  } catch (error) {
    console.error('[Runware Search API] Error:', error)
    
    return c.json({
      error: 'Model search failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }, 500)
  }
})

/**
 * GET /v1/runware/models
 * 
 * Get all available models (with pagination)
 * Convenience endpoint that searches with no filters
 */
app.get('/', async (c) => {
  try {
    if (!c.env.RUNWARE_API_KEY) {
      return c.json({
        error: 'Runware API is not configured',
        message: 'RUNWARE_API_KEY environment variable is missing'
      }, 503)
    }

    // Get pagination from query
    const query = c.req.query()
    const offset = query.offset ? parseInt(query.offset) : 0
    const limit = query.limit ? Math.min(parseInt(query.limit), 100) : 20

    // Search with no filters to get all models
    const runwareService = getRunwareService(c.env.RUNWARE_API_KEY)
    const results = await runwareService.searchModels({
      visibility: 'public',
      offset,
      limit
    })

    return c.json({
      data: [results]
    })
  } catch (error) {
    console.error('[Runware Models API] Error:', error)
    
    return c.json({
      error: 'Failed to fetch models',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }, 500)
  }
})

export default app
