/**
 * One-time export of Turso data to SQL for import into D1.
 * Usage: tsx drizzle/migrate-turso-to-d1.ts > /dev/null (writes drizzle/turso-export.sql)
 * Then: wrangler d1 execute imagerouter --remote --file=drizzle/turso-export.sql
 */
import { createClient } from '@libsql/client'
import { writeFileSync } from 'node:fs'
import 'dotenv/config'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'bigint') return v.toString()
  return `'${String(v).replace(/'/g, "''")}'`
}

async function main() {
  const tables = ['users', 'api_keys', 'api_usage']
  const lines: string[] = []

  for (const table of tables) {
    const result = await client.execute(`SELECT * FROM ${table}`)
    console.log(`${table}: ${result.rows.length} rows`)
    const cols = result.columns
    for (const row of result.rows) {
      const values = cols.map((c) => sqlValue(row[c]))
      lines.push(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
    }
  }

  writeFileSync('drizzle/turso-export.sql', lines.join('\n') + '\n')
  console.log(`Wrote ${lines.length} statements to drizzle/turso-export.sql`)
}

main()
