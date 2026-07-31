import { CloudflareBindings } from '../types/env'

/**
 * Options passed to every env.AI.run() call so requests route through
 * AI Gateway. Uses CF_AI_GATEWAY_ID, or the auto-created 'default' gateway.
 */
export function aiRunOptions(env: CloudflareBindings): { gateway: { id: string } } {
  return { gateway: { id: env.CF_AI_GATEWAY_ID || 'default' } }
}

/**
 * Run any model through the Cloudflare AI binding.
 * Accepts Workers AI models ('@cf/...') and third-party catalog models
 * ('{author}/{model}', billed via Unified Billing - no provider keys).
 */
export async function runModel(
  env: CloudflareBindings,
  model: string,
  inputs: Record<string, any>
): Promise<any> {
  if (!env.AI) {
    throw new Error('AI binding not configured. Add { "ai": { "binding": "AI" } } to wrangler.jsonc')
  }

  const response = await (env.AI as any).run(model, inputs, aiRunOptions(env))

  // Catalog models report task state; surface failures as errors
  if (response && typeof response === 'object' && 'state' in response) {
    const state = String(response.state).toLowerCase()
    if (state !== 'completed' && state !== 'succeeded') {
      throw new Error(`Cloudflare AI task not completed (state: ${response.state}): ${JSON.stringify(response.result || response.error || {})}`)
    }
  }

  return response
}
