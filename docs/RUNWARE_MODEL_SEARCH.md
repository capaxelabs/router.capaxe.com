# Runware Model Search API

This document describes the Runware Model Search API endpoints that allow you to search and discover models in the Runware catalog.

## Overview

The Runware Model Search API provides three main endpoints:

1. **POST /v1/runware/models/search** - Advanced search with all filters
2. **GET /v1/runware/models/search** - Simple search using query parameters  
3. **GET /v1/runware/models** - List all available models with pagination

## Endpoints

### 1. POST /v1/runware/models/search

Advanced model search with JSON body for complex filter combinations.

**Request:**
```http
POST /v1/runware/models/search
Content-Type: application/json

{
  "search": "realistic",              // Optional: search term
  "tags": ["photorealistic"],         // Optional: filter by tags (array)
  "category": "checkpoint",            // Optional: checkpoint, lora, controlnet, vae, embeddings, lycoris
  "type": "base",                      // Optional: base, inpainting, refiner (only for checkpoints)
  "architecture": "sdxl",              // Optional: sdxl, flux1d, sd3, pony, imagen3, etc.
  "conditioning": "canny",             // Optional: for ControlNet models only
  "visibility": "public",              // Optional: public, private, community, favorite (default: public)
  "offset": 0,                         // Optional: pagination offset (default: 0)
  "limit": 20                          // Optional: results per page (default: 20, max: 100)
}
```

**Response:**
```json
{
  "data": [
    {
      "taskUUID": "50836053-a0ee-4cf5-b9d6-ae7c5d140ada",
      "taskType": "modelSearch",
      "totalResults": 150,
      "results": [
        {
          "name": "Promissing_Realistic_XL",
          "air": "civitai:305149@392545",
          "tags": [
            "photorealistic",
            "base model",
            "sci-fi",
            "photo",
            "woman",
            "fantasy",
            "photorealism"
          ],
          "heroImage": "https://mim.runware.ai/r/66a70a0bb7c38-450x450.jpg",
          "category": "checkpoint",
          "private": false,
          "comment": "",
          "version": "v22",
          "architecture": "sdxl",
          "type": "base",
          "defaultWidth": 1024,
          "defaultHeight": 1024,
          "defaultSteps": 20,
          "defaultScheduler": "Default",
          "defaultCFG": 7.5
        }
      ]
    }
  ]
}
```

### 2. GET /v1/runware/models/search

Simple search using URL query parameters. Good for quick searches and integration with simple HTTP clients.

**Request:**
```http
GET /v1/runware/models/search?search=realistic&category=checkpoint&architecture=sdxl&limit=20&offset=0
```

**Query Parameters:**
- `search` - Search term (string)
- `tags` - Comma-separated tags (e.g., "photorealistic,realistic")
- `category` - Model category (checkpoint, lora, controlnet, etc.)
- `type` - Model type (base, inpainting, refiner)
- `architecture` - Model architecture (sdxl, flux1d, sd3, pony, etc.)
- `conditioning` - ControlNet conditioning type
- `visibility` - Visibility filter (public, private, community, favorite) - default: public
- `offset` - Pagination offset (number)
- `limit` - Results per page (number, max 100)

**Response:** Same format as POST endpoint

### 3. GET /v1/runware/models

List all available models with pagination. No filters applied.

**Request:**
```http
GET /v1/runware/models?offset=0&limit=20
```

**Query Parameters:**
- `offset` - Pagination offset (default: 0)
- `limit` - Results per page (default: 20, max: 100)

**Response:** Same format as POST endpoint

## Filter Options

### Categories
- `checkpoint` - Base models for image generation
- `lora` - LoRA (Low-Rank Adaptation) models for style transfer
- `lycoris` - Alternative to LoRA models
- `controlnet` - Models for guided image generation
- `vae` - Variational Autoencoders for image quality
- `embeddings` - Textual embeddings for new concepts

### Types (Checkpoint only)
- `base` - Standard models for general image generation
- `inpainting` - Models for filling/modifying parts of images
- `refiner` - Models that improve quality and details

### Architectures
- **FLUX Models:** `flux1s`, `flux1d`, `fluxpro`, `fluxultra`, `fluxkontextdev`, `fluxkontextpro`, `fluxkontextmax`
- **Imagen Models:** `imagen3`, `imagen3fast`, `imagen4preview`, `imagen4ultra`, `imagen4fast`
- **Gemini:** `gemini_2_5_flash_image`
- **HiDream:** `hidreamfast`, `hidreamdev`, `hidreamfull`
- **Qwen:** `qwen_image`, `qwen_image_edit`
- **Ideogram:** `ideogram1`, `ideogram2a`, `ideogram2`, `ideogram3`
- **Stable Diffusion:** `sd1x`, `sdhyper`, `sd1xlcm`, `sdxl`, `sdxllcm`, `sdxldistilled`, `sdxlhyper`, `sdxllightning`, `sdxlturbo`, `sd3`
- **Other:** `flex_1_alpha`, `pony`

### Conditioning (ControlNet only)
- `blur` - Blurred image guidance
- `canny` - Edge detection maps
- `depth` - Depth map information
- `gray` - Grayscale image reference
- `hed` - Holistic edge detection
- `inpaint` - Mask-based generation
- `lineart` - Line art reference
- `normal` - Normal map information
- `openpose` - Human pose guidance
- `qrcode` - QR code structural reference
- `scribble` - Simple sketches
- `sketch` - Sketch drawings
- `softedge` - Soft edge detection
- And more...

### Visibility
- `public` - Only your organization's public models (default)
- `private` - Only your organization's private models
- `community` - Community-contributed models
- `favorite` - Your favorited models

## Using Model Results

Once you find a model, use its `air` identifier in image generation requests:

```json
{
  "model": "civitai:305149@392545",
  "prompt": "a beautiful landscape",
  "size": "1024x1024"
}
```

## Example Usage

### Search for realistic SDXL models
```bash
curl -X POST http://localhost:8787/v1/runware/models/search \
  -H "Content-Type: application/json" \
  -d '{
    "search": "realistic",
    "category": "checkpoint",
    "architecture": "sdxl",
    "tags": ["photorealistic"],
    "limit": 10
  }'
```

### Search for ControlNet models with Canny edge detection
```bash
curl "http://localhost:8787/v1/runware/models/search?category=controlnet&conditioning=canny&limit=5"
```

### Get all available FLUX models
```bash
curl "http://localhost:8787/v1/runware/models/search?architecture=flux1d&limit=20"
```

### List all models (paginated)
```bash
curl "http://localhost:8787/v1/runware/models?offset=0&limit=50"
```

## Pagination

To navigate through large result sets:

1. Check `totalResults` in the response
2. Use `offset` and `limit` to fetch additional pages
3. Example: For page 2 with 20 results per page, use `offset=20&limit=20`

```bash
# Page 1
curl "http://localhost:8787/v1/runware/models/search?limit=20&offset=0"

# Page 2
curl "http://localhost:8787/v1/runware/models/search?limit=20&offset=20"

# Page 3
curl "http://localhost:8787/v1/runware/models/search?limit=20&offset=40"
```

## Error Responses

### API Key Not Configured
```json
{
  "error": "Runware API is not configured",
  "message": "RUNWARE_API_KEY environment variable is missing"
}
```
Status: `503 Service Unavailable`

### Search Failed
```json
{
  "error": "Model search failed",
  "message": "Runware API error: [error details]"
}
```
Status: `500 Internal Server Error`

## Notes

- The `air` (AI Resource Identifier) is required to use models in generation requests
- Models can be immediately used after discovery - no additional setup required
- Search works across model names, versions, tags, and other fields
- Results are ordered by relevance when using search terms
- Maximum 100 results per page for optimal performance
- Use specific filters to narrow results and improve search performance
