# PhotoMaker Integration Guide

## Overview

PhotoMaker is a Runware feature that enables **instant subject personalization** without additional training. It allows you to maintain subject identity across different scenes and artistic styles using 1-4 reference images.

## Model Information

| Field | Value |
|-------|-------|
| **Model ID** | `runware/photomaker` |
| **Provider** | Runware |
| **Task Type** | `photoMaker` (special Runware taskType) |
| **Status** | Active |
| **Category** | Image Personalization |

## Key Features

- ✅ **No Training Required** - Instant personalization from reference images
- ✅ **High Fidelity** - Maintains subject consistency across generations
- ✅ **1-4 Reference Images** - More images = better consistency
- ✅ **11 Artistic Styles** - From photographic to fantasy art
- ✅ **Trigger Word** - `rwre` automatically prepended to prompts
- ✅ **Strength Control** - Balance fidelity vs. transformation (15-50)
- ✅ **SDXL Models** - Works with any SDXL-based model

## Database Entry

### INSERT Statement (SQL)

```sql
INSERT INTO models (id, name, slug, type, status, is_public, providers, ...)
VALUES (
  'runware/photomaker',
  'PhotoMaker',
  'photomaker',
  'image',
  'active',
  1,
  '[{"id":"runware","model_name":"photoMaker",...}]',
  ...
);
```

**See full SQL:** [drizzle/seed-photomaker.sql](drizzle/seed-photomaker.sql)

### TypeScript Seed

```bash
npm run db:seed-photomaker
```

**Seed file:** [drizzle/seed-photomaker.ts](drizzle/seed-photomaker.ts)

## API Request Structure

### User API Request (OpenAI-Compatible)

```http
POST /v1/images/generations
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "model": "runware/photomaker",
  "prompt": "wearing a professional suit",
  "input_images": [
    "uuid-of-image-1",
    "uuid-of-image-2",
    "uuid-of-image-3"
  ],
  "style": "Photographic",
  "strength": 15,
  "size": "1024x1024",
  "n": 1
}
```

### Actual Runware API Call

```json
{
  "taskType": "photoMaker",
  "taskUUID": "a770f077-f413-47de-9dac-be0b26a35da6",
  "inputImages": [
    "uuid-of-image-1",
    "uuid-of-image-2",
    "uuid-of-image-3"
  ],
  "positivePrompt": "rwre wearing a professional suit",
  "style": "Photographic",
  "strength": 15,
  "model": "civitai:139562@344487",
  "width": 1024,
  "height": 1024,
  "steps": 20,
  "CFGScale": 7,
  "numberResults": 1,
  "outputType": ["URL"],
  "outputFormat": "PNG",
  "includeCost": true
}
```

## Key Parameters

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `inputImages` | string[] | 1-4 reference images (UUIDs, URLs, or base64) |
| `positivePrompt` | string | Text description (trigger word `rwre` auto-added) |
| `model` | string | SDXL-based model AIR ID |
| `width` | integer | Width (128-2048, divisible by 64) |
| `height` | integer | Height (128-2048, divisible by 64) |

### Optional Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `style` | string | "No style" | 11 styles | Artistic style preset |
| `strength` | integer | 15 | 15-50 | Fidelity (15) vs transformation (50) |
| `steps` | integer | 20 | 1-100 | Inference steps |
| `CFGScale` | float | 7 | 0-50 | Prompt adherence |
| `seed` | integer | Random | 1-9.2e18 | Reproducibility seed |
| `negativePrompt` | string | - | - | What to avoid |
| `clipSkip` | integer | 0 | 0-2 | Text interpretation layers |
| `scheduler` | string | Model default | - | Sampling algorithm |

## Supported Styles

1. **No style** - Maximum subject fidelity
2. **Cinematic** - Movie-like aesthetic
3. **Disney Character** - Disney-inspired
4. **Digital Art** - Digital artwork
5. **Photographic** - Enhanced photo quality
6. **Fantasy art** - Fantasy-themed
7. **Neonpunk** - Cyberpunk neon
8. **Enhance** - Quality improvement
9. **Comic book** - Comic book style
10. **Lowpoly** - Low-polygon geometric
11. **Line art** - Line drawing style

## Recommended SDXL Models

Use these models from [Runware Model Explorer](https://my.runware.ai/models/all):

| Model | AIR ID | Version |
|-------|--------|---------|
| RealVisXL | `civitai:139562@344487` | V4.0 (BakedVAE) |
| SDXL | `civitai:101055@128078` | v1.0 VAE fix |
| DreamShaper XL | `civitai:112902@126688` | alpha2 (xl1.0) |
| Juggernaut XL | `civitai:133005@288982` | V 8 + RunDiffusion |
| Realism Engine SDXL | `civitai:152525@293240` | v3.0 VAE |

## Trigger Word: `rwre`

PhotoMaker requires the trigger word `rwre` in the prompt:

```bash
# User provides:
"wearing a suit, professional photo"

# System prepends:
"rwre wearing a suit, professional photo"

# Or user can place it manually:
"wearing a suit, rwre, professional photo"
```

The position affects the strength of the effect - at the start = maximum impact.

## Capabilities

```json
{
  "supportsImage": true,
  "maxInputImages": 4,
  "minInputImages": 1,
  "supportedStyles": ["No style", "Cinematic", ...],
  "triggerWord": "rwre",
  "requiresSDXL": true,
  "strengthRange": { "min": 15, "max": 50, "default": 15 },
  "maxResolution": "2048x2048",
  "minResolution": "128x128"
}
```

## Pricing

- **Type**: Calculated (varies by SDXL model used)
- **Average**: ~$0.0013 per image
- **Factors**:
  - SDXL model chosen
  - Image dimensions
  - Number of steps
  - Number of results

## Examples

### Example 1: Professional Headshot

```json
{
  "model": "runware/photomaker",
  "prompt": "rwre wearing a professional suit, corporate headshot",
  "input_images": ["uuid-1", "uuid-2", "uuid-3"],
  "style": "Photographic",
  "strength": 15,
  "size": "1024x1024"
}
```

### Example 2: Disney Character

```json
{
  "model": "runware/photomaker",
  "prompt": "rwre as a Disney character, animated style",
  "input_images": ["uuid-1", "uuid-2"],
  "style": "Disney Character",
  "strength": 25,
  "size": "1024x1024"
}
```

### Example 3: Fantasy Art

```json
{
  "model": "runware/photomaker",
  "prompt": "rwre in a fantasy landscape, epic composition",
  "input_images": ["uuid-1", "uuid-2", "uuid-3", "uuid-4"],
  "style": "Fantasy art",
  "strength": 30,
  "model_override": "civitai:139562@344487",
  "size": "1024x1024"
}
```

## Best Practices

### Reference Images

✅ **DO:**
- Use 3-4 clear, well-lit images for best results
- Include variety of angles and expressions
- Use high-quality original photos
- Ensure single, clear face per image

❌ **DON'T:**
- Use heavily filtered or edited images
- Include multiple faces in one image
- Use low resolution images
- Mix different subjects

### Prompt Writing

✅ **DO:**
- Be specific about scene and composition
- Describe desired action and setting
- Include lighting and mood details
- Use the trigger word `rwre`

❌ **DON'T:**
- Be too vague or generic
- Contradict the reference images
- Use conflicting style descriptions

### Strength Settings

- **15-20**: Maximum subject fidelity, minimal transformation
- **20-30**: Balanced between identity and style
- **30-40**: More creative freedom, less fidelity
- **40-50**: Maximum transformation, loosest fidelity

Start with **15** (default) for "No style", then experiment.

## Integration Flow

```
User Request
    ↓
Model ID: "runware/photomaker"
    ↓
Database Lookup
    ↓
Provider: "runware"
Task Type: "photoMaker"
    ↓
Process Input Images
    ↓
Prepend Trigger Word
    ↓
Select SDXL Model
    ↓
Runware API Call
    ↓
Return Generated Image
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid model" | Non-SDXL model used | Use SDXL-based model |
| "Missing inputImages" | No reference images | Provide 1-4 images |
| "Invalid dimensions" | Not divisible by 64 | Use 128, 192, 256, etc. |
| "Trigger word missing" | No `rwre` in prompt | Auto-prepended by system |

## Testing

```bash
# Add PhotoMaker to database
npm run db:seed-photomaker

# Test with sample request
curl -X POST http://localhost:8787/v1/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "runware/photomaker",
    "prompt": "wearing a professional suit",
    "input_images": ["uuid-1", "uuid-2"],
    "style": "Photographic",
    "strength": 15,
    "size": "1024x1024"
  }'
```

## Resources

- [Runware PhotoMaker Docs](https://runware.ai/docs/en/image-inference/photomaker)
- [Model Explorer](https://my.runware.ai/models/all)
- [SDXL Models Guide](https://runware.ai/docs/en/image-inference/models)

---

## Quick Reference

**To add to database:**
```bash
npm run db:seed-photomaker
```

**Model ID:**
```
runware/photomaker
```

**Task Type:**
```
photoMaker
```

**Required:**
- 1-4 reference images
- SDXL-based model
- Trigger word `rwre` (auto-added)
