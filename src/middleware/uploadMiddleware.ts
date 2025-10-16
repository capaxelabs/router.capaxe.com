import { Context } from 'hono'
import { FileUpload } from '../lib/imageHelpers'

export interface ProcessedImageData {
  base64: string
  mimeType: string
  filename: string
  size: number
}

export interface ParsedFiles {
  image?: File[]
  mask?: File[]
  [key: string]: File[] | undefined
}

export interface ProcessedFiles {
  image?: ProcessedImageData[]
  mask?: ProcessedImageData[]
  [key: string]: ProcessedImageData[] | undefined
}

/**
 * Validate file uploads based on field restrictions
 */
export function validateFileUploads(
  files: ParsedFiles,
  restrictions: {
    [fieldName: string]: {
      maxCount: number
      allowedTypes?: string[]
      maxSizeBytes?: number
    }
  }
): void {
  for (const [fieldName, fieldFiles] of Object.entries(files)) {
    const restriction = restrictions[fieldName]
    if (!restriction) continue

    // Check max count
    if (fieldFiles && fieldFiles.length > restriction.maxCount) {
      throw new Error(`Too many files for field '${fieldName}'. Maximum allowed: ${restriction.maxCount}`)
    }

    if (fieldFiles) {
      for (const file of fieldFiles) {
        // Check file type
        if (restriction.allowedTypes && !restriction.allowedTypes.includes(file.type)) {
          throw new Error(`Invalid file type for field '${fieldName}'. Allowed types: ${restriction.allowedTypes.join(', ')}`)
        }

        // Check file size
        if (restriction.maxSizeBytes && file.size > restriction.maxSizeBytes) {
          throw new Error(`File too large for field '${fieldName}'. Maximum size: ${restriction.maxSizeBytes} bytes`)
        }
      }
    }
  }
}

/**
 * File upload middleware for image generation endpoints
 */
export const imageUploadMiddleware = async (c: Context, next: () => Promise<void>) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    c.set('parsedFields', body)
    c.set('parsedFiles', {})
    
  } catch (error) {
    return c.json({
      error: {
        message: error instanceof Error ? error.message : 'File upload error',
        type: 'file_upload_error'
      }
    }, 400)
  }
  
  await next()
}

/**
 * Video upload middleware with different file restrictions
 */
export const videoUploadMiddleware = async (c: Context, next: () => Promise<void>) => {
  try {
    
    const body = await c.req.json().catch(() => ({}))
    c.set('parsedFields', body)
    c.set('parsedFiles', {})
  
  } catch (error) {
    return c.json({
      error: {
        message: error instanceof Error ? error.message : 'File upload error',
        type: 'file_upload_error'
      }
    }, 400)
  }
  
  await next()
}

/**
 * Helper function to combine fields and files into request parameters
 */
export function combineFieldsAndFiles(
  fields: Record<string, string>,
  files: ParsedFiles
): Record<string, any> {
  return {
    ...fields,
    files: files
  }
}