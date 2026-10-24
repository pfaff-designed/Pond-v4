'use client'

import { useRef, useState } from 'react'
import { requestNotify } from '@/lib/deletion/notify-bridge'
import { updatePond, type UpdatePondPatch } from './client'
import { usePond } from './context'

/**
 * Renaming a pond from the switcher's inline editor (KAN-492). Optimistic: the
 * local patch lands before the network call, so the rail header and switcher
 * read the new name/glyph at once. On a rejection the patch is rolled back to
 * the pre-edit row and the miss surfaces as a toast — the switcher has already
 * closed by then, so there is nowhere inline left to show it.
 *
 * `inFlight` is a ref, not state, for the same reason as `useCreatePond`'s own:
 * a second Enter lands before the re-render that would show it (AUDIT G9).
 * `pending` IS state (mirroring `useCreatePond`'s own pair) so the switcher can
 * disable the `rename & icon` row while a write is outstanding, rather than
 * silently dropping a second edit that would land before the first resolves.
 */
export function useRenamePond() {
  const { ponds, patchPond } = usePond()
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)

  const rename = async (pondId: string, patch: UpdatePondPatch): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    const previous = ponds.find((p) => p.id === pondId)
    patchPond(pondId, patch)
    try {
      await updatePond(pondId, patch)
    } catch (err) {
      console.error(err)
      if (previous) patchPond(pondId, { name: previous.name, glyph: previous.glyph })
      requestNotify({ message: 'Could not rename the pond' })
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return { rename, pending }
}
