/**
 * Temporary: mirror the Cloudflare model catalog into Turso so the
 * currently-deployed (pre-D1) worker lists correct models until the
 * D1 deploy lands. Deactivates old provider rows first.
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import 'dotenv/config'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

async function main() {
  const before = await client.execute("SELECT COUNT(*) as c FROM models WHERE status='active'")
  console.log(`active models before: ${before.rows[0].c}`)

  await client.execute("UPDATE models SET status='inactive'")

  const sql = readFileSync('drizzle/seed-cloudflare-models.sql', 'utf8')
  await client.executeMultiple(sql)

  const after = await client.execute("SELECT type, COUNT(*) as c FROM models WHERE status='active' GROUP BY type")
  for (const row of after.rows) console.log(`active ${row.type}: ${row.c}`)
}

main()
