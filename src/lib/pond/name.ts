'use client'

/**
 * The pond's name — what the rail header shows (AUDIT C3, trimmed by ADR 0002
 * to a NAME: no switcher, no chevron; those are M3 with the pond table).
 *
 * M1 is single-user and has no pond model, so the name has no row to live in
 * yet. This is the one seam that resolves it: the onboarding name-pond step
 * (#118) replaces `defaultPondName` with the person's own choice; the switcher
 * (M3) replaces the hook with a read of the active pond. Until then the
 * handoff's own default for a person's pond stands — `PondRail` at rest names it
 * "life", the same word as the root of the tree — and the sandbox workspace
 * says what it is.
 *
 * Both names are LOWERCASE (#101 review): the rail's source copy in `Pond 05
 * Shell` is lowercase throughout (life, personal, journal, notes) and the capitals
 * in the boards are `text-transform: uppercase` on the eyebrow, a presentational
 * rule the CSS already carries. The data is lowercase; the transform is the view's.
 */

import { useWorkspace, type WorkspaceScope } from '@/lib/workspace/context'

export function defaultPondName(workspace: WorkspaceScope): string {
  return workspace === 'sandbox' ? 'sandbox' : 'life'
}

/** The current workspace's pond name. */
export function usePondName(): string {
  return defaultPondName(useWorkspace())
}
