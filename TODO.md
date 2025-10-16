# ImageRouter Express to Hono Migration Plan

## Migration Strategy

This document outlines the phased migration from Express to Hono, focusing on Google and Bytedance models first, followed by other providers. Each phase builds incrementally to ensure stable functionality.

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
- [x] `POST /v1/openai/images/generations` (Google models only)
- [x] `POST /v1/openai/images/edits` (Google models only)
- [x] `POST /v1/openai/videos/generations` (Google models only)
- [x] `GET /v1/models` (Google models only)

### 2.5 Testing & Validation ✅
- [x] Create tests for Google image models
- [x] Create tests for Google video models
- [x] Test Google authentication flow
- [x] Test file upload with Google models
- [x] Performance testing for Google endpoints

**Phase 2 Status**: ✅ **COMPLETED** - All Google models are fully implemented and tested with R2 storage integration including CUID filenames and date-based folder organization

---

## 🎭 Phase 3: Bytedance Models Migration

### 3.1 Bytedance Image Models (6 models)
- [ ] `bytedance/dreamina-3.1.js`
- [ ] `bytedance/infiniteyou-free.js`
- [ ] `bytedance/infiniteyou.js`
- [ ] `bytedance/seededit-v3.js`
- [ ] `bytedance/seedream-v3.js`
- [ ] `bytedance/seedream-v4.js`

### 3.2 Bytedance Video Models (2 models)
- [ ] `bytedance/seedance-1-lite.js`
- [ ] `bytedance/seedance-1-pro.js`

### 3.3 Bytedance Integration Services
- [ ] Migrate FAL API integration for Bytedance models
- [ ] Migrate Runware API integration for Bytedance models
- [ ] Migrate WaveSpeed API integration for Bytedance models
- [ ] Update parameter validation for Bytedance models
- [ ] Handle image-to-video functionality for Bytedance

### 3.4 Extended API Endpoints
- [ ] Update `POST /v1/openai/images/generations` (add Bytedance models)
- [ ] Update `POST /v1/openai/images/edits` (add Bytedance models)
- [ ] Update `POST /v1/openai/videos/generations` (add Bytedance models)
- [ ] Update `GET /v1/models` (add Bytedance models)

### 3.5 Testing & Validation
- [ ] Create tests for Bytedance image models
- [ ] Create tests for Bytedance video models
- [ ] Test multiple provider fallback logic
- [ ] Integration tests for Google + Bytedance combined
- [ ] Load testing with both provider sets

---

## 🌟 Phase 4: Advanced Features & Optimization

### 4.1 Advanced Functionality
- [ ] Implement proper error handling and retries
- [ ] Add request/response logging and analytics
- [ ] Set up usage tracking and billing
- [ ] Implement caching where appropriate
- [ ] Add request queuing for high-load scenarios

### 4.2 Monitoring & Observability  
- [ ] Set up Cloudflare Workers analytics
- [ ] Implement health check endpoints
- [ ] Add performance monitoring
- [ ] Set up error reporting and alerting
- [ ] Create dashboards for model usage

### 4.3 Documentation & Deployment
- [ ] Update API documentation
- [ ] Create deployment workflows
- [ ] Set up staging environment
- [ ] Production deployment checklist
- [ ] Performance benchmarking vs Express version

---

## 🔄 Phase 5: Future Extensions (Other Models)

### 5.1 High-Priority Providers
- [ ] **OpenAI Models** (3 models)
  - `openai/dall-e-2.js`
  - `openai/dall-e-3.js`
  - `openai/gpt-image-1.js`

- [ ] **Black Forest Labs** (10 models)
  - All FLUX variants

- [ ] **Stability AI** (7 models)  
  - All Stable Diffusion variants

### 5.2 Medium-Priority Providers
- [ ] **Ideogram AI** (6 models)
- [ ] **RunDiffusion** (5 models)
- [ ] **Runware** (5 models)
- [ ] **KwaiVGI** (4 video models)
- [ ] **HiDream AI** (5 models)

### 5.3 Lower-Priority Providers
- [ ] **Recraft AI** (3 models)
- [ ] **Minimax** (3 models)
- [ ] **Qwen** (2 models)
- [ ] **Luma** (2 models)
- [ ] **Lodestones** (2 models)
- [ ] **xAI** (1 model)

---

## 📊 Migration Metrics

### Success Criteria for Each Phase
- [ ] All endpoints return correct responses
- [ ] Response times ≤ Express version performance
- [ ] Error rates < 1% for valid requests
- [ ] All tests passing
- [ ] Documentation updated

### Rollback Plan
- Maintain Express version running in parallel
- Use feature flags for gradual traffic migration
- Database compatibility maintained between versions
- Quick rollback procedure documented

---

## 🔧 Technical Notes

### Cloudflare Workers Limitations to Address
- 128MB memory limit per request
- 10ms CPU time limit (without Unbound)
- No Node.js filesystem APIs
- Different environment variable access patterns
- Different error handling patterns

### Database Migration Strategy
- Run Drizzle and Prisma in parallel initially
- Sync data between both systems
- Gradual migration of endpoints
- Final cutover after validation

---

**Total Models to Migrate:**
- **Phase 2 (Google):** 18 models (14 image + 4 video)
- **Phase 3 (Bytedance):** 8 models (6 image + 2 video)
- **Phase 5 (Future):** 50+ additional models from other providers

**Estimated Timeline:** 
- Phase 1: ✅ 1-2 weeks (COMPLETED)
- Phase 2: ✅ 2-3 weeks (COMPLETED)
- Phase 3: 1-2 weeks  
- Phase 4: 1-2 weeks
- Phase 5: 4-6 weeks (ongoing)

---

## 🎉 Recent Accomplishments (September 2025)

### R2 Storage Enhancement ✅ COMPLETED
- **CUID Implementation**: All files now use CUID for unique, collision-resistant filenames instead of user IDs
- **Date-based Organization**: Files are organized in structured folders:
  - Images: `/images/YYYY/MM/DD/[cuid].ext`
  - Videos: `/videos/YYYY/MM/DD/[cuid].ext`
- **Native R2 Integration**: Removed AWS SDK compatibility issues, using pure Cloudflare R2 APIs
- **Database Middleware**: Fixed TypeScript typing and environment variable handling for Workers deployment
- **Testing**: Fully tested with working image generation API returning properly structured URLs

### Working Example:
```
https://81cac75fe318d80f4344481afc4799ac.r2.cloudflarestorage.com/images/2025/09/25/cmfyuksaf000000ijet1iryyg.png
```

**Current Status**: Phase 1 and Phase 2 are fully complete. Ready for Phase 3 (Bytedance models) implementation.