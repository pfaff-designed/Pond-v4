/**
 * Pure label for a soft-deleted pond's countdown (KAN-493, migration 0036).
 * No React, no Supabase — `PondSettingsPage` calls this over `listDeletedPonds`'s
 * `deletedAt`.
 */

import { TRASH_RETENTION_DAYS } from '@/lib/change-log/deleted-view'

const DAY_MS = 24 * 60 * 60 * 1000

/** Calendar days elapsed between `deletedAt` and `now`, local midnight to
 *  local midnight — same boundary rule as `daysBetween` (`log-page.ts`),
 *  reimplemented here rather than imported since that module's export is
 *  change-log-record-shaped, not a bare ISO-to-Date pair. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function daysElapsed(deletedAt: string, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(deletedAt))) / DAY_MS)
}

/** `goes in 30 days` / `goes in 1 day` — N = the retention window minus days
 *  elapsed, floored at 0 (a pond sitting past its own window, since the purge
 *  job isn't built yet, reads `goes in 0 days` rather than a negative count). */
export function pondGoesLabel(deletedAt: string, now: Date): string {
  const daysLeft = Math.max(0, TRASH_RETENTION_DAYS - daysElapsed(deletedAt, now))
  return `goes in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
}
