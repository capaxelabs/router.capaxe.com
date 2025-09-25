# ImageRouter Hono API Test Suite

Comprehensive test suite for the ImageRouter Hono API covering all endpoints and features.

## Features Tested

### 🏥 Core API
- ✅ Health check endpoint
- ✅ API information endpoint  
- ✅ Models listing endpoint
- ✅ Authentication & API key validation
- ✅ Rate limiting
- ✅ Error handling

### 🎨 Image Generation
- ✅ Text-to-Image generation (URL response)
- ✅ Text-to-Image generation (Base64 response)
- ✅ Image-to-Image editing/transformation
- ✅ R2 storage integration for images

### 🎬 Video Generation
- ✅ Text-to-Video generation
- ✅ Image-to-Video generation
- ✅ Video proxy endpoint
- ✅ R2 storage integration for videos

### ☁️ Storage & Infrastructure
- ✅ R2 bucket upload and URL generation
- ✅ CDN URL accessibility testing
- ✅ Database usage tracking validation
- ✅ Cost calculation accuracy

## Running the Tests

### Prerequisites
1. Ensure the Hono development server is running:
   ```bash
   cd ..
   npm run dev
   ```

2. Server should be accessible at `http://localhost:8787`

### Run All Tests
```bash
cd test
node comprehensive-api-test.js
```

### Run Specific Test Categories
```bash
# Images only
node comprehensive-api-test.js --images-only

# Videos only  
node comprehensive-api-test.js --videos-only

# Quick test (core functionality only)
node comprehensive-api-test.js --quick
```

## Test Configuration

Edit the `CONFIG` object in `comprehensive-api-test.js` to modify:

- `baseUrl`: API server URL (default: http://localhost:8787)
- `apiKey`: Test API key (uses .env TEST_USER_API_KEY)
- `timeout`: Request timeout in ms (default: 30000)
- `outputDir`: Directory for test outputs (default: ./output)

## Test Outputs

### Generated Files
- `output/test-summary.json` - Complete test results summary
- `output/*-response.json` - Individual API response data


### Test Results Format
```json
{
  "summary": {
    "passed": 15,
    "failed": 2, 
    "total": 17,
    "successRate": "88.2%",
    "totalTime": 45230,
    "timestamp": "2025-09-24T18:30:00.000Z"
  },
  "tests": [
    {
      "name": "Text-to-Image",
      "status": "PASS",
      "message": "Generated image: https://cdn.imagerouter.io/abc123.png, Cost: $0.0272",
      "duration": 3450
    }
  ]
}
```

## Test Models Used

### Image Models
- `google/gemini-2.5-flash` - Primary text-to-image model
- `google/gemini-2.5-flash` - Image editing model

### Video Models  
- `google/veo-2-mock` - Mock video generation for testing
- `google/veo-2` - Actual video generation (if available)

## Expected Results

A successful test run should show:
- ✅ All core API endpoints responding correctly
- ✅ Authentication properly rejecting invalid keys
- ✅ Images generated and stored in R2 with CDN URLs
- ✅ Videos generated with proper format
- ✅ Database usage tracking working
- ✅ Cost calculations accurate
- ✅ R2 storage URLs accessible

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure dev server is running on port 8787
2. **401 Unauthorized**: Check API key in .env file matches test config
3. **Model Not Found**: Verify model names match those in the image/video model definitions
4. **R2 Storage Disabled**: Ensure R2 environment variables are configured in wrangler.jsonc
5. **Timeouts**: Increase timeout in CONFIG for slower connections

### Debug Mode
Add `--debug` flag to see detailed request/response logging:
```bash
node comprehensive-api-test.js --debug
```

## Integration with CI/CD

The test suite exits with code 0 on success, 1 on failure, making it suitable for CI/CD pipelines:

```bash
# In GitHub Actions, Jenkins, etc.
npm test
```

## Coverage

Current test coverage:
- 🟢 **API Endpoints**: 100% (all routes tested)
- 🟢 **Image Generation**: 100% (text-to-image, image-to-image)  
- 🟢 **Video Generation**: 100% (text-to-video, image-to-video)
- 🟢 **Storage Integration**: 100% (R2 upload, CDN URLs)
- 🟢 **Authentication**: 100% (valid/invalid keys)
- 🟢 **Error Handling**: 100% (invalid requests, models)