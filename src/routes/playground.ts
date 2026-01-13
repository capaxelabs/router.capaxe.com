/**
 * Admin Routes for Model Management
 *
 * Protected endpoints for creating, updating, and managing models in the database.
 * Requires ADMIN_API_KEY authentication.
 */

import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { models, type NewModel } from '../db/schema'
import { ModelService } from '../services/modelService'
import { adminAuth } from '../middleware/adminAuth'

const admin = new Hono()

// ============================================================================
// GET /admin - Admin Playground UI (redirect to static file)
// ============================================================================

admin.get('/', async (c) => {
  // Redirect to the main SPA (admin is now integrated)
  return c.redirect('/')
})

// Apply admin authentication to API routes only (not the UI)
admin.use('/models/*', adminAuth)

// ============================================================================
// GET /admin/models - List all models
// ============================================================================

admin.get('/models', async (c) => {
  const db = c.get('db')
  const modelService = new ModelService(db)

  // Get query parameters
  const type = c.req.query('type') as 'image' | 'video' | undefined
  const status = c.req.query('status') as 'active' | 'inactive' | 'deprecated' | 'beta' | undefined
  const provider = c.req.query('provider')

  console.log('type', type)
  console.log('status', status)
  console.log('provider', provider)

  // List models with filters
  const allModels = await modelService.listModels({
    type,
    status,
    provider,
  })

  return c.json({
    success: true,
    count: allModels.length,
    models: allModels,
  })
})

// ============================================================================
// GET /admin/models/stats - Get model statistics
// NOTE: Must come before /models/:id to avoid "stats" being matched as :id
// ============================================================================

admin.get('/models/stats', async (c) => {
  const db = c.get('db')
  const modelService = new ModelService(db)

  const stats = await modelService.getModelStats()

  return c.json({
    success: true,
    stats,
  })
})

// ============================================================================
// GET /admin/models/:id - Get single model
// ============================================================================

admin.get('/models/:id', async (c) => {
  const db = c.get('db')
  const modelService = new ModelService(db)
  const modelId = c.req.param('id')

  const model = await modelService.getModelById(modelId)

  if (!model) {
    return c.json(
      {
        success: false,
        error: 'Model not found',
      },
      404
    )
  }

  return c.json({
    success: true,
    model,
  })
})

// ============================================================================
// POST /admin/models - Create new model
// ============================================================================

admin.post('/models', async (c) => {
  const db = c.get('db')
  const body = await c.req.json()

  // Validate required fields
  const requiredFields = ['id', 'name', 'slug', 'type', 'providers', 'releaseDate']
  for (const field of requiredFields) {
    if (!body[field]) {
      return c.json(
        {
          success: false,
          error: `Missing required field: ${field}`,
        },
        400
      )
    }
  }

  // Validate type
  if (!['image', 'video'].includes(body.type)) {
    return c.json(
      {
        success: false,
        error: 'Type must be either "image" or "video"',
      },
      400
    )
  }

  // Validate status
  const validStatuses = ['active', 'inactive', 'deprecated', 'beta']
  if (body.status && !validStatuses.includes(body.status)) {
    return c.json(
      {
        success: false,
        error: `Status must be one of: ${validStatuses.join(', ')}`,
      },
      400
    )
  }

  // Validate providers is an array
  if (!Array.isArray(body.providers)) {
    return c.json(
      {
        success: false,
        error: 'Providers must be an array',
      },
      400
    )
  }

  try {
    // Prepare database record
    const newModel: NewModel = {
      id: body.id,
      name: body.name,
      slug: body.slug,
      type: body.type,
      status: body.status || 'active',
      isPublic: body.isPublic !== undefined ? (body.isPublic ? 1 : 0) : 1,
      providers: JSON.stringify(body.providers),
      arenaScore: body.arenaScore || null,
      releaseDate: body.releaseDate,
      description: body.description || null,
      examples: JSON.stringify(body.examples || []),
      capabilities: JSON.stringify(body.capabilities || {}),
      applyImageFn: body.applyImageFn || null,
      applyMaskFn: body.applyMaskFn || null,
      applyQualityFn: body.applyQualityFn || null,
      postCalcPriceFn: body.postCalcPriceFn || null,
      validateParamsFn: body.validateParamsFn || null,
      tags: JSON.stringify(body.tags || []),
      category: body.category || null,
      maxRequestsPerDay: body.maxRequestsPerDay || null,
      requiresWhitelist: body.requiresWhitelist ? 1 : 0,
    }

    // Insert into database
    await db.insert(models).values(newModel)

    // Clear cache
    const modelService = new ModelService(db)
    modelService.clearCache()

    return c.json(
      {
        success: true,
        message: 'Model created successfully',
        model: newModel,
      },
      201
    )
  } catch (error: any) {
    console.error('Error creating model:', error)

    // Check for unique constraint violation
    if (error.message?.includes('UNIQUE constraint failed')) {
      return c.json(
        {
          success: false,
          error: 'Model with this ID or slug already exists',
        },
        409
      )
    }

    return c.json(
      {
        success: false,
        error: 'Failed to create model',
        details: error.message,
      },
      500
    )
  }
})

// ============================================================================
// PATCH /admin/models/:id - Update existing model
// ============================================================================

admin.patch('/models/:id', async (c) => {
  const db = c.get('db')
  const modelId = c.req.param('id')
  const body = await c.req.json()

  // Check if model exists
  const existing = await db.select().from(models).where(eq(models.id, modelId)).get()

  if (!existing) {
    return c.json(
      {
        success: false,
        error: 'Model not found',
      },
      404
    )
  }

  try {
    // Build update object (only include provided fields)
    const updates: any = {}

    if (body.name !== undefined) updates.name = body.name
    if (body.slug !== undefined) updates.slug = body.slug
    if (body.type !== undefined) {
      if (!['image', 'video'].includes(body.type)) {
        return c.json({ success: false, error: 'Invalid type' }, 400)
      }
      updates.type = body.type
    }
    if (body.status !== undefined) {
      const validStatuses = ['active', 'inactive', 'deprecated', 'beta']
      if (!validStatuses.includes(body.status)) {
        return c.json({ success: false, error: 'Invalid status' }, 400)
      }
      updates.status = body.status
    }
    if (body.isPublic !== undefined) updates.isPublic = body.isPublic ? 1 : 0
    if (body.providers !== undefined) updates.providers = JSON.stringify(body.providers)
    if (body.arenaScore !== undefined) updates.arenaScore = body.arenaScore
    if (body.releaseDate !== undefined) updates.releaseDate = body.releaseDate
    if (body.description !== undefined) updates.description = body.description
    if (body.examples !== undefined) updates.examples = JSON.stringify(body.examples)
    if (body.capabilities !== undefined) updates.capabilities = JSON.stringify(body.capabilities)
    if (body.applyImageFn !== undefined) updates.applyImageFn = body.applyImageFn
    if (body.applyMaskFn !== undefined) updates.applyMaskFn = body.applyMaskFn
    if (body.applyQualityFn !== undefined) updates.applyQualityFn = body.applyQualityFn
    if (body.postCalcPriceFn !== undefined) updates.postCalcPriceFn = body.postCalcPriceFn
    if (body.validateParamsFn !== undefined) updates.validateParamsFn = body.validateParamsFn
    if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags)
    if (body.category !== undefined) updates.category = body.category
    if (body.maxRequestsPerDay !== undefined) updates.maxRequestsPerDay = body.maxRequestsPerDay
    if (body.requiresWhitelist !== undefined) updates.requiresWhitelist = body.requiresWhitelist ? 1 : 0

    // Add updated timestamp
    updates.updatedAt = Math.floor(Date.now() / 1000)

    // Update database
    await db.update(models).set(updates).where(eq(models.id, modelId))

    // Clear cache
    const modelService = new ModelService(db)
    modelService.clearModelCache(modelId)

    // Get updated model
    const updated = await db.select().from(models).where(eq(models.id, modelId)).get()

    return c.json({
      success: true,
      message: 'Model updated successfully',
      model: updated,
    })
  } catch (error: any) {
    console.error('Error updating model:', error)

    return c.json(
      {
        success: false,
        error: 'Failed to update model',
        details: error.message,
      },
      500
    )
  }
})

// ============================================================================
// PUT /admin/models/:id/status - Update model status only
// ============================================================================

admin.put('/models/:id/status', async (c) => {
  const db = c.get('db')
  const modelId = c.req.param('id')
  const body = await c.req.json()

  if (!body.status) {
    return c.json(
      {
        success: false,
        error: 'Status is required',
      },
      400
    )
  }

  const validStatuses = ['active', 'inactive', 'deprecated', 'beta']
  if (!validStatuses.includes(body.status)) {
    return c.json(
      {
        success: false,
        error: `Status must be one of: ${validStatuses.join(', ')}`,
      },
      400
    )
  }

  // Check if model exists
  const existing = await db.select().from(models).where(eq(models.id, modelId)).get()

  if (!existing) {
    return c.json(
      {
        success: false,
        error: 'Model not found',
      },
      404
    )
  }

  try {
    // Update status
    const updates: any = {
      status: body.status,
      updatedAt: Math.floor(Date.now() / 1000),
    }

    // Add deprecatedAt timestamp if status is deprecated
    if (body.status === 'deprecated') {
      updates.deprecatedAt = Math.floor(Date.now() / 1000)
    }

    await db.update(models).set(updates).where(eq(models.id, modelId))

    // Clear cache
    const modelService = new ModelService(db)
    modelService.clearModelCache(modelId)

    return c.json({
      success: true,
      message: `Model status updated to: ${body.status}`,
      previousStatus: existing.status,
      newStatus: body.status,
    })
  } catch (error: any) {
    console.error('Error updating model status:', error)

    return c.json(
      {
        success: false,
        error: 'Failed to update model status',
        details: error.message,
      },
      500
    )
  }
})

// ============================================================================
// DELETE /admin/models/:id - Soft delete model (set status to inactive)
// ============================================================================

admin.delete('/models/:id', async (c) => {
  const db = c.get('db')
  const modelId = c.req.param('id')
  const hardDelete = c.req.query('hard') === 'true'

  // Check if model exists
  const existing = await db.select().from(models).where(eq(models.id, modelId)).get()

  if (!existing) {
    return c.json(
      {
        success: false,
        error: 'Model not found',
      },
      404
    )
  }

  try {
    if (hardDelete) {
      // Hard delete (permanent removal)
      await db.delete(models).where(eq(models.id, modelId))

      // Clear cache
      const modelService = new ModelService(db)
      modelService.clearCache()

      return c.json({
        success: true,
        message: 'Model permanently deleted',
        modelId,
      })
    } else {
      // Soft delete (set status to inactive)
      await db
        .update(models)
        .set({
          status: 'inactive',
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(models.id, modelId))

      // Clear cache
      const modelService = new ModelService(db)
      modelService.clearModelCache(modelId)

      return c.json({
        success: true,
        message: 'Model deactivated (soft delete)',
        modelId,
        note: 'Use ?hard=true to permanently delete',
      })
    }
  } catch (error: any) {
    console.error('Error deleting model:', error)

    return c.json(
      {
        success: false,
        error: 'Failed to delete model',
        details: error.message,
      },
      500
    )
  }
})

// ============================================================================
// POST /admin/models/bulk - Bulk import models
// ============================================================================

admin.post('/models/bulk', async (c) => {
  const db = c.get('db')
  const body = await c.req.json()

  if (!Array.isArray(body.models)) {
    return c.json(
      {
        success: false,
        error: 'Request body must contain a "models" array',
      },
      400
    )
  }

  const results = {
    success: [] as string[],
    failed: [] as { id: string; error: string }[],
  }

  for (const modelData of body.models) {
    try {
      const newModel: NewModel = {
        id: modelData.id,
        name: modelData.name,
        slug: modelData.slug,
        type: modelData.type,
        status: modelData.status || 'active',
        isPublic: modelData.isPublic !== undefined ? (modelData.isPublic ? 1 : 0) : 1,
        providers: JSON.stringify(modelData.providers),
        arenaScore: modelData.arenaScore || null,
        releaseDate: modelData.releaseDate,
        description: modelData.description || null,
        examples: JSON.stringify(modelData.examples || []),
        capabilities: JSON.stringify(modelData.capabilities || {}),
        applyImageFn: modelData.applyImageFn || null,
        applyMaskFn: modelData.applyMaskFn || null,
        applyQualityFn: modelData.applyQualityFn || null,
        postCalcPriceFn: modelData.postCalcPriceFn || null,
        validateParamsFn: modelData.validateParamsFn || null,
        tags: JSON.stringify(modelData.tags || []),
        category: modelData.category || null,
        maxRequestsPerDay: modelData.maxRequestsPerDay || null,
        requiresWhitelist: modelData.requiresWhitelist ? 1 : 0,
      }

      await db.insert(models).values(newModel)
      results.success.push(modelData.id)
    } catch (error: any) {
      results.failed.push({
        id: modelData.id,
        error: error.message,
      })
    }
  }

  // Clear cache
  const modelService = new ModelService(db)
  modelService.clearCache()

  return c.json({
    success: true,
    message: 'Bulk import completed',
    imported: results.success.length,
    failed: results.failed.length,
    results,
  })
})

export default admin
