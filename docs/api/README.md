# ImageRouter API Documentation

OpenAI-compatible API for image and video generation using Google Gemini, Google Imagen, Google Veo, and Runware models.

## 🚀 Quick Start

**Base URL:** `https://imagerouter.capaxe.com`

All API requests require Bearer token authentication:
```
Authorization: Bearer YOUR_API_KEY
```

### ⚡ Async-First Architecture

All generation endpoints use asynchronous processing by default:
1. Submit request → Receive task ID immediately
2. Poll `/v1/tasks/{taskId}` → Check status  
3. Task completes → Retrieve result

---

## 📁 Core API Endpoints

### 1. **Image - Generate** (`Image - Generate.bru`)
```
POST /v1/images/generations
```
Generate images using Google Gemini, Imagen, or Runware models.

**Key Features:**
- Text-to-image and image-to-image generation
- Aspect ratio support (auto-converted to pixel dimensions)
- 1-14 reference images (model-dependent)
- Supported formats: JPEG, PNG, GIF, WebP, BMP, TIFF
- ❌ AVIF not supported

---

### 2. **Video - Generate** (`Video - Generate.bru`)
```
POST /v1/videos/generations
```
Generate videos using Google Veo 2 and Veo 3 models.

**Key Features:**
- Text-to-video and image-to-video animation
- Up to 10 seconds duration
- 720p and 1080p resolution options
- ~5-10 minutes processing time

---

### 3. **Task - Get Status** (`Task - Get Status.bru`)
```
GET /v1/tasks/{taskId}
```
Poll async task status for image/video generation.

**Task Statuses:**
- `pending` - Queued for processing
- `processing` - Currently generating
- `completed` - Ready, result available
- `failed` - Error occurred

---

### 4. **Models - List** (`Models - List.bru`)
```
GET /v1/models
```
Get all available models with capabilities and pricing.

**Query Parameters:**
- `type` - Filter by "image" or "video"
- `status` - Filter by "active", "beta", "deprecated"
- `provider` - Filter by provider (e.g., "google", "runware")

---

## 🔧 Admin Endpoints

Model management and administration:

- `Admin - List Models.bru` - List all models (admin view)
- `Admin - Get Model.bru` - Get specific model details
- `Admin - Create Model.bru` - Create new model entry
- `Admin - Update Model.bru` - Update model configuration
- `Admin - Update Model Status.bru` - Change model status (active/beta/deprecated)
- `Admin - Delete Model.bru` - Delete model from database
- `Admin - Bulk Import Models.bru` - Import multiple models at once
- `Admin - Model Stats.bru` - Get model usage statistics

---

## 🛠️ Utility Endpoints

- `Health Check.bru` - API health status
- `API Info.bru` - API version and information
- `Get IP Address.bru` - Get your IP address (for testing)
- `Base64 Conversion Examples.bru` - How to convert images to base64
- `Error Examples - Validation Error.bru` - Common error response examples
- `Rate Limit Test.bru` - Test rate limiting functionality
- `Models HTML Viewer.bru` - Interactive web interface for browsing models

---

## 🏃 Runware-Specific Endpoints

- `Runware Model List.bru` - List available Runware models with pagination
- `Runware Model Search.bru` - POST search with advanced filters
- `Runware Model Search (GET).bru` - GET search using query parameters

---

## 📖 Usage Examples

### Basic Image Generation
```bash
curl -X POST https://imagerouter.capaxe.com/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.5-flash-image",
    "prompt": "A serene Japanese garden at sunset",
    "size": "16:9",
    "quality": "high"
  }'
```

**Response:**
```json
{
  "taskId": "abc123",
  "status": "pending",
  "type": "image",
  "createdAt": 1234567890
}
```

### Check Task Status
```bash
curl https://imagerouter.capaxe.com/v1/tasks/abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response (completed):**
```json
{
  "taskId": "abc123",
  "status": "completed",
  "result": {
    "data": [
      {
        "url": "https://storage.example.com/images/2025/12/02/image1.png"
      }
    ]
  }
}
```

### Image-to-Image with Reference
```bash
curl -X POST https://imagerouter.capaxe.com/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.5-flash-image",
    "prompt": "Transform into watercolor painting style",
    "image": {
      "data": "base64_encoded_image_data",
      "type": "image/png"
    },
    "size": "1:1"
  }'
```

### Video Generation
```bash
curl -X POST https://imagerouter.capaxe.com/v1/videos/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/veo-2",
    "prompt": "A time-lapse of clouds over mountains",
    "duration": 5,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  }'
```

---

## 🎯 Available Models

### Google Gemini (Image)
- `google/gemini-2.5-flash-image` - Fast model, max 3 reference images
- `google/gemini-3-pro-image-preview` - Advanced model, max 14 reference images, Google Search grounding

### Google Imagen (Image)
- `google/imagen-3`, `google/imagen-3-fast`
- `google/imagen-4`, `google/imagen-4-fast`

### Google Veo (Video)
- `google/veo-2` - Up to 8 seconds
- `google/veo-3` - Up to 10 seconds, advanced features

### Runware (Image)
- `runware/flux-pro-v1.1` - FLUX Pro model
- `runware/sourceful-flux-v1` - Sourceful FLUX
- `runware/bytedance-seedream-v5` - ByteDance Seedream
- `runware/photomaker` - Subject personalization (requires "rwre" trigger word)

---

## ⚠️ Error Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Invalid parameters, unsupported image format (AVIF) |
| 401 | Unauthorized | Missing/invalid API key |
| 402 | Payment Required | Insufficient credits |
| 404 | Not Found | Invalid model ID or task ID |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server error, provider API failure |

---

## 📊 Rate Limits

Rate limits vary by plan. Check response headers:
- `X-RateLimit-Limit` - Total requests allowed
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - When limit resets (Unix timestamp)

---

## 🔄 API Workflow

### Recommended Flow
```
1. GET /v1/models?type=image
   → Discover available models and their capabilities

2. POST /v1/images/generations
   → Returns: {"taskId": "abc123", "status": "pending"}

3. Poll GET /v1/tasks/abc123 every 2-3 seconds
   → Status: "processing", "progress": 50

4. Poll again until completed
   → Status: "completed", "result": {"data": [{"url": "..."}]}
```

---

## 📚 Documentation Structure

This Bruno collection includes:
- **4 Core Endpoints** - Image, Video, Task, Models
- **8 Admin Endpoints** - Model management
- **7 Utility Endpoints** - Testing, examples, helpers
- **3 Runware Endpoints** - Runware-specific features

**Total: 22 endpoints** organized for easy testing and integration.

---

## 🆕 Changelog

### 2025-12-02
- ✅ Consolidated API documentation (removed duplicates)
- ✅ Added aspect ratio support (auto-conversion to pixel dimensions)
- ✅ Added MIME type validation (AVIF format rejected with clear error)
- ✅ Added dynamic model loading from database
- ✅ Comprehensive inline documentation for all endpoints
- ✅ Added reference image validation (per-model limits)

### 2025-11-01
- Added PhotoMaker model (runware/photomaker)
- Added Gemini 2.5 Flash Image and Gemini 3 Pro Image Preview
- Added ByteDance Seedream V5 and V3 models

---

## 🧪 Testing with Bruno

### Prerequisites
- [Bruno](https://www.usebruno.com/) - Download from official website
- API access (local or production)

### Setup
1. Open Bruno
2. Import this collection: File → Open Collection → Select `docs/api` folder
3. Select environment:
   - **Local**: http://localhost:8787
   - **Production**: https://imagerouter.capaxe.com
4. Set API key in request headers or environment variables

---

## 🆘 Support

- **Documentation**: https://imagerouter.capaxe.com/docs
- **API Status**: https://status.capaxe.com
- **Support**: support@capaxe.com
- **GitHub Issues**: https://github.com/capaxe/imagerouter/issues

---

## 📝 License

© 2025 Capaxe. All rights reserved.
