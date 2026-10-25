/**
 * Pure label for a soft-deleted pond's countdown (KAN-493, migration 0036).
 * No React, no Supabase — `PondSettingsPage` calls this over `listDeletedPonds`'s
 * `deletedAt`.
 */

import { daysBetween } from '@/lib/change-log/log-page'

/** AUDIT 6m's own grace period — a pond's own fact, not trash's. It reads the
 *  same as `TRASH_RETENTION_DAYS` (`deleted-view.ts`) today only by
 *  coincidence; the two have separate owners and are free to diverge. */
export const POND_DELETE_GRACE_DAYS = 30

/** `goes in 30 days` / `goes in 1 day` — N = the grace period minus days
 *  elapsed since `deletedAt` (`daysBetween`, `log-page.ts` — the one home for
 *  this local-midnight-to-local-midnight boundary rule), floored at 0 (a pond
 *  sitting past its own window, since the purge job isn't built yet, reads
 *  `goes in 0 days` rather than a negative count). */
export function pondGoesLabel(deletedAt: string, now: Date): string {
  const daysLeft = Math.max(0, POND_DELETE_GRACE_DAYS - daysBetween(now, deletedAt))
  return `goes in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
}
