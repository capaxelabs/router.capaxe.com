# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ImageRouter API is a unified proxy service that provides OpenAI-compatible endpoints for multiple AI image and video generation providers. It abstracts away the complexity of different provider APIs, handles authentication, billing, storage, and provides a consistent interface for developers.

**Current Architecture:** Cloudflare Workers using Hono framework with Drizzle ORM + Turso (libSQL)

**Supported Providers:**
- **Google**: Gemini 2.0/2.5, Imagen 3/4 series, Veo 2/3 (images & videos)
- **Runware**: Stable Diffusion and other image generation models

**Note**: This implementation focuses exclusively on Google and Runware providers. Other providers (Bytedance, OpenAI, Replicate, FAL, Stability AI, etc.) are out of scope.

## Development Commands

```bash
# Development
npm run dev                 # Start Cloudflare Workers dev server
npm run deploy              # Deploy to production with minification
npm run cf-typegen          # Generate TypeScript types for Cloudflare bindings

# Database (Drizzle + Turso)
npm run db:generate         # Generate migration files from schema changes
npm run db:migrate          # Apply migrations to database
npm run db:studio           # Open Drizzle Studio (visual database browser)
npm run db:seed             # Seed database with test data

# Testing
npm run test                # Run test suite (if configured)
```

## Async-First Architecture

**CRITICAL**: All API calls default to async mode using Cloudflare Queues for production scalability.

### Request Processing Modes

#### 1. **Async Mode (Default - Recommended)**
- Default behavior - no `async` parameter needed
- Returns task ID immediately: `{"task_id": "abc123"}`
- Client polls: `GET /v1/tasks/{task_id}` for completion
- Uses Cloudflare Queues for distributed processing
- **Scalable** - no connection timeouts or worker limits
- **Production ready** - handles high traffic and long-running models

#### 2. **Sync Mode (Development Only)**
- Requires explicit `async=false` parameter
- Blocks HTTP connection until completion
- **Not recommended for production** - hits Cloudflare Worker limits
- Used for testing/development only

### Queue-Based Processing Flow
```
Client Request → Immediate Task ID → Queue Message → Provider API → Poll Status → Results
     ↓              ↓                    ↓               ↓            ↓         ↓
   POST /generate   task_id: abc123    Background      Replicate    Polling    Final URLs
   (async=default)  HTTP 200 OK        Processing      Google       Updates    Available
```

### Key Files for Async Processing
- [src/services/queueService.ts](src/services/queueService.ts) - Queue message creation and task management
- [src/services/queueConsumer.ts](src/services/queueConsumer.ts) - Background worker processing
- [src/services/taskManager.ts](src/services/taskManager.ts) - Task status tracking
- [src/routes/tasks.ts](src/routes/tasks.ts) - Task polling endpoints

## Core Architecture

### Database Schema ([src/db/schema.ts](src/db/schema.ts))

**Users Table**
- `id` (text, PK) - Unique user identifier
- `credits` (integer) - User credit balance
- `createdAt`, `updatedAt` (timestamp)

**API Keys Table**
- `id` (text, PK) - Key identifier
- `key` (text, unique) - Actual API key
- `userId` (FK) - Reference to users table
- `name` (text) - Key description
- `isActive` (boolean) - Key status
- `lastUsedAt` (timestamp)

**API Usage Table** (Critical for tracking generations)
- `id` (text, PK) - Usage record identifier
- `userId` (FK), `apiKeyId` (FK) - User and key references
- `model`, `provider` (text) - Model and provider used
- `prompt` (text) - Generation prompt
- `cost` (integer) - Cost in 1e-4 USD units
- `speedMs` (integer) - Generation time
- `imageSize`, `quality` (text) - Generation parameters
- `outputUrls` (text) - JSON array of generated asset URLs
- `status` (text) - Generation status
- **Async task fields:**
  - `taskId` (text) - Links to async task
  - `taskStatus` (enum) - `sync`, `pending`, `processing`, `completed`, `failed`
  - `taskProgress` (integer) - 0-100 completion percentage
  - `taskStartedAt`, `taskCompletedAt` (timestamp)
  - `isAsync` (boolean) - Whether this was an async request

**IMPORTANT**: All generated images/videos are stored in R2 and their URLs are saved to `outputUrls` column as JSON array.

### Model System

**Model Definition Pattern:**
```typescript
class ModelName {
  data = {
    id: 'provider/model-name',
    providers: [
      {
        id: 'gemini',
        model_name: 'actual-api-model-name',
        pricing: { type: 'FIXED', price: 0.01 },
        applyImage?: (params) => { /* transform params */ },
        applyMask?: (params) => { /* transform params */ },
        applyQuality?: (params) => { /* transform params */ }
      }
    ],
    arena_score: 1350,
    release_date: '2024-01-01',
    examples: [{ image: '/path/to/example.png' }]
  }
  getData() { return this.data }
}
```

**Model Locations:**
- Google Image Models: [src/shared/imageModels/google/](src/shared/imageModels/google/)
- Google Video Models: [src/shared/videoModels/google/](src/shared/videoModels/google/)
- Runware Image Models: [src/shared/imageModels/runware/](src/shared/imageModels/runware/)

### Provider Selection ([src/utils/providerSelector.ts](src/utils/providerSelector.ts))

The system automatically selects the best provider based on:
1. **API key availability** (checks `c.env.REPLICATE_API_KEY`, `GEMINI_API_KEY`, etc.)
2. **Feature requirements** (image input, mask support, quality settings)
3. **Cost optimization** (selects cheapest available provider)

### Storage System ([src/lib/storage.ts](src/lib/storage.ts))

**R2 Storage Integration:**
- Uses Cloudflare R2 for generated assets
- **CUID-based filenames** for unique, collision-resistant naming
- **Date-based folder structure:**
  - Images: `/images/YYYY/MM/DD/[cuid].ext`
  - Videos: `/videos/YYYY/MM/DD/[cuid].ext`
- Public URL format: `https://{R2_CUSTOM_PUBLIC_URL}/images/2025/01/15/cmfyuksaf000000ijet1iryyg.png`

**Storage Service Methods:**
```typescript
storageService.uploadImageToR2(imageData: ArrayBuffer, extension: string): Promise<string>
storageService.uploadVideoToR2(videoData: ArrayBuffer, extension: string): Promise<string>
storageService.downloadFromUrl(url: string): Promise<{ data: ArrayBuffer, contentType: string }>
```

### Service Layer

**Image Generation** ([src/services/imageService.ts](src/services/imageService.ts))
- `generateImage(c, params, userId)` - Main image generation handler
- Routes to provider-specific handlers:
  - `generateGemini()` - Google Gemini API
  - `generateVertex()` - Google Vertex AI
  - `generateOpenRouter()` - OpenRouter proxy
  - `generateReplicate()` - Replicate API (async-first)
  - `generateRunware()` - Runware API

**Video Generation** ([src/services/videoService.ts](src/services/videoService.ts))
- `generateVideo(c, params, userId)` - Main video generation handler
- Google Veo models require async processing (5+ minute generations)
- Automatic polling for operation completion

**Usage Logging** ([src/services/usageLogger.ts](src/services/usageLogger.ts))
- `logUsage(db, record)` - Records generation in `api_usage` table
- Tracks cost, speed, provider, output URLs
- Links async tasks with `taskId` field

### API Endpoints

**Image Generation:**
```
POST /v1/openai/images/generations
  → Returns: {"task_id": "abc123"} (async) or direct result (sync)
  → Body: { model, prompt, size, quality, n, response_format, async }
```

**Video Generation:**
```
POST /v1/openai/videos/generations
  → Returns: {"task_id": "xyz789"} (always async for videos)
  → Body: { model, prompt, duration, resolution, response_format }
```

**Task Status:**
```
GET /v1/tasks/{task_id}
  → Returns: { status, progress, result?, error? }
```

**Model Listing:**
```
GET /v1/models?provider=google
  → Returns: Array of available models with pricing/capabilities
```

**Web Interfaces:**
```
GET /models - HTML page with model browser
GET /tasks - HTML page with task status viewer
```

## Cloudflare Workers Environment

### Environment Bindings ([src/types/env.ts](src/types/env.ts))

**R2 Buckets:**
- `STORAGE_BUCKET` - Main storage for generated assets

**Queues:**
- `ASYNC_QUEUE` - Queue for async generation tasks

**Environment Variables:**
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` - Database connection
- `R2_BUCKET_NAME`, `R2_CUSTOM_PUBLIC_URL` - Storage configuration
- `JWT_SECRET` - Authentication token signing
- Provider API keys: `GEMINI_API_KEY`, `REPLICATE_API_KEY`, `RUNWARE_API_KEY`, etc.
- `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_SERVICE_ACCOUNT_KEY`

### Workers Constraints

**What You CAN'T Use:**
- Node.js filesystem APIs (`fs`, `path`)
- `child_process`, `cluster`
- Long-running synchronous operations (CPU time limits)
- Prisma ORM (use Drizzle instead)

**What You SHOULD Use:**
- `fetch()` for HTTP requests
- Cloudflare R2 for file storage
- Cloudflare Queues for async tasks
- Drizzle ORM for database
- Native `crypto` API
- `c.env` for environment variables in Hono context

### Configuration Files

- [wrangler.jsonc](wrangler.jsonc) - Cloudflare Workers config (bindings, queues, R2)
- [drizzle.config.ts](drizzle.config.ts) - Drizzle ORM config
- [tsconfig.json](tsconfig.json) - TypeScript configuration

## Migration Status

**Current Phase: Phase 2 Complete ✅ | Phase 3 Next (Runware)**

### Phase 1: Foundation ✅ COMPLETED
- Drizzle ORM + Turso database
- R2 storage with CUID and date-based folders
- API key middleware and rate limiting
- Core services migrated

### Phase 2: Google Models ✅ COMPLETED
- 14 Google image models (Gemini, Imagen 3/4)
- 4 Google video models (Veo 2/3)
- Google Vertex AI and Gemini API integration
- Image/video generation endpoints
- Async task processing with queues

### Phase 3: Runware Models (Next)
- Runware image models verification
- Provider fallback logic (Google → Runware)
- Integration testing

### Phase 4: Production Readiness
- Monitoring and observability
- Performance optimization
- Production deployment

See [TODO.md](TODO.md) for detailed migration progress.

## Key Implementation Patterns

### Adding a New Model

1. Create model file in `src/shared/imageModels/{provider}/` or `videoModels/{provider}/`
2. Export model from provider's `index.ts`
3. Add provider handler in `imageService.ts` or `videoService.ts` if new
4. Update provider selector to recognize new provider
5. Test with both sync and async modes

### Adding a New Provider

1. Add API key to environment variables
2. Create provider handler function in service layer
3. Implement provider-specific API call logic
4. Add provider config to model definitions
5. Update provider selector to check for API key
6. Handle async polling if provider requires it

### Async Task Processing

1. Request comes to `/v1/openai/images/generations`
2. Route handler validates and creates task ID
3. Task record inserted into `api_usage` table with `taskStatus: 'pending'`
4. Queue message sent to `ASYNC_QUEUE`
5. HTTP response returns immediately with `task_id`
6. Queue consumer picks up message in background
7. Consumer updates `taskStatus: 'processing'`
8. Provider API called and polled if needed
9. Results stored in R2, URLs saved to `outputUrls`
10. Task completed with `taskStatus: 'completed'`
11. Client polls `GET /v1/tasks/{id}` to retrieve results

## Common Development Workflows

### Testing a Model Locally
```bash
npm run dev

# Test sync mode (immediate response)
curl -X POST http://localhost:8787/v1/openai/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model": "google/imagen-4", "prompt": "a cat", "async": false}'

# Test async mode (queue processing)
curl -X POST http://localhost:8787/v1/openai/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model": "google/imagen-4", "prompt": "a cat"}'
```

### Debugging Queue Processing
```bash
# Check Cloudflare dashboard for queue metrics
# View logs: wrangler tail --format pretty
npm run dev
# Trigger a generation and watch logs
```

### Database Inspection
```bash
npm run db:studio
# Opens Drizzle Studio at http://localhost:4983
# Browse tables, run queries, inspect data
```

### Deploying to Production
```bash
npm run deploy
# Deploys to Cloudflare Workers
# Automatically applies database migrations
# Updates environment variables from wrangler.jsonc
```

## Error Handling

**Authentication Errors:**
- Missing API key → 401 Unauthorized
- Invalid API key → 401 Unauthorized
- Insufficient credits → 402 Payment Required

**Generation Errors:**
- Model not found → 404 Not Found
- Invalid parameters → 400 Bad Request
- Provider API failure → 500 Internal Server Error (retry via queue)
- Timeout → Task marked as failed with error message

**Async Task Errors:**
- Failed tasks are retried up to 3 times (configured in wrangler.jsonc)
- Dead letter queue: `imagerouter-failed-tasks` for manual inspection
- Error messages stored in `api_usage.error` field

## Important Implementation Notes

### Database Records for Generated Assets

**CRITICAL**: Every generated image or video MUST be recorded in the database with:
1. **Task ID** - Unique identifier for async tracking
2. **Output URLs** - JSON array of R2 URLs in `api_usage.outputUrls`
3. **Cost and timing** - For billing and analytics
4. **Provider and model** - For usage tracking
5. **Task status** - For async completion polling

**Never return base64 data directly** - always upload to R2 first and return URLs.

### File Naming Convention

**Use CUID for all filenames:**
```typescript
import { cuid } from 'cuid'
const filename = `${cuid()}.${extension}`
```

**Never use user IDs in filenames** - prevents collisions and security issues.

### Pricing Calculation

**Three pricing types** ([src/shared/PricingScheme.ts](src/shared/PricingScheme.ts)):
- `FIXED` - Flat rate per generation
- `CALCULATED` - Based on parameters (size, quality, steps)
- `POST_GENERATION` - Determined after completion (e.g., per-second video)

Cost is stored as `cost * 10000` (integer) in database for precision.

### Provider API Keys

**Check availability before selection:**
```typescript
if (!c.env.REPLICATE_API_KEY) {
  throw new Error('Replicate API key not configured')
}
```

**Provider ID mapping:**
- `gemini` → `GEMINI_API_KEY`
- `geminiImagen` → `GEMINI_API_KEY`
- `vertex` → `GOOGLE_SERVICE_ACCOUNT_KEY`
- `runware` → `RUNWARE_API_KEY`

**Note**: Only Google and Runware providers are supported in this implementation.

### Google Authentication

**Two auth methods** ([src/services/googleAuth.ts](src/services/googleAuth.ts)):
1. **Gemini API** - Direct API key (`GEMINI_API_KEY`)
2. **Vertex AI** - Service account with OAuth2 access token

Use `getGoogleAccessToken(serviceAccountKey)` for Vertex AI models.

## Testing Scripts

- [test_video.sh](test_video.sh) - Test Google Veo video generation
- [test_replicate.sh](test_replicate.sh) - Test Replicate integration
- [test_runware.sh](test_runware.sh) - Test Runware models
- [test_multi_provider.sh](test_multi_provider.sh) - Test provider fallback logic
- [test_video_test_mode.sh](test_video_test_mode.sh) - Test video mock mode

## Production Architecture

**Cloudflare Workers Stack:**
- **Runtime**: Edge workers (V8 isolates)
- **Framework**: Hono.js (Express-like API)
- **Database**: Turso (libSQL) via Drizzle ORM
- **Storage**: Cloudflare R2 (S3-compatible)
- **Queues**: Cloudflare Queues for async processing
- **Monitoring**: Cloudflare observability (configured in wrangler.jsonc)

**Scaling Properties:**
- No cold starts (V8 isolates)
- Global edge distribution
- Unlimited concurrent requests
- Queue-based async processing prevents timeouts
- R2 storage with CDN distribution

## Documentation

- **API Docs**: OpenAPI spec in [src/openapiDoc.ts](src/openapiDoc.ts)
- **Migration Plan**: [TODO.md](TODO.md) - Detailed phase-by-phase migration status
- **Replicate Polling**: [REPLICATE_POLLING.md](REPLICATE_POLLING.md) - Async polling implementation
- **Setup Guide**: [README.md](README.md) - Project setup and configuration
