// Helper function to convert an object to FormData
export function objectToFormData(obj: Record<string, any>): FormData {
  const formData = new FormData()
  
  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    
    // Handle file uploads (image or mask)
    if ((key === 'image' || key === 'mask') && value) {
      if (Array.isArray(value) && key === 'image') {
        // Handle multiple images
        value.forEach(item => {
          if (item.blob && item.filename) {
            formData.append(`${key}[]`, item.blob, item.filename)
          }
        })
      } else if (value.blob && value.filename) {
        // Handle single file
        formData.append(key, value.blob, value.filename)
      }
    } else {
      // For all other fields
      formData.append(key, value)
    }
  })
  
  return formData
}

// File processing interfaces for Cloudflare Workers
export interface ProcessedFile {
  blob: Blob
  filename: string
}

export interface FileUpload {
  name: string
  type: string
  size: number
  stream(): ReadableStream<Uint8Array>
  arrayBuffer(): Promise<ArrayBuffer>
}

// Utility function to process image files from Cloudflare Workers File API
export async function processSingleOrMultipleFiles(imageFiles: FileUpload | FileUpload[], format: 'blob' | 'datauri' = 'blob'): Promise<ProcessedFile | ProcessedFile[] | string | string[]> {
  if (Array.isArray(imageFiles)) {
    return processMultipleFiles(imageFiles, format)
  } else {
    return processSingleFile(imageFiles, format)
  }
}

export async function processSingleFile(file: FileUpload | FileUpload[], format: 'blob' | 'datauri' = 'blob'): Promise<ProcessedFile | string> {
  if (Array.isArray(file) && file.length > 1) {
    throw new Error('This model supports only one image input')
  }
  const actualFile = Array.isArray(file) ? file[0] : file
  
  if (format === 'blob') {
    const arrayBuffer = await actualFile.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: actualFile.type })
    return {
      blob,
      filename: actualFile.name
    }
  } else if (format === 'datauri') {
    const arrayBuffer = await actualFile.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    const mimeType = actualFile.type || 'image/png'
    return `data:${mimeType};base64,${base64}`
  } else {
    throw new Error(`Invalid image processing format '${format}'`)
  }
}

export async function processMultipleFiles(files: FileUpload[], format: 'blob' | 'datauri' = 'blob'): Promise<ProcessedFile[] | string[]> {
  return await Promise.all(files.map(file => processSingleFile(file, format))) as ProcessedFile[] | string[]
}

// Function to get Google Gemini API key based on model and environment variables
export function getGeminiApiKey(model: string, env: { GEMINI_API_KEY?: string }): string {
  const geminiKeyString = env.GEMINI_API_KEY
  let geminiKeyArray: string[] = []
  
  if (geminiKeyString) {
    geminiKeyArray = geminiKeyString.split(',').filter(key => key.trim() !== '')
  }
  
  // Make sure we have at least one key
  if (!geminiKeyArray.length) {
    throw new Error('No Google Gemini API key found')
  }
  
  // Use random API key for free models; use the first key for paid models
  if (model === 'gemini-2.0-flash-exp-image-generation' && geminiKeyArray.length > 1) {
    return geminiKeyArray[Math.floor(Math.random() * geminiKeyArray.length)]
  } else {
    return geminiKeyArray[0]
  }
}

// Post-calculation functions for pricing
export function postCalcSimple(imageResult: { cost: number }): number {
  try {
    // just return the cost, it's already in the result
    return imageResult.cost
  } catch (error) {
    console.error('Error calculating Runware price:', error)
    return 1 // return 1 for safety, this should never happen
  }
}

export function postCalcNanoGPTDiscounted10(imageResult: { cost: number }): number {
  try {
    // just return 110% of the cost, since NanoGPT is discounted by 10%
    return imageResult.cost * 1.1
  } catch (error) {
    console.error('Error calculating NanoGPT price:', error)
    return 1 // return 1 for safety, this should never happen
  }
}

export function postCalcNanoGPTDiscounted5(imageResult: { cost: number }): number {
  try {
    // just return 105% of the cost, since NanoGPT is discounted by 5%
    return imageResult.cost * 1.05
  } catch (error) {
    console.error('Error calculating NanoGPT price:', error)
    return 1 // return 1 for safety, this should never happen
  }
}

// Function to extract width and height from a size string (e.g. "1024x1024")
// Returns an object with numeric `width` and `height` properties. If the
// provided value is the special keyword 'auto', both values will be null.
// Throws if the format is invalid.
export function extractWidthHeight(size: string | null | undefined): { width: number | null; height: number | null } {
  if (size === undefined || size === null || size === 'auto') {
    return { width: null, height: null }
  }

  // Accept forms like "1024x1024" or "512X768" (case-insensitive on the separator)
  const match = /^\s*(\d+)\s*[xX]\s*(\d+)\s*$/.exec(size)
  if (!match) {
    throw new Error("'size' must be in the format 'WIDTHxHEIGHT' (e.g. '1024x768')")
  }

  const width = parseInt(match[1], 10)
  const height = parseInt(match[2], 10)

  return { width, height }
}