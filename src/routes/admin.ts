import { Hono } from 'hono'
import { desc, like, and, eq } from 'drizzle-orm'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { adminAuthWithRateLimit } from '../middleware/adminAuth'
import { apiUsage } from '../db/schema'

const admin = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

admin.use('/calls', adminAuthWithRateLimit)
admin.use('/auth/verify', adminAuthWithRateLimit)

// GET /admin/auth/verify - validates the admin key (middleware rejects bad keys)
admin.get('/auth/verify', (c) => c.json({ success: true }))

/**
 * GET /admin/calls - recent API calls with stored request/response metadata.
 * Query: limit (default 50, max 200), type (chat|img|vid), status (success|error|pending)
 */
admin.get('/calls', async (c) => {
  const db = c.get('db')
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200)
  const type = c.req.query('type')
  const status = c.req.query('status')

  const conditions = []
  if (type) conditions.push(like(apiUsage.taskId, `${type}_%`))
  if (status) conditions.push(eq(apiUsage.status, status))

  try {
    const rows = await db
      .select()
      .from(apiUsage)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(apiUsage.createdAt))
      .limit(limit)

    const calls = rows.map((r: any) => {
      let metadata = null
      try { metadata = r.metadata ? JSON.parse(r.metadata) : null } catch { /* keep null */ }
      let outputUrls: string[] = []
      try { outputUrls = JSON.parse(r.outputUrls || '[]') } catch { /* keep empty */ }

      return {
        id: r.id,
        taskId: r.taskId,
        createdAt: r.createdAt,
        model: r.model,
        provider: r.provider,
        prompt: r.prompt,
        cost: (r.cost || 0) / 10000, // back to USD
        speedMs: r.speedMs,
        status: r.status,
        taskStatus: r.taskStatus,
        error: r.error,
        outputUrls,
        metadata,
      }
    })

    return c.json({ success: true, calls })
  } catch (error) {
    console.error('Error fetching calls:', error)
    return c.json({ success: false, error: { message: 'Failed to fetch calls', type: 'internal_error' } }, 500)
  }
})

export default admin
