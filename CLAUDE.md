# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ImageRouter API is a service that acts as a proxy between applications and various image/video generation APIs. The codebase is currently being migrated from Express (`express/`) to Hono (`hono/`) for Cloudflare Workers deployment, with initial focus on Google and Bytedance models.

### Architecture

- **Express Version** (`express/`): Full-featured Node.js API with Prisma PostgreSQL
- **Hono Version** (`hono/`): Cloudflare Workers-compatible API using Drizzle + libSQL with Turso

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

## Migration Focus

**Current Migration Scope**: Only Google and Bytedance models for both images and videos
- **Google Image Models**: All `express/src/shared/imageModels/google/*.js` files
- **Google Video Models**: All `express/src/shared/videoModels/google/*.js` files  
- **Bytedance Image Models**: All `express/src/shared/imageModels/bytedance/*.js` files
- **Bytedance Video Models**: All `express/src/shared/videoModels/bytedance/*.js` files

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

### Request Flow
1. Route handler (`imageRoutes.js`/`videoRoutes.js`)
2. Upload middleware (handles files)
3. Parameter validation (`validateImageParams.js`/`validateVideoParams.js`)
4. Generation service (`imageService.js`/`videoService.js`)
5. Provider-specific API calls
6. Storage service (S3/R2) for outputs

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

## API Compatibility

Maintain OpenAI-compatible endpoints:
- `POST /v1/openai/images/generations`
- `POST /v1/openai/images/edits` 
- `POST /v1/openai/videos/generations`
- `GET /v1/models` (filtered for Google/Bytedance only)

## Database Schema Migration

Convert Prisma schema to Drizzle for:
- Users (credits tracking)
- APIKeys (authentication)
- APIUsage (logging/analytics)

Use Turso (libSQL) as the database backend for Cloudflare Workers compatibility.

## Environment Variables

Key variables to migrate:
- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLOUD_LOCATION`  
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- Various provider API keys for Bytedance models
- Storage configuration (R2 instead of S3)

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