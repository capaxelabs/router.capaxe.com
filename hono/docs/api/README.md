# ImageRouter API - Bruno Documentation

This directory contains comprehensive API documentation for the ImageRouter API using Bruno (an open-source API client).

## 🚀 Getting Started

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
- **Generate Image - Gemini** - Create images using Gemini models
- **Generate Image - Imagen** - Create images using Imagen models
- **Generate Image - Base64 Response** - Get images as base64 strings
- **Generate Multiple Images** - Create multiple images in one request
- **Edit Image - Multipart** - Edit existing images with file upload

### Video Generation
- **Generate Video - Veo** - Create videos using Veo models
- **Generate Video - Image to Video** - Animate static images into videos
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

## 🛠️ Request Parameters

### Image Generation
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

### Video Generation
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

## 📝 Response Formats

### Successful Image Generation
```json
{
  "created": 1640995200,
  "data": [
    {
      "url": "https://storage-url/image.png",
      "revised_prompt": "Enhanced prompt used"
    }
  ]
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

## 🔄 File Uploads

For image editing and image-to-video generation, use multipart form data:

```
Content-Type: multipart/form-data

Fields:
- model: Model identifier
- prompt: Text description
- image: Image file (JPEG, PNG, WebP, GIF up to 20MB)
- mask: Optional mask file for selective editing (up to 10MB)
- [other parameters as form fields]
```

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