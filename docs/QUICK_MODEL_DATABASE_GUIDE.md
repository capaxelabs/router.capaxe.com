# Quick Guide: Database-Driven Models

## Table Structure (Added to `src/db/schema.ts`)

```typescript
export const models = sqliteTable('models', {
  // Core
  id: text('id').primaryKey(),                    // 'google/gemini-2.5-flash'
  name: text('name').notNull(),                   // 'Gemini 2.5 Flash'
  slug: text('slug').notNull().unique(),          // 'gemini-25-flash'
  type: text('type', { enum: ['image', 'video'] }).notNull(),
  status: text('status', { enum: ['active', 'inactive', 'deprecated', 'beta'] }),
  
  // JSON Fields
  providers: text('providers').notNull(),         // [{ id, model_name, pricing }]
  capabilities: text('capabilities'),             // { supportsImage, aspectRatios, ... }
  examples: text('examples').default('[]'),       // [{ image, prompt }]
  tags: text('tags').default('[]'),               // ['fast', 'cheap']
  
  // Function References (to registry)
  applyImageFn: text('apply_image_fn'),
  postCalcPriceFn: text('post_calc_price_fn'),
  
  // Metadata
  arenaScore: integer('arena_score'),
  releaseDate: text('release_date').notNull(),
  
  // Timestamps
  createdAt, updatedAt, deprecatedAt
})
```

## Next Steps

### 1. Generate & Apply Migration
```bash
npm run db:generate  # Creates migration file
npm run db:migrate   # Applies to Turso database
```

### 2. Create Function Registry
File: `src/shared/modelFunctions/registry.ts`

```typescript
export const MODEL_FUNCTIONS = {
  // Image processors
  gemini25FlashApplyImage: async (params: any) => { /* ... */ },
  veo2ApplyImage: async (params: any) => { /* ... */ },
  
  // Price calculators
  gemini25FlashPostCalc: (result: any) => 0.0272 * result.data.length,
  
  // Validators
  veo2ValidateParams: (params: any) => { /* ... */ },
}
```

### 3. Create Model Service
File: `src/services/modelService.ts`

```typescript
export class ModelService {
  async getModelById(id: string) {
    const model = await db.select().from(models).where(eq(models.id, id)).get()
    return this.hydrateModel(model)
  }
  
  async listModels(filters?: { type?: string; status?: string }) {
    let query = db.select().from(models)
    if (filters?.status) query = query.where(eq(models.status, filters.status))
    return query.all()
  }
  
  private hydrateModel(dbModel: Model) {
    // Parse JSON fields
    const providers = JSON.parse(dbModel.providers)
    const capabilities = JSON.parse(dbModel.capabilities)
    
    // Attach functions from registry
    const applyImageFn = dbModel.applyImageFn 
      ? MODEL_FUNCTIONS[dbModel.applyImageFn] 
      : undefined
    
    return { ...dbModel, providers, capabilities, applyImageFn }
  }
}
```

### 4. Seed Database from Existing Files
File: `src/db/seeds/migrateModelsToDb.ts`

```typescript
import Gemini25Flash from '../shared/imageModels/google/gemini-2.5-flash'

const geminiModel = new Gemini25Flash()
const data = geminiModel.getData()

await db.insert(models).values({
  id: data.id,
  name: 'Gemini 2.5 Flash',
  slug: 'gemini-25-flash',
  type: 'image',
  status: 'active',
  providers: JSON.stringify(data.providers.map(p => ({
    id: p.id,
    model_name: p.model_name,
    pricing: p.pricing
  }))),
  arenaScore: data.arena_score,
  releaseDate: data.release_date,
  examples: JSON.stringify(data.examples),
  applyImageFn: 'gemini25FlashApplyImage',
  postCalcPriceFn: 'gemini25FlashPostCalc',
})
```

### 5. Update Endpoints
File: `src/routes/models.ts`

```typescript
// OLD: Load from files
import Gemini25Flash from '../shared/imageModels/google/gemini-2.5-flash'
const model = new Gemini25Flash().getData()

// NEW: Load from database
const modelService = new ModelService(c.env.DB)
const model = await modelService.getModelById('google/gemini-2.5-flash')
```

## Benefits Recap

✅ **No deployments** - Add models via SQL insert  
✅ **Instant toggle** - `UPDATE models SET status='inactive' WHERE id='...'`  
✅ **Dynamic pricing** - Update JSON in `providers` field  
✅ **A/B testing** - Use `status='beta'` with whitelist  
✅ **Centralized** - Single source of truth in database  

## Adding a New Model (After Migration)

### Via SQL
```sql
INSERT INTO models (id, name, slug, type, status, providers, releaseDate)
VALUES (
  'google/gemini-3.0',
  'Gemini 3.0',
  'gemini-30',
  'image',
  'beta',
  '[{"id":"gemini","model_name":"gemini-3.0","pricing":{"type":"fixed","value":0.05}}]',
  '2025-03-01'
);
```

### Via API (Future - Phase 5.7)
```bash
curl -X POST https://api.example.com/admin/models \
  -H "Authorization: Bearer admin-token" \
  -d '{
    "id": "google/gemini-3.0",
    "name": "Gemini 3.0",
    "type": "image",
    "status": "beta",
    "providers": [{
      "id": "gemini",
      "model_name": "gemini-3.0",
      "pricing": {"type": "fixed", "value": 0.05}
    }]
  }'
```

## Implementation Checklist

Phase 5.1:
- [x] Design schema
- [x] Add to `src/db/schema.ts`
- [ ] Generate migration
- [ ] Apply to database

Phase 5.2:
- [ ] Create function registry
- [ ] Extract all transformation functions

Phase 5.3:
- [ ] Create `modelService.ts`
- [ ] Add cache layer

Phase 5.4:
- [ ] Update `/v1/models` endpoint
- [ ] Update provider selector
- [ ] Update image/video services

Phase 5.5:
- [ ] Create seed script
- [ ] Migrate all 23+ models

Phase 5.6:
- [ ] Test all endpoints
- [ ] Verify pricing calculations

See [TODO.md](../TODO.md) Phase 5 for complete implementation plan.
