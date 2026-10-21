/** Retry backoff for a failed autosave: 2s, 4s, 8s, then 30s forever. */

const SCHEDULE_MS = [2000, 4000, 8000]
const CAP_MS = 30000

/** `attempt` is the 0-based retry count (the first retry is attempt 0). */
export const nextRetryDelayMs = (attempt: number): number => SCHEDULE_MS[attempt] ?? CAP_MS
