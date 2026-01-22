# ImageRouter API Reference

Base URL: `https://api.imagerouter.capaxe.com`

## Authentication

All authenticated endpoints require an API key passed via:
- Header: `Authorization: Bearer <api-key>`
- Or Header: `X-API-Key: <api-key>`

Admin endpoints require the `ADMIN_API_KEY`.

---

## Chat Completions (Text Generation)

OpenAI-compatible chat completions endpoint that routes to multiple providers (OpenAI, Anthropic, Google).

### Create Chat Completion

```bash
curl -X POST https://api.imagerouter.capaxe.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

**Response:**
```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1704067200,
  "model": "gemini-2.0-flash",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! I'm doing well, thank you for asking."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 15,
    "total_tokens": 40
  }
}
```

### Streaming Chat Completion

```bash
curl -X POST https://api.imagerouter.capaxe.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [{"role": "user", "content": "Count from 1 to 5"}],
    "stream": true
  }'
```

**Response (SSE):**
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1704067200,"model":"gemini-2.0-flash","choices":[{"index":0,"delta":{"content":"1"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1704067200,"model":"gemini-2.0-flash","choices":[{"index":0,"delta":{"content":", 2"},"finish_reason":null}]}

data: [DONE]
```

### List Chat Models

```bash
curl -X GET https://api.imagerouter.capaxe.com/v1/chat/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {"id": "gpt-4o", "object": "model", "owned_by": "openai", "description": "GPT-4o - Latest multimodal model"},
    {"id": "claude-3-5-sonnet-20241022", "object": "model", "owned_by": "anthropic", "description": "Claude 3.5 Sonnet"},
    {"id": "gemini-2.0-flash", "object": "model", "owned_by": "google", "description": "Gemini 2.0 Flash"}
  ]
}
```

### Available Chat Models

| Model | Provider | Description |
|-------|----------|-------------|
| `gpt-4o` | OpenAI | GPT-4o - Latest multimodal model |
| `gpt-4o-mini` | OpenAI | GPT-4o Mini - Fast and affordable |
| `gpt-4-turbo` | OpenAI | GPT-4 Turbo with vision |
| `o1` | OpenAI | O1 - Reasoning model |
| `o1-mini` | OpenAI | O1 Mini - Fast reasoning |
| `o3-mini` | OpenAI | O3 Mini - Latest reasoning |
| `claude-3-5-sonnet-20241022` | Anthropic | Claude 3.5 Sonnet - Best balance |
| `claude-3-5-haiku-20241022` | Anthropic | Claude 3.5 Haiku - Fast |
| `claude-3-opus-20240229` | Anthropic | Claude 3 Opus - Most capable |
| `gemini-2.0-flash-exp` | Google | Gemini 2.0 Flash Experimental |
| `gemini-2.0-flash` | Google | Gemini 2.0 Flash |
| `gemini-1.5-pro` | Google | Gemini 1.5 Pro |
| `gemini-1.5-flash` | Google | Gemini 1.5 Flash |

---

## Image Generation

### Generate Images

```bash
curl -X POST https://api.imagerouter.capaxe.com/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/imagen-4",
    "prompt": "A beautiful sunset over mountains with vibrant colors",
    "size": "1024x1024",
    "quality": "auto",
    "n": 1
  }'
```

**Response (Async):**
```json
{
  "taskId": "img_abc123...",
  "status": "pending",
  "type": "image",
  "createdAt": 1704067200,
  "message": "Image generation task created. Use GET /v1/tasks/:taskId to check status."
}
```

### Generate with Reference Image

```bash
curl -X POST https://api.imagerouter.capaxe.com/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.0-flash-exp",
    "prompt": "Transform this into a watercolor painting",
    "image": {
      "data": "BASE64_ENCODED_IMAGE",
      "type": "image/png"
    },
    "size": "1024x1024"
  }'
```

### Generate with Multiple Reference Images

```bash
curl -X POST https://api.imagerouter.capaxe.com/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.0-flash-exp",
    "prompt": "Combine these styles into one image",
    "image": [
      {"data": "BASE64_IMAGE_1", "type": "image/png"},
      {"data": "BASE64_IMAGE_2", "type": "image/jpeg"}
    ],
    "size": "1024x1024"
  }'
```

### Edit Image (Inpainting)

```bash
curl -X POST https://api.imagerouter.capaxe.com/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.0-flash-exp",
    "prompt": "Replace the sky with a starry night",
    "image": {
      "data": "BASE64_ORIGINAL_IMAGE",
      "type": "image/png"
    },
    "mask": {
      "data": "BASE64_MASK_IMAGE",
      "type": "image/png"
    }
  }'
```

### List User's Images

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/images/user/list?limit=20&offset=0&status=completed" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "data": [
    {
      "id": "usage_123",
      "taskId": "img_abc123",
      "model": "google/imagen-4",
      "provider": "gemini",
      "prompt": "A beautiful sunset...",
      "imageSize": "1024x1024",
      "quality": "auto",
      "images": ["https://storage.example.com/images/2025/01/13/abc123.png"],
      "cost": 0.01,
      "status": "success",
      "taskStatus": "completed",
      "taskProgress": 100,
      "createdAt": 1704067200,
      "completedAt": 1704067210
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "count": 1,
    "hasMore": false
  }
}
```

---

## Video Generation

### Generate Video

```bash
curl -X POST https://api.imagerouter.capaxe.com/v1/videos/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/veo-2",
    "prompt": "A drone shot flying over ocean waves crashing on rocks",
    "duration": 5,
    "resolution": "720p"
  }'
```

**Response:**
```json
{
  "taskId": "vid_xyz789...",
  "status": "pending",
  "type": "video",
  "createdAt": 1704067200,
  "message": "Video generation task created. Use GET /v1/tasks/:taskId to check status.",
  "estimatedCompletionTime": 1704067500
}
```

### List User's Videos

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/videos/user/list?limit=20&offset=0" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "usage_456",
      "taskId": "vid_xyz789",
      "model": "google/veo-2",
      "provider": "gemini",
      "prompt": "A drone shot...",
      "videos": ["https://storage.example.com/videos/2025/01/13/xyz789.mp4"],
      "cost": 0.05,
      "status": "success",
      "taskStatus": "completed",
      "taskProgress": 100,
      "createdAt": 1704067200,
      "completedAt": 1704067500,
      "durationMs": 300000
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "count": 1,
    "hasMore": false
  }
}
```

---

## Task Management

### Get Task Status

```bash
curl -X GET https://api.imagerouter.capaxe.com/v1/tasks/img_abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response (Pending):**
```json
{
  "taskId": "img_abc123",
  "status": "processing",
  "progress": 50,
  "result": null,
  "error": null
}
```

**Response (Completed):**
```json
{
  "taskId": "img_abc123",
  "status": "completed",
  "progress": 100,
  "result": {
    "data": [
      {"url": "https://storage.example.com/images/2025/01/13/abc123.png"}
    ],
    "cost": 0.01
  },
  "error": null
}
```

### List User's Tasks

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/tasks/user/list?limit=10&status=completed" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Get Task Statistics

```bash
curl -X GET https://api.imagerouter.capaxe.com/v1/tasks/stats \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "pending": 2,
  "processing": 1,
  "completed": 50,
  "failed": 3,
  "total": 56
}
```

### Cancel Task

```bash
curl -X DELETE https://api.imagerouter.capaxe.com/v1/tasks/img_abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "message": "Task cancelled successfully",
  "taskId": "img_abc123"
}
```

---

## Models

### List All Models

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/models"
```

### Filter by Type

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/models?type=image"
```

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/models?type=video"
```

### Filter by Provider

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/models?provider=google"
```

**Response:**
```json
{
  "google/imagen-4": {
    "id": "google/imagen-4",
    "name": "Google Imagen 4",
    "type": "image",
    "providers": [
      {
        "id": "gemini",
        "model_name": "imagen-4-1-0",
        "pricing": {"type": "FIXED", "value": 0.01}
      }
    ],
    "arena_score": 1350,
    "release_date": "2024-01-01",
    "capabilities": {},
    "tags": [],
    "category": "Google"
  }
}
```

---

## Media Gallery

### Get All Media (Images & Videos)

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/media?limit=20&type=all" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Filter by Type

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/media?type=image" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/media?type=video" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Runware Models

### Search Runware Models

```bash
curl -X POST https://api.imagerouter.capaxe.com/v1/runware/models/search \
  -H "Content-Type: application/json" \
  -d '{
    "search": "realistic",
    "category": "checkpoint",
    "architecture": "sdxl",
    "limit": 20
  }'
```

### Search with Tags

```bash
curl -X POST https://api.imagerouter.capaxe.com/v1/runware/models/search \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["anime", "illustration"],
    "type": "base",
    "limit": 10
  }'
```

### List All Runware Models

```bash
curl -X GET "https://api.imagerouter.capaxe.com/v1/runware/models?limit=50"
```

---

## Admin Endpoints

> **Note:** Admin endpoints require `ADMIN_API_KEY` authentication.

### List All Models (Admin)

```bash
curl -X GET "https://api.imagerouter.capaxe.com/admin/models" \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

### Get Model Statistics

```bash
curl -X GET https://api.imagerouter.capaxe.com/admin/models/stats \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalModels": 22,
    "activeModels": 20,
    "imageModels": 17,
    "videoModels": 3
  }
}
```

### Get Single Model

```bash
curl -X GET "https://api.imagerouter.capaxe.com/admin/models/google%2Fimagen-4" \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

### Create Model

```bash
curl -X POST https://api.imagerouter.capaxe.com/admin/models \
  -H "Authorization: Bearer ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "custom/my-model",
    "name": "My Custom Model",
    "slug": "my-model",
    "type": "image",
    "releaseDate": "2025-01-13",
    "status": "active",
    "providers": [
      {
        "id": "gemini",
        "model_name": "custom-model-v1",
        "pricing": {"type": "FIXED", "value": 0.02}
      }
    ],
    "description": "A custom image generation model",
    "category": "Custom"
  }'
```

### Update Model

```bash
curl -X PATCH "https://api.imagerouter.capaxe.com/admin/models/custom%2Fmy-model" \
  -H "Authorization: Bearer ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Updated Model",
    "status": "beta",
    "description": "Updated description"
  }'
```

### Update Model Status

```bash
curl -X PUT "https://api.imagerouter.capaxe.com/admin/models/google%2Fimagen-4/status" \
  -H "Authorization: Bearer ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Model status updated to: inactive",
  "previousStatus": "active",
  "newStatus": "inactive"
}
```

### Delete Model (Soft Delete)

```bash
curl -X DELETE "https://api.imagerouter.capaxe.com/admin/models/custom%2Fmy-model" \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "message": "Model deactivated (soft delete)",
  "modelId": "custom/my-model",
  "note": "Use ?hard=true to permanently delete"
}
```

### Delete Model (Hard Delete)

```bash
curl -X DELETE "https://api.imagerouter.capaxe.com/admin/models/custom%2Fmy-model?hard=true" \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

### Bulk Import Models

```bash
curl -X POST https://api.imagerouter.capaxe.com/admin/models/bulk \
  -H "Authorization: Bearer ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "models": [
      {
        "id": "custom/model-1",
        "name": "Model 1",
        "slug": "model-1",
        "type": "image",
        "releaseDate": "2025-01-13",
        "providers": [{"id": "gemini", "model_name": "model-1", "pricing": {"type": "FIXED", "value": 0.01}}]
      },
      {
        "id": "custom/model-2",
        "name": "Model 2",
        "slug": "model-2",
        "type": "image",
        "releaseDate": "2025-01-13",
        "providers": [{"id": "runware", "model_name": "model-2", "pricing": {"type": "FIXED", "value": 0.02}}]
      }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk import completed",
  "imported": 2,
  "failed": 0,
  "results": {
    "success": ["custom/model-1", "custom/model-2"],
    "failed": []
  }
}
```

---

## Utility Endpoints

### Health Check

```bash
curl -X GET https://api.imagerouter.capaxe.com/healthz
```

**Response:**
```json
{"status": "ok"}
```

### API Info

```bash
curl -X GET https://api.imagerouter.capaxe.com/
```

**Response:**
```json
{
  "name": "ImageRouter API",
  "version": "1.0.0",
  "description": "A unified API for image and video generation models",
  "framework": "Hono + Cloudflare Workers",
  "docs": "https://docs.imagerouter.capaxe.com"
}
```

### Get Client IP

```bash
curl -X GET https://api.imagerouter.capaxe.com/ip
```

**Response:**
```json
{"ip": "192.168.1.1"}
```

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": {
    "message": "Error description",
    "type": "error_type",
    "code": "ERROR_CODE"
  }
}
```

### Common Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing API key |
| 402 | Payment Required - Insufficient credits |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |
| 501 | Not Implemented |
| 503 | Service Unavailable - Provider not configured |

---

## Rate Limits

- **General API:** 100 requests per minute per IP
- **Image Generation:** 10 requests per minute per API key
- **Video Generation:** 5 requests per minute per API key
- **Admin Endpoints:** 60 requests per minute per IP

---

## Available Models

### Image Models (Google)
- `google/gemini-2.0-flash-exp`
- `google/gemini-2.0-flash-prev`
- `google/gemini-2.5-flash`
- `google/gemini-2.5-flash-free`
- `google/imagen-3`
- `google/imagen-3-fast`
- `google/imagen-4`
- `google/imagen-4-fast`
- `google/imagen-4-ultra`

### Image Models (Runware)
- `runware/flux-schnell`
- `runware/flux-dev`
- `runware/sdxl`
- `runware/sd-turbo`
- `runware/photomaker`

### Video Models (Google)
- `google/veo-2`
- `google/veo-3`
- `google/veo-3-fast`

Use `GET /v1/models` to get the complete list with pricing and capabilities.

---

## Vercel AI SDK Integration

ImageRouter provides a TypeScript SDK compatible with Vercel AI SDK for easy integration.

### Installation

```bash
npm install @imagerouter/sdk ai
```

### Usage with Vercel AI SDK

```typescript
import { createImageRouter } from '@imagerouter/sdk';
import { generateText, streamText, generateImage } from 'ai';

const imagerouter = createImageRouter({
  apiKey: process.env.IMAGEROUTER_API_KEY!,
  baseURL: 'https://api.imagerouter.capaxe.com' // optional, this is the default
});

// Text generation (non-streaming)
const { text } = await generateText({
  model: imagerouter.chat('gemini-2.0-flash'),
  prompt: 'Write a haiku about coding',
});

// Text generation (streaming)
const result = await streamText({
  model: imagerouter.chat('gpt-4o'),
  prompt: 'Explain quantum computing',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

// Image generation
const { images } = await generateImage({
  model: imagerouter.image('google/imagen-4'),
  prompt: 'A futuristic city at sunset',
  size: '1024x1024',
});

console.log(images[0]); // Uint8Array of image data
```

### Available SDK Methods

```typescript
// Create provider instance
const imagerouter = createImageRouter({
  apiKey: string,        // Required: Your ImageRouter API key
  baseURL?: string,      // Optional: API base URL
  headers?: Record<string, string>, // Optional: Custom headers
  pollInterval?: number, // Optional: Image task polling interval (ms)
  maxPollAttempts?: number, // Optional: Max polling attempts
});

// Chat model (LanguageModelV1)
imagerouter.chat(modelId: string)
// Supported: gpt-4o, claude-3-5-sonnet, gemini-2.0-flash, etc.

// Image model (ImageModelV1)
imagerouter.image(modelId: string)
// Supported: google/imagen-4, runware/flux-schnell, etc.
```

### Provider Options

```typescript
// Image generation with provider-specific options
const { images } = await generateImage({
  model: imagerouter.image('google/imagen-4'),
  prompt: 'A beautiful landscape',
  size: '1024x1024',
  providerOptions: {
    imagerouter: {
      quality: 'hd',
      style: 'vivid',
    }
  }
});
```
