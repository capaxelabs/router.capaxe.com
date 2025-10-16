/**
 * External webhook-based async processing
 * Simple approach: trigger external service to process tasks
 */

import { Context } from 'hono'
import { CloudflareBindings, ContextVariables } from '../types/env'

/**
 * Trigger external processing via webhook/HTTP call
 * This approach sends the task to an external service that processes it
 */
export async function triggerExternalProcessing(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  taskId: string,
  type: 'image' | 'video',
  userId: string,
  request: any
): Promise<void> {
  const webhookUrl = c.env.ASYNC_WEBHOOK_URL
  
  if (!webhookUrl) {
    throw new Error('ASYNC_WEBHOOK_URL not configured')
  }

  const payload = {
    taskId,
    type,
    userId,
    request,
    timestamp: Date.now(),
    callbackUrl: `${c.env.PUBLIC_URL}/v1/tasks/${taskId}/callback`,
    env: {
      // Only pass necessary env vars to external service
      GEMINI_API_KEY: c.env.GEMINI_API_KEY,
      TURSO_DATABASE_URL: c.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: c.env.TURSO_AUTH_TOKEN,
      R2_BUCKET_NAME: c.env.R2_BUCKET_NAME,
      R2_CUSTOM_PUBLIC_URL: c.env.R2_CUSTOM_PUBLIC_URL,
    }
  }

  // Fire and forget - don't wait for response
  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${c.env.ASYNC_WEBHOOK_SECRET || 'webhook-secret'}`
    },
    body: JSON.stringify(payload)
  }).catch(error => {
    console.error('Failed to trigger external processing:', error)
  })
}

/**
 * Handle callback from external processor
 * The external service calls this when task is complete
 */
export async function handleProcessingCallback(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  taskId: string,
  result: {
    status: 'completed' | 'failed'
    data?: any
    error?: string
    cost?: number
    latency?: number
  }
): Promise<Response> {
  try {
    // Verify webhook signature/auth
    const authHeader = c.req.header('authorization')
    const expectedAuth = `Bearer ${c.env.ASYNC_WEBHOOK_SECRET || 'webhook-secret'}`
    
    if (authHeader !== expectedAuth) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // Update task in database
    const { createDatabase } = await import('../db')
    const { apiUsage } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = createDatabase({
      TURSO_DATABASE_URL: c.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: c.env.TURSO_AUTH_TOKEN
    })

    const updateData: any = {
      taskStatus: result.status,
      taskProgress: result.status === 'completed' ? 100 : 0,
      taskCompletedAt: Math.floor(Date.now() / 1000),
      status: result.status,
      updatedAt: new Date()
    }

    if (result.status === 'completed' && result.data) {
      updateData.outputUrls = JSON.stringify(
        result.data.data?.map((item: any) => item.url || item.b64_json) || []
      )
      updateData.cost = Math.round((result.cost || 0) * 10000)
      updateData.speedMs = result.latency || 0
    }

    if (result.status === 'failed') {
      updateData.error = result.error
    }

    await db
      .update(apiUsage)
      .set(updateData)
      .where(eq(apiUsage.taskId, taskId))

    return c.json({ success: true })

  } catch (error) {
    console.error('Failed to handle processing callback:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

/**
 * Simple external processor (could be deployed as separate worker or service)
 * This is what the external webhook would look like
 */
export async function externalProcessorHandler(request: Request): Promise<Response> {
  try {
    const payload = await request.json()
    const { taskId, type, userId, request: taskRequest, env, callbackUrl } = payload

    // Process the task
    let result: any
    if (type === 'image') {
      // Import and run image generation
      result = await processExternalImageTask(taskRequest, userId, env)
    } else {
      // Import and run video generation  
      result = await processExternalVideoTask(taskRequest, userId, env)
    }

    // Call back to main service
    await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('authorization') || ''
      },
      body: JSON.stringify({
        status: 'completed',
        data: result,
        cost: result.cost,
        latency: result.latency
      })
    })

    return new Response(JSON.stringify({ success: true }))

  } catch (error) {
    console.error('External processing failed:', error)
    
    // Try to callback with error
    try {
      const payload = await request.json()
      await fetch(payload.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('authorization') || ''
        },
        body: JSON.stringify({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        })
      })
    } catch (callbackError) {
      console.error('Failed to callback with error:', callbackError)
    }

    return new Response(JSON.stringify({ error: 'Processing failed' }), { status: 500 })
  }
}

async function processExternalImageTask(request: any, userId: string, env: any): Promise<any> {
  // This would import the generation service and run it
  // Implementation details would be similar to the queue processor
  return { data: [], cost: 0, latency: 0 } // Placeholder
}

async function processExternalVideoTask(request: any, userId: string, env: any): Promise<any> {
  // Similar to image processing
  return { data: [], cost: 0, latency: 0 } // Placeholder
}