import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

export function createDatabase(env: { TURSO_DATABASE_URL: string; TURSO_AUTH_TOKEN: string }) {
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  })
  
  return drizzle(client, { schema })
}

export type Database = ReturnType<typeof createDatabase>
export * from './schema'