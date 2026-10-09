/**
 * Structural equality over JSON values. `JSON.stringify` would call two snapshots
 * different because JSONB round-trips object keys in its own order, which would
 * report every block as "moved on" and make every revert arrive `outdated`.
 */
export const jsonEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => jsonEqual(item, b[i]))
  }
  if (typeof a !== 'object') return false
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const aKeys = Object.keys(ao)
  const bKeys = Object.keys(bo)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(bo, key) && jsonEqual(ao[key], bo[key])
  )
}
