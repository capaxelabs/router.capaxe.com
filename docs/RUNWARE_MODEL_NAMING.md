# Runware Model Naming Convention

## Runware API Structure

Runware uses a unique model naming format different from other providers:

```
{provider}:{version}@{variant}
```

### Examples:
- `runware:101@1` - FLUX Pro v1.1
- `sourceful:1@1` - Sourceful FLUX V1
- `bytedance:5@0` - ByteDance Seedream V5
- `bytedance:3@0` - ByteDance Seedream V3

## Runware API Request Format

```bash
curl --request POST \
  --url 'https://api.runware.ai/v1' \
  --header "Authorization: Bearer ${RUNWARE_API_KEY}" \
  --header "Content-Type: application/json" \
  --data-raw '[
    {
      "taskType": "imageInference",
      "numberResults": 1,
      "outputFormat": "PNG",
      "width": 1024,
      "height": 1024,
      "includeCost": true,
      "outputType": ["URL"],
      "model": "bytedance:5@0",      ← Runware model identifier
      "positivePrompt": "your prompt here"
    }
  ]'
```

## How We Store Runware Models

### Database Model Entry Structure

```json
{
  "id": "runware/bytedance-seedream-v5",     // Our model ID
  "name": "ByteDance Seedream V5",
  "slug": "bytedance-seedream-v5",
  "type": "image",
  "status": "active",
  "isPublic": true,

  "providers": "[
    {
      \"id\": \"runware\",
      \"model_name\": \"bytedance:5@0\",      // Runware's actual API model name
      \"pricing\": {
        \"type\": \"fixed\",
        \"value\": 0.02
      },
      \"maxRetries\": 3,
      \"timeoutSeconds\": 90
    }
  ]",

  "capabilities": "{
    \"supportsImage\": false,
    \"supportsMask\": false,
    \"supportsTextToImage\": true,
    \"maxResolution\": \"1024x1024\"
  }"
}
```

### Key Fields Explained

| Field | Purpose | Example |
|-------|---------|---------|
| `id` | User-facing model ID | `runware/bytedance-seedream-v5` |
| `providers[].id` | Provider identifier | `runware` |
| `providers[].model_name` | **Runware API model name** | `bytedance:5@0` |
| `capabilities` | What the model can do | Supports text-to-image, etc. |

## Model ID Convention

We use a consistent convention across all providers:

```
{provider}/{model-name}
```

### Examples:
- **Google:** `google/gemini-2.5-flash-image`
- **Runware:** `runware/bytedance-seedream-v5`
- **Vertex:** `vertex/imagen-4-fast`

## Runware-Specific Capabilities

Runware models support additional parameters in the `capabilities` field:

```json
{
  "supportsImage": true,           // Image-to-image support
  "supportsMask": true,             // Inpainting support
  "supportsControlNet": true,       // ControlNet guidance
  "supportsUpscaling": true,        // Built-in upscaling
  "supportsNegativePrompt": true,   // Negative prompts
  "stepsRange": {                   // Inference steps range
    "min": 1,
    "max": 50,
    "default": 20
  },
  "guidanceRange": {                // Guidance scale range
    "min": 0,
    "max": 20,
    "default": 7.5
  }
}
```

## Available Runware Models

### Current Models in Seed File:

| Our Model ID | Runware API Name | Price | Features |
|--------------|------------------|-------|----------|
| `runware/flux-pro-v1.1` | `runware:101@1` | $0.04 | High quality, ControlNet, Inpainting |
| `runware/sourceful-flux-v1` | `sourceful:1@1` | $0.035 | Artistic, Creative |
| `runware/bytedance-seedream-v5` | `bytedance:5@0` | $0.02 | Fast, Efficient |
| `runware/bytedance-seedream-v3` | `bytedance:3@0` | $0.015 | Cost-effective |

## API Request Flow

```
User Request
    ↓
Model ID: "runware/bytedance-seedream-v5"
    ↓
Database Lookup
    ↓
Provider: "runware"
Provider Model Name: "bytedance:5@0"
    ↓
Runware API Call
    ↓
{
  "taskType": "imageInference",
  "model": "bytedance:5@0",        ← Runware's format
  "positivePrompt": "...",
  ...
}
```

## Adding New Runware Models

1. **Find the Runware model identifier** from [Runware Docs](https://docs.runware.ai/)
   - Example: `newmodel:2@1`

2. **Create database entry:**
   ```typescript
   {
     id: 'runware/your-model-name',
     name: 'Your Model Name',
     slug: 'your-model-name',
     type: 'image',
     providers: JSON.stringify([
       {
         id: 'runware',
         model_name: 'newmodel:2@1',  // ← Runware's identifier
         pricing: { type: 'fixed', value: 0.03 }
       }
     ])
   }
   ```

3. **Add to seed file** in `drizzle/seed-new-image-models.ts`

4. **Run seed:** `npm run db:seed-new-models`

## Runware vs Google Model Differences

| Aspect | Google | Runware |
|--------|--------|---------|
| **Model Name Format** | `gemini-2.5-flash-image` | `bytedance:5@0` |
| **API Structure** | REST with JSON body | REST with JSON array |
| **Authentication** | `x-goog-api-key` header | `Authorization: Bearer` |
| **Task Type** | Implicit (endpoint-based) | Explicit (`taskType: "imageInference"`) |
| **Advanced Features** | Google Search, Thinking | ControlNet, Upscaling, Inpainting |

## Complete Example

### User API Request:
```http
POST /v1/images/generations
{
  "model": "runware/flux-pro-v1.1",
  "prompt": "A serene landscape",
  "size": "1024x1024"
}
```

### Database Lookup Result:
```json
{
  "id": "runware/flux-pro-v1.1",
  "providers": [{
    "id": "runware",
    "model_name": "runware:101@1"
  }]
}
```

### Actual Runware API Call:
```json
[{
  "taskType": "imageInference",
  "model": "runware:101@1",
  "positivePrompt": "A serene landscape",
  "width": 1024,
  "height": 1024,
  "numberResults": 1,
  "outputType": ["URL"]
}]
```

---

## Quick Reference

**To add models to database:**
```bash
npm run db:seed-new-models
```

**Current seed file includes:**
- ✅ 2 Google Gemini models
- ✅ 4 Runware models
- ✅ Total: 6 new models
