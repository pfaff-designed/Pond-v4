'use client'

import { useRef, useState } from 'react'
import { requestNotify } from '@/lib/deletion/notify-bridge'
import { setPondFavourites } from './client'
import { usePond } from './context'
import { toggleFavouritePageId } from './favourites'

/**
 * Favouriting/unfavouriting a page from ⌘K (KAN-475). Optimistic, same shape
 * as `useRenamePond`: the toggled list lands in `patchPond` before the
 * network call, so the band and the ⌘K row's label flip at once. On
 * rejection, rolled back to the pre-toggle ids and the miss surfaces as a
 * toast — there is nowhere inline left to show it once the palette has
 * closed.
 */
export function useFavouritePage() {
  const { pond, patchPond } = usePond()
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)

  const toggle = async (pageId: string): Promise<void> => {
    if (inFlight.current || !pond) return
    inFlight.current = true
    setPending(true)
    const previous = pond.favouritePageIds
    const next = toggleFavouritePageId(previous, pageId)
    try {
      patchPond(pond.id, { favouritePageIds: next })
      await setPondFavourites(pond.id, next)
    } catch (err) {
      console.error(err)
      patchPond(pond.id, { favouritePageIds: previous })
      requestNotify({ message: 'Could not update favourites' })
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return { toggle, pending }
}
