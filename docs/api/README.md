# ImageRouter API - Bruno Documentation

This directory contains comprehensive API documentation for the ImageRouter API using Bruno (an open-source API client).

## 🚀 Getting Started

### ⚡ IMPORTANT: Async is Now Default!

**Major Change**: All image and video generation endpoints now default to **asynchronous processing**. Requests return a task ID for status tracking instead of waiting for completion.

- **Default Behavior**: Returns task ID immediately → Use `/v1/tasks/{taskId}` to check status
- **Synchronous Mode**: Add `?sync=true` query parameter for immediate results (legacy behavior)

### Prerequisites
- [Bruno](https://www.usebruno.com/) - Download from the official website
- ImageRouter API running locally or access to production endpoint

### Setup
1. Open Bruno
2. Import this collection by opening the `docs/api` directory
3. Select the appropriate environment:
   - **Local**: For development testing (http://localhost:8787)
   - **Production**: For production testing (https://imagerouter.capaxe.com)

## 📁 API Endpoints

### Core Endpoints
- **Health Check** - Check API health status
- **API Info** - Get general API information
- **Get IP Address** - Debug endpoint for IP detection
- **List Available Models** - Get all available Google AI models
- **Models HTML Viewer** - Interactive web interface for browsing models

### Image Generation
- **Generate Image - Gemini** - Create images using Gemini models (⚡ ASYNC DEFAULT)
- **Generate Image - Imagen** - Create images using Imagen models (⚡ ASYNC DEFAULT)
- **Generate Image - Sync Mode** - ⭐ NEW: Synchronous processing with ?sync=true
- **Generate Image - Base64 Response** - Get images as base64 strings
- **Generate Image - Base64 Input** - ⭐ NEW: Generate/edit images using base64 input
- **Generate Multiple Images** - Create multiple images in one request
- **Generate Multiple Images - Base64** - ⭐ NEW: Batch processing with base64 inputs
- **Edit Image - Multipart** - Edit existing images with file upload (⚡ ASYNC DEFAULT)
- **Edit Image - Base64 Input** - ⭐ NEW: Edit images using base64 data (⚡ ASYNC DEFAULT)

### Video Generation
- **Generate Video - Veo** - Create videos using Veo models (⚡ ASYNC DEFAULT)
- **Generate Video - Image to Video** - Animate static images into videos (⚡ ASYNC DEFAULT)
- **Generate Video - Base64 Input** - ⭐ NEW: Generate videos using base64 input images (⚡ ASYNC DEFAULT)
- **Video Generation - Multiple Images** - ⭐ NEW: Advanced multi-image video generation (⚡ ASYNC DEFAULT)
- **Video Proxy** - Internal proxy for serving Google-hosted videos

### Error Examples
- **Invalid Model** - Example of model not found error
- **Validation Error** - Example of parameter validation errors
- **Rate Limit Test** - Test rate limiting functionality

## 🔧 Configuration

### Environment Variables
Update the environment files with your API keys and endpoints:

**Local Environment** (`environments/local.bru`):
```
vars {
  APP_URL: http://localhost:8787
}
```

**Production Environment** (`environments/production.bru`):
```
vars {
  APP_URL: https://imagerouter.capaxe.com
}
```

### Authentication
Currently, the API doesn't require authentication for testing, but in production you may need:
- Google Gemini API keys
- Google Cloud project configuration
- Vertex AI authentication

## 📊 Available Models

### Google Image Models
- `google/gemini-2.0-flash-exp` - Experimental Gemini model
- `google/gemini-2.0-flash-prev` - Previous Gemini version
- `google/gemini-2.5-flash` - Latest Gemini flash model
- `google/gemini-2.5-flash:free` - Free tier Gemini model
- `google/imagen-3` - High quality Imagen model
- `google/imagen-3-fast` - Fast Imagen generation
- `google/imagen-4` - Latest Imagen model
- `google/imagen-4-fast` - Fast latest generation
- `google/imagen-4-ultra` - Highest quality variant

### Google Video Models
- `google/veo-2` - Standard Veo video model
- `google/veo-3` - Latest Veo model
- `google/veo-3-fast` - Optimized for speed

## ⚡ Async-First API Workflow

### Default Async Workflow (Recommended)
1. **Submit Request**: `POST /v1/openai/images/generations` (no query params needed)
2. **Receive Task ID**: Get immediate response with `taskId`, `status: "pending"`
3. **Check Status**: `GET /v1/tasks/{taskId}` (requires Authorization header)
4. **Get Results**: When `status: "completed"`, retrieve generated content

### Legacy Sync Workflow
1. **Submit Request**: `POST /v1/openai/images/generations?sync=true`
2. **Wait for Response**: Request blocks until generation completes
3. **Get Results**: Image data returned directly in response

## 🛠️ Request Parameters

### Image Generation (Text-to-Image)
```json
{
  "model": "google/imagen-3-fast",
  "prompt": "Your image description here",
  "n": 1,                          // Number of images (1-16)
  "size": "1024x1024",            // Image size or "auto"
  "quality": "high",              // "auto", "low", "medium", "high"
  "response_format": "url",       // "url" or "b64_json"
  "user": "optional-user-id"      // Optional user identifier
}
```

### Image Generation with Base64 Input (NEW!)
```json
{
  "model": "google/gemini-2.5-flash",
  "prompt": "Transform this image into a painting",
  "image": {
    "data": "iVBORw0KGgoAAAANS...",     // Base64 image data (no data:image/ prefix)
    "type": "image/png",              // MIME type
    "filename": "input.png"           // Optional filename
  },
  "n": 1,
  "size": "1024x1024", 
  "quality": "high",
  "response_format": "url"
}
```

### Multiple Base64 Images
```json
{
  "model": "google/gemini-2.5-flash", 
  "prompt": "Create variations using these reference images",
  "image": [
    {
      "data": "iVBORw0KGgoAAAANS...",
      "type": "image/png",
      "filename": "ref1.png"
    },
    {
      "data": "/9j/4AAQSkZJRgABAQ...", 
      "type": "image/jpeg",
      "filename": "ref2.jpg"
    }
  ],
  "n": 4,
  "response_format": "url"
}
```

### Video Generation (Text-to-Video)
```json
{
  "model": "google/veo-3-fast",
  "prompt": "Your video description here",
  "duration": 5,                  // Video length in seconds (1-10)
  "fps": 24,                      // Frames per second (12-60)
  "size": "1280x720",            // Video dimensions or "auto"
  "quality": "high",              // Video quality
  "response_format": "url"        // Response format
}
```

### Video Generation with Base64 Input (NEW!)
```json
{
  "model": "google/veo-3-fast",
  "prompt": "Animate this image with flowing motion",
  "image": {
    "data": "iVBORw0KGgoAAAANS...",     // Base64 image data (no data:image/ prefix)
    "type": "image/png",              // MIME type
    "filename": "input.png"           // Optional filename
  },
  "duration": 6,
  "fps": 30,
  "size": "1920x1080",
  "response_format": "url"
}
```

### Multiple Images for Video (Advanced)
```json
{
  "model": "google/veo-3-fast",
  "prompt": "Create transitions between these scenes",
  "image": [
    {
      "data": "iVBORw0KGgoAAAANS...",
      "type": "image/png",
      "filename": "scene1.png"
    },
    {
      "data": "/9j/4AAQSkZJRgABAQ...",
      "type": "image/jpeg", 
      "filename": "scene2.jpg"
    }
  ],
  "duration": 10,
  "fps": 24,
  "response_format": "url"
}
```

## 📝 Response Formats

### Async Response (Default Behavior)
```json
{
  "taskId": "img_1758773371_m1njlh_9w3bvq",
  "status": "pending",
  "type": "image", 
  "createdAt": 1640995200123,
  "message": "Image generation task created. Use GET /v1/tasks/:taskId to check status."
}
```

### Task Status Check (`GET /v1/tasks/{taskId}`)
```json
{
  "taskId": "img_1758773371_m1njlh_9w3bvq",
  "status": "completed",
  "progress": 100,
  "result": {
    "created": 1640995200,
    "data": [
      {
        "url": "https://storage-url/image.png",
        "revised_prompt": "Enhanced prompt used"
      }
    ],
    "cost": 0.0272
  }
}
```

### Sync Response (with ?sync=true)
```json
{
  "created": 1640995200,
  "data": [
    {
      "url": "https://storage-url/image.png",
      "revised_prompt": "Enhanced prompt used"
    }
  ],
  "cost": 0.0272
}
```

### Successful Video Generation
```json
{
  "created": 1640995200,
  "data": [
    {
      "url": "https://storage-url/video.mp4",
      "revised_prompt": null
    }
  ]
}
```

### Error Response
```json
{
  "error": {
    "message": "Detailed error message",
    "type": "error_type",
    "code": "ERROR_CODE"
  }
}
```

## 🚦 Rate Limits

- **General API**: 20 requests per second per IP
- **Image/Video Generation**: 6000 requests per minute per IP
- **Rate limit headers** included in responses

## 🔄 Image Input Methods

### Method 1: Base64 JSON (Recommended ⭐)
Most efficient method with direct base64 data in JSON requests:

```json
{
  "model": "google/gemini-2.5-flash",
  "prompt": "Edit instruction",
  "image": {
    "data": "base64-encoded-image-data",
    "type": "image/png",
    "filename": "optional-name.png"
  }
}
```

**Benefits:**
- ✅ Faster processing (no file conversion overhead)
- ✅ Direct LLM compatibility  
- ✅ Better for programmatic usage
- ✅ Supports multiple images in single request
- ✅ Works with async processing

### Method 2: Multipart Form Upload (Legacy)
Traditional file upload method for compatibility:

```
Content-Type: multipart/form-data

Fields:
- model: Model identifier
- prompt: Text description  
- image: Image file (JPEG, PNG, WebP, GIF up to 20MB)
- mask: Optional mask file for selective editing (up to 10MB)
- [other parameters as form fields]
```

**Note:** Files are automatically converted to base64 internally.

## 💡 Base64 Best Practices

### Preparing Base64 Data
```javascript
// Browser/Node.js example
const fileInput = document.getElementById('file');
const file = fileInput.files[0];
const reader = new FileReader();

reader.onload = function(e) {
  const base64Data = e.target.result.split(',')[1]; // Remove data:image/... prefix
  
  const requestBody = {
    model: "google/gemini-2.5-flash",
    prompt: "Transform this image",
    image: {
      data: base64Data,
      type: file.type,
      filename: file.name
    }
  };
};
reader.readAsDataURL(file);
```

### Python Example
```python
import base64

with open('image.jpg', 'rb') as f:
    base64_data = base64.b64encode(f.read()).decode('utf-8')

request_data = {
    "model": "google/gemini-2.5-flash",
    "prompt": "Edit this image",
    "image": {
        "data": base64_data,
        "type": "image/jpeg",
        "filename": "image.jpg"
    }
}
```

### Performance Tips
- ✅ Use base64 method for programmatic/API usage
- ✅ Remove data:image/... prefix from base64 strings
- ✅ Include proper MIME type for better processing
- ✅ Use async=true query parameter for long operations
- ❌ Don't use multipart upload for high-volume applications

## 🧪 Testing

Each Bruno request includes:
- **Documentation** - Detailed parameter explanations
- **Test Scripts** - Automated response validation
- **Examples** - Real-world usage scenarios

Run tests by executing requests in Bruno. Test scripts will automatically validate:
- Response status codes
- Response structure
- Required fields presence
- Data types and formats

## 🐛 Common Issues

### 1. API Key Errors
```json
{
  "error": {
    "message": "API key not valid. Please pass a valid API key.",
    "type": "INVALID_ARGUMENT"
  }
}
```
**Solution**: Configure valid Google API keys in your environment

### 2. Rate Limiting
```json
{
  "error": {
    "message": "Too many requests, please try again later.",
    "type": "rate_limit_error"
  }
}
```
**Solution**: Wait and retry, or implement exponential backoff

### 3. Validation Errors
```json
{
  "error": {
    "message": "Validation error: Prompt is required at prompt",
    "type": "validation_error"
  }
}
```
**Solution**: Check request parameters match the schema

### 4. Model Not Found
```json
{
  "error": {
    "message": "Model 'invalid/model' not found",
    "type": "image_generation_error"
  }
}
```
**Solution**: Use valid model IDs from the models list endpoint

## 🔄 Migration Guide: Multipart → Base64

### Before (Multipart Upload)
```bash
curl -X POST https://imagerouter.capaxe.com/v1/openai/images/edits \
  -F "model=google/gemini-2.5-flash" \
  -F "prompt=Add a red hat" \
  -F "image=@photo.jpg"
```

### After (Base64 JSON - Recommended)
```bash
# Convert image to base64 first
BASE64_DATA=$(base64 -i photo.jpg)

curl -X POST https://imagerouter.capaxe.com/v1/openai/images/edits \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.5-flash",
    "prompt": "Add a red hat",
    "image": {
      "data": "'$BASE64_DATA'",
      "type": "image/jpeg",
      "filename": "photo.jpg"
    }
  }'
```

### Video Generation Migration

**Before (Multipart Upload):**
```bash
curl -X POST https://imagerouter.capaxe.com/v1/openai/videos/generations \
  -F "model=google/veo-3-fast" \
  -F "prompt=Animate this image" \
  -F "image=@reference.jpg" \
  -F "duration=5"
```

**After (Base64 JSON - Recommended):**
```bash
BASE64_DATA=$(base64 -i reference.jpg)

curl -X POST https://imagerouter.capaxe.com/v1/openai/videos/generations?async=true \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/veo-3-fast",
    "prompt": "Animate this image with smooth motion",
    "image": {
      "data": "'$BASE64_DATA'",
      "type": "image/jpeg",
      "filename": "reference.jpg"
    },
    "duration": 5,
    "fps": 24
  }'
```

### Migration Benefits
- **⚡ Async-First Processing**: No more timeouts or blocking requests
- **📊 Task Status Tracking**: Monitor generation progress in real-time  
- **🔄 Better User Experience**: Immediate response with background processing
- **📈 Improved Scalability**: Handle high-volume requests efficiently
- **🛡️ Enhanced Reliability**: Queue-based system with retry logic
- **💾 Reduced Memory Usage**: No long-running connections
- **🎯 Base64 Optimization**: 2-3x faster with direct base64 processing

### ⚠️ Breaking Changes
- **Default behavior changed**: All endpoints now return task IDs by default
- **Sync mode requires parameter**: Add `?sync=true` for old behavior
- **Task checking requires auth**: Use Authorization header for `/v1/tasks/{taskId}`

## 📚 Additional Resources

- [ImageRouter Documentation](https://docs.imagerouter.capaxe.com)
- [Bruno Documentation](https://docs.usebruno.com)
- [Google Gemini API Docs](https://ai.google.dev/docs)
- [Google Vertex AI Docs](https://cloud.google.com/vertex-ai/docs)

## 🤝 Contributing

To add new API examples:
1. Create a new `.bru` file in this directory
2. Follow the existing naming convention
3. Include comprehensive documentation and tests
4. Update this README if needed

---

Happy testing! 🎉