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
import { usePond } from './context'

export function defaultPondName(workspace: WorkspaceScope): string {
  return workspace === 'sandbox' ? 'sandbox' : 'life'
}

/**
 * The active pond's name (#312).
 *
 * This is the replacement that this file's own header predicted — "the switcher
 * (M3) replaces the hook with a read of the active pond". It reads the pond the
 * shell resolved from `?pond=` and falls back to `defaultPondName` only where
 * there is no pond to read: outside the shell's `PondProvider`, or before
 * migration 0018 made the table.
 *
 * Until this changed, every surface showing a pond name showed `life` regardless
 * of which pond you were in — visible as a new pond's rail root reading `life`
 * while its header read the pond's real name.
 */
export function usePondName(): string {
  const workspace = useWorkspace()
  const { pond } = usePond()
  return pond?.name ?? defaultPondName(workspace)
}
