import { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { Database, users, apiUsage } from '../db'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { googleImageModels } from '../shared/imageModels/google'
import { googleVideoModels } from '../shared/videoModels/google'
import { runwareImageModels } from '../shared/imageModels/runware'
import { runwareVideoModels } from '../shared/videoModels/runware'
import { preCalcPrice, postCalcPrice, convertPriceToDbFormat } from '../shared/priceCalculator'
import { AuthenticatedUser } from '../middleware/apiKeyMiddleware'

const models: Record<string, any> = {
  ...googleImageModels,
  ...googleVideoModels,
  ...runwareImageModels,
  ...runwareVideoModels
}

export interface UsageLogEntry {
  id: string
  cost: number
  model: string
  provider: string
}

export interface GenerationParams {
  model: string
  prompt: string
  size?: string
  quality?: string
  duration?: number
  n?: number
  [key: string]: any
}

/**
 * Pre-log usage - deduct estimated credits and create usage entry
 */
export async function preLogUsage(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: GenerationParams,
  authenticatedUser: AuthenticatedUser,
  providerIndex: number
): Promise<UsageLogEntry> {
  const db = c.get('db') as Database
  if (!db) {
    throw new Error('Database not available')
  }

  const modelConfig = models[params.model]
  if (!modelConfig) {
    throw new Error(`Model '${params.model}' not found`)
  }

  // Calculate pre-price (maximum estimated cost)
  const prePriceUsd = preCalcPrice(params.model, params.size, params.quality, providerIndex)
  const prePriceInt = convertPriceToDbFormat(prePriceUsd)
  
  // Check if user has enough credits
  if (prePriceInt !== 0 && authenticatedUser.credits < prePriceInt) {
    throw new Error(`Insufficient credits (this model needs minimum $${prePriceUsd.toFixed(4)} credits), please topup your account`)
  }

  if (!authenticatedUser.isActive) {
    throw new Error('Your account is inactive, please contact support')
  }

  // Get client IP
  const proxyCount = Number(c.env.PROXY_COUNT || 0)
  const clientIp = proxyCount > 0 
    ? c.req.header('cf-connecting-ip') || 'unknown'
    : c.req.header('x-forwarded-for') || 'unknown'

  // Generate unique ID for usage log entry
  const usageId = crypto.randomUUID()

  try {
    // Use transaction to ensure both operations succeed or fail together
    await db.transaction(async (tx) => {
      // Deduct maximum estimated credits initially
      await tx.update(users)
        .set({ 
          credits: authenticatedUser.credits - prePriceInt,
          updatedAt: new Date()
        })
        .where(eq(users.id, authenticatedUser.id))

      // Create API usage entry
      await tx.insert(apiUsage).values({
        id: usageId,
        apiKeyId: authenticatedUser.apiKeyId,
        apiKeyTempJwt: authenticatedUser.isTemporaryJwt,
        userId: authenticatedUser.id,
        model: params.model,
        provider: modelConfig.providers[providerIndex].id,
        prompt: params.prompt || '',
        cost: prePriceInt, // Initial cost is max price
        speedMs: 0,
        imageSize: params.size || 'unknown',
        quality: (params.quality as 'auto' | 'low' | 'medium' | 'high') || 'auto',
        status: 'processing',
        ip: clientIp,
        outputUrls: '[]'
      })
    })

    console.log(`Pre-charged $${prePriceUsd.toFixed(4)} for ${params.model}`)
    
    return {
      id: usageId,
      cost: prePriceInt,
      model: params.model,
      provider: modelConfig.providers[providerIndex].id
    }

  } catch (error) {
    console.error('Error in preLogUsage:', error)
    throw new Error('Failed to log usage and deduct credits')
  }
}

/**
 * Refund usage - refund credits and mark as error
 */
export async function refundUsage(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  authenticatedUser: AuthenticatedUser,
  usageLogEntry: UsageLogEntry,
  errorToLog: string
): Promise<boolean> {
  const db = c.get('db') as Database
  if (!db) {
    throw new Error('Database not available')
  }

  try {
    // Use transaction to update both user balance and API usage together
    await db.transaction(async (tx) => {
      // Refund the full amount if request failed
      await tx.update(users)
        .set({ 
          credits: authenticatedUser.credits + usageLogEntry.cost,
          updatedAt: new Date()
        })
        .where(eq(users.id, authenticatedUser.id))
      
      // Update API usage entry with error status
      await tx.update(apiUsage)
        .set({
          status: 'error',
          error: errorToLog.substring(0, 500), // Limit error message length
          cost: 0 // Request failed, no cost
        })
        .where(eq(apiUsage.id, usageLogEntry.id))
    })

    console.log(`Failed request, refunded ${usageLogEntry.cost / 10000} credits for ${usageLogEntry.model}`)
    return true

  } catch (error) {
    console.error('Failed to refund usage:', error)
    throw new Error('Failed to refund usage')
  }
}

/**
 * Post-log usage - adjust final cost and update status
 */
export async function postLogUsage(
  c: Context<{ Bindings: CloudflareBindings; Variables: ContextVariables }>,
  params: GenerationParams,
  authenticatedUser: AuthenticatedUser,
  usageLogEntry: UsageLogEntry,
  generationResult: any,
  providerIndex: number
): Promise<number> {
  const db = c.get('db') as Database
  if (!db) {
    throw new Error('Database not available')
  }

  const prePriceUsd = preCalcPrice(params.model, params.size, params.quality, providerIndex)
  const prePriceInt = convertPriceToDbFormat(prePriceUsd)

  const postPriceUsd = postCalcPrice(params.model, params.size, params.quality, generationResult, providerIndex)
  const postPriceInt = convertPriceToDbFormat(postPriceUsd)

  // Extract URLs from the result
  const outputUrls = extractOutputUrls(generationResult, usageLogEntry.id)

  try {
    // Use transaction to update both user balance and API usage together
    await db.transaction(async (tx) => {
      // Refund the difference between max price and actual price
      const refundAmount = prePriceInt - postPriceInt
      if (refundAmount !== 0) {
        await tx.update(users)
          .set({ 
            credits: authenticatedUser.credits + refundAmount,
            updatedAt: new Date()
          })
          .where(eq(users.id, authenticatedUser.id))
      }
      
      // Update API usage entry with success, actual cost, and output URLs
      await tx.update(apiUsage)
        .set({
          speedMs: generationResult.latency || 0,
          status: 'success',
          cost: postPriceInt, // Update to actual cost
          outputUrls: JSON.stringify(outputUrls)
        })
        .where(eq(apiUsage.id, usageLogEntry.id))
    })

    console.log(`Post-charged $${postPriceUsd.toFixed(4)} for ${params.model}`)
    return postPriceInt

  } catch (error) {
    console.error('Error in postLogUsage:', error, { params, result: generationResult })
    throw new Error(`Failed to post-log usage for ${params.model} ${usageLogEntry.id}`)
  }
}

/**
 * Helper function to extract URLs from image/video generation result
 */
function extractOutputUrls(result: any, usageLogId: string): string[] {
  const urls: string[] = []
  
  if (!result || !result.data || !Array.isArray(result.data)) {
    return urls
  }
  
  for (const item of result.data) {
    let url: string | null = null
    
    // Check for URL (for url response format)
    if (item.url) {
      url = item.url
    }
    // Check for uploaded URL (for b64_json response format, preserved by storage service)
    else if (item._uploadedUrl) {
      url = item._uploadedUrl
    }
    
    if (url) {
      // Shorten URL by removing custom public URL and usage log ID
      const shortenedUrl = shortenUrl(url, usageLogId)
      urls.push(shortenedUrl)
    }
  }
  
  return urls
}

/**
 * Helper function to shorten URLs by removing custom public URL and usage log ID
 */
function shortenUrl(url: string, usageLogId: string): string {
  const customPublicUrl = process.env.R2_CUSTOM_PUBLIC_URL
  if (!customPublicUrl) {
    return url
  }
  
  // Replace R2 URL + usage log ID with @ wildcard
  const expectedPrefix = `${customPublicUrl}/${usageLogId}`
  if (url.startsWith(expectedPrefix)) {
    return url.replace(expectedPrefix, '@')
  }
  
  // If URL doesn't match our pattern, return as-is
  return url
}