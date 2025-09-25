# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ImageRouter API is a unified proxy service that provides OpenAI-compatible endpoints for multiple AI image and video generation providers. It abstracts away the complexity of different provider APIs, handles authentication, billing, storage, and provides a consistent interface for developers.

### Current Production Architecture

**ImageRouter is currently deployed and being used by:**
- **Web applications** requiring AI image/video generation
- **Mobile apps** needing consistent API endpoints  
- **SaaS platforms** integrating multiple AI providers
- **Developers** who want OpenAI-style APIs for non-OpenAI models

### Technical Architecture

- **Express Version** (`express/`): Full-featured Node.js API with Prisma PostgreSQL (Legacy)
- **Hono Version** (`hono/`): Modern Cloudflare Workers API using Drizzle + libSQL with Turso (Target)

**Supported Providers:**
- **Google**: Gemini 2.0/2.5, Imagen 3/4 series, Veo 2/3 (images & videos)
- **Bytedance**: Dreamina, InfiniteYou, SeedEdit, Seedream, Seedance (images & videos) 
- **Replicate**: Any public model via unified interface
- **Others**: FAL, Runware, OpenRouter, Vertex AI, etc.

## Development Commands

### Express (Legacy)
```bash
# Development
cd express && npm run dev
cd express && npm test
cd express && npm run lint
cd express && npm run format

# Database
cd express && npm run prisma:generate
cd express && npm run prisma:migrate

# Production
cd express && docker compose up
```

### Hono (Target)
```bash
# Development
cd hono && npm run dev
cd hono && npm run deploy
cd hono && npm run cf-typegen
```

## Async-First Architecture

**CRITICAL**: All API calls default to async mode using Cloudflare Queues for production scalability.

### Request Processing Modes

#### 1. **Async Mode (Default - Recommended)**
- **Default behavior** - no `async` parameter needed
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
- Automatic warnings logged

### Queue-Based Processing Flow
```
Client Request → Immediate Task ID → Queue Message → Provider API → Poll Status → Results
     ↓              ↓                    ↓               ↓            ↓         ↓
   POST /generate   task_id: abc123    Background      Replicate    Polling    Final URLs
   (async=default)  HTTP 200 OK        Processing      Google       Updates    Available
```

### Supported Async Providers
- **Google Veo**: 5+ minute video generation requires async
- **Replicate**: Any model (images: 30s-5min, videos: 2-20min)  
- **Bytedance**: Video models (Seedance) require async
- **All providers** benefit from async mode in production

## Migration Focus

**Current Migration Scope**: Google, Bytedance, and Replicate models with async-first architecture
- **Google Image Models**: All `express/src/shared/imageModels/google/*.js` files
- **Google Video Models**: All `express/src/shared/videoModels/google/*.js` files  
- **Bytedance Image Models**: All `express/src/shared/imageModels/bytedance/*.js` files
- **Bytedance Video Models**: All `express/src/shared/videoModels/bytedance/*.js` files
- **Replicate Integration**: Universal support for any Replicate model

## Key Architecture Patterns

### Model Structure
Each model is a class with:
```javascript
class ModelName {
  constructor() {
    this.data = {
      id: 'provider/model-name',
      providers: [{ id, model_name, pricing, applyImage?, applyMask? }],
      arena_score: number,
      release_date: 'YYYY-MM-DD',
      examples: [{ image|video: '/path' }]
    }
  }
  getData() { return this.data }
  async applyImage?(params) { /* transform params for image input */ }
}
```

### Provider System
- Models support multiple providers (geminiImagen, vertex, fal, runware, etc.)
- Each provider has different pricing and capabilities
- Provider selection happens in `providerSelector.js`

### Pricing Types
- `FIXED`: Flat rate per generation
- `CALCULATED`: Based on parameters (size, quality)  
- `POST_GENERATION`: Determined after completion

### Request Flow (Async-First)

#### Standard Flow (async=default)
1. Route handler receives request (`/v1/openai/images/generations`)
2. Upload middleware processes files
3. Parameter validation and authentication
4. **Queue message created** → Returns task ID immediately
5. Queue consumer processes in background:
   - Provider-specific API calls
   - Polling for completion
   - Storage service (R2) for outputs
   - Database updates with results
6. Client polls `/v1/tasks/{id}` for completion

#### Sync Flow (async=false - Development Only)
1. Route handler receives request with `async=false`
2. Upload middleware processes files  
3. Parameter validation and authentication
4. **Synchronous processing**:
   - Direct provider API calls
   - Blocking polling until completion
   - Storage service (R2) for outputs
5. Return results directly

## Cloudflare Workers Constraints

When migrating to Hono:
- **No Node.js APIs**: Replace `fs`, `path`, `child_process`
- **No Prisma**: Use Drizzle ORM with libSQL/Turso
- **File Uploads**: Use Cloudflare's native file handling
- **Environment**: Access via `c.env` in Hono context
- **Database**: D1 for SQL, KV for simple key-value, R2 for file storage
- **External APIs**: Use `fetch()` (already used in Express)

## Important Files for Migration

### Core Services (to migrate)
- `src/services/imageService.js` → Image generation logic
- `src/services/videoService.js` → Video generation logic
- `src/services/imageHelpers.js` → Utility functions
- `src/services/storageService.js` → File upload/storage
- `src/utils/providerSelector.js` → Provider selection logic

### Model Definitions (Google & Bytedance only)
- `src/shared/imageModels/google/` → All Google image models
- `src/shared/imageModels/bytedance/` → All Bytedance image models
- `src/shared/videoModels/google/` → All Google video models  
- `src/shared/videoModels/bytedance/` → All Bytedance video models
- `src/shared/PricingScheme.js` → Pricing constants

### Infrastructure
- `src/middleware/apiKeyMiddleware.js` → API authentication
- `src/middleware/uploadMiddleware.js` → File handling (needs Cloudflare adaptation)
- `src/config/database.js` → Database connection (migrate to Drizzle)

## Production Usage & API Compatibility

### How ImageRouter is Used in Production

**ImageRouter serves as a unified AI gateway** providing OpenAI-compatible endpoints for applications that need:

#### **Multi-Provider Support**
- Single API for Google, Bytedance, Replicate, and 15+ other providers
- Automatic failover and provider selection
- Cost optimization across providers

#### **Enterprise Features** 
- **Authentication**: API key management and user credits
- **Rate Limiting**: Per-user and per-endpoint throttling
- **Usage Analytics**: Detailed logging and cost tracking
- **File Storage**: Automatic R2/S3 integration for generated assets

#### **Developer Experience**
- **OpenAI-Compatible**: Drop-in replacement for OpenAI API calls
- **Async-First**: Scalable queue-based processing for long-running tasks
- **WebUI**: Built-in model browser and testing interface
- **Error Handling**: Unified error responses across all providers

### API Endpoints (OpenAI-Compatible)

#### **Image Generation**
```bash
# Async (Default - Recommended)
POST /v1/openai/images/generations
→ Returns: {"task_id": "abc123"}
GET /v1/tasks/abc123 → Poll for completion

# Sync (Development Only)  
POST /v1/openai/images/generations?async=false
→ Returns: Direct result (may timeout)
```

#### **Video Generation**
```bash
# Async (Default - Required for videos)
POST /v1/openai/videos/generations  
→ Returns: {"task_id": "xyz789"}
GET /v1/tasks/xyz789 → Poll for completion
```

#### **Other Endpoints**
- `POST /v1/openai/images/edits` - Image editing/inpainting
- `GET /v1/models` - List available models (filtered by provider)
- `GET /v1/tasks/{id}` - Check async task status
- `GET /models/ui` - Web interface for model browsing

## Database Schema Migration

Convert Prisma schema to Drizzle for:
- Users (credits tracking)
- APIKeys (authentication)
- APIUsage (logging/analytics)

Use Turso (libSQL) as the database backend for Cloudflare Workers compatibility.

## Environment Variables

### Core Infrastructure
- `ASYNC_QUEUE` - Cloudflare Queue for async processing (CRITICAL)
- `DB` - D1 Database binding for Drizzle
- `STORAGE_BUCKET` - R2 bucket for generated assets
- `JWT_SECRET` - Authentication token signing
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` - Production database

### Provider API Keys
- `GOOGLE_CLOUD_PROJECT_ID` + `GOOGLE_CLOUD_LOCATION` + `GOOGLE_SERVICE_ACCOUNT_KEY`
- `GEMINI_API_KEY` - Google Gemini API access
- `REPLICATE_API_KEY` - Replicate model access (NEW)
- `FAL_API_KEY` - FAL AI models
- `RUNWARE_API_KEY` - Runware provider
- `WAVESPEED_API_KEY` - WaveSpeed video models

### Storage Configuration  
- `R2_BUCKET_NAME` + `R2_CUSTOM_PUBLIC_URL` - Cloudflare R2 storage
- Replaces S3 configuration from Express version

## Testing

Maintain test compatibility:
- API endpoint tests
- Model validation tests
- Provider selection tests
- Focus on Google and Bytedance model coverage

## Task Management and TODO Tracking

**IMPORTANT**: This project uses a structured TODO.md file to track migration progress across phases.

### TODO Management Rules:
1. **Always use TodoWrite tool** to track your progress on tasks
2. **Mark tasks as completed** immediately after finishing them
3. **Update TODO.md file** whenever a significant milestone is reached
4. **Cross-reference with TODO.md** to understand current phase and remaining work

### When completing tasks:
- Mark the task as ✅ completed in TODO.md
- Add completion date if significant
- Update phase progress summaries
- Note any blockers or dependencies discovered

### TODO.md Structure:
- **Phase 1**: Foundation & Infrastructure (✅ COMPLETED)
- **Phase 2**: Google Models Migration (IN PROGRESS)
- **Phase 3**: Bytedance Models Migration 
- **Phase 4**: Advanced Features & Optimization
- **Phase 5**: Future Extensions (Other Models)

### Progress Tracking:
Always check TODO.md to understand:
- Which phase you're currently in
- What specific tasks remain
- Dependencies between tasks
- Success criteria for each phase

The TODO.md file is the single source of truth for migration progress.