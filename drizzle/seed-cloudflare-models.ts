/**
 * Seed all image + video models from the Cloudflare AI catalog
 * (https://developers.cloudflare.com/ai/models/).
 *
 * - '@cf/...' models run on Workers AI (Workers AI pricing)
 * - '{author}/{model}' models are third-party via AI Gateway Unified Billing
 *
 * NOTE: prices are estimates - the catalog does not publish prices
 * ("View pricing in the Cloudflare dashboard"). Verify in the dashboard
 * before wiring billing.
 *
 * Emits drizzle/seed-cloudflare-models.sql for D1:
 *   npm run db:seed-cloudflare
 */
import { writeFileSync } from 'node:fs'

type Task = 't2i' | 'i2i' | 't2v' | 'i2v'

interface CatalogModel {
  id: string
  name: string
  task: Task
  price: number // estimated USD per generation
  description?: string
  capabilities?: Record<string, any>
  provider?: Record<string, any> // extra provider-config fields
  tags?: string[]
}

const IMAGE_MODELS: CatalogModel[] = [
  // ---- Workers AI hosted (@cf/) ----
  { id: '@cf/black-forest-labs/flux-1-schnell', name: 'FLUX.1 [schnell]', task: 't2i', price: 0.0005, description: 'Fast FLUX.1 text-to-image on Workers AI (base64 output).', capabilities: { maxSteps: 8 } },
  { id: '@cf/black-forest-labs/flux-2-dev', name: 'FLUX.2 [dev]', task: 't2i', price: 0.02, description: 'FLUX.2 [dev] on Workers AI. High-fidelity, multi-reference image support.', capabilities: { supportsImageToImage: true } },
  { id: '@cf/black-forest-labs/flux-2-klein-4b', name: 'FLUX.2 [klein] 4B', task: 't2i', price: 0.002, description: 'FLUX.2 klein 4B on Workers AI with multi-reference support.', capabilities: { supportsImageToImage: true } },
  { id: '@cf/black-forest-labs/flux-2-klein-9b', name: 'FLUX.2 [klein] 9B', task: 't2i', price: 0.004, description: 'FLUX.2 klein 9B on Workers AI with multi-reference support.', capabilities: { supportsImageToImage: true } },
  { id: '@cf/lykon/dreamshaper-8-lcm', name: 'DreamShaper 8 LCM', task: 't2i', price: 0.0005, description: 'Stable Diffusion fine-tune, photorealism, fast LCM sampling.' },
  { id: '@cf/leonardo/lucid-origin', name: 'Leonardo Lucid Origin', task: 't2i', price: 0.007, description: 'Leonardo.AI Lucid Origin on Workers AI.' },
  { id: '@cf/leonardo/phoenix-1.0', name: 'Leonardo Phoenix 1.0', task: 't2i', price: 0.007, description: 'Leonardo.AI Phoenix 1.0 on Workers AI.' },
  { id: '@cf/runwayml/stable-diffusion-v1-5-img2img', name: 'SD 1.5 img2img', task: 'i2i', price: 0.0005, description: 'Stable Diffusion v1.5 image-to-image on Workers AI.' },
  { id: '@cf/runwayml/stable-diffusion-v1-5-inpainting', name: 'SD 1.5 Inpainting', task: 'i2i', price: 0.0005, description: 'Stable Diffusion v1.5 inpainting on Workers AI.', capabilities: { supportsMask: true } },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', name: 'SDXL Base 1.0', task: 't2i', price: 0.001, description: 'Stable Diffusion XL base on Workers AI.' },
  { id: '@cf/bytedance/stable-diffusion-xl-lightning', name: 'SDXL Lightning', task: 't2i', price: 0.0005, description: 'SDXL-Lightning fast generation on Workers AI.' },

  // ---- Third-party catalog (Unified Billing) ----
  { id: 'alibaba/wan-2.6-image', name: 'Wan 2.6 Image', task: 't2i', price: 0.02, description: 'Alibaba Wan 2.6 text-to-image via Cloudflare Unified Billing.' },
  { id: 'black-forest-labs/flux-2-flex', name: 'FLUX.2 Flex', task: 't2i', price: 0.06, description: 'FLUX.2 Flex via Unified Billing.' },
  { id: 'black-forest-labs/flux-2-max', name: 'FLUX.2 Max', task: 't2i', price: 0.08, description: 'FLUX.2 Max via Unified Billing.' },
  { id: 'black-forest-labs/flux-2-pro-preview', name: 'FLUX.2 Pro (Preview)', task: 't2i', price: 0.05, description: 'FLUX.2 Pro preview via Unified Billing.' },
  { id: 'bytedance/seedream-4.0', name: 'Seedream 4.0', task: 't2i', price: 0.03, description: 'ByteDance Seedream 4.0 via Unified Billing.' },
  { id: 'bytedance/seedream-4.5', name: 'Seedream 4.5', task: 't2i', price: 0.03, description: 'ByteDance Seedream 4.5 via Unified Billing.' },
  { id: 'bytedance/seedream-5-lite', name: 'Seedream 5 Lite', task: 't2i', price: 0.02, description: 'ByteDance Seedream 5 Lite via Unified Billing.' },
  { id: 'bytedance/seedream-5-pro', name: 'Seedream 5 Pro', task: 't2i', price: 0.04, description: 'ByteDance Seedream 5 Pro via Unified Billing.' },
  { id: 'google/imagen-4', name: 'Imagen 4', task: 't2i', price: 0.04, description: 'Google Imagen 4 via Unified Billing.', capabilities: { aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] } },
  { id: 'google/nano-banana', name: 'Nano Banana', task: 't2i', price: 0.039, description: 'Google Nano Banana (Gemini image) via Unified Billing. Supports image editing.', capabilities: { supportsImageToImage: true } },
  { id: 'google/nano-banana-2', name: 'Nano Banana 2', task: 't2i', price: 0.039, description: 'Google Nano Banana 2 via Unified Billing. Supports image editing.', capabilities: { supportsImageToImage: true } },
  { id: 'google/nano-banana-2-lite', name: 'Nano Banana 2 Lite', task: 't2i', price: 0.02, description: 'Google Nano Banana 2 Lite via Unified Billing.', capabilities: { supportsImageToImage: true } },
  { id: 'google/nano-banana-pro', name: 'Nano Banana Pro', task: 't2i', price: 0.13, description: 'Google Nano Banana Pro via Unified Billing.', capabilities: { supportsImageToImage: true } },
  { id: 'krea/krea-2-large', name: 'Krea 2 Large', task: 't2i', price: 0.05, description: 'Krea 2 Large via Unified Billing.' },
  { id: 'krea/krea-2-medium', name: 'Krea 2 Medium', task: 't2i', price: 0.03, description: 'Krea 2 Medium via Unified Billing.' },
  { id: 'krea/krea-2-medium-turbo', name: 'Krea 2 Medium Turbo', task: 't2i', price: 0.02, description: 'Krea 2 Medium Turbo via Unified Billing.' },
  { id: 'openai/gpt-image-1.5', name: 'GPT Image 1.5', task: 't2i', price: 0.04, description: 'OpenAI GPT Image 1.5 via Unified Billing.', capabilities: { supportsImageToImage: true } },
  { id: 'openai/gpt-image-2', name: 'GPT Image 2', task: 't2i', price: 0.05, description: 'OpenAI GPT Image 2 via Unified Billing.', capabilities: { supportsImageToImage: true } },
  { id: 'pruna/p-image', name: 'Pruna P-Image', task: 't2i', price: 0.02, description: 'Pruna P-Image via Unified Billing.' },
  { id: 'pruna/p-image-edit', name: 'Pruna P-Image Edit', task: 'i2i', price: 0.03, description: 'Pruna image editing via Unified Billing.' },
  { id: 'pruna/p-image-try-on', name: 'Pruna P-Image Try-On', task: 'i2i', price: 0.04, description: 'Pruna virtual try-on via Unified Billing.' },
  { id: 'pruna/p-image-upscale', name: 'Pruna P-Image Upscale', task: 'i2i', price: 0.02, description: 'Pruna image upscaler via Unified Billing.', capabilities: { supportsUpscaling: true } },
  { id: 'recraft/recraftv3', name: 'Recraft V3', task: 't2i', price: 0.04, description: 'Recraft V3 via Unified Billing.' },
  { id: 'recraft/recraftv4', name: 'Recraft V4', task: 't2i', price: 0.04, description: 'Recraft V4 via Unified Billing.' },
  { id: 'recraft/recraftv4-vector', name: 'Recraft V4 Vector', task: 't2i', price: 0.04, description: 'Recraft V4 vector output via Unified Billing.', capabilities: { outputFormat: 'svg' } },
  { id: 'recraft/recraftv4-pro', name: 'Recraft V4 Pro', task: 't2i', price: 0.08, description: 'Recraft V4 Pro via Unified Billing.' },
  { id: 'recraft/recraftv4-pro-vector', name: 'Recraft V4 Pro Vector', task: 't2i', price: 0.08, description: 'Recraft V4 Pro vector output via Unified Billing.', capabilities: { outputFormat: 'svg' } },
  { id: 'recraft/recraftv4-1', name: 'Recraft V4.1', task: 't2i', price: 0.04, description: 'Recraft V4.1 via Unified Billing.' },
  { id: 'recraft/recraftv4-1-vector', name: 'Recraft V4.1 Vector', task: 't2i', price: 0.04, description: 'Recraft V4.1 vector output via Unified Billing.', capabilities: { outputFormat: 'svg' } },
  { id: 'recraft/recraftv4-1-pro', name: 'Recraft V4.1 Pro', task: 't2i', price: 0.08, description: 'Recraft V4.1 Pro via Unified Billing.' },
  { id: 'recraft/recraftv4-1-pro-vector', name: 'Recraft V4.1 Pro Vector', task: 't2i', price: 0.08, description: 'Recraft V4.1 Pro vector output via Unified Billing.', capabilities: { outputFormat: 'svg' } },
  { id: 'recraft/recraftv4-1-utility', name: 'Recraft V4.1 Utility', task: 't2i', price: 0.02, description: 'Recraft V4.1 Utility via Unified Billing.' },
  { id: 'recraft/recraftv4-1-utility-vector', name: 'Recraft V4.1 Utility Vector', task: 't2i', price: 0.02, description: 'Recraft V4.1 Utility vector output via Unified Billing.', capabilities: { outputFormat: 'svg' } },
  { id: 'recraft/recraftv4-1-utility-pro', name: 'Recraft V4.1 Utility Pro', task: 't2i', price: 0.04, description: 'Recraft V4.1 Utility Pro via Unified Billing.' },
  { id: 'recraft/recraftv4-1-utility-pro-vector', name: 'Recraft V4.1 Utility Pro Vector', task: 't2i', price: 0.04, description: 'Recraft V4.1 Utility Pro vector output via Unified Billing.', capabilities: { outputFormat: 'svg' } },
  { id: 'xai/grok-imagine-image', name: 'Grok Imagine Image', task: 't2i', price: 0.02, description: 'xAI Grok Imagine via Unified Billing.' },
  { id: 'xai/grok-imagine-image-quality', name: 'Grok Imagine Image Quality', task: 't2i', price: 0.07, description: 'xAI Grok Imagine (quality tier) via Unified Billing.' },
]

const VIDEO_MODELS: CatalogModel[] = [
  { id: 'alibaba/hh1-t2v', name: 'Alibaba HH1 T2V', task: 't2v', price: 0.30, description: 'Alibaba HH1 text-to-video via Unified Billing.' },
  { id: 'alibaba/hh1-i2v', name: 'Alibaba HH1 I2V', task: 'i2v', price: 0.30, description: 'Alibaba HH1 image-to-video via Unified Billing.' },
  { id: 'alibaba/hh1.1-t2v', name: 'Alibaba HH1.1 T2V', task: 't2v', price: 0.35, description: 'Alibaba HH1.1 text-to-video via Unified Billing.' },
  { id: 'alibaba/hh1.1-i2v', name: 'Alibaba HH1.1 I2V', task: 'i2v', price: 0.35, description: 'Alibaba HH1.1 image-to-video via Unified Billing.' },
  { id: 'alibaba/hh1.1-r2v', name: 'Alibaba HH1.1 R2V', task: 'i2v', price: 0.35, description: 'Alibaba HH1.1 reference-to-video via Unified Billing.' },
  { id: 'alibaba/wan-2.7-i2v', name: 'Wan 2.7 I2V', task: 'i2v', price: 0.30, description: 'Alibaba Wan 2.7 image-to-video via Unified Billing.' },
  { id: 'bytedance/seedance-2.0', name: 'Seedance 2.0', task: 't2v', price: 0.60, description: 'ByteDance Seedance 2.0 via Unified Billing.', capabilities: { durations: [5, 10], resolutions: ['480p', '720p', '1080p'] } },
  { id: 'bytedance/seedance-2.0-fast', name: 'Seedance 2.0 Fast', task: 't2v', price: 0.30, description: 'ByteDance Seedance 2.0 Fast via Unified Billing.', capabilities: { durations: [5, 10], resolutions: ['480p', '720p'] } },
  { id: 'bytedance/seedance-2.0-mini', name: 'Seedance 2.0 Mini', task: 't2v', price: 0.15, description: 'ByteDance Seedance 2.0 Mini via Unified Billing.', capabilities: { durations: [5, 10], resolutions: ['480p', '720p'] } },
  {
    id: 'google/veo-3.1', name: 'Veo 3.1', task: 't2v', price: 3.20,
    description: 'Google Veo 3.1 via Unified Billing. Text/image-to-video with audio, up to 1080p.',
    capabilities: { aspectRatios: ['16:9', '9:16', '1:1'], durations: ['4s', '6s', '8s'], defaultDuration: '6s', resolutions: ['720p', '1080p'], supportsAudio: true },
    provider: { durationFormat: 'seconds-string' },
  },
  {
    id: 'google/veo-3.1-fast', name: 'Veo 3.1 Fast', task: 't2v', price: 1.20,
    description: 'Google Veo 3.1 Fast via Unified Billing.',
    capabilities: { aspectRatios: ['16:9', '9:16', '1:1'], durations: ['4s', '6s', '8s'], defaultDuration: '6s', resolutions: ['720p', '1080p'], supportsAudio: true },
    provider: { durationFormat: 'seconds-string' },
  },
  { id: 'minimax/hailuo-2.3', name: 'Hailuo 2.3', task: 't2v', price: 0.50, description: 'MiniMax Hailuo 2.3 via Unified Billing.' },
  { id: 'minimax/hailuo-2.3-fast', name: 'Hailuo 2.3 Fast', task: 't2v', price: 0.25, description: 'MiniMax Hailuo 2.3 Fast via Unified Billing.' },
  { id: 'pixverse/v5.6', name: 'PixVerse V5.6', task: 't2v', price: 0.45, description: 'PixVerse V5.6 via Unified Billing.' },
  { id: 'pixverse/v6', name: 'PixVerse V6', task: 't2v', price: 0.60, description: 'PixVerse V6 via Unified Billing.' },
  { id: 'pruna/p-video', name: 'Pruna P-Video', task: 't2v', price: 0.30, description: 'Pruna P-Video via Unified Billing.' },
  { id: 'pruna/p-video-animate', name: 'Pruna P-Video Animate', task: 'i2v', price: 0.40, description: 'Pruna image animation via Unified Billing.' },
  { id: 'pruna/p-video-avatar', name: 'Pruna P-Video Avatar', task: 'i2v', price: 0.40, description: 'Pruna avatar video via Unified Billing.' },
  { id: 'pruna/p-video-replace', name: 'Pruna P-Video Replace', task: 'i2v', price: 0.40, description: 'Pruna video replacement via Unified Billing.' },
  { id: 'runwayml/aleph-2', name: 'Runway Aleph 2', task: 't2v', price: 1.50, description: 'Runway Aleph 2 via Unified Billing.' },
  { id: 'runwayml/gen-4.5', name: 'Runway Gen-4.5', task: 't2v', price: 1.00, description: 'Runway Gen-4.5 via Unified Billing.' },
  { id: 'vidu/q3-pro', name: 'Vidu Q3 Pro', task: 't2v', price: 0.60, description: 'Vidu Q3 Pro via Unified Billing.' },
  { id: 'vidu/q3-turbo', name: 'Vidu Q3 Turbo', task: 't2v', price: 0.30, description: 'Vidu Q3 Turbo via Unified Billing.' },
  { id: 'xai/grok-imagine-video', name: 'Grok Imagine Video', task: 't2v', price: 0.30, description: 'xAI Grok Imagine video via Unified Billing.' },
  { id: 'xai/grok-imagine-video-1.5-preview', name: 'Grok Imagine Video 1.5 (Preview)', task: 'i2v', price: 0.40, description: 'xAI Grok Imagine 1.5 image-to-video via Unified Billing.' },
]

function slugify(id: string): string {
  return id.replace(/^@/, '').replace(/[/.]/g, '-').toLowerCase()
}

function toRow(m: CatalogModel) {
  const isVideo = m.task === 't2v' || m.task === 'i2v'
  const isWorkersAI = m.id.startsWith('@cf/')
  const usesImageInput = m.task === 'i2i' || m.task === 'i2v'

  const capabilities: Record<string, any> = {
    supportsImage: usesImageInput || Boolean(m.capabilities?.supportsImageToImage),
    supportsMask: false,
    supportsQuality: false,
    ...(isVideo
      ? { supportsTextToVideo: m.task === 't2v', supportsImageToVideo: usesImageInput || m.task === 't2v' }
      : { supportsTextToImage: m.task === 't2i', supportsImageToImage: usesImageInput }),
    ...m.capabilities,
  }

  return {
    id: m.id,
    name: m.name,
    slug: slugify(m.id),
    type: (isVideo ? 'video' : 'image') as 'image' | 'video',
    status: 'active' as const,
    isPublic: true,

    providers: JSON.stringify([
      {
        id: 'workers-ai',
        model_name: m.id,
        pricing: {
          type: 'fixed',
          value: m.price, // ESTIMATE - verify in Cloudflare dashboard
        },
        maxRetries: isVideo ? 1 : 2,
        timeoutSeconds: isVideo ? 600 : 180,
        ...m.provider,
      },
    ]),

    releaseDate: '2026-07-31',
    description: m.description || m.name,

    capabilities: JSON.stringify(capabilities),

    tags: JSON.stringify([
      m.id.startsWith('@cf/') ? 'workers-ai' : 'unified-billing',
      isVideo ? 'video' : 'image',
      ...(m.tags || []),
    ]),
    category: isVideo
      ? (m.task === 'i2v' ? 'image-to-video' : 'text-to-video')
      : (m.task === 'i2i' ? 'image-to-image' : 'text-to-image'),

    examples: JSON.stringify([]),
  }
}

function esc(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL'
  return `'${v.replace(/'/g, "''")}'`
}

function toInsertSQL(m: CatalogModel): string {
  const r = toRow(m)
  const cols = 'id, name, slug, type, status, is_public, providers, release_date, description, capabilities, tags, category, examples'
  const vals = [
    esc(r.id), esc(r.name), esc(r.slug), esc(r.type), esc(r.status),
    r.isPublic ? '1' : '0',
    esc(r.providers), esc(r.releaseDate), esc(r.description),
    esc(r.capabilities), esc(r.tags), esc(r.category), esc(r.examples),
  ].join(', ')
  return `INSERT INTO models (${cols}) VALUES (${vals}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, providers=excluded.providers, capabilities=excluded.capabilities, description=excluded.description, status=excluded.status, tags=excluded.tags, category=excluded.category;`
}

const all = [...IMAGE_MODELS, ...VIDEO_MODELS]
writeFileSync('drizzle/seed-cloudflare-models.sql', all.map(toInsertSQL).join('\n') + '\n')
console.log(`Wrote ${all.length} model inserts (${IMAGE_MODELS.length} image, ${VIDEO_MODELS.length} video) to drizzle/seed-cloudflare-models.sql`)
