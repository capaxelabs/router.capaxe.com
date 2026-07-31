# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ImageRouter is a unified proxy API providing OpenAI-compatible endpoints for AI image and video generation. It abstracts multiple provider APIs behind a single interface with authentication, billing, storage, and async task processing.

**Stack:** Cloudflare Workers + Hono framework + Drizzle ORM + Cloudflare D1 (via the `DB` binding) + R2 storage + Cloudflare Queues

**Providers:** Cloudflare AI only. All inference goes through the `env.AI` binding + AI Gateway ([src/services/cloudflareAI.ts](src/services/cloudflareAI.ts)): Workers AI models (`@cf/...`, Workers AI pricing) and third-party catalog models (`{author}/{model}` e.g. `google/veo-3.1`, billed via Cloudflare Unified Billing). No provider API keys. Direct provider integrations (Gemini, Vertex, OpenAI, Anthropic, Runware, Replicate) were removed.

## Development Commands

```bash
npm run dev                 # Start Cloudflare Workers dev server (localhost:8787)
npm run cf-typegen          # Regenerate TypeScript types for Cloudflare bindings

# Database
npm run db:generate         # Generate migration files from schema changes
npm run db:migrate          # Apply migrations
npm run db:studio           # Open Drizzle Studio (localhost:4983)
npm run db:seed             # Seed test data
npm run db:seed-models      # Migrate model definitions into database

# Deploy
npx wrangler deploy --minify  # Deploy to production (no deploy script in package.json)
```

Local secrets go in `.dev.vars` (see `.dev.vars.example`).

## Architecture

### Entry Point & Request Flow

[src/index.ts](src/index.ts) creates a typed Hono app with `CloudflareBindings` and `ContextVariables`. It exports two handlers:
- `fetch` — the Hono HTTP handler
- `queue` — lazy-imports [src/services/queueConsumer.ts](src/services/queueConsumer.ts) for background processing

**Global middleware order** (applied to all routes):
1. `requestLogger` → `errorHandler` → `corsMiddleware` → `securityHeaders`
2. `generalLimiter` (20 req/sec in-memory)
3. `getDb()` — injects Drizzle DB instance via `c.set('db', db)` / `c.get('db')`

### Async-Only Generation

All generation endpoints are async-only. There is no sync mode in the current implementation.

```
POST /v1/images/generations → { taskId, status: 'pending' }
POST /v1/videos/generations → { taskId, estimatedCompletionTime }
GET  /v1/tasks/:taskId      → { status, progress, result?, error? }
```

**Flow:** Route handler validates request → creates `api_usage` record with `taskStatus: 'pending'` → sends queue message (containing only `taskId`) → returns immediately → queue consumer fetches full task from DB → calls provider → uploads result to R2 → updates `api_usage` with `outputUrls` and `taskStatus: 'completed'`

Queue messages are intentionally minimal (just `taskId`) to stay within Cloudflare Queue size limits. The consumer re-hydrates from the database.

### API Routes

| Mount | Module | Purpose |
|-------|--------|---------|
| `GET /healthz` | inline | Health check |
| `/v1/models` | [src/routes/models.ts](src/routes/models.ts) | Model listing from DB |
| `/v1/images` | [src/routes/images.ts](src/routes/images.ts) | Image generation, editing, user list |
| `/v1/videos` | [src/routes/videos.ts](src/routes/videos.ts) | Video generation, proxy, user list |
| `/v1/tasks` | [src/routes/tasks.ts](src/routes/tasks.ts) | Task status, list, stats, cancel |
| `/v1/media` | [src/routes/media.ts](src/routes/media.ts) | Unified image+video gallery |
| `/v1/chat` | [src/routes/chat.ts](src/routes/chat.ts) | OpenAI-compatible chat proxy via `env.AI.run()` |
| `/tasks` | [src/routes/tasksPage.ts](src/routes/tasksPage.ts) | Tasks web UI (HTML) |

Static SPA assets in `public/` are served via Cloudflare Workers Assets (configured in `wrangler.jsonc`).

### DB-Driven Model System

Models are stored in the `models` database table, not in TypeScript files. The old file-based model classes in `src/shared/imageModels/` and `src/shared/videoModels/` are legacy; the DB is the source of truth.

**Key components:**
- [src/services/modelService.ts](src/services/modelService.ts) — `ModelService` with 5-minute in-memory cache. Factory: `getModelService(db)` (creates new instance per request, no singletons in serverless)
- [src/shared/modelFunctions/registry.ts](src/shared/modelFunctions/registry.ts) — `MODEL_FUNCTIONS` maps string names to actual functions. DB model rows store function names as strings (e.g., `applyImageFn: 'gemini25FlashApplyImage'`); `hydrateModel()` resolves these to live function references.
- [src/shared/priceCalculator.ts](src/shared/priceCalculator.ts) — `setModelsCache(models)` must be called before `preCalcPrice()`/`postCalcPrice()`. The queue consumer does this before each task.

**Adding a new model:** Insert a row into the `models` table (via admin API or seed script). If the model needs custom behavior, add a function to `MODEL_FUNCTIONS` registry and reference it by name in the DB row.

### Authentication

[src/middleware/apiKeyMiddleware.ts](src/middleware/apiKeyMiddleware.ts) supports two auth modes based on Bearer token format:
- **64-char hex string** → API key lookup (joins `api_keys` + `users` tables)
- **JWT (dot-separated)** → HS256 HMAC verification via Web Crypto API against `JWT_SECRET`

Admin endpoints use `ADMIN_API_KEY` header check + in-memory rate limiting (60 req/min per IP) in [src/middleware/adminAuth.ts](src/middleware/adminAuth.ts).

### Storage

[src/lib/storage.ts](src/lib/storage.ts) — `R2StorageService` uses AWS Signature V4 over R2's S3-compatible REST API (not the Workers R2 binding directly). This works from both Workers and queue consumers.

- CUID-based filenames: `images/YYYY/MM/DD/[cuid].ext` or `videos/YYYY/MM/DD/[cuid].ext`
- Public URLs: `https://{R2_CUSTOM_PUBLIC_URL}/images/...`
- Factory: `createStorageService(...)` returns `null` if credentials are missing
- All generation output must be uploaded to R2; never return base64 directly

### Cloudflare AI

[src/services/cloudflareAI.ts](src/services/cloudflareAI.ts) — `runModel(env, model, inputs)` wraps `env.AI.run()` with the AI Gateway option (`CF_AI_GATEWAY_ID`, defaults to `default`). Catalog models return `{ state, result: {...} }`; non-completed states are surfaced as errors.

### Service Layer

- [src/services/imageService.ts](src/services/imageService.ts) — `generateImage()`: loads model from DB, runs it via `runModel()`, normalizes base64/URL/binary-stream responses
- [src/services/videoService.ts](src/services/videoService.ts) — `generateVideo()`: runs catalog video models (e.g. `google/veo-3.1`) via `runModel()`; the binding waits for completion and returns a URL which is re-uploaded to R2. No operation polling.
- [src/services/queueConsumer.ts](src/services/queueConsumer.ts) — Must initialize model cache (`setModelsCache()`) and create a mock Hono context with DB instance before calling generation functions
- [src/services/queueService.ts](src/services/queueService.ts) — `QueueService` class for task CRUD, polling, and status updates
- [src/services/usageLogger.ts](src/services/usageLogger.ts) — Logs every generation to `api_usage` table

### Database Schema

Defined in [src/db/schema.ts](src/db/schema.ts). Four tables:

- **users** — `id`, `credits` (in 1e-4 USD units), timestamps
- **api_keys** — `id`, `key` (unique 64-char hex), `userId` (FK), `isActive`
- **api_usage** — `id`, `taskId` (prefixed: `img_` or `vid_`), `taskStatus` (`pending`/`processing`/`completed`/`failed`), `outputUrls` (JSON array of R2 URLs), `cost` (integer, `price * 10000`), `model`, `provider`, `prompt`, `metadata` (JSON), timestamps
- **models** — `id` (e.g., `google/gemini-2.5-flash`), `type` (`image`/`video`), `status`, `providers` (JSON), `capabilities` (JSON), function name fields (`applyImageFn`, etc.)

### Pricing

Three types in [src/shared/PricingScheme.ts](src/shared/PricingScheme.ts):
- `FIXED` — flat rate
- `CALCULATED` — based on request parameters
- `POST_GENERATION` — determined after completion (e.g., video duration)

Cost stored as `cost * 10000` (integer) for precision.

## Cloudflare Workers Constraints

- No Node.js filesystem APIs (`fs`, `path`), no `child_process`
- Use `fetch()` for HTTP, native `crypto` API, Drizzle ORM (not Prisma)
- Access env vars via `c.env.*` in Hono context
- Queue consumer has same CPU time limits; long operations must be re-queued
- Rate limiters are in-memory per-isolate (not distributed)

## Environment Variables

**Required:** `JWT_SECRET`, `ADMIN_API_KEY`. The database is the D1 `DB` binding in `wrangler.jsonc` (no credentials). Apply migrations with `wrangler d1 execute imagerouter --remote --file=drizzle/<migration>.sql`, or `npm run db:migrate` after setting `CLOUDFLARE_D1_TOKEN`.

**R2:** `R2_BUCKET_NAME`, `R2_CUSTOM_PUBLIC_URL`, plus `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` for S3 API auth

**AI:** the `AI` binding in `wrangler.jsonc` (no API keys). Optional `CF_AI_GATEWAY_ID` to route through a specific AI Gateway (defaults to `default`).

## Key Patterns to Follow

- **No singletons** — serverless workers don't persist state between requests. Use factory functions (`getModelService(db)`, `createStorageService(...)`)
- **Queue consumer must init model cache** — call `setModelsCache()` before any generation function
- **Minimal queue messages** — only send `taskId`; consumer fetches everything from DB
- **Always upload to R2** — never return base64 to clients
- **CUID for filenames** — never use user IDs in file paths
- **Task ID prefixes** — `img_` for images, `vid_` for videos

## Migration Status

See [TODO.md](TODO.md) for full details. Phases 1-2 complete (foundation + Google models). Phase 5 (DB-driven models) is partially complete. All previously-reported critical bugs (Vertex AI auth, queue consumer cache, mock tokens, JWT validation) have been fixed.
