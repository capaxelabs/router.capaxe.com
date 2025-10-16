# ImageRouter Hono Migration Plan

## Migration Strategy

This document tracks the migration to Hono/Cloudflare Workers, focusing exclusively on **Google** and **Runware** providers. Each phase builds incrementally to ensure stable functionality.

---

## 🚀 Phase 1: Foundation & Infrastructure Setup ✅ COMPLETED (2025-01-20)

### 1.1 Core Infrastructure ✅
- [x] Set up Drizzle ORM with libSQL/Turso database
- [x] Configure Cloudflare Workers environment (wrangler.jsonc)
- [x] Create database schema migration (Prisma → Drizzle)
  - [x] Users table
  - [x] APIKeys table
  - [x] APIUsage table
- [x] Set up environment variables for Cloudflare Workers
- [x] Configure R2 storage for file uploads

### 1.2 Core Services Migration ✅
- [x] Migrate `PricingScheme.js` (pricing constants)
- [x] Migrate `imageHelpers.js` (Cloudflare-compatible utilities)
- [x] Migrate `storageService.js` (R2 instead of S3)
- [x] **Implement CUID for unique filenames instead of user IDs**
- [x] **Organize files in date-based folder structure (images/YYYY/MM/DD/, videos/YYYY/MM/DD/)**
- [x] **Fix R2 storage integration with native Cloudflare APIs (removed AWS SDK compatibility issues)**
- [x] Migrate `providerSelector.js` (provider selection logic)
- [x] Create Cloudflare Workers-compatible file upload handling

### 1.3 Middleware & Auth ✅
- [x] Migrate API key middleware (`apiKeyMiddleware.js`)
- [x] Implement rate limiting for Cloudflare Workers
- [x] Create request validation utilities
- [x] Set up CORS and security headers

**Phase 1 Status**: ✅ **COMPLETED** - All foundation infrastructure is ready for Phase 2

---

## 🎯 Phase 2: Google Models Migration ✅ COMPLETED (2025-01-25)

### 2.1 Google Image Models (14 models) ✅
- [x] `google/gemini-2.0-flash-exp.js`
- [x] `google/gemini-2.0-flash-prev.js`
- [x] `google/gemini-2.5-flash-free.js`
- [x] `google/gemini-2.5-flash.js`
- [x] `google/imagen-3-fast.js`
- [x] `google/imagen-3.js`
- [x] `google/imagen-4-05-20-ultra.js`
- [x] `google/imagen-4-05-20.js`
- [x] `google/imagen-4-06-06-fast.js`
- [x] `google/imagen-4-06-06-ultra.js`
- [x] `google/imagen-4-06-06.js`
- [x] `google/imagen-4-fast.js`
- [x] `google/imagen-4-ultra.js`
- [x] `google/imagen-4.js`

### 2.2 Google Video Models (4 models) ✅
- [x] `google/veo-2-mock.js`
- [x] `google/veo-2.js`
- [x] `google/veo-3-fast.js`
- [x] `google/veo-3.js`

### 2.3 Google Integration Services ✅
- [x] Migrate Google Vertex AI authentication
- [x] Migrate Google Gemini API integration
- [x] Migrate `generateImage()` function for Google models
- [x] Migrate `generateVideo()` function for Google models
- [x] Create Google-specific parameter validation
- [x] Set up Google service account key handling

### 2.4 Google API Endpoints ✅
- [x] `POST /v1/openai/images/generations` (Google models)
- [x] `POST /v1/openai/images/edits` (Google models)
- [x] `POST /v1/openai/videos/generations` (Google models)
- [x] `GET /v1/models` (Google models)

### 2.5 Testing & Validation ✅
- [x] Create tests for Google image models
- [x] Create tests for Google video models
- [x] Test Google authentication flow
- [x] Test file upload with Google models
- [x] Performance testing for Google endpoints

**Phase 2 Status**: ✅ **COMPLETED** - All Google models are fully implemented and tested with R2 storage integration including CUID filenames and date-based folder organization

---

## 🎨 Phase 3: Runware Models Integration

### 3.1 Runware Image Models
- [ ] Verify Runware model definitions in `src/shared/imageModels/runware/`
- [ ] Test Runware API integration in `src/services/imageService.ts`
- [ ] Validate Runware provider selection logic
- [ ] Test Runware-specific parameters (model_name, steps, guidance_scale)
- [ ] Verify pricing calculations for Runware models

### 3.2 Runware API Endpoints
- [ ] Update `POST /v1/openai/images/generations` (ensure Runware models work)
- [ ] Update `GET /v1/models` (include Runware models in listing)
- [ ] Test async processing with Runware models
- [ ] Verify R2 storage integration for Runware outputs

### 3.3 Testing & Validation
- [ ] Create tests for Runware image models
- [ ] Test multiple provider fallback logic (Google → Runware)
- [ ] Integration tests for Google + Runware combined
- [ ] Load testing with both provider sets
- [ ] Verify cost calculation accuracy for both providers

**Phase 3 Target**: Complete Runware integration and testing (3-5 days)

---

## 🌟 Phase 4: Production Readiness & Optimization

### 4.1 Advanced Functionality
- [ ] Implement proper error handling and retries for async tasks
- [ ] Add comprehensive request/response logging
- [ ] Verify usage tracking and billing accuracy
- [ ] Implement caching for model listings
- [ ] Optimize queue processing for high-load scenarios

### 4.2 Monitoring & Observability
- [ ] Configure Cloudflare Workers analytics (already enabled in wrangler.jsonc)
- [ ] Add performance monitoring dashboards
- [ ] Set up error reporting and alerting
- [ ] Create usage dashboards for Google and Runware models
- [ ] Monitor R2 storage costs and optimization

### 4.3 Documentation & Deployment
- [ ] Finalize API documentation with Google/Runware examples
- [ ] Create production deployment workflows
- [ ] Set up staging environment on Cloudflare
- [ ] Production deployment checklist
- [ ] Performance benchmarking (response times, cost per generation)

**Phase 4 Target**: Production-ready deployment (1 week)

---

## 🗄️ Phase 5: Database-Driven Model Management (NEW)

**Goal**: Migrate from file-based model definitions to database storage for dynamic model management without deployments.

**Documentation**: See [docs/MODEL_DATABASE_PROPOSAL.md](docs/MODEL_DATABASE_PROPOSAL.md) for detailed design.

### 5.1 Database Schema & Migration ✅ COMPLETED
- [x] Design `models` table schema with JSON support (Turso/libSQL)
- [x] Add `models` table to Drizzle schema (`src/db/schema.ts`)
- [x] Generate Drizzle migration: `pnpm run db:generate`
- [x] Apply migration to database: `pnpm run db:migrate`
- [x] Create seed script to populate models from existing files
- [x] Verify data integrity and JSON field queries

### 5.2 Function Registry Pattern ✅ COMPLETED
- [x] Create `src/shared/modelFunctions/registry.ts` for function lookup
- [x] Extract transformation functions from model classes:
  - [x] `applyImage` functions (Gemini, Veo, etc.)
  - [x] `postCalcPrice` functions
  - [x] `validateParams` functions
- [x] Implement function registry pattern with TypeScript types
- [x] Add function execution wrapper with error handling

### 5.3 Model Service Layer ✅ COMPLETED
- [x] Create `src/services/modelService.ts` for database queries
- [x] Implement model loading with function resolution:
  - [x] `getModelById(id)` - Single model lookup
  - [x] `listModels(filters)` - List with status/type filtering
  - [x] `getActiveModels(type)` - Only active models
- [x] Add model cache layer (reduce DB queries)
- [x] Implement model validation logic

### 5.4 Update Existing Services
- [ ] Update `GET /v1/models` endpoint to query database
- [ ] Modify `providerSelector.ts` to use database models
- [ ] Update `imageService.ts` to load models from DB
- [ ] Update `videoService.ts` to load models from DB
- [ ] Add model status checks in generation endpoints

### 5.5 Data Migration & Seeding ✅ COMPLETED
- [x] Create migration script: `src/db/seeds/migrateModelsToDb.ts`
- [x] Migrate all Google image models (13 models)
- [x] Migrate all Google video models (4 models)
- [x] Migrate all Runware models (5 models)
- [x] Verify all model data is correctly transferred (**22 models total**)
- [ ] Test pricing calculations with DB models

### 5.6 Testing & Validation
- [ ] Test model loading from database
- [ ] Test function registry execution
- [ ] Verify pricing calculations work correctly
- [ ] Test model enable/disable functionality
- [ ] Integration tests for all endpoints
- [ ] Performance testing (cache effectiveness)

### 5.7 Admin Interface (Optional)
- [ ] Create `POST /admin/models` - Add new model
- [ ] Create `PATCH /admin/models/:id` - Update model
- [ ] Create `PUT /admin/models/:id/status` - Change status
- [ ] Create `DELETE /admin/models/:id` - Soft delete
- [ ] Add bulk import/export endpoints
- [ ] Create simple web UI for model management

### 5.8 Documentation & Cleanup
- [ ] Update API documentation with model management
- [ ] Document function registry pattern
- [ ] Create guide for adding new models via database
- [ ] Archive old model files (keep for reference)
- [ ] Update CLAUDE.md with new architecture

**Phase 5 Benefits**:
- ✅ Add new models without code deployment
- ✅ Instant enable/disable models via status field
- ✅ Dynamic pricing updates
- ✅ A/B testing with beta status
- ✅ Centralized model management

**Phase 5 Target**: Complete database-driven model system (2 weeks)

**Schema Highlights**:
```sql
CREATE TABLE models (
  id TEXT PRIMARY KEY,           -- 'google/gemini-2.5-flash'
  name TEXT NOT NULL,            -- 'Gemini 2.5 Flash'
  slug TEXT UNIQUE NOT NULL,     -- 'gemini-25-flash'
  type TEXT NOT NULL,            -- 'image' | 'video'
  status TEXT DEFAULT 'active',  -- 'active' | 'inactive' | 'deprecated' | 'beta'
  providers TEXT NOT NULL,       -- JSON array
  capabilities TEXT DEFAULT '{}',-- JSON object
  applyImageFn TEXT,             -- Function reference
  postCalcPriceFn TEXT,          -- Function reference
  tags TEXT DEFAULT '[]',        -- JSON array
  created_at INTEGER,
  updated_at INTEGER
);
```

---

## 📊 Migration Metrics

### Success Criteria for Each Phase
- [ ] All endpoints return correct responses
- [ ] Response times ≤ Express version performance
- [ ] Error rates < 1% for valid requests
- [ ] All tests passing
- [ ] Documentation updated

### Rollback Plan
- Express version no longer maintained (Hono is primary)
- Database schema is forward-compatible
- Quick rollback via Cloudflare Workers versioning
- R2 storage is shared between versions

---

## 🔧 Technical Notes

### Cloudflare Workers Limitations to Address
- 128MB memory limit per request
- 10ms CPU time limit (without Unbound)
- No Node.js filesystem APIs
- Different environment variable access patterns
- Different error handling patterns

### Provider Scope
- **In Scope:** Google (Gemini, Imagen, Veo) and Runware
- **Out of Scope:** All other providers (Bytedance, OpenAI, Stability AI, Black Forest Labs, FAL, Replicate, etc.)
- Provider selection logic will fallback between Google and Runware based on API key availability

---

**Total Models Supported:**
- **Phase 2 (Google):** 18 models (14 image + 4 video) ✅ COMPLETED
- **Phase 3 (Runware):** 5+ image models (to be verified)
- **Total:** 23+ models across Google and Runware providers

**Estimated Timeline:**
- Phase 1: ✅ 1-2 weeks (COMPLETED)
- Phase 2: ✅ 2-3 weeks (COMPLETED)
- Phase 3: 3-5 days (Runware verification & testing)
- Phase 4: 1 week (Production readiness)
- Phase 5: 2 weeks (Database-driven model management) **NEW**

---

## 🎉 Recent Accomplishments (October 2025)

### R2 Storage Enhancement ✅ COMPLETED
- **CUID Implementation**: All files now use CUID for unique, collision-resistant filenames instead of user IDs
- **Date-based Organization**: Files are organized in structured folders:
  - Images: `/images/YYYY/MM/DD/[cuid].ext`
  - Videos: `/videos/YYYY/MM/DD/[cuid].ext`
- **Native R2 Integration**: Removed AWS SDK compatibility issues, using pure Cloudflare R2 APIs
- **Database Storage**: All generated images/videos are stored in R2 and URLs are saved to `api_usage.outputUrls` (JSON array)
- **Database Middleware**: Fixed TypeScript typing and environment variable handling for Workers deployment
- **Testing**: Fully tested with working image generation API returning properly structured URLs

### Database Storage for Generated Assets ✅ COMPLETED
- **Schema Implementation**: `api_usage.outputUrls` field stores JSON array of R2 URLs
- **No Base64 Responses**: All responses return URLs instead of base64 data
- **Async Task Integration**: Task polling returns stored URLs from database
- **Usage Logging**: Every generation is logged with output URLs, cost, speed, and provider info

### Working Example:
```
https://81cac75fe318d80f4344481afc4799ac.r2.cloudflarestorage.com/images/2025/09/25/cmfyuksaf000000ijet1iryyg.png
```

---

**Current Status**: Phase 1 and Phase 2 are fully complete. Database storage for generated assets is implemented - all images/videos are stored in R2 with URLs saved to `api_usage.outputUrls` field. Tasks return URLs instead of base64 data. Ready for Phase 3 (Runware verification), Phase 4 (Production readiness), and Phase 5 (Database-driven models).

**New Addition**: **Phase 5** introduces database-driven model management, eliminating the need for code deployments when adding/updating models. See [docs/MODEL_DATABASE_PROPOSAL.md](docs/MODEL_DATABASE_PROPOSAL.md) for full design details.

**Scope Note**: This migration focuses exclusively on **Google** and **Runware** providers. All other providers (Bytedance, OpenAI, Stability AI, Black Forest Labs, etc.) are out of scope for this implementation.
