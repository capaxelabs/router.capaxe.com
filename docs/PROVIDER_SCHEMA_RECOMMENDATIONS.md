# Provider Schema Recommendations

## Current Issues

### Problem 1: Provider Selection Logic
Currently, the system requires checking provider arrays and selecting index [0], which is inefficient and unclear:

```typescript
// Current approach
const providerIndex = selectProvider(modelConfig.providers, params)
const selectedProvider = modelConfig.providers[providerIndex]
```

### Problem 2: Model ID Doesn't Indicate Provider
- `google/imagen-4` could use either `geminiImagen` OR `vertex` provider
- Users must know which provider is actually used
- No clear way to determine provider from model ID alone

### Problem 3: Redundant Provider Arrays
Most models have only 1 provider, but we store them in arrays:
```json
"providers": "[{\"id\":\"runware\",\"model_name\":\"bytedance:5@0\",\"pricing\":{\"type\":\"fixed\",\"value\":0.02}}]"
```

## Recommended Solution

### Option A: **Single Provider Per Model (RECOMMENDED)**

**Principle:** One model = One provider. Create separate model entries for different providers.

#### Schema Changes

```typescript
export const models = sqliteTable('models', {
  // ... existing fields ...

  // NEW: Direct provider fields (no JSON parsing needed)
  providerId: text('provider_id').notNull(), // 'gemini', 'vertex', 'runware'
  providerModelName: text('provider_model_name').notNull(), // Actual model name for API

  // Pricing (flattened from provider config)
  pricingType: text('pricing_type', {
    enum: ['fixed', 'calculated', 'post_generation']
  }).notNull(),
  pricingValue: integer('pricing_value'), // in 1e-4 USD units (e.g., 200 = $0.02)

  // Provider settings
  maxRetries: integer('max_retries').default(3).notNull(),
  timeoutSeconds: integer('timeout_seconds').default(120).notNull(),
  requiresAuth: integer('requires_auth', { mode: 'boolean' }).default(true).notNull(),

  // DEPRECATED: Remove this field
  // providers: text('providers').notNull(),
})
```

#### Model ID Convention

**New naming convention that includes provider:**

```
{provider}/{model-variant}
```

**Examples:**
- `gemini/gemini-2.5-flash-image` → Uses Gemini API
- `vertex/imagen-4-fast` → Uses Vertex AI
- `runware/flux-pro` → Uses Runware SDK
- `gemini/veo-3` → Uses Gemini API for video

#### Benefits

✅ **Model ID determines provider** - No ambiguity
✅ **No JSON parsing** - Direct column access
✅ **Better database queries** - Can filter/index by `providerId`
✅ **Simpler code** - No provider selection logic needed
✅ **Type-safe** - Enum validation at database level

#### Migration Example

**Old data:**
```json
{
  "id": "google/imagen-4-fast-06-06",
  "providers": "[{\"id\":\"geminiImagen\",\"model_name\":\"gemini-2.0-flash-exp\",\"pricing\":{\"type\":\"fixed\",\"value\":0.02}},{\"id\":\"vertex\",\"model_name\":\"imagen-4.0-fast-generate-preview-06-06\",\"pricing\":{\"type\":\"fixed\",\"value\":0.02}}]"
}
```

**New data (split into 2 models):**
```json
[
  {
    "id": "gemini/imagen-4-fast-06-06",
    "providerId": "gemini",
    "providerModelName": "gemini-2.0-flash-exp",
    "pricingType": "fixed",
    "pricingValue": 200,
    "maxRetries": 3,
    "timeoutSeconds": 120
  },
  {
    "id": "vertex/imagen-4-fast-06-06",
    "providerId": "vertex",
    "providerModelName": "imagen-4.0-fast-generate-preview-06-06",
    "pricingType": "fixed",
    "pricingValue": 200,
    "maxRetries": 3,
    "timeoutSeconds": 300
  }
]
```

---

### Option B: Keep Provider Arrays but Add Primary Provider

**If you want to keep multiple providers per model for fallback:**

```typescript
export const models = sqliteTable('models', {
  // ... existing fields ...

  // NEW: Primary provider (determines model ID)
  primaryProviderId: text('primary_provider_id').notNull(),
  primaryProviderModelName: text('primary_provider_model_name').notNull(),

  // Keep existing for fallback
  providers: text('providers').notNull(), // JSON array (fallback providers)
})
```

**Model ID still indicates primary provider:**
- `gemini/imagen-4` → Primary: Gemini API, Fallback: Vertex AI
- `runware/flux-pro` → Primary: Runware, Fallback: none

---

## Recommended Implementation Plan

### Phase 1: Schema Migration

1. **Add new columns** (Option A)
2. **Migrate existing data** from `providers` JSON to new columns
3. **Keep `providers` column temporarily** for rollback safety

### Phase 2: Code Updates

1. **Update imageService.ts** to use direct fields:

```typescript
// OLD
const providerIndex = selectProvider(modelConfig.providers, params)
const selectedProvider = modelConfig.providers[providerIndex]
const actualModel = selectedProvider.model_name

// NEW
const providerId = modelConfig.providerId
const actualModel = modelConfig.providerModelName
```

2. **Update provider routing** in imageService.ts:

```typescript
// Simplified routing - no provider selection needed
switch (modelConfig.providerId) {
  case 'gemini':
  case 'geminiImagen':
    result = await generateGemini(c, { ...params, model: modelConfig.providerModelName }, userId)
    break
  case 'vertex':
    result = await generateVertex(c, { ...params, model: modelConfig.providerModelName }, userId)
    break
  case 'runware':
    result = await generateRunware(c, { ...params, model: modelConfig.providerModelName }, userId)
    break
  default:
    throw new Error(`Provider '${modelConfig.providerId}' not implemented`)
}
```

3. **Remove providerSelector.ts** - No longer needed!

### Phase 3: Data Cleanup

1. **Verify new structure** works in production
2. **Drop `providers` column** after 1 week
3. **Remove provider selection code**

---

## Updated Seed File Structure

### New Gemini Image Models

```typescript
const geminiImageModels = [
  {
    id: 'gemini/gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    slug: 'gemini-25-flash-image',
    type: 'image',
    status: 'active',
    isPublic: true,

    // Direct provider fields
    providerId: 'gemini',
    providerModelName: 'gemini-2.5-flash-image',
    pricingType: 'fixed',
    pricingValue: 300, // $0.03 in 1e-4 USD units
    maxRetries: 3,
    timeoutSeconds: 120,
    requiresAuth: true,

    // Model metadata
    arenaScore: null,
    releaseDate: '2025-01-15',
    description: 'Fast and efficient image generation...',

    // Capabilities
    capabilities: JSON.stringify({
      supportsImage: true,
      maxInputImages: 3,
      aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      maxResolution: '1024x1024',
      defaultResolution: '1024x1024',
    }),

    tags: JSON.stringify(['fast', 'multimodal', 'text-to-image', 'image-editing', 'gemini']),
    category: 'text-to-image',
  },
  {
    id: 'gemini/gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image Preview',
    slug: 'gemini-3-pro-image-preview',
    type: 'image',
    status: 'beta',
    isPublic: true,

    // Direct provider fields
    providerId: 'gemini',
    providerModelName: 'gemini-3-pro-image-preview',
    pricingType: 'calculated', // Varies by resolution
    pricingValue: 300, // Base price
    maxRetries: 3,
    timeoutSeconds: 300, // Longer for thinking mode
    requiresAuth: true,

    // Model metadata
    arenaScore: null,
    releaseDate: '2025-01-15',
    description: 'State-of-the-art image generation with thinking mode...',

    // Capabilities
    capabilities: JSON.stringify({
      supportsImage: true,
      supportsQuality: true,
      maxInputImages: 14,
      maxObjectImages: 6,
      maxHumanImages: 5,
      aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      maxResolution: '4096x4096',
      resolutionOptions: ['1K', '2K', '4K'],
      supportsGoogleSearch: true,
      supportsThinkingMode: true,
      defaultResolution: '1024x1024',
    }),

    tags: JSON.stringify(['advanced', 'multimodal', 'google-search', 'thinking', 'high-res', 'beta', 'gemini']),
    category: 'text-to-image',
  },
]
```

---

## Database Query Improvements

### Before (with JSON parsing)
```typescript
const providers = JSON.parse(modelConfig.providers)
const provider = providers[0]
const modelName = provider.model_name
const pricing = provider.pricing
```

### After (direct access)
```typescript
const providerId = modelConfig.providerId
const modelName = modelConfig.providerModelName
const pricing = modelConfig.pricingValue / 10000 // Convert to USD
```

### Query by Provider
```typescript
// Find all Gemini models
const geminiModels = await db.select()
  .from(models)
  .where(eq(models.providerId, 'gemini'))

// Find all video models using Vertex AI
const vertexVideoModels = await db.select()
  .from(models)
  .where(and(
    eq(models.type, 'video'),
    eq(models.providerId, 'vertex')
  ))
```

---

## Backward Compatibility

During migration, support both old and new formats:

```typescript
function getProviderInfo(model: Model) {
  // New format (preferred)
  if (model.providerId) {
    return {
      id: model.providerId,
      model_name: model.providerModelName,
      pricing: {
        type: model.pricingType,
        value: model.pricingValue / 10000
      }
    }
  }

  // Old format (fallback)
  const providers = JSON.parse(model.providers)
  return providers[0]
}
```

---

## Summary

**RECOMMENDED APPROACH: Option A - Single Provider Per Model**

### Changes Required

1. ✅ **Schema**: Add `providerId`, `providerModelName`, `pricingType`, `pricingValue` columns
2. ✅ **Migration**: Split multi-provider models into separate entries
3. ✅ **Code**: Remove provider selection logic, use direct fields
4. ✅ **Cleanup**: Remove `providers` JSON column after migration

### Benefits

- 🚀 **Faster**: No JSON parsing
- 🎯 **Clearer**: Model ID = Provider
- 🔍 **Queryable**: Can filter by provider
- 🛡️ **Type-safe**: Database-level validation
- 🧹 **Simpler**: Less code, easier to maintain

### Next Steps

1. Review this recommendation
2. Decide on Option A or Option B
3. Create migration script
4. Update seed files
5. Test with new Gemini models
