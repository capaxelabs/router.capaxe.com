/**
 * Deep-copy a value for logging, truncating long strings (base64 images,
 * huge prompts) and capping arrays/depth so metadata rows stay small.
 */
export function truncateDeep(value: any, maxStr = 300, maxArray = 25, depth = 6): any {
  if (depth <= 0) return '[max depth]'
  if (typeof value === 'string') {
    return value.length > maxStr
      ? `${value.slice(0, maxStr)}...[truncated ${value.length - maxStr} chars]`
      : value
  }
  if (Array.isArray(value)) {
    const out = value.slice(0, maxArray).map(v => truncateDeep(v, maxStr, maxArray, depth - 1))
    if (value.length > maxArray) out.push(`...[${value.length - maxArray} more items]`)
    return out
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = truncateDeep(v, maxStr, maxArray, depth - 1)
    }
    return out
  }
  return value
}
