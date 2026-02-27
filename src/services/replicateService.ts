import Replicate from 'replicate'
import type { FileOutput } from 'replicate'

export interface ReplicateImageParams {
  model: string
  input: Record<string, any>
}

export class ReplicateService {
  private client: Replicate

  constructor(apiKey: string) {
    this.client = new Replicate({ auth: apiKey })
  }

  async generateImage(params: ReplicateImageParams): Promise<{
    created: number
    data: Array<{ url?: string; b64_json?: string; revised_prompt?: string | null }>
    cost?: number
  }> {
    console.log(`[Replicate] Running model: ${params.model}`)

    const output = await this.client.run(
      params.model as `${string}/${string}`,
      { input: params.input }
    )

    // Handle FileOutput (single file response)
    if (output && typeof output === 'object' && 'url' in output && typeof (output as any).url === 'function') {
      const fileOutput = output as FileOutput
      const url = fileOutput.url().toString()
      console.log(`[Replicate] Got file output URL: ${url}`)

      return {
        created: Math.floor(Date.now() / 1000),
        data: [{ url, revised_prompt: null }]
      }
    }

    // Handle array of FileOutput (multiple outputs)
    if (Array.isArray(output)) {
      const urls: string[] = []
      for (const item of output) {
        if (item && typeof item === 'object' && 'url' in item && typeof (item as any).url === 'function') {
          urls.push((item as FileOutput).url().toString())
        } else if (typeof item === 'string') {
          urls.push(item)
        }
      }

      if (urls.length > 0) {
        console.log(`[Replicate] Got ${urls.length} output URLs`)
        return {
          created: Math.floor(Date.now() / 1000),
          data: urls.map(url => ({ url, revised_prompt: null }))
        }
      }
    }

    // Handle string URL output
    if (typeof output === 'string') {
      return {
        created: Math.floor(Date.now() / 1000),
        data: [{ url: output, revised_prompt: null }]
      }
    }

    throw new Error(`Unexpected Replicate output format: ${JSON.stringify(output)}`)
  }
}

export function getReplicateService(apiKey: string): ReplicateService {
  return new ReplicateService(apiKey)
}
