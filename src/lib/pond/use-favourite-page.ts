'use client'

import { useRef } from 'react'
import { requestNotify } from '@/lib/deletion/notify-bridge'
import { setPondFavourites } from './client'
import { usePond } from './context'
import { toggleFavouritePageId } from './favourites'

/**
 * Favouriting/unfavouriting a page from ⌘K (KAN-475). Optimistic, same shape
 * as `useRenamePond`: the toggled list lands in `patchPond` before the
 * network call, so the band and the ⌘K row's label flip at once. On
 * rejection, rolled back and the miss surfaces as a toast — there is nowhere
 * inline left to show it once the palette has closed.
 *
 * Writes are serialized, one in flight at a time, and the newest intent
 * wins: a second toggle while the first write is still in the air does not
 * drop it (the optimistic label has already flipped to match) — it replaces
 * what `desired` holds, and the write loop below keeps going until what it
 * just sent still matches `desired`, so the list that lands on the server is
 * always the last one the person asked for.
 */
export function useFavouritePage() {
  const { pond, patchPond } = usePond()
  const writing = useRef(false)
  const desired = useRef<string[] | null>(null)
  const rollback = useRef<string[] | undefined>(undefined)
  const pondId = useRef<string | null>(null)

  const flush = async () => {
    if (writing.current) return
    writing.current = true
    try {
      while (desired.current) {
        const toSend = desired.current
        const id = pondId.current as string
        try {
          await setPondFavourites(id, toSend)
          rollback.current = toSend
          if (desired.current === toSend) desired.current = null
        } catch (err) {
          console.error(err)
          patchPond(id, { favouritePageIds: rollback.current })
          desired.current = null
          requestNotify({ message: 'Could not update favourites' })
        }
      }
    } finally {
      writing.current = false
    }
  }

  const toggle = async (pageId: string): Promise<void> => {
    if (!pond) return
    if (!desired.current) rollback.current = pond.favouritePageIds
    const next = toggleFavouritePageId(desired.current ?? pond.favouritePageIds, pageId)
    patchPond(pond.id, { favouritePageIds: next })
    desired.current = next
    pondId.current = pond.id
    await flush()
  }

  return { toggle }
}
