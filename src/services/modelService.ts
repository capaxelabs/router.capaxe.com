/**
 * Model Service
 * 
 * Handles database queries for models and hydrates them with functions from the registry.
 * Implements caching to reduce database queries.
 */

import { eq, and, sql } from 'drizzle-orm'
import { models, type Model } from '../db/schema'
import { MODEL_FUNCTIONS, type ModelFunctionName } from '../shared/modelFunctions/registry'
import type { ModelData } from '../utils/providerSelector'

// ============================================================================
// Types
// ============================================================================

export interface HydratedModel extends Omit<Model, 'providers' | 'capabilities' | 'examples' | 'tags'> {
  providers: Array<{
    id: string
    model_name: string
    pricing: {
      type: string
      value: number
      postCalcFunctionName?: string
    }
    requiresAuth?: boolean
    maxRetries?: number
    timeoutSeconds?: number
  }>
  capabilities: {
    supportsImage?: boolean
    supportsMask?: boolean
    supportsQuality?: boolean
    aspectRatios?: string[]
    resolutions?: string[]
    maxResolution?: string
    supportsNegativePrompt?: boolean
    supportsSteps?: boolean
    maxDurationSeconds?: number
  }
  examples: Array<{
    image?: string
    video?: string
    prompt?: string
    parameters?: Record<string, any>
  }>
  tags: string[]
  
  // Functions from registry
  applyImageFn?: (...args: any[]) => Promise<any>
  applyMaskFn?: (...args: any[]) => Promise<any>
  applyQualityFn?: (...args: any[]) => Promise<any>
  postCalcPriceFn?: (...args: any[]) => any
  validateParamsFn?: (...args: any[]) => void
}

export interface ModelFilters {
  type?: 'image' | 'video'
  status?: 'active' | 'inactive' | 'deprecated' | 'beta'
  isPublic?: boolean
  provider?: string
}

// ============================================================================
// Cache Implementation
// ============================================================================

class ModelCache {
  private cache: Map<string, { model: HydratedModel; timestamp: number }> = new Map()
  private listCache: Map<string, { models: HydratedModel[]; timestamp: number }> = new Map()
  private readonly TTL = 5 * 60 * 1000 // 5 minutes

  get(id: string): HydratedModel | null {
    const cached = this.cache.get(id)
    if (!cached) return null

    const isExpired = Date.now() - cached.timestamp > this.TTL
    if (isExpired) {
      this.cache.delete(id)
      return null
    }

    return cached.model
  }

  set(id: string, model: HydratedModel): void {
    this.cache.set(id, { model, timestamp: Date.now() })
  }

  getList(key: string): HydratedModel[] | null {
    const cached = this.listCache.get(key)
    if (!cached) return null

    const isExpired = Date.now() - cached.timestamp > this.TTL
    if (isExpired) {
      this.listCache.delete(key)
      return null
    }

    return cached.models
  }

  setList(key: string, models: HydratedModel[]): void {
    this.listCache.set(key, { models, timestamp: Date.now() })
  }

  clear(): void {
    this.cache.clear()
    this.listCache.clear()
  }

  clearModel(id: string): void {
    this.cache.delete(id)
    // Clear list cache when individual model is cleared
    this.listCache.clear()
  }
}

// ============================================================================
// Model Service
// ============================================================================

export class ModelService {
  private cache: ModelCache

  constructor(private db: any) {
    this.cache = new ModelCache()
  }

  /**
   * Get a single model by ID
   */
  async getModelById(id: string): Promise<HydratedModel | null> {
    // Check cache first
    const cached = this.cache.get(id)
    if (cached) return cached

    // Query database
    const dbModel = await this.db
      .select()
      .from(models)
      .where(eq(models.id, id))
      .get()

    if (!dbModel) return null

    // Hydrate and cache
    const hydrated = this.hydrateModel(dbModel)
    this.cache.set(id, hydrated)

    return hydrated
  }

  /**
   * List models with optional filters
   */
  async listModels(filters?: ModelFilters): Promise<HydratedModel[]> {
    // Create cache key from filters
    const cacheKey = JSON.stringify(filters || {})
    
    // Check cache
    const cached = this.cache.getList(cacheKey)
    if (cached) return cached

    // Build query
    let query = this.db.select().from(models)

    // Apply filters
    const conditions = []
    if (filters?.type) {
      conditions.push(eq(models.type, filters.type))
    }
    if (filters?.status) {
      conditions.push(eq(models.status, filters.status))
    }
    if (filters?.isPublic !== undefined) {
      conditions.push(eq(models.isPublic, filters.isPublic ? 1 : 0))
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions))
    }

    // Execute query
    const dbModels = await query.all()

    // Filter by provider if specified (requires JSON parsing)
    let filteredModels = dbModels
    if (filters?.provider) {
      filteredModels = dbModels.filter((model) => {
        try {
          const providers = JSON.parse(model.providers)
          return providers.some((p: any) => p.id === filters.provider)
        } catch {
          return false
        }
      })
    }

    // Hydrate all models
    const hydrated = filteredModels.map((m) => this.hydrateModel(m))

    // Cache and return
    this.cache.setList(cacheKey, hydrated)
    return hydrated
  }

  /**
   * Get only active models
   */
  async getActiveModels(type?: 'image' | 'video'): Promise<HydratedModel[]> {
    return this.listModels({ status: 'active', isPublic: true, type })
  }

  /**
   * Check if a model exists and is active
   */
  async isModelActive(id: string): Promise<boolean> {
    const model = await this.getModelById(id)
    return model?.status === 'active' && model?.isPublic === true
  }

  /**
   * Get model count by status
   */
  async getModelStats(): Promise<Record<string, number>> {
    const allModels = await this.listModels()
    
    return {
      total: allModels.length,
      active: allModels.filter(m => m.status === 'active').length,
      inactive: allModels.filter(m => m.status === 'inactive').length,
      deprecated: allModels.filter(m => m.status === 'deprecated').length,
      beta: allModels.filter(m => m.status === 'beta').length,
      image: allModels.filter(m => m.type === 'image').length,
      video: allModels.filter(m => m.type === 'video').length,
    }
  }

  /**
   * Clear cache (useful after model updates)
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Clear specific model from cache
   */
  clearModelCache(id: string): void {
    this.cache.clearModel(id)
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Hydrate a database model record with parsed JSON and functions
   */
  private hydrateModel(dbModel: Model): HydratedModel {
    // Parse JSON fields
    let providers: any[] = []
    let capabilities: any = {}
    let examples: any[] = []
    let tags: string[] = []

    try {
      providers = JSON.parse(dbModel.providers)
    } catch (e) {
      console.error(`Failed to parse providers for model ${dbModel.id}:`, e)
    }

    try {
      capabilities = JSON.parse(dbModel.capabilities)
    } catch (e) {
      console.error(`Failed to parse capabilities for model ${dbModel.id}:`, e)
    }

    try {
      examples = JSON.parse(dbModel.examples)
    } catch (e) {
      console.error(`Failed to parse examples for model ${dbModel.id}:`, e)
    }

    try {
      tags = JSON.parse(dbModel.tags)
    } catch (e) {
      console.error(`Failed to parse tags for model ${dbModel.id}:`, e)
    }

    // Attach functions from registry
    const applyImageFn = dbModel.applyImageFn 
      ? MODEL_FUNCTIONS[dbModel.applyImageFn]
      : undefined

    const applyMaskFn = dbModel.applyMaskFn
      ? MODEL_FUNCTIONS[dbModel.applyMaskFn]
      : undefined

    const applyQualityFn = dbModel.applyQualityFn
      ? MODEL_FUNCTIONS[dbModel.applyQualityFn]
      : undefined

    const postCalcPriceFn = dbModel.postCalcPriceFn
      ? MODEL_FUNCTIONS[dbModel.postCalcPriceFn]
      : undefined

    const validateParamsFn = dbModel.validateParamsFn
      ? MODEL_FUNCTIONS[dbModel.validateParamsFn]
      : undefined

    return {
      ...dbModel,
      providers,
      capabilities,
      examples,
      tags,
      applyImageFn,
      applyMaskFn,
      applyQualityFn,
      postCalcPriceFn,
      validateParamsFn,
    }
  }

  /**
   * Convert hydrated model to ModelData format (for backwards compatibility)
   */
  toModelData(hydrated: HydratedModel): ModelData {
    return {
      id: hydrated.id,
      providers: hydrated.providers.map((p) => ({
        id: p.id,
        model_name: p.model_name,
        pricing: p.pricing,
        applyImage: hydrated.applyImageFn,
        applyMask: hydrated.applyMaskFn,
        applyQuality: hydrated.applyQualityFn,
      })),
      arena_score: hydrated.arenaScore || undefined,
      release_date: hydrated.releaseDate,
      examples: hydrated.examples,
    }
  }
}

// ============================================================================
// Singleton Instance (for convenience)
// ============================================================================

let modelServiceInstance: ModelService | null = null

export function getModelService(db: any): ModelService {
  if (!modelServiceInstance) {
    modelServiceInstance = new ModelService(db)
  }
  return modelServiceInstance
}
