/**
 * Task ID Generation Strategy
 */

export interface TaskIdComponents {
  prefix: string      // 'img' | 'vid'
  timestamp: string   // Unix timestamp
  userId: string      // First 8 chars of user ID hash
  random: string      // Random string for uniqueness
}

/**
 * Generate structured task ID
 * Format: {prefix}_{timestamp}_{userHash}_{random}
 * 
 * Examples:
 * - img_1758738090_abc12def_xyz789   (Image task)
 * - vid_1758738091_def34ghi_abc123   (Video task)
 */
export function generateTaskId(type: 'image' | 'video', userId: string): string {
  const prefix = type === 'image' ? 'img' : 'vid'
  const timestamp = Math.floor(Date.now() / 1000).toString() // Unix timestamp
  const userHash = hashUserId(userId).substring(0, 8)
  const random = generateRandomString(6)
  
  return `${prefix}_${timestamp}_${userHash}_${random}`
}

/**
 * Parse task ID back to components
 */
export function parseTaskId(taskId: string): TaskIdComponents | null {
  const parts = taskId.split('_')
  if (parts.length !== 4) return null
  
  const [prefix, timestamp, userId, random] = parts
  
  if (!['img', 'vid'].includes(prefix)) return null
  
  return {
    prefix,
    timestamp, 
    userId,
    random
  }
}

/**
 * Validate task ID format
 */
export function isValidTaskId(taskId: string): boolean {
  return parseTaskId(taskId) !== null
}

/**
 * Get task type from task ID
 */
export function getTaskType(taskId: string): 'image' | 'video' | null {
  const components = parseTaskId(taskId)
  if (!components) return null
  
  return components.prefix === 'img' ? 'image' : 'video'
}

/**
 * Hash user ID for privacy (simple hash for demo)
 */
function hashUserId(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Generate random string
 */
function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Examples of generated task IDs:
 */
export const TASK_ID_EXAMPLES = {
  image: 'img_1758738090_a1b2c3d4_xyz789',
  video: 'vid_1758738091_e5f6g7h8_abc123'
} as const