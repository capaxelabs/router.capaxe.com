# Model Database Migration Proposal

## Executive Summary

This proposal outlines migrating from file-based model definitions to database-driven storage in Turso (libSQL), enabling dynamic model management without code deployments.

---

## Current State Analysis

### Current Model Structure (File-Based)

Each model is a TypeScript class file:

```typescript
class Gemini25Flash {
  data = {
    id: 'google/gemini-2.5-flash',
    providers: [{
      id: 'gemini',
      model_name: 'gemini-2.5-flash-image-preview',
      pricing: { type: 'post_generation', value: 0.0272 },
      applyImage: this.applyImageGemini,  // FUNCTION
    }],
    arena_score: 1167,
    release_date: '2025-08-26',
    examples: [...]
  }
  
  async applyImageGemini(params: any) { /* custom logic */ }
  postCalcPrice(imageResult: any) { /* custom logic */ }
}
```

**Current Locations:**
- `src/shared/imageModels/google/` - 14 image models
- `src/shared/imageModels/runware/` - 10+ image models
- `src/shared/videoModels/google/` - 4 video models
- `src/shared/videoModels/runware/` - Video models

**Issues with Current Approach:**
1. ❌ New model = new file + deployment
2. ❌ Model updates require code changes
3. ❌ No runtime enable/disable of models
4. ❌ Difficult to manage 20+ model files
5. ❌ No centralized model versioning
6. ❌ Functions embedded in classes (can't serialize)

---

## Proposed Database Schema

### Primary Table: `models`

```typescript
export const models = sqliteTable('models', {
  // Identification
  id: text('id').primaryKey(), // 'google/gemini-2.5-flash'
  name: text('name').notNull(), // 'Gemini 2.5 Flash'
  slug: text('slug').notNull(), // 'gemini-25-flash'
  type: text('type', { 
    enum: ['image', 'video'] 
  }).notNull(),
  
  // Status & Visibility
  status: text('status', { 
    enum: ['active', 'inactive', 'deprecated', 'beta'] 
  }).default('active').notNull(),
  isPublic: integer('is_public', { mode: 'boolean' }).default(true).notNull(),
  
  // Provider Configuration (JSON)
  providers: text('providers').notNull(), 
  /*
    JSON structure:
    [{
      "id": "gemini",
      "model_name": "gemini-2.5-flash-image-preview",
      "pricing": {
        "type": "post_generation",
        "value": 0.0272,
        "postCalcFunctionName": "gemini25FlashPostCalc" // Reference to function
      },
      "requiresAuth": true,
      "maxRetries": 3,
      "timeoutSeconds": 120
    }]
  */
  
  // Model Metadata
  arenaScore: integer('arena_score'),
  releaseDate: text('release_date').notNull(), // ISO 8601
  description: text('description'),
  
  // Examples (JSON)
  examples: text('examples').default('[]').notNull(),
  /*
    [{
      "image": "/model-examples/...",
      "prompt": "example prompt",
      "parameters": {...}
    }]
  */
  
  // Capabilities (JSON)
  capabilities: text('capabilities').default('{}').notNull(),
  /*
    {
      "supportsImage": true,
      "supportsMask": false,
      "supportsQuality": true,
      "aspectRatios": ["1:1", "16:9", "9:16"],
      "maxResolution": "1024x1024",
      "supportsNegativePrompt": true,
      "supportsSteps": false
    }
  */
  
  // Function References (for custom behaviors)
  applyImageFn: text('apply_image_fn'), // 'gemini25FlashApplyImage'
  applyMaskFn: text('apply_mask_fn'),
  applyQualityFn: text('apply_quality_fn'),
  postCalcPriceFn: text('post_calc_price_fn'),
  validateParamsFn: text('validate_params_fn'),
  
  // Tags & Categorization (JSON)
  tags: text('tags').default('[]').notNull(), // ["fast", "cheap", "beta"]
  category: text('category'), // "text-to-image", "image-to-video"
  
  // Usage Limits (optional)
  maxRequestsPerDay: integer('max_requests_per_day'),
  requiresWhitelist: integer('requires_whitelist', { mode: 'boolean' }).default(false).notNull(),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`).notNull(),
  deprecatedAt: integer('deprecated_at', { mode: 'timestamp' }),
}, (table) => ({
  typeIdx: index('models_type_idx').on(table.type),
  statusIdx: index('models_status_idx').on(table.status),
  providerIdx: index('models_provider_idx').on(table.providers), // For JSON queries
}))
```

---

## Hybrid Approach: Database + Code

### Database Stores:
✅ Model metadata (id, name, status, release date)  
✅ Provider configurations (JSON)  
✅ Pricing information  
✅ Examples and capabilities (JSON)  
✅ Tags and categories  
✅ Enable/disable flags  

### Code Maintains:
✅ Custom transformation functions (`applyImage`, `postCalcPrice`)  
✅ Complex validation logic  
✅ Provider-specific API integrations  

### Function Registry Pattern

```typescript
// src/shared/modelFunctions/registry.ts
export const MODEL_FUNCTIONS = {
  // Apply functions
  gemini25FlashApplyImage: async (params: any) => { /* logic */ },
  veo2ApplyImage: async (params: any) => { /* logic */ },
  
  // Post-calc functions
  gemini25FlashPostCalc: (result: any) => { /* logic */ },
  
  // Validation functions
  veo2ValidateParams: (params: any) => { /* logic */ },
} as const

export type ModelFunctionName = keyof typeof MODEL_FUNCTIONS
```

Usage:
```typescript
const model = await db.select().from(models).where(eq(models.id, modelId)).get()

if (model.applyImageFn) {
  const fn = MODEL_FUNCTIONS[model.applyImageFn]
  params = await fn(params)
}
```

---

## Migration Strategy

### Phase 1: Database Schema Setup (2-3 days)
1. Create `models` table in Drizzle schema
2. Generate and apply migration
3. Create seed script to populate from existing files
4. Verify data integrity

### Phase 2: Model Loader Service (2-3 days)
1. Create `modelService.ts` for database queries
2. Implement function registry pattern
3. Create model cache layer (reduce DB queries)
4. Add model validation logic

### Phase 3: Update Endpoints (2-3 days)
1. Modify `GET /v1/models` to query database
2. Update provider selector to use database models
3. Update image/video generation services
4. Add model status checks

### Phase 4: Admin Interface (Optional - 3-5 days)
1. Create `POST /admin/models` - Add new model
2. Create `PATCH /admin/models/:id` - Update model
3. Create `DELETE /admin/models/:id` - Soft delete
4. Add bulk import/export functionality

---

## Example Database Records

### Image Model (Google Gemini)
```json
{
  "id": "google/gemini-2.5-flash",
  "name": "Gemini 2.5 Flash",
  "slug": "gemini-25-flash",
  "type": "image",
  "status": "active",
  "isPublic": true,
  "providers": [
    {
      "id": "gemini",
      "model_name": "gemini-2.5-flash-image-preview",
      "pricing": {
        "type": "post_generation",
        "value": 0.0272
      }
    }
  ],
  "arenaScore": 1167,
  "releaseDate": "2025-08-26",
  "capabilities": {
    "supportsImage": true,
    "supportsMask": false,
    "supportsQuality": true,
    "aspectRatios": ["1:1", "3:4", "4:3", "16:9", "9:16"]
  },
  "applyImageFn": "gemini25FlashApplyImage",
  "postCalcPriceFn": "gemini25FlashPostCalc",
  "tags": ["fast", "multi-modal"],
  "category": "text-to-image"
}
```

### Video Model (Google Veo 2)
```json
{
  "id": "google/veo-2",
  "name": "Veo 2",
  "slug": "veo-2",
  "type": "video",
  "status": "active",
  "providers": [
    {
      "id": "gemini",
      "model_name": "veo-2.0-generate-001",
      "pricing": {
        "type": "fixed",
        "value": 1.75
      },
      "timeoutSeconds": 300
    }
  ],
  "arenaScore": 1115,
  "releaseDate": "2024-12-16",
  "capabilities": {
    "supportsImage": true,
    "aspectRatios": ["16:9", "9:16"],
    "resolutions": ["720p"],
    "maxDurationSeconds": 8
  },
  "applyImageFn": "veo2ApplyImage",
  "validateParamsFn": "veo2ValidateParams",
  "tags": ["video", "image-to-video"],
  "category": "video-generation"
}
```

---

## Benefits

### Operational
✅ **No deployments for new models** - Add via database insert  
✅ **Instant enable/disable** - Update status field  
✅ **A/B testing** - Beta status for select users  
✅ **Centralized management** - Single source of truth  

### Development
✅ **Reduced code duplication** - Share function logic  
✅ **Easier testing** - Mock database instead of files  
✅ **Better versioning** - Track model changes over time  
✅ **Type safety maintained** - Drizzle ORM types  

### Business
✅ **Faster iteration** - Launch models in minutes  
✅ **Dynamic pricing** - Update costs without deployment  
✅ **Usage analytics** - Track popular models  
✅ **Feature flags** - Gradual rollouts  

---

## Rollout Plan

### Week 1: Schema & Migration
- Day 1-2: Create schema, write migration
- Day 3-4: Create seed script, test data integrity
- Day 5: Code review and testing

### Week 2: Service Layer
- Day 1-2: Build modelService and function registry
- Day 3-4: Update provider selector and endpoints
- Day 5: Integration testing

### Week 3: Validation & Cleanup
- Day 1-2: End-to-end testing (all models)
- Day 3-4: Documentation and migration guides
- Day 5: Deploy to production

### Week 4: Admin Tools (Optional)
- Day 1-3: Build admin API endpoints
- Day 4-5: Create web interface for model management

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Function registry complexity | Medium | Start with simple functions, iterate |
| Database query performance | Low | Add caching layer, index JSON fields |
| Migration data loss | High | Thorough testing, backup before migration |
| Breaking existing API clients | High | Maintain backward compatibility |
| JSON query limitations in SQLite | Medium | Keep queries simple, use indexes |

---

## Success Metrics

- ✅ All 23+ models migrated successfully
- ✅ Model listing API response time < 100ms
- ✅ Zero breaking changes for existing clients
- ✅ New model addition time < 5 minutes
- ✅ Model enable/disable takes < 1 second

---

## Next Steps

1. **Approval**: Review this proposal with team
2. **Implementation**: Follow phased migration plan
3. **Testing**: Comprehensive testing at each phase
4. **Documentation**: Update API docs and guides
5. **Deployment**: Gradual rollout to production
