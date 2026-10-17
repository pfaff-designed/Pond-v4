'use client'

/**
 * The open page's draft (lifted out of `DocumentPanel`): the title and blocks the
 * person is editing, seeded from the loaded page, and the debounced whole-array
 * save that writes them back. Saves are debounced and write the whole block array
 * (blocks are never partially persisted); renaming refreshes the sidebar via the
 * ['pages'] query.
 */

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import type { Block } from '@/lib/documents/types'
import { setProperty, updateTitle, type PondPage } from '@/lib/pages/client'
import { commitBlocks } from '@/lib/pages/commit'
import type { HomePage } from '@/lib/pages/home'
import { homeQueryKey } from '@/lib/pages/keys'
import { registerPageFlush } from '@/lib/pages/page-flush'
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

export function usePageDraft({ page, pageId, pondId, getSupabase }: PageDraftInput) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [saved, setSaved] = useState(true)
  // When the last autosave of this session landed; null until one has.
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  // Which page the local title/blocks state was seeded from. State (not the ref)
  // so render can branch on it; the ref below serves the event-handler save path.
  // Never reset on navigate-away: it can only ever match a page whose local state
  // came from that same page, so a stale value is harmless (re-seeded on return).
  const [seededId, setSeededId] = useState<string | null>(null)
  const loadedId = useRef<string | null>(null)
  const serverSig = useRef<string>('') // signature of the server blocks we've reconciled
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // What the open page held before its next pause: the blocks last saved, seeded
  // or adopted. Only the open page's — a save still pending from the page just
  // left carries its own, captured when it was scheduled.
  const lastSaved = useRef<{ pageId: string; blocks: Block[] } | null>(null)
  const lastSavedOf = (id: string): Block[] | null =>
    lastSaved.current?.pageId === id ? lastSaved.current.blocks : null
  // The save a debounce timer is currently waiting to fire, if any — held so
  // `flushNow` (KAN-302) can run it immediately instead of waiting out the pause.
  const pendingSave = useRef<{
    pageId: string
    title: string
    blocks: Block[]
    beforeAtSchedule: Block[]
  } | null>(null)
  // The save currently awaiting its network round-trip, if any — set the
  // instant it starts (before any await) so a `flushNow` that lands once the
  // debounce timer has already fired (pendingSave is null, runSave in flight)
  // returns THIS promise instead of racing ahead of it.
  const inFlightSave = useRef<Promise<void> | null>(null)
  // Read inside the debounce timer's callback (fires later than the render that
  // scheduled it), so it needs the latest value by ref rather than the closure's.
  const isOnline = useOnline()
  const isOnlineRef = useRef(isOnline)
  useEffect(() => {
    isOnlineRef.current = isOnline
  }, [isOnline])
  // Always the CURRENT page's latest edited title/blocks — read by a retry that
  // fires while that same page is still open, so it never resends the stale
  // payload that failed.
  const titleRef = useRef(title)
  const blocksRef = useRef(blocks)
  useEffect(() => {
    titleRef.current = title
  }, [title])
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])
  // A failed save's retry: timer, attempt count and payload, each keyed by
  // pageId (not a single ref) the same way `lastSaved` is keyed — so leaving
  // page A for page B doesn't cancel A's still-pending retry.
  const retryTimer = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const retryAttempt = useRef<Map<string, number>>(new Map())
  const retryPayload = useRef<Map<string, { title: string; blocks: Block[]; beforeAtSchedule: Block[] }>>(
    new Map()
  )
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set())
  // Pages whose debounce fired while offline and whose draft now lives in
  // `retryPayload` rather than the single `pendingSave` slot — a different
  // page's debounce firing next must never overwrite another page's draft.
  // Distinct from `retryingIds` (an actual failed-save backoff): a held
  // draft never attempted the network, so it carries no attempt count.
  const [heldIds, setHeldIds] = useState<Set<string>>(new Set())

  useEffect(
    () => () => {
      retryTimer.current.forEach((timer) => clearTimeout(timer))
    },
    []
  )

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
      // Offline, leaving a page whose debounce hasn't fired yet: hold its
      // draft now, under its own pageId, rather than leave it in the single
      // `pendingSave` slot — the page being opened could type and overwrite
      // it there before the old timer ever gets a chance to fire.
      const leavingId = loadedId.current
      if (leavingId && !isOnlineRef.current && pendingSave.current?.pageId === leavingId) {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current)
          saveTimer.current = null
        }
        holdOffline(pendingSave.current)
        pendingSave.current = null
      }
      loadedId.current = page.id
      serverSig.current = JSON.stringify(page.blocks)
      lastSaved.current = { pageId: page.id, blocks: page.blocks }
      setSeededId(page.id)
      // A failed save (or an offline hold) for this page is still pending —
      // seed from what the person actually typed, not the server copy, so
      // the reseed doesn't silently discard it and the eyebrow still reads
      // retrying/offline rather than saved. `lastSaved`/`serverSig` above
      // stay at the server copy regardless: that's still what the next
      // real save diffs against.
      const stored = retryPayload.current.get(page.id)
      if (stored) {
        setTitle(stored.title)
        setBlocks(stored.blocks)
        setSaved(false)
      } else {
        setTitle(page.title)
        setBlocks(page.blocks)
        setSaved(true)
      }
      setSavedAt(null)
    } else if (page && page.id === loadedId.current && saved) {
      // Same page, no unsaved edits: adopt server blocks only when they changed
      // vs. what we last reconciled — i.e. an external write (accepted proposal).
      const sig = JSON.stringify(page.blocks)
      if (sig !== serverSig.current) {
        serverSig.current = sig
        // The write already has its own record; the next own edit starts after it.
        lastSaved.current = { pageId: page.id, blocks: page.blocks }
        setBlocks(page.blocks)
      }
    }
    if (!pageId) loadedId.current = null
  }, [page, pageId, saved])

  // Until the seeding effect above has run for THIS page, the local title/blocks
  // state still holds the previous node's values (effects run after paint). Every
  // read below — the type-switch branch included — goes through these derived
  // values so the correct surface and content paint on the very first frame: no
  // flash of the previous page's surface, no one-frame leak of the
  // previous page's state on node change (ticket-22 review).
  const seeded = !!page && page.id === seededId
  const viewBlocks: Block[] = seeded ? blocks : (page?.blocks ?? [])
  const viewTitle = seeded ? title : (page?.title ?? '')

  // The save itself, pulled out of `scheduleSave` so `flushNow` can run it
  // immediately instead of waiting for the debounce timer to fire (KAN-302).
  async function runSave(
    id: string,
    nextTitle: string,
    nextBlocks: Block[],
    beforeAtSchedule: Block[]
  ) {
    // This save is one pause: the change log records it as one edit, from what
    // the page last saved to what it saves now. Advanced before the first await
    // so a save that fires while this one is in flight starts from here, and
    // set back if this one fails, so the next starts from what is stored.
    const before = lastSavedOf(id) ?? beforeAtSchedule
    const advanced = lastSavedOf(id) !== null
    if (advanced) lastSaved.current = { pageId: id, blocks: nextBlocks }
    // Title first, then blocks + sidebar-refresh + re-embed via the shared
    // commitBlocks (same tail the accepted-AI-edit path uses). Sequential so
    // the ['pages'] invalidation inside commitBlocks lands after the rename,
    // keeping the sidebar rename immediate.
    const supabase = getSupabase()
    // Settles once the save's change-log record is on `sessionUndo`'s stack
    // (commitBlocks's `remembered`) — awaited below, AFTER `setSaved`, so a
    // ⌘Z that races in right after this save finds its own record already
    // remembered instead of falling through to the previous step (KAN-355).
    let remembered: Promise<void> = Promise.resolve()
    try {
      await updateTitle(supabase, id, nextTitle)
      // `ownEdit`: the page moved on under the person's own hand, so every
      // pending block diff aimed at it goes outdated — its card greys out,
      // drops accept and offers revise — and the save is logged as accepted.
      ;({ remembered } = await commitBlocks(supabase, queryClient, id, nextBlocks, {
        ownEdit: true,
        before,
        pondId,
      }))
    } catch (err) {
      if (advanced && lastSaved.current?.pageId === id && lastSaved.current.blocks === nextBlocks) {
        lastSaved.current = { pageId: id, blocks: before }
      }
      console.error('[document] save failed', id, err)
      scheduleRetry(id, nextTitle, nextBlocks, beforeAtSchedule)
      return
    }
    // keep the ['page'] cache — and the signature the adopt compares against —
    // in step with what we just saved, so the same-page adopt above only fires
    // for genuinely external writes.
    if (loadedId.current === id) serverSig.current = JSON.stringify(nextBlocks)
    queryClient.setQueryData(['page', id], (prev: PondPage | null | undefined) =>
      prev ? { ...prev, title: nextTitle, blocks: nextBlocks } : prev
    )
    // The root page's title is also the breadcrumb's root crumb on every page.
    queryClient.setQueryData(homeQueryKey(pondId), (prev: HomePage | null | undefined) =>
      prev && prev.id === id ? { ...prev, title: nextTitle } : prev
    )
    // The save that just landed may belong to a page that's no longer open
    // (another page's retry) or have been superseded by a newer edit already
    // typed for the same page (its own next debounce, or a save already
    // started off that newer draft) — only the open page's save, carrying
    // what is STILL the latest draft, marks the eyebrow saved.
    if (loadedId.current === id && nextTitle === titleRef.current && nextBlocks === blocksRef.current) {
      setSaved(true)
      setSavedAt(new Date())
    }
    clearRetry(id)
    // Resolve `runSave` (and so `startSave`'s chain/`inFlightSave`/`flushNow`)
    // only once the record above is remembered — never before "saved", and
    // never rejects (commitBlocks's `remembered` already swallows its own
    // failures).
    await remembered
  }

  // Cancel `id`'s pending retry (if any) and forget its attempt count and
  // stored payload — a save for `id` landed, so nothing it schedules matters.
  function clearRetry(id: string) {
    const timer = retryTimer.current.get(id)
    if (timer) clearTimeout(timer)
    retryTimer.current.delete(id)
    retryAttempt.current.delete(id)
    retryPayload.current.delete(id)
    setRetryingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setHeldIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  // Offline: a draft that can't reach the network can't stay in the single
  // `pendingSave` slot once there's any chance another page's debounce fires
  // next — that would silently overwrite it. Move it into the per-pageId
  // `retryPayload` map instead (reusing the retry machinery): the `online`
  // transition below already resumes every entry there, so a held draft
  // saves on reconnect same as a real retry does.
  function holdOffline(p: { pageId: string; title: string; blocks: Block[]; beforeAtSchedule: Block[] }) {
    retryPayload.current.set(p.pageId, {
      title: p.title,
      blocks: p.blocks,
      beforeAtSchedule: p.beforeAtSchedule,
    })
    setHeldIds((prev) => (prev.has(p.pageId) ? prev : new Set(prev).add(p.pageId)))
  }

  // Back off and try again with whatever `id` holds at the moment the retry
  // fires — never the payload that just failed. A later failed save for the
  // same `id` (including this same retry failing again) replaces the pending
  // timer and payload rather than racing it.
  function scheduleRetry(id: string, title: string, blocks: Block[], beforeAtSchedule: Block[]) {
    const existing = retryTimer.current.get(id)
    if (existing) clearTimeout(existing)
    retryPayload.current.set(id, { title, blocks, beforeAtSchedule })
    const attempt = retryAttempt.current.get(id) ?? 0
    retryAttempt.current.set(id, attempt + 1)
    setRetryingIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    const timer = setTimeout(() => {
      retryTimer.current.delete(id)
      runRetry(id)
    }, nextRetryDelayMs(attempt))
    retryTimer.current.set(id, timer)
  }

  // `id` may no longer be the open page by the time its backoff elapses — read
  // the live title/blocks refs only while it still is; otherwise resend the
  // payload stored when the save failed (nothing newer exists for a page the
  // person has left).
  function runRetry(id: string) {
    if (!isOnlineRef.current) return
    const stored = retryPayload.current.get(id)
    if (!stored) return
    const isCurrent = id === loadedId.current
    const nextTitle = isCurrent ? titleRef.current : stored.title
    const nextBlocks = isCurrent ? blocksRef.current : stored.blocks
    void startSave(id, nextTitle, nextBlocks, stored.beforeAtSchedule)
  }

  // Runs `runSave` and tracks it in `inFlightSave` for the window it is
  // actually awaiting its network round-trip — set synchronously, before
  // `runSave`'s first `await`, so nothing can observe the save as "started"
  // without also finding it here. Chained on the previous save (if any) so two
  // saves of the same page never run at once and land out of order (KAN-355):
  // `runSave`'s own `before`/`lastSaved` advance only runs once this save
  // actually starts, which is now after the previous one has fully settled.
  // With no previous save, `runSave` is called directly rather than through a
  // `Promise.resolve().then(...)` hop — existing callers (`flushNow` in
  // particular) rely on the first save's `updateTitle` having already been
  // called by the time `startSave` returns, not one microtask later.
  function startSave(
    id: string,
    nextTitle: string,
    nextBlocks: Block[],
    beforeAtSchedule: Block[]
  ): Promise<void> {
    // `id` already has a retry/held entry: refresh it with what's actually
    // about to be saved, synchronously and before chaining (`runSave` may run
    // a tick or a whole save later under the KAN-355 chain) — otherwise a
    // page switch that reseeds from `retryPayload` while THIS save is still
    // queued finds the older draft that failed, not this newer one, and
    // silently reseeds back to it. Timer/attempt count stay as they are;
    // only the stored payload moves.
    if (retryPayload.current.has(id)) {
      retryPayload.current.set(id, { title: nextTitle, blocks: nextBlocks, beforeAtSchedule })
    }
    const prev = inFlightSave.current
    const promise = (
      prev
        ? prev.catch(() => {}).then(() => runSave(id, nextTitle, nextBlocks, beforeAtSchedule))
        : runSave(id, nextTitle, nextBlocks, beforeAtSchedule)
    ).finally(() => {
      if (inFlightSave.current === promise) inFlightSave.current = null
    })
    inFlightSave.current = promise
    return promise
  }

  function scheduleSave(nextTitle: string, nextBlocks: Block[]) {
    const id = loadedId.current
    if (!id) return
    setSaved(false)
    const beforeAtSchedule = lastSavedOf(id) ?? []
    pendingSave.current = { pageId: id, title: nextTitle, blocks: nextBlocks, beforeAtSchedule }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      const p = pendingSave.current
      pendingSave.current = null
      if (!p) return
      // Offline: never hit the network — hold the draft under its own pageId
      // so the `online` transition below flushes it (with whatever is newest
      // by then) without risking another page's debounce overwriting it.
      if (!isOnlineRef.current) {
        holdOffline(p)
        return
      }
      void startSave(p.pageId, p.title, p.blocks, p.beforeAtSchedule)
    }, EDIT_PAUSE_MS)
  }

  // Run a still-pending debounced save right now instead of waiting out the
  // pause — the composer calls this (via the page-flush registry) before
  // sending a message, so Pond's next read of the page never lands inside
  // the debounce window (KAN-302). If the debounce timer has ALREADY fired and
  // its save is in flight (nothing pending, but `runSave` is awaiting its
  // network round-trip), return that same promise rather than undefined —
  // otherwise the composer would send while the save it's meant to wait on is
  // still in the air.
  function flushNow(): Promise<void> | undefined {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    // Offline: never hit the network — leave `pendingSave` as it is so the
    // `online` transition flushes it (with whatever is newest by then).
    if (!isOnlineRef.current) return inFlightSave.current ?? undefined
    const p = pendingSave.current
    pendingSave.current = null
    if (p) return startSave(p.pageId, p.title, p.blocks, p.beforeAtSchedule)
    return inFlightSave.current ?? undefined
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

  // `runRetry` closes over refs only, but kept behind a ref regardless (same
  // reason as `flushNowRef`) so the `online` effect below always calls the
  // latest closure rather than one captured at some earlier render.
  const runRetryRef = useRef(runRetry)
  useEffect(() => {
    runRetryRef.current = runRetry
  })

  // `online` transition (KAN-407): flush the draft left pending by the offline
  // gate above, at once, with whatever is newest — never wait out a fresh debounce.
  // A retry stuck mid-backoff when the network dropped would otherwise never
  // resume (its own timer already fired and bailed out via `runRetry`'s offline
  // check, deleting itself without rescheduling) — so every outstanding retry
  // also fires at once here, with its attempt count reset to 0 first: "online
  // resets the backoff", so a fresh failure restarts at the first 2s step
  // rather than resuming whatever step was ticking when offline hit.
  const wasOnline = useRef(isOnline)
  useEffect(() => {
    if (isOnline && !wasOnline.current) {
      // Read before `flushNowRef` below clears it — if that page also has a
      // held/retrying entry (typed again after the hold), `flushNow` already
      // sends its newest draft, so draining that same id next would fire a
      // second, redundant save for it.
      const flushedPageId = pendingSave.current?.pageId ?? null
      void flushNowRef.current()
      retryPayload.current.forEach((_, id) => {
        if (id === flushedPageId) return
        const timer = retryTimer.current.get(id)
        if (timer) clearTimeout(timer)
        retryTimer.current.delete(id)
        retryAttempt.current.set(id, 0)
        runRetryRef.current(id)
      })
    }
    wasOnline.current = isOnline
  }, [isOnline])

  // `beforeunload` (KAN-407): `saved` tracks only the OPEN page — switching to
  // page B re-seeds `saved` true even while page A still has a retry pending
  // (`retryingIds` is keyed by pageId and survives the switch), so `saved`
  // alone would let the tab close with A's edit lost. Gate on unsaved work
  // for ANY page instead — `heldIds` covers an offline-held draft the same way.
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
    void setProperty(getSupabase(), id, key, value)
  }

  // Apply an in-editor block change (from BlockCanvas): update local state and
  // schedule the debounced persist. (Named to avoid colliding with the DB-level
  // commitBlocks.)
  function commitLocalEdit(next: Block[]) {
    setBlocks(next)
    scheduleSave(viewTitle, next)
  }

  // A caller that just wrote blocks directly (KAN-124's template apply: its own
  // `appendOwnEdit` + `sessionUndo.remember`, bypassing `scheduleSave` entirely)
  // still goes on to call `commitLocalEdit` so the editor's local state reflects
  // the write. Without this, `lastSaved` would still hold the baseline from
  // BEFORE that write, so `commitLocalEdit`'s own debounced save would fire with
  // a stale `before` and log a second own-edit record for the same change. Call
  // this FIRST (synchronously, before `commitLocalEdit`) so that save's `before`
  // is already the blocks just written — byte-equal to its `after`, so
  // `recordOwnEdit` logs nothing for it.
  function adoptSavedBlocks(blocks: Block[]) {
    const id = loadedId.current
    if (!id) return
    lastSaved.current = { pageId: id, blocks }
    serverSig.current = JSON.stringify(blocks)
  }

  // Undo a block removal (ticket-44 review): re-insert against the LATEST blocks
  // via a functional update, so an edit made between the delete and the Undo
  // isn't clobbered by a re-base on the stale stage-time snapshot (the original
  // DocumentPanel behaviour, preserved through BlockCanvas.onUndoRemove).
  function undoRemove(index: number, block: Block) {
    setBlocks((current) => {
      const at = Math.min(index, current.length)
      const next = [...current.slice(0, at), block, ...current.slice(at)]
      scheduleSave(viewTitle, next)
      return next
    })
  }

  return {
    viewTitle,
    viewBlocks,
    saved,
    savedAt,
    offline: !isOnline,
    retrying: pageId ? retryingIds.has(pageId) : false,
    onTitle,
    onProperty,
    commitLocalEdit,
    undoRemove,
    adoptSavedBlocks,
  }
}
