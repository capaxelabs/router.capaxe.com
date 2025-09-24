import { Context } from 'hono'
import { FileUpload } from '../lib/imageHelpers'

export interface ParsedFiles {
  image?: File[]
  mask?: File[]
  [key: string]: File[] | undefined
}

/**
 * Parse multipart/form-data from Cloudflare Workers request
 */
export async function parseMultipartFormData(c: Context): Promise<{
  fields: Record<string, string>
  files: ParsedFiles
}> {
  const formData = await c.req.formData()
  const fields: Record<string, string> = {}
  const files: ParsedFiles = {}

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      // Handle file uploads
      if (value.size === 0) continue // Skip empty files
      
      // Normalize field names (handle both 'image' and 'image[]')
      let normalizedKey = key
      if (key.endsWith('[]')) {
        normalizedKey = key.slice(0, -2)
      }
      
      if (!files[normalizedKey]) {
        files[normalizedKey] = []
      }
      files[normalizedKey]!.push(value)
    } else {
      // Handle regular form fields
      fields[key] = value.toString()
    }
  }

  return { fields, files }
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
    const contentType = c.req.header('content-type')
    
    if (contentType?.startsWith('multipart/form-data')) {
      const { fields, files } = await parseMultipartFormData(c)
      
      // Validate file uploads
      validateFileUploads(files, {
        image: {
          maxCount: 16,
          allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          maxSizeBytes: 20 * 1024 * 1024 // 20MB
        },
        mask: {
          maxCount: 1,
          allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maxSizeBytes: 10 * 1024 * 1024 // 10MB
        }
      })
      
      // Store parsed data in context
      c.set('parsedFields', fields)
      c.set('parsedFiles', files)
    } else {
      // For non-multipart requests, parse JSON body
      const body = await c.req.json().catch(() => ({}))
      c.set('parsedFields', body)
      c.set('parsedFiles', {})
    }
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
    const contentType = c.req.header('content-type')
    
    if (contentType?.startsWith('multipart/form-data')) {
      const { fields, files } = await parseMultipartFormData(c)
      
      // Validate file uploads for video generation
      validateFileUploads(files, {
        image: {
          maxCount: 6,
          allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maxSizeBytes: 20 * 1024 * 1024 // 20MB
        }
      })
      
      // Store parsed data in context
      c.set('parsedFields', fields)
      c.set('parsedFiles', files)
    } else {
      // For non-multipart requests, parse JSON body
      const body = await c.req.json().catch(() => ({}))
      c.set('parsedFields', body)
      c.set('parsedFiles', {})
    }
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