'use client'

/**
 * The open page's draft (lifted out of `DocumentPanel`): the title and blocks the
 * person is editing, seeded from the loaded page, and the debounced whole-array
 * save that writes them back. Saves are debounced and write the whole block array
 * (blocks are never partially persisted); renaming refreshes the sidebar via the
 * ['pages'] query.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import type { Block } from '@/lib/documents/types'
import { withoutRowStart } from '@/lib/modules/layout-rows'
import { setProperty, type PondPage } from '@/lib/pages/client'
import { createPageWriter, type PageWriteState } from '@/lib/pages/commit'
import type { HomePage } from '@/lib/pages/home'
import { homeQueryKey } from '@/lib/pages/keys'
import { getPageWriteQueue, registerPageFlush } from '@/lib/pages/page-flush'
import { createPageWriteQueue, type PageWriteQueue } from '@/lib/pages/page-write-queue'
import { withValue, type PropertyValue } from '@/lib/properties/schema'
import type { createClient } from '@/lib/supabase/client'

interface PageDraftInput {
  /** The loaded page, or nothing while it loads. */
  page: PondPage | null | undefined
  /** The page in view — the URL's node, or the root. */
  pageId: string | null
  pondId: string | null
  getSupabase: () => ReturnType<typeof createClient>
}

/**
 * Pure (KAN-440): re-inserts `block` at `index` into `current`, having first
 * reversed any `detachKeepingRows` handoff the removal made — `handedRowStartTo`
 * is the id `removeBlockAt` recorded at stage-time, so undo omits `rowStart`
 * from exactly that block, against `current` (the LATEST blocks, not the
 * stage-time snapshot). Exported so `undoRemove`'s own contract is directly
 * testable without rendering the hook.
 */
export function withUndoneRemove(
  current: Block[],
  index: number,
  block: Block,
  handedRowStartTo?: string | null
): Block[] {
  const restored = handedRowStartTo
    ? current.map((b) => (b.id === handedRowStartTo ? withoutRowStart(b) : b))
    : current
  const at = Math.min(index, restored.length)
  return [...restored.slice(0, at), block, ...restored.slice(at)]
}

export function usePageDraft({ page, pageId, pondId, getSupabase }: PageDraftInput) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  // `saved` has nothing of its own to track (KAN-495: the queue is the only
  // record of what's stored) — it's true exactly when there's no debounced
  // save still waiting on its pause AND the page's write queue is idle
  // (nothing queued, mid-apply, or halted). The queue half is read straight
  // off the queue itself via `useSyncExternalStore` (below), not mirrored
  // into its own `useState` — the queue is the one place that fact lives.
  const [pendingDebounce, setPendingDebounce] = useState(false)
  // When the last autosave of this session landed; null until one has.
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  // Which page the local title/blocks state was seeded from. State (not the ref)
  // so render can branch on it; the ref below serves the event-handler save path.
  // Never reset on navigate-away: it can only ever match a page whose local state
  // came from that same page, so a stale value is harmless (re-seeded on return).
  const [seededId, setSeededId] = useState<string | null>(null)
  const loadedId = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The save a debounce timer is currently waiting to fire, if any — held so
  // `flushNow` (KAN-302) can run it immediately instead of waiting out the pause.
  const pendingSave = useRef<{ pageId: string; title: string; blocks: Block[] } | null>(null)
  // The latest `pondId` prop, read by the queue's writer AT WRITE TIME, never
  // at queue-creation time: `queueFor`'s `createQueue` callback only ever runs
  // ONCE per page id (the registry below is lazy), so closing over `pondId`
  // directly would freeze whichever value was in scope on that first call —
  // `null`, while ponds are still loading, on a reload landing straight on
  // `?nodeId` — for the rest of the session, silently dropping every write's
  // record from `sessionUndo` (its `trackPending`/`remember` both no-op on a
  // null pond).
  const pondIdRef = useRef(pondId)
  useEffect(() => {
    pondIdRef.current = pondId
  })
  // The latest `blocks`, read by `undoRemove` instead of a `setBlocks`
  // functional updater: StrictMode double-invokes an updater function, and
  // `undoRemove`'s updater enqueued a structural write as a side effect of
  // computing its return value, so one toast Undo produced two writes (two
  // change-log records) in development. A ref updated after every render
  // gives the same "latest, not stale" guarantee without running inside React's
  // updater machinery.
  const blocksRef = useRef(blocks)
  useEffect(() => {
    blocksRef.current = blocks
  })

  // The page's write queue (KAN-495) — created lazily on first use and kept
  // alive across remounts by the page-write registry, so a save still in
  // flight from a page just left finishes in its own queue. `fallback` only
  // matters the first time any caller reaches this page id; later calls find
  // the existing queue and ignore it. The writer itself is a thin wrapper, not
  // `createPageWriter(...)` called directly: `queueFor` runs during render
  // (see `pageQueue` below), and calling `getSupabase()` there would construct
  // the Supabase client at render time, which `useLazySupabase`'s contract
  // forbids — wrapping it defers that call (and the `pondIdRef` read) to when
  // the writer is actually invoked, from inside the queue's own apply loop.
  function queueFor(id: string, fallback: PageWriteState): PageWriteQueue<PageWriteState> {
    return getPageWriteQueue<PageWriteQueue<PageWriteState>>(id, () =>
      createPageWriteQueue(
        (op, settle) => createPageWriter(getSupabase(), queryClient, id, pondIdRef.current)(op, settle),
        fallback
      )
    )
  }

  // The current page's write queue (KAN-495), or null before it's loaded —
  // read here (not only inside effects/handlers) so `queueIdle` below can
  // subscribe to it. `undefined`/`null` page is the loading state; `saved`
  // defaults to true then, matching today's behaviour before a page exists
  // to be unsaved against.
  // `queueFor`'s writer only REFERENCES `pondIdRef.current` inside a closure
  // it hands to `createPageWriteQueue`, which stores it without calling it;
  // the ref is actually read later, from the queue's own apply loop, never
  // synchronously during this render.
  const pageQueue =
    page && page.id === pageId
      ? // eslint-disable-next-line react-hooks/refs -- see comment above
        queueFor(page.id, { title: page.title, blocks: page.blocks })
      : null
  // Stable per queue (keyed on `pageQueue`'s identity, not recreated every
  // render) — `useSyncExternalStore` resubscribes whenever `subscribe` itself
  // changes identity, and a fresh closure every render would otherwise
  // unsubscribe and resubscribe on every single render of this hook.
  const subscribeToQueue = useCallback(
    (listener: () => void) => (pageQueue ? pageQueue.subscribe(() => listener()) : () => {}),
    [pageQueue]
  )
  const queueIdle = useSyncExternalStore(
    subscribeToQueue,
    () => pageQueue?.idle() ?? true,
    () => true
  )
  const saved = !pendingDebounce && queueIdle

  // Seed local editable state when a different page loads. On a *same-page*
  // refetch we normally leave local edits alone — but when there are no unsaved
  // edits (`saved`) and the server blocks differ from ours, adopt them: that
  // difference means an external write (e.g. an accepted AI diff-card proposal),
  // since our own saves keep the ['page'] cache in sync (see scheduleSave).
  //
  // KNOWN LIMITATION (ticket-10, accepted this slice): if the panel has UNSAVED
  // local edits (`!saved`) when an AI proposal is accepted, that external write is
  // NOT adopted here and will be overwritten by the pending debounced save — the
  // accepted edit is effectively dropped. We guard on `saved` deliberately so an
  // external write never clobbers in-flight keystrokes. The window is narrow
  // (type + Accept within the 600ms debounce) and the app is single-user; a proper
  // block-level merge is deferred. Accept an AI edit with a settled ("Saved") panel.
  useEffect(() => {
    if (page && page.id !== loadedId.current) {
      loadedId.current = page.id
      // Touch the page's queue so it exists with this baseline as `head()` if
      // this is the first visit; a queue from an earlier visit keeps its own
      // head (a save still pending from the page just left finishes there).
      const queue = queueFor(page.id, { title: page.title, blocks: page.blocks })
      // That surviving queue's head can also be STALE: the page may have
      // changed elsewhere while we were away (an accepted diff, a
      // child-links page-link insert, an undo from another page) — none of
      // those route through this page's queue, so its head never moved. Left
      // alone, the next write's `before` would be a state the store no
      // longer holds, and ⌘Z on it would revert that other change instead.
      // Only rebase while idle: a queue halted on navigate-away keeps its
      // pending op and shows unsaved rather than dropping typed work — the
      // next retry/edit resolves it, same as returning to any other unsaved
      // page.
      if (queue.idle() && JSON.stringify(queue.head().blocks) !== JSON.stringify(page.blocks)) {
        queue.rebase({ title: page.title, blocks: page.blocks })
      }
      setSeededId(page.id)
      setTitle(page.title)
      setBlocks(page.blocks)
      setPendingDebounce(false)
      setSavedAt(null)
    } else if (page && page.id === loadedId.current && saved) {
      // Same page, no unsaved edits: adopt server blocks only when they
      // differ from what the queue holds — i.e. an external write (accepted
      // proposal, undo/redo landing) — via `rebase`, which also moves the
      // queue's own `head()` so it never sees a later op's `before` as the
      // pre-adopt value.
      const queue = queueFor(page.id, { title: page.title, blocks: page.blocks })
      const next = { title: page.title, blocks: page.blocks }
      if (JSON.stringify(next) !== JSON.stringify(queue.head())) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded one-shot adopt of an external write (accepted diff, undo/redo landing), not a cascade: the `if` above only ever lets this fire once per external write, since `rebase` moves `queue.head()` to match.
        setBlocks(page.blocks)
        queue.rebase(next)
      }
    }
    if (!pageId) loadedId.current = null
    // `saved` is read above but deliberately NOT a dependency: our own write
    // flips it true via the queue's `notify()` (synchronous) a render BEFORE
    // `enqueueTyped`/`enqueueStructural`'s `.then()` reconciles the
    // `['page', id]` cache (a microtask later) — keying this effect off
    // `saved` reran it on that earlier render, comparing against page.blocks
    // while it was still stale, and wrongly adopted (reverted) the save that
    // had just landed (KAN-495). Running only on `page`/`pageId` means this
    // branch next runs once the cache actually reflects the write, at which
    // point `next` already equals `queue.head()` and nothing is adopted.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `queueFor` is recreated every render (closes over `getSupabase`/`queryClient`/`pondId`) but only touches the module-level registry; keying off it would re-run this seeding effect on every render instead of only on page/pageId changes. `saved` is read, not a dep, per the comment above.
  }, [page, pageId])

  // Until the seeding effect above has run for THIS page, the local title/blocks
  // state still holds the previous node's values (effects run after paint). Every
  // read below — the type-switch branch included — goes through these derived
  // values so the correct surface and content paint on the very first frame: no
  // flash of the previous page's surface, no one-frame leak of the
  // previous page's state on node change (ticket-22 review).
  const seeded = !!page && page.id === seededId
  const viewBlocks: Block[] = seeded ? blocks : (page?.blocks ?? [])
  const viewTitle = seeded ? title : (page?.title ?? '')

  // Enqueue a typed (debounced) write — what `scheduleSave`'s timer fires and
  // what `flushNow` runs immediately. The queue reads `before` from its own
  // `head()` at apply time, never from here.
  function enqueueTyped(id: string, nextTitle: string, nextBlocks: Block[]): Promise<void> {
    const queue = queueFor(id, { title: nextTitle, blocks: nextBlocks })
    return queue
      .enqueue({ kind: 'typed', after: { title: nextTitle, blocks: nextBlocks } })
      .then(() => {
        queryClient.setQueryData(['page', id], (prev: PondPage | null | undefined) =>
          prev ? { ...prev, title: nextTitle, blocks: nextBlocks } : prev
        )
        // The root page's title is also the breadcrumb's root crumb on every page.
        queryClient.setQueryData(homeQueryKey(pondId), (prev: HomePage | null | undefined) =>
          prev && prev.id === id ? { ...prev, title: nextTitle } : prev
        )
        setSavedAt(new Date())
      })
      .catch((err) => {
        console.error('[document] save failed', id, err)
      })
  }

  function scheduleSave(nextTitle: string, nextBlocks: Block[]) {
    const id = loadedId.current
    if (!id) return
    setPendingDebounce(true)
    pendingSave.current = { pageId: id, title: nextTitle, blocks: nextBlocks }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      const p = pendingSave.current
      pendingSave.current = null
      setPendingDebounce(false)
      if (p) void enqueueTyped(p.pageId, p.title, p.blocks)
    }, EDIT_PAUSE_MS)
  }

  // Run a still-pending debounced save right now instead of waiting out the
  // pause — the composer calls this (via the page-flush registry) before
  // sending a message, so Pond's next read of the page never lands inside
  // the debounce window (KAN-302). Hands the pending save to the queue
  // (synchronously — nothing else can slip in ahead of it), then returns
  // the queue's own drain promise, which already covers that write plus
  // anything else still outstanding (KAN-495: the queue is the only record
  // of what's in flight).
  function flushNow(): Promise<void> | undefined {
    const id = loadedId.current
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const p = pendingSave.current
    pendingSave.current = null
    if (p) {
      setPendingDebounce(false)
      void enqueueTyped(p.pageId, p.title, p.blocks)
    }
    if (!id) return undefined
    return queueFor(id, { title: viewTitle, blocks: viewBlocks }).drained()
  }

  // `flushNow` is recreated every render; the registry entry stays stable per
  // pageId and calls through this ref so it always runs the latest closure.
  // The ref is written in an effect (never during render — react-hooks/refs).
  const flushNowRef = useRef(flushNow)
  useEffect(() => {
    flushNowRef.current = flushNow
  })
  useEffect(() => {
    if (!pageId) return
    return registerPageFlush(pageId, () => flushNowRef.current())
  }, [pageId])

  function onTitle(value: string) {
    setTitle(value)
    scheduleSave(value, viewBlocks)
  }

  // Set one typed property (#17). Direct user manipulation → OPTIMISTIC write
  // (decision 17: never the AI/proposal path): reflect it in the ['page'] cache
  // at once, then persist via the merge-safe setProperty (which preserves
  // _schema). `withValue` also refuses the reserved key, matching the writer.
  function onProperty(key: string, value: PropertyValue) {
    const id = loadedId.current
    if (!id) return
    queryClient.setQueryData(['page', id], (prev: PondPage | null | undefined) =>
      prev ? { ...prev, props: withValue(prev.props, key, value) } : prev
    )
    void setProperty(getSupabase(), id, key, value)
  }

  // Apply an in-editor block change (from BlockCanvas): update local state and
  // schedule the debounced persist. (Named to avoid colliding with the DB-level
  // commitBlocks.)
  function commitLocalEdit(next: Block[]) {
    setBlocks(next)
    scheduleSave(viewTitle, next)
  }

  type StructuralWriteOpts = {
    /**
     * A failed op normally stays halted for the next write to auto-retry
     * (⌘⌫, drag-drop: a transient failure behaves like today). A template
     * apply's `before`/`after` are only ever attempted once — a half-applied
     * template (blocks with no matching schema/props) must never be what a
     * later keystroke's write builds on — so that caller opts into
     * discarding the halted op outright and repainting local state back to
     * `head()` instead of leaving it to retry.
     */
    discardOnFailure?: boolean
  }

  // Enqueues `next` as this page's own structural op (flushing whatever typed
  // save the debounce is still waiting on first, synchronously, so the two
  // can never land as one record) and marks the draft saved once it lands —
  // the queue's `head()` IS what's stored, so there's nothing else to adopt.
  // Called only from `writeStructural` (BlockCanvas's one structural entry
  // point, which `undoRemove` also goes through) — never from inside a
  // `setBlocks` updater, which StrictMode double-invokes.
  function enqueueStructural(id: string, next: Block[], opts?: StructuralWriteOpts): Promise<boolean> {
    flushNow()
    const queue = queueFor(id, { title: viewTitle, blocks: next })
    // The cache is what a return trip reads. Write the in-flight blocks now,
    // not when the save resolves: leaving and coming back before it settles
    // would otherwise paint the pre-write page, and a word typed on that
    // stale screen is then thrown away with the failed apply — or, if the
    // apply lands, stored over the blocks the person never saw.
    queryClient.setQueryData(['page', id], (prev: PondPage | null | undefined) =>
      prev ? { ...prev, blocks: next } : prev
    )
    return queue
      .enqueue({ kind: 'structural', after: { title: viewTitle, blocks: next } })
      .then(() => {
        queryClient.setQueryData(['page', id], (prev: PondPage | null | undefined) =>
          prev ? { ...prev, blocks: next } : prev
        )
        setSavedAt(new Date())
        return true
      })
      .catch((err) => {
        console.error('[document] structural save failed', id, err)
        if (opts?.discardOnFailure) {
          // Any op already queued behind the halt (a debounce that fired
          // before the failure resolved) was built on this discarded
          // `after` too — discard it with the halted op, not just the
          // halted op itself, or it silently re-stores the failed apply.
          // This is that page's queue, so it is safe after the person has
          // moved on: page B has its own queue.
          queue.discardHalted({ andQueued: true })
          const stored = queue.head()
          // Roll the optimistic cache back even when another page is open.
          // A later visit reads this cache; leaving the discarded blocks
          // here would rebase the queue onto a template the store never held.
          queryClient.setQueryData(['page', id], (prev: PondPage | null | undefined) =>
            prev ? { ...prev, title: stored.title, blocks: stored.blocks } : prev
          )
          // The debounce timer and the on-screen blocks are the OPEN page's,
          // not this write's. A template apply on A that fails after the
          // person has opened B must not cancel B's pending save or repaint
          // B with A's stored blocks — B's next keystroke would then save
          // A's blocks over B. Only a pending save that still belongs to
          // this page, and a screen that is still this page, get rewound.
          const pending = pendingSave.current
          if (pending?.pageId === id) {
            if (saveTimer.current) {
              clearTimeout(saveTimer.current)
              saveTimer.current = null
            }
            pendingSave.current = null
            setPendingDebounce(false)
          }
          if (loadedId.current === id) setBlocks(stored.blocks)
        }
        return false
      })
  }

  // BlockCanvas's ONE structural entry point (KAN-495): a direct write
  // (⌘⌫, drag-drop, template apply, width change) updates local state and
  // enqueues its own structural op, replacing the old enqueue-then-`onChange`
  // pair that queued a second (typed) write of the same blocks behind it.
  function writeStructural(next: Block[], opts?: StructuralWriteOpts): Promise<boolean> {
    const id = loadedId.current
    if (!id) return Promise.resolve(false)
    setBlocks(next)
    return enqueueStructural(id, next, opts)
  }

  // Undo a block removal (ticket-44 review): re-insert against the LATEST blocks
  // (read from `blocksRef`, not `blocks` itself), so an edit made between the
  // delete and the Undo isn't clobbered by a re-base on the stale stage-time
  // snapshot (the original DocumentPanel behaviour, preserved through
  // BlockCanvas.onUndoRemove). `writeStructural` runs outside any `setBlocks`
  // updater — a functional updater here would run its enqueue as a side
  // effect of computing its return value, which StrictMode double-invokes.
  function undoRemove(index: number, block: Block, handedRowStartTo?: string | null) {
    const next = withUndoneRemove(blocksRef.current, index, block, handedRowStartTo)
    void writeStructural(next)
  }

  return {
    viewTitle,
    viewBlocks,
    saved,
    savedAt,
    onTitle,
    onProperty,
    commitLocalEdit,
    undoRemove,
    writeStructural,
  }
}
