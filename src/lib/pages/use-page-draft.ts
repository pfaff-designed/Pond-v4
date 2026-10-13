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
      serverSig.current = JSON.stringify(page.blocks)
      lastSaved.current = { pageId: page.id, blocks: page.blocks }
      setSeededId(page.id)
      setTitle(page.title)
      setBlocks(page.blocks)
      setSaved(true)
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
    try {
      await updateTitle(supabase, id, nextTitle)
      // `ownEdit`: the page moved on under the person's own hand, so every
      // pending block diff aimed at it goes outdated — its card greys out,
      // drops accept and offers revise — and the save is logged as accepted.
      await commitBlocks(supabase, queryClient, id, nextBlocks, {
        ownEdit: true,
        before,
        pondId,
      })
    } catch (err) {
      if (advanced && lastSaved.current?.pageId === id && lastSaved.current.blocks === nextBlocks) {
        lastSaved.current = { pageId: id, blocks: before }
      }
      console.error('[document] save failed', id, err)
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
    setSaved(true)
    setSavedAt(new Date())
  }

  // Runs `runSave` and tracks it in `inFlightSave` for the window it is
  // actually awaiting its network round-trip — set synchronously, before
  // `runSave`'s first `await`, so nothing can observe the save as "started"
  // without also finding it here.
  function startSave(
    id: string,
    nextTitle: string,
    nextBlocks: Block[],
    beforeAtSchedule: Block[]
  ): Promise<void> {
    const promise = runSave(id, nextTitle, nextBlocks, beforeAtSchedule).finally(() => {
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
      if (p) void startSave(p.pageId, p.title, p.blocks, p.beforeAtSchedule)
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

  return { viewTitle, viewBlocks, saved, savedAt, onTitle, onProperty, commitLocalEdit, undoRemove }
}
