# ImageRouter API

Unified API for AI image, video, and text generation, powered by Cloudflare AI.

**Base URL:** `https://router.capaxe.com`

## Authentication

All `/v1/*` endpoints except `GET /v1/models` need an API key in the `Authorization` header:

```
Authorization: Bearer YOUR_API_KEY
```

## How it works

- **Text (chat)** is synchronous — you get the answer in the same response. Streaming is supported.
- **Image and video** are asynchronous — you get a `taskId` immediately, then poll `GET /v1/tasks/:taskId` until the task completes. Results are hosted URLs, never base64.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/models` | List all models (image, video, text) |
| GET | `/v1/chat/models` | List text models (OpenAI format) |
| POST | `/v1/chat/completions` | Chat completion (OpenAI-compatible) |
| POST | `/v1/images/generations` | Create image generation task |
| POST | `/v1/images/edits` | Create image edit task (with input images) |
| POST | `/v1/videos/generations` | Create video generation task |
| GET | `/v1/tasks/:taskId` | Task status and result |
| GET | `/v1/tasks/user/list` | List your tasks |
| GET | `/v1/images/user/list` | List your generated images |
| GET | `/v1/videos/user/list` | List your generated videos |
| GET | `/v1/media` | Unified gallery (images + videos) |
| GET | `/healthz` | Health check |

## Text (chat completions)

OpenAI-compatible, so it works with the OpenAI SDK and Vercel AI SDK by changing the base URL.

### Request

```bash
curl https://router.capaxe.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/zai-org/glm-5.2",
    "messages": [
      { "role": "user", "content": "Say hello in 5 words" }
    ]
  }'
```

Optional fields: `max_tokens`, `temperature`, `top_p`, `stream: true` (SSE streaming).

### Response

```json
{
  "id": "chatcmpl-1754039000000",
  "object": "chat.completion",
  "created": 1754039000,
  "model": "@cf/zai-org/glm-5.2",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello there, nice meeting you!" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 8,
    "total_tokens": 20,
    "neurons": 63,
    "cost": 0.000693,
    "cost_source": "neurons"
  }
}
```

`usage.cost` is the dollar cost of the call. `cost_source` is `neurons` (exact, Workers AI models) or `estimated_tokens` (estimated from the model's per-1M-token price).

When streaming, the final chunk before `[DONE]` carries the same `usage` object.

## Image generation

### Request

```bash
curl https://router.capaxe.com/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/black-forest-labs/flux-1-schnell",
    "prompt": "A lighthouse at sunset, oil painting style",
    "size": "1024x1024",
    "n": 1
  }'
```

Fields: `model`, `prompt` (required); `n` (1-16), `size` (`1024x1024`, aspect ratio like `16:9`, or `auto`), `quality` (`auto` | `low` | `medium` | `high`), `image` (input image URL or base64 object, for image-to-image).

### Immediate response

```json
{
  "taskId": "img_a1b2c3d4e5f6",
  "status": "pending",
  "type": "image",
  "createdAt": 1754039000000,
  "message": "Image generation task created. Use GET /v1/tasks/:taskId to check status."
}
```

### Poll the task

```bash
curl https://router.capaxe.com/v1/tasks/img_a1b2c3d4e5f6 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Completed response:

```json
{
  "taskId": "img_a1b2c3d4e5f6",
  "type": "image",
  "status": "completed",
  "progress": 100,
  "model": "@cf/black-forest-labs/flux-1-schnell",
  "prompt": "A lighthouse at sunset, oil painting style",
  "imageSize": "1024x1024",
  "createdAt": 1754039000000,
  "startedAt": 1754039001000,
  "completedAt": 1754039006000,
  "result": {
    "created": 1754039000,
    "data": [
      { "url": "https://storage.shootflo.com/images/2026/08/01/cm9x2k4f80001.png" }
    ],
    "cost": 0.0001
  }
}
```

`status` moves through `pending` → `processing` → `completed` or `failed`. While `processing`, the response includes `progress` (0-100) and `estimatedTimeRemaining`. On failure, it includes `error`.

## Video generation

### Request

```bash
curl https://router.capaxe.com/v1/videos/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/veo-3.1",
    "prompt": "A drone shot flying over a tropical beach",
    "duration": 8,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

Fields: `model`, `prompt` (required); `duration` (seconds, 1-10), `aspect_ratio` (`16:9` | `9:16` | `1:1`), `resolution` (`720p` | `1080p`), `negative_prompt`, `seed`, `image` (input image for image-to-video).

### Immediate response

```json
{
  "taskId": "vid_f6e5d4c3b2a1",
  "status": "pending",
  "type": "video",
  "createdAt": 1754039000000,
  "message": "Video generation task created. Use GET /v1/tasks/:taskId to check status.",
  "estimatedCompletionTime": 1754039060000
}
```

### Poll the task

Same as images — `GET /v1/tasks/vid_f6e5d4c3b2a1`. Completed response:

```json
{
  "taskId": "vid_f6e5d4c3b2a1",
  "type": "video",
  "status": "completed",
  "progress": 100,
  "model": "google/veo-3.1",
  "prompt": "A drone shot flying over a tropical beach",
  "createdAt": 1754039000000,
  "completedAt": 1754039055000,
  "result": {
    "created": 1754039000,
    "data": [
      { "url": "https://storage.shootflo.com/videos/2026/08/01/cm9x3p7q10002.mp4" }
    ],
    "cost": 3.2
  }
}
```

## Listing models

```bash
curl https://router.capaxe.com/v1/models
```

Returns every model with its type (`image` | `video` | `text`) and pricing. Use the model `id` exactly as returned (e.g. `@cf/black-forest-labs/flux-1-schnell`, `google/veo-3.1`, `@cf/zai-org/glm-5.2`).

## Errors

All errors use one shape:

```json
{
  "error": {
    "message": "Model 'bad/model' not found. Use GET /v1/models to see available models.",
    "type": "invalid_model",
    "param": "model"
  }
}
```

Common types: `invalid_request_error` (400), `unauthorized` (401), `not_found` (404), `queue_unavailable` (503), `internal_error` (500).

## Costs

Every call is logged with its dollar cost. Chat responses include cost inline in `usage`; image and video tasks include `result.cost` when completed. Costs are exact for Workers AI models (`@cf/...`, billed in neurons) and estimated for catalog models.
