import { defineConfig } from 'drizzle-kit'

// Migrations run against Cloudflare D1.
// db:generate needs no credentials. For db:migrate / db:studio via d1-http,
// set CLOUDFLARE_D1_TOKEN (an API token with D1 edit permission) in .env.
// Alternative without a token: wrangler d1 execute imagerouter --remote --file=drizzle/<migration>.sql
export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '81cac75fe318d80f4344481afc4799ac',
    databaseId: process.env.CLOUDFLARE_DATABASE_ID || '2d9212ff-9135-4ea0-9d2d-76de2a78f641',
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
})
