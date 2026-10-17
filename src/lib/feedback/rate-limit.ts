/**
 * In-memory sliding-window rate limit for `report a problem` (KAN-335) — 10
 * reports/hour/user. Module-level state: fine for a size-S, resets on deploy.
 */

const WINDOW_MS = 60 * 60 * 1000
const MAX_REPORTS_PER_WINDOW = 10

const reportTimestamps = new Map<string, number[]>()

export function checkFeedbackRateLimit(userId: string): boolean {
  const now = Date.now()
  const windowStart = now - WINDOW_MS
  const timestamps = (reportTimestamps.get(userId) ?? []).filter((timestamp) => timestamp > windowStart)

  if (timestamps.length >= MAX_REPORTS_PER_WINDOW) {
    reportTimestamps.set(userId, timestamps)
    return false
  }

  timestamps.push(now)
  reportTimestamps.set(userId, timestamps)
  return true
}
