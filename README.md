# ImageRouter Hono - Phase 1 Complete

This is the Cloudflare Workers/Hono version of ImageRouter API, currently in Phase 1 of migration.

## Phase 1 - Infrastructure ✅

The foundation infrastructure has been completed:

- ✅ Drizzle ORM with libSQL/Turso database
- ✅ Cloudflare Workers environment configuration  
- ✅ Database schema migration (Prisma → Drizzle)
- ✅ Environment variables setup
- ✅ R2 storage configuration
- ✅ Core services migration (PricingScheme, imageHelpers, providerSelector, storageService)
- ✅ File upload handling (Cloudflare Workers compatible)
- ✅ API key middleware with JWT support
- ✅ Rate limiting system
- ✅ Request validation utilities
- ✅ CORS and security headers

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Configure Turso database:**
   ```bash
   # Create a Turso database
   turso db create imagerouter-hono
   
   # Get the database URL and auth token
   turso db show imagerouter-hono --url
   turso db tokens create imagerouter-hono
   
   # Update wrangler.jsonc with database IDs (optional for D1)
   ```

4. **Generate database schema:**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **Run development server:**
   ```bash
   npm run dev
   ```

## Project Structure

```
src/
├── db/                     # Database schema and connection
│   ├── schema.ts          # Drizzle schema (Users, APIKeys, APIUsage)
│   └── index.ts           # Database connection setup
├── lib/                   # Core utilities
│   ├── imageHelpers.ts    # Image processing utilities
│   ├── storage.ts         # R2 storage service
│   └── validation.ts      # Request validation schemas
├── middleware/            # Hono middleware
│   ├── apiKeyMiddleware.ts    # API key authentication
│   ├── rateLimiting.ts        # Rate limiting system
│   ├── security.ts            # CORS, security headers
│   └── uploadMiddleware.ts    # File upload handling
├── shared/                # Shared utilities
│   └── PricingScheme.ts   # Pricing type constants
├── types/                 # TypeScript types
│   └── env.ts             # Environment bindings
├── utils/                 # Utility functions
│   └── providerSelector.ts   # Provider selection logic
└── index.ts               # Main application entry point
```

## Supported Providers

Currently supporting **Google** and **Runware** providers:

- **Google Image Models:** 13 models (Gemini 2.0/2.5, Imagen 3/4 series)
- **Runware Image Models:** 5 models (CyberRealistic-Pony, DreamShaper, Realistic-Vision, RealVisXL, RMBG-2.0)
- **Google Video Models:** 4 models (Veo 2/3 series)
- **Runware Video Models:** 5 models (KlingAI 2.1 Master/Pro/Standard, MiniMax Hailuo 02, PixVerse V5)

**Total:** 27 models across 2 providers

## Adding New Models

### Adding a Google Model

To add a new Google image or video model:

1. **Create model file** in the appropriate directory:
   - **Images:** `src/shared/imageModels/google/your-model-name.ts`
   - **Videos:** `src/shared/videoModels/google/your-model-name.ts`

2. **Model file structure:**
   ```typescript
   import { PRICING_TYPES } from '../../PricingScheme'
   import { ModelData } from './imagen-3'

   class YourModelName {
     data: ModelData

     constructor() {
       this.data = {
         id: 'google/your-model-name',
         providers: [{
           id: 'gemini',  // or 'vertex', 'geminiImagen'
           model_name: 'actual-api-model-name',
           pricing: {
             type: PRICING_TYPES.FIXED,  // or CALCULATED, POST_GENERATION
             value: 0.01,
           },
           // Optional: Add transform functions if needed
           applyImage: this.applyImage,
           applyQuality: this.applyQuality,
         }],
         arena_score: 1200,
         release_date: '2024-01-01',
         examples: []
       }
     }

     getData(): ModelData {
       return this.data
     }
   }

   export default YourModelName
   ```

3. **Export from index.ts** in `src/shared/imageModels/google/index.ts` or `src/shared/videoModels/google/index.ts`:
   ```typescript
   import YourModelName from './your-model-name'
   
   export const googleImageModels = {
     // ... existing models
     'google/your-model-name': new YourModelName().getData(),
   }
   
   export {
     // ... existing exports
     YourModelName
   }
   ```

4. **That's it!** The model is automatically integrated into:
   - Model listing API (`GET /v1/models`)
   - Usage tracking system
   - Price calculator
   - Generation endpoints

### Adding a Runware Model

To add a new Runware image or video model:

1. **Create model file** in the appropriate directory:
   - **Images:** `src/shared/imageModels/runware/your-model-name.ts`
   - **Videos:** `src/shared/videoModels/runware/your-model-name.ts`

2. **Model file structure:**
   ```typescript
   import { PRICING_TYPES } from '../../PricingScheme'
   import { ModelData } from '../google/imagen-3'

   class YourModelName {
     data: ModelData

     constructor() {
       this.data = {
         id: 'runware/your-model-name',
         providers: [{
           id: 'runware',
           model_name: 'provider:model-id',  // Runware model identifier
           pricing: {
             type: PRICING_TYPES.FIXED,  // or POST_GENERATION
             value: 0.35,
             // For POST_GENERATION pricing:
             // postCalcFunction: postCalcSimple,
             // range: { min: 0.001, average: 0.002, max: 0.03 }
           },
         }],
         arena_score: 1150,
         release_date: '2024-01-01',
         examples: []
       }
     }

     getData(): ModelData {
       return this.data
     }
   }

   export default YourModelName
   ```

3. **Export from index.ts** in `src/shared/imageModels/runware/index.ts` or `src/shared/videoModels/runware/index.ts`:
   ```typescript
   import YourModelName from './your-model-name'
   
   export const runwareImageModels = {
     // ... existing models
     'runware/your-model-name': new YourModelName().getData(),
   }
   
   export {
     // ... existing exports
     YourModelName
   }
   ```

4. **That's it!** The model is automatically integrated into all systems.

### No Additional Configuration Required

Once you add a model to the shared directory and export it from the index file, it's automatically available in:

- **Model Listing:** `GET /v1/models` and `GET /models/ui`
- **Usage Logging:** Tracked in `api_usage` table
- **Price Calculator:** Automatic cost calculation
- **Generation Endpoints:** `POST /v1/openai/images/generations` or `/v1/openai/videos/generations`
- **Provider Selection:** Automatic routing to the correct provider

## Available Endpoints

- `GET /` - API information
- `GET /health` - Health check
- `GET /ip` - Client IP detection

## Development

```bash
# Development server
npm run dev

# Generate types for Cloudflare bindings
npm run cf-typegen

# Database operations
npm run db:generate  # Generate migrations
npm run db:migrate   # Apply migrations  
npm run db:studio    # Open Drizzle Studio

# Deploy
npm run deploy
```

## Technologies

- **Runtime:** Cloudflare Workers
- **Framework:** Hono.js
- **Database:** Turso (libSQL) with Drizzle ORM
- **Storage:** Cloudflare R2
- **Validation:** Zod
- **TypeScript:** Full type safety