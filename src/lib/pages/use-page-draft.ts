'use client'

/**
 * The open page's draft (lifted out of `DocumentPanel`): the title and blocks the
 * person is editing, seeded from the loaded page, and the debounced whole-array
 * save that writes them back. Saves are debounced and write the whole block array
 * (blocks are never partially persisted); renaming refreshes the sidebar via the
 * ['pages'] query.
 *
 * The write queue (KAN-495) is the only record of what is stored and in what
 * order. A failed typed save, an offline hold, and a debounce still waiting
 * when the person leaves the page (KAN-407) sit on top of that queue: the
 * eyebrow can say retrying or offline, and the draft is what gets sent.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import { sessionUndo, type PendingHistoryStep, type UndoHandle } from '@/lib/change-log/session-undo'
import type { Block } from '@/lib/documents/types'
import { closeBlockHistory } from '@/lib/modules/text/active-editor'
import { withoutRowStart } from '@/lib/modules/layout-rows'
import { setProperty, type PondPage } from '@/lib/pages/client'
import { createPageWriter, type PageWriteState } from '@/lib/pages/commit'
import type { HomePage } from '@/lib/pages/home'
import { homeQueryKey } from '@/lib/pages/keys'
import { getPageWriteQueue, registerPageFlush } from '@/lib/pages/page-flush'
import { createPageWriteQueue, type PageWriteQueue } from '@/lib/pages/page-write-queue'
import { nextRetryDelayMs } from '@/lib/pages/save-retry'
import { useOnline } from '@/lib/pages/use-online'
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

type DraftSnapshot = { title: string; blocks: Block[] }
type PendingDraft = DraftSnapshot & { pageId: string }

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
  // (nothing queued, mid-apply, or halted) AND this page has no offline hold
  // and no typed-save retry outstanding. The queue half is read straight
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
  const pendingSave = useRef<PendingDraft | null>(null)
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
  // The latest title/blocks, read by a retry instead of a `setBlocks`
  // functional updater: StrictMode double-invokes an updater function, and
  // `undoRemove`'s updater enqueued a structural write as a side effect of
  // computing its return value, so one toast Undo produced two writes (two
  // change-log records) in development. A ref updated after every render
  // gives the same "latest, not stale" guarantee without running inside React's
  // updater machinery. The title ref is the same idea for a retry that must
  // resend what the open page shows now, not the payload that failed.
  const blocksRef = useRef(blocks)
  const titleRef = useRef(title)
  useEffect(() => {
    blocksRef.current = blocks
    titleRef.current = title
  })
  const isOnline = useOnline()
  const isOnlineRef = useRef(isOnline)
  useEffect(() => {
    isOnlineRef.current = isOnline
  })

  // Latest typed draft per page that has not landed: an in-flight save, a
  // failed save waiting out its backoff, or an offline hold. Keyed by page id
  // so leaving the page does not drop it. Cleared only when THAT draft lands.
  const drafts = useRef<Map<string, DraftSnapshot>>(new Map())
  const retryTimer = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const retryAttempt = useRef<Map<string, number>>(new Map())
  const retryingIdsRef = useRef<Set<string>>(new Set())
  const heldIdsRef = useRef<Set<string>>(new Set())
  const [retryingIds, setRetryingIds] = useState<Set<string>>(retryingIdsRef.current)
  const [heldIds, setHeldIds] = useState<Set<string>>(heldIdsRef.current)

  function setRetrying(id: string, on: boolean) {
    const prev = retryingIdsRef.current
    if (prev.has(id) === on) return
    const next = new Set(prev)
    if (on) next.add(id)
    else next.delete(id)
    retryingIdsRef.current = next
    setRetryingIds(next)
  }

  function setHeld(id: string, on: boolean) {
    const prev = heldIdsRef.current
    if (prev.has(id) === on) return
    const next = new Set(prev)
    if (on) next.add(id)
    else next.delete(id)
    heldIdsRef.current = next
    setHeldIds(next)
  }

  function clearDraft(id: string) {
    drafts.current.delete(id)
    const timer = retryTimer.current.get(id)
    if (timer) clearTimeout(timer)
    retryTimer.current.delete(id)
    retryAttempt.current.delete(id)
    setRetrying(id, false)
    setHeld(id, false)
  }

  useEffect(
    () => () => {
      retryTimer.current.forEach((timer) => clearTimeout(timer))
    },
    []
  )

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
  const retryingHere = pageId !== null && retryingIds.has(pageId)
  const heldHere = pageId !== null && heldIds.has(pageId)
  const saved = !pendingDebounce && queueIdle && !retryingHere && !heldHere

  // A typed save landed. The cache follows what the queue stored. A newer
  // draft already remembered for this page (typed again while this one was
  // in flight) is left alone — clearing it would reseed the page back to
  // the save that just finished.
  function land(id: string, nextTitle: string, nextBlocks: Block[]) {
    queryClient.setQueryData(['page', id], (prev: PondPage | null | undefined) =>
      prev ? { ...prev, title: nextTitle, blocks: nextBlocks } : prev
    )
    queryClient.setQueryData(homeQueryKey(pondIdRef.current), (prev: HomePage | null | undefined) =>
      prev && prev.id === id ? { ...prev, title: nextTitle } : prev
    )
    const stored = drafts.current.get(id)
    const landedThis = !stored || (stored.title === nextTitle && stored.blocks === nextBlocks)
    if (!landedThis) return
    clearDraft(id)
    if (loadedId.current === id) setSavedAt(new Date())
  }

  // Back off and try the halted op again. `attempt` is the 0-based step
  // already used; the next failure reads the incremented count, so a second
  // failure waits 4s rather than restarting at 2s.
  function scheduleRetry(id: string, nextTitle: string, nextBlocks: Block[]) {
    const existing = retryTimer.current.get(id)
    if (existing) clearTimeout(existing)
    drafts.current.set(id, { title: nextTitle, blocks: nextBlocks })
    const attempt = retryAttempt.current.get(id) ?? 0
    retryAttempt.current.set(id, attempt + 1)
    setRetrying(id, true)
    setHeld(id, false)
    const timer = setTimeout(() => {
      retryTimer.current.delete(id)
      runRetry(id)
    }, nextRetryDelayMs(attempt))
    retryTimer.current.set(id, timer)
  }

  // Offline: the draft cannot stay in the single `pendingSave` slot, because
  // the next page's debounce writes that same slot. Park it under its page id.
  // A halted typed op from before the drop is the older payload — drop it so
  // reconnect sends this draft, not the one that failed.
  function holdOffline(p: PendingDraft) {
    drafts.current.set(p.pageId, { title: p.title, blocks: p.blocks })
    const queue = queueFor(p.pageId, { title: p.title, blocks: p.blocks })
    if (queue.halted()) {
      const timer = retryTimer.current.get(p.pageId)
      if (timer) clearTimeout(timer)
      retryTimer.current.delete(p.pageId)
      queue.discardHalted()
      setRetrying(p.pageId, false)
    }
    setHeld(p.pageId, true)
  }

  // Enqueue a typed (debounced) write — what `scheduleSave`'s timer fires and
  // what `flushNow` runs immediately. The queue reads `before` from its own
  // `head()` at apply time, never from here.
  function enqueueTyped(id: string, nextTitle: string, nextBlocks: Block[]): Promise<void> {
    drafts.current.set(id, { title: nextTitle, blocks: nextBlocks })
    setHeld(id, false)
    const queue = queueFor(id, { title: nextTitle, blocks: nextBlocks })
    // A later edit does not drop the failed save. `enqueue` retries that op
    // first, then applies this one, so each stays its own undo step (KAN-495).
    // The backoff timer for the failed attempt is stale once this write takes
    // over the retry.
    if (retryingIdsRef.current.has(id) && queue.halted()) {
      const timer = retryTimer.current.get(id)
      if (timer) clearTimeout(timer)
      retryTimer.current.delete(id)
    }
    const onPending = reserveUndoSlot()?.resolve
    return queue
      .enqueue({ kind: 'typed', after: { title: nextTitle, blocks: nextBlocks }, onPending })
      .then(() => {
        land(id, nextTitle, nextBlocks)
      })
      .catch((err: unknown) => {
        if (!queue.halted()) {
          const stored = drafts.current.get(id)
          if (stored && stored.title === nextTitle && stored.blocks === nextBlocks) drafts.current.delete(id)
          return
        }
        const pond = pondIdRef.current
        if (pond) sessionUndo.markPendingFailed(pond)
        console.error('[document] save failed', id, err)
        scheduleRetry(id, nextTitle, nextBlocks)
      })
  }

  // `id` may no longer be the open page. While it is, send what it shows now;
  // otherwise send the draft stored when the save failed or was held.
  function runRetry(id: string) {
    if (!isOnlineRef.current) return
    const stored = drafts.current.get(id)
    if (!stored) return
    const isCurrent = id === loadedId.current
    const nextTitle = isCurrent ? titleRef.current : stored.title
    const nextBlocks = isCurrent ? blocksRef.current : stored.blocks
    const queue = queueFor(id, { title: nextTitle, blocks: nextBlocks })
    const same = stored.title === nextTitle && stored.blocks === nextBlocks
    if (queue.halted() && same) {
      void queue
        .retry()
        .then(() => {
          land(id, nextTitle, nextBlocks)
        })
        .catch((err: unknown) => {
          if (!queue.halted()) return
          console.error('[document] save failed', id, err)
          scheduleRetry(id, nextTitle, nextBlocks)
        })
      return
    }
    // The newer attempt is already in the queue. A backoff timer that fires
    // in this window must not enqueue the same draft a second time.
    if (!queue.idle() && same) return
    void enqueueTyped(id, nextTitle, nextBlocks)
  }

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
      // The single `pendingSave` slot is shared by every page. The page being
      // opened could type into it before the old timer fires, and the edit
      // just left would be gone. Offline, hold it under its own page id.
      // Online, start it now — there is no reason to wait out the pause.
      const leavingId = loadedId.current
      if (leavingId && pendingSave.current?.pageId === leavingId) {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current)
          saveTimer.current = null
        }
        const p = pendingSave.current
        pendingSave.current = null
        if (!isOnlineRef.current) holdOffline(p)
        else void enqueueTyped(p.pageId, p.title, p.blocks)
      }
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
      // page. A draft we are still holding (failed, in flight, or offline)
      // is that typed work even when the queue is idle, so it is not rebased
      // away either.
      const stored = drafts.current.get(page.id)
      if (queue.idle() && !stored && JSON.stringify(queue.head().blocks) !== JSON.stringify(page.blocks)) {
        queue.rebase({ title: page.title, blocks: page.blocks })
      }
      setSeededId(page.id)
      if (stored) {
        setTitle(stored.title)
        setBlocks(stored.blocks)
      } else {
        setTitle(page.title)
        setBlocks(page.blocks)
      }
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

  // KAN-368: the undo slot exists the instant the write is enqueued — before
  // it waits behind anything already in the queue and before its round trip —
  // so ⌘Z takes this step, not whatever settled underneath it. The queue still
  // owns `before` (`head()` at apply time). `onPending` fills the slot once
  // the record ids are known; a second `remember` would stack a duplicate.
  function reserveUndoSlot(opts?: {
    onUndone?: () => Promise<void> | void
    onRedone?: () => Promise<void> | void
  }):
    | {
        resolve: (recordIds: readonly string[] | null) => void
        handle: UndoHandle
      }
    | undefined {
    const id = pondIdRef.current
    if (!id) return undefined
    let resolveRecordIds: (recordIds: readonly string[] | null) => void = () => {}
    let settled = false
    const recordIds = new Promise<readonly string[] | null>((resolve) => {
      resolveRecordIds = (ids) => {
        if (settled) return
        settled = true
        resolve(ids)
      }
    })
    const handle = sessionUndo.rememberPending({
      pondId: id,
      recordIds,
      onUndone: opts?.onUndone,
      onRedone: opts?.onRedone,
    })
    const pending = handle as PendingHistoryStep
    const resolve = resolveRecordIds
    resolveRecordIds = (ids) => {
      pending.attemptFailed = false
      resolve(ids)
    }
    return { resolve: resolveRecordIds, handle }
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
      if (!p) return
      setPendingDebounce(false)
      if (!isOnlineRef.current) {
        holdOffline(p)
        return
      }
      void enqueueTyped(p.pageId, p.title, p.blocks)
    }, EDIT_PAUSE_MS)
  }

  // Run a still-pending debounced save right now instead of waiting out the
  // pause — the composer calls this (via the page-flush registry) before
  // sending a message, so Pond's next read of the page never lands inside
  // the debounce window (KAN-302). Hands the pending save to the queue
  // (synchronously — nothing else can slip in ahead of it), then returns
  // the queue's own drain promise, which already covers that write plus
  // anything else still outstanding (KAN-495: the queue is the only record
  // of what's in flight). Offline, the pending draft stays where it is: the
  // `online` transition below is what sends it.
  function flushNow(): Promise<void> | undefined {
    const id = loadedId.current
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (!isOnlineRef.current) {
      if (!id) return undefined
      return queueFor(id, { title: viewTitle, blocks: viewBlocks }).drained()
    }
    const p = pendingSave.current
    pendingSave.current = null
    if (p) {
      setPendingDebounce(false)
      void enqueueTyped(p.pageId, p.title, p.blocks)
      // KAN-368: close these fields' history now, not when the record is
      // durable. A structural edit flushes this save and moves focus; ⌘Z
      // right after must fall through to the session step. The slot above
      // was reserved in the same turn, so the shell has something to take.
      for (const block of p.blocks) {
        if ('content' in block) closeBlockHistory(block.id, block.content)
      }
    }
    if (!id) return undefined
    return queueFor(id, { title: viewTitle, blocks: viewBlocks }).drained()
  }

  // `flushNow` / `runRetry` / `enqueueTyped` are recreated every render; the
  // effects below stay stable and call through these refs. Written in an
  // effect (never during render — react-hooks/refs).
  const flushNowRef = useRef(flushNow)
  const runRetryRef = useRef(runRetry)
  const enqueueTypedRef = useRef(enqueueTyped)
  useEffect(() => {
    flushNowRef.current = flushNow
    runRetryRef.current = runRetry
    enqueueTypedRef.current = enqueueTyped
  })
  useEffect(() => {
    if (!pageId) return
    return registerPageFlush(pageId, () => flushNowRef.current())
  }, [pageId])

  // `online` (KAN-407): send the draft the offline gate held, at once, with
  // whatever is newest — never wait out a fresh debounce. A retry whose
  // timer already fired while offline bailed without rescheduling; coming
  // back starts it now, and resets the backoff so the next failure waits 2s
  // again rather than whatever step was left.
  const wasOnline = useRef(isOnline)
  useEffect(() => {
    if (isOnline && !wasOnline.current) {
      const flushedPageId = pendingSave.current?.pageId ?? null
      void flushNowRef.current()
      for (const id of [...heldIdsRef.current]) {
        if (id === flushedPageId) continue
        const draft = drafts.current.get(id)
        setHeld(id, false)
        if (draft) void enqueueTypedRef.current(id, draft.title, draft.blocks)
      }
      for (const id of [...retryingIdsRef.current]) {
        if (id === flushedPageId) continue
        const timer = retryTimer.current.get(id)
        if (timer) clearTimeout(timer)
        retryTimer.current.delete(id)
        retryAttempt.current.set(id, 0)
        runRetryRef.current(id)
      }
    }
    wasOnline.current = isOnline
  }, [isOnline])

  // `beforeunload` (KAN-407): `saved` is the OPEN page. Switching to page B
  // can read saved while page A still has a retry or an offline hold, so the
  // tab must still warn. `heldIds` / `retryingIds` are keyed by page id and
  // survive that switch.
  const hasUnsavedWork = !saved || retryingIds.size > 0 || heldIds.size > 0
  useEffect(() => {
    if (!hasUnsavedWork) return
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedWork])

  // `pagehide` / `visibilitychange` (KAN-407): flush the pending draft the
  // instant the tab is closed or backgrounded, rather than waiting out the
  // debounce — mirrors the deletion-undo flush-on-hide (useDeletionUndo.tsx).
  // `visibilitychange` fires first and gives the request more time to leave.
  // Offline, `flushNow` leaves the draft pending for the online transition.
  useEffect(() => {
    function handleHide() {
      void flushNowRef.current()
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') handleHide()
    }
    window.addEventListener('pagehide', handleHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', handleHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

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
    setProperty(getSupabase(), id, key, value).catch((err) =>
      console.error('Failed to save property', key, err)
    )
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
    /** View-insert's new database (KAN-368): run once the ⌘Z/⇧⌘Z RPC lands. */
    onUndone?: () => Promise<void> | void
    onRedone?: () => Promise<void> | void
    /** Fires synchronously with the reserved handle, before the write awaits. */
    onUndoHandle?: (handle: UndoHandle) => void
  }

  // Enqueues `next` as this page's own structural op (flushing whatever typed
  // save the debounce is still waiting on first, synchronously, so the two
  // can never land as one record) and marks the draft saved once it lands —
  // the queue's `head()` IS what's stored, so there's nothing else to adopt.
  // Called only from `writeStructural` (BlockCanvas's one structural entry
  // point, which `undoRemove` also goes through) — never from inside a
  // `setBlocks` updater, which StrictMode double-invokes.
  function enqueueStructural(id: string, next: Block[], opts?: StructuralWriteOpts): Promise<boolean> {
    // Flush first so the typed save's slot is reserved UNDER this one.
    flushNow()
    const reserved = reserveUndoSlot(opts)
    const onPending = reserved?.resolve
    if (reserved) opts?.onUndoHandle?.(reserved.handle)
    // The slot is already on the stack. Close these fields now so a ⌘Z in
    // the same turn falls through to it instead of the editor's own history
    // (KAN-368). The record still fills the slot when the write lands.
    for (const block of next) {
      if ('content' in block) closeBlockHistory(block.id, block.content)
    }
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
      .enqueue({ kind: 'structural', after: { title: viewTitle, blocks: next }, onPending })
      .then(() => {
        queryClient.setQueryData(['page', id], (prev: PondPage | null | undefined) =>
          prev ? { ...prev, blocks: next } : prev
        )
        setSavedAt(new Date())
        return true
      })
      .catch((err: unknown) => {
        console.error('[document] structural save failed', id, err)
        const discarded = err instanceof Error && err.message.includes('discarded')
        if (discarded) {
          // Already dropped with the halted op. Settle the slot; don't
          // discard again or repaint from this op's own `before`.
          onPending?.(null)
          return false
        }
        if (opts?.discardOnFailure) {
          // Not retried — the reserved slot must settle or ⌘Z waits it out.
          onPending?.(null)
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
        } else {
          const pond = pondIdRef.current
          if (pond) sessionUndo.markPendingFailed(pond)
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
    offline: !isOnline,
    retrying: retryingHere,
    onTitle,
    onProperty,
    commitLocalEdit,
    undoRemove,
    writeStructural,
  }
}
