'use client'

import { requestNotify } from '@/lib/deletion/notify-bridge'
import { setPondFavourites } from './client'
import { usePond } from './context'
import { rememberReorder } from './favourites-undo'
import { toggleFavouritePageId } from './favourites'

type PatchPond = (id: string, patch: { favouritePageIds?: string[] }) => void

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
 *
 * `Rail.tsx` and `ShellCommands.tsx` each call this hook from their own
 * mount (the drag path and the ⌘Z undo path). The write-loop state below is
 * module scope, not a `useRef` per mount, so a flush started by one mount
 * and a reorder requested by the other serialize through the same loop
 * instead of firing two concurrent writes whose response order — not
 * request order — would decide what lands last on the server.
 */
let desired: string[] | null = null
let writing = false
let flushPromise: Promise<void> | null = null
let rollback: string[] | undefined = undefined
let pondId: string | null = null
let patchPondFn: PatchPond | null = null

const runFlushLoop = async () => {
  writing = true
  try {
    while (desired) {
      const toSend = desired
      const id = pondId as string
      try {
        await setPondFavourites(id, toSend)
        rollback = toSend
        if (desired === toSend) desired = null
      } catch (err) {
        console.error(err)
        patchPondFn?.(id, { favouritePageIds: rollback })
        // Only clear what this attempt actually sent — a reorder that
        // landed in `desired` while this write was in flight (a mid-flight
        // undo) must still go out, not be dropped by this failure.
        if (desired === toSend) desired = null
        requestNotify({ message: 'Could not update favourites' })
      }
    }
  } finally {
    writing = false
    flushPromise = null
  }
}

// A caller that finds `writing` already true awaits the SAME loop instead
// of resolving immediately — otherwise its own `reorder`/`toggle` call could
// report done before the write it just queued (`desired`) ever ran.
const flush = (): Promise<void> => {
  if (writing && flushPromise) return flushPromise
  flushPromise = runFlushLoop()
  return flushPromise
}

export function useFavouritePage() {
  const { pond, patchPond } = usePond()

  const toggle = async (pageId: string): Promise<void> => {
    if (!pond) return
    patchPondFn = patchPond
    if (!desired) rollback = pond.favouritePageIds
    const next = toggleFavouritePageId(desired ?? pond.favouritePageIds, pageId)
    patchPond(pond.id, { favouritePageIds: next })
    desired = next
    pondId = pond.id
    await flush()
  }

  const reorder = async (
    next: readonly string[],
    opts?: { recordUndo?: boolean }
  ): Promise<boolean> => {
    if (!pond) return false
    patchPondFn = patchPond
    const before = desired ?? pond.favouritePageIds
    if (!desired) rollback = pond.favouritePageIds
    // `recordUndo: false` is the ⌘Z-driven revert itself (ShellCommands) — it
    // must not stash its own "before" (the just-undone order), or a second
    // ⌘Z would revert the revert instead of reaching `sessionUndo`.
    if (opts?.recordUndo ?? true) rememberReorder(pond.id, before ?? [])
    const nextIds = [...next]
    patchPond(pond.id, { favouritePageIds: nextIds })
    desired = nextIds
    pondId = pond.id
    await flush()
    return rollback === nextIds
  }

  return { toggle, reorder }
}
