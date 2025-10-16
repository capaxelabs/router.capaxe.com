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

## Next Steps - Phase 2

Ready to begin Phase 2 (Google Models Migration):
- Migrate Google image models (14 models)
- Migrate Google video models (4 models) 
- Set up Google Vertex AI integration
- Create image/video generation endpoints
- Add model listing endpoints

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