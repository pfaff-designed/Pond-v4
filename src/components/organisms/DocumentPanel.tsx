'use client'

/**
 * The main-panel page renderer. Reads the open page id from the URL (?nodeId=),
 * loads the page, and lets you edit its title and content blocks. Everything is
 * a page, so this is the one surface for Life, areas, sub-pages, projects — all
 * of them (`Pond 03 Concepts`: "The only container. A page holds blocks, and
 * pages nest inside pages… Life is the page at the top.").
 *
 * The root (#234): no ?nodeId means Life, whose blocks live on the reserved
 * per-user home row (lib/pages/home). The row is resolved here and then takes
 * the SAME path as any other page — no bespoke surface, no distinct area kind
 * (#108). Its nested pages are the top-level pages, shown through the same
 * children grid every page uses.
 *
 * Saves are debounced and write the whole block array (per the spec, blocks are
 * never partially persisted). Renaming refreshes the sidebar via the ['pages']
 * query. Re-embedding on save is wired in Slice 6 alongside the retrieval switch.
 *
 * Manual block authoring (ticket-37, ticket-44): the user is an equal author to
 * the AI. The editor body — the `/` palette, hover `+` insert, reorder, and the
 * always-visible "+ Add a block" foot affordance — is the shared <BlockCanvas>,
 * so every page authors identically. This panel owns the title header, the
 * debounced save, and the children grid; BlockCanvas owns the blocks.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { getPage, setProperty, updateTitle } from '@/lib/pages/client'
import { getOrCreateHomePage } from '@/lib/pages/home'
import { commitBlocks } from '@/lib/pages/commit'
import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'
import { PondBlock } from '@/components/organisms/PondBlock'
import { propertiesFrame } from '@/lib/modules/block-frame'
import { BacklinksPanel } from '@/components/organisms/BacklinksPanel'
import { usePageChangesPanel } from '@/components/organisms/PageChangesPanel'
import {
  readSchema,
  readValues,
  withValue,
  ROW_TYPE,
  type PropertyValue,
} from '@/lib/properties/schema'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { ChildrenGrid } from '@/components/molecules/ChildrenGrid'
import { ContentWidthHandle } from '@/components/molecules/ContentWidthHandle'
import { useContentWidth } from '@/lib/layout/content-width'
import { useSurfaceColumn } from '@/lib/layout/surface-column'
import { usePublishCommandPath } from '@/lib/layout/command-path'
import { commandPath } from '@/lib/pages/command-path'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { childCards } from '@/lib/pages/child-cards'
import { titleEyebrow } from '@/lib/pages/title-eyebrow'
import { workspaceUrl, type WorkspaceNodeRef } from '@/lib/pages/nav'
import { fetchPages } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { usePond } from '@/lib/pond/context'
import { PageCanvas } from '@/lib/modules/page-canvas'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { PageMentioned, PageProvenance } from '@/components/organisms/PageProvenance'
import type { Block } from '@/lib/documents/types'

export function DocumentPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pond, loading: pondLoading } = usePond()
  const pondId = pond?.id ?? null
  const pondName = pond?.name ?? null
  const nodeId = searchParams.get('nodeId')
  // Lazily created on first use, not at render — so an envless mount (Storybook,
  // CI) never constructs a real client and throws (#38); the page query and the
  // save/property paths below construct it only when they actually run.
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()
  const { flushScope } = useDeletionUndo()
  // #58: the editor column's user-set width — persisted, clamped, adjusted by
  // the ContentWidthHandle on the column's right edge. Hook lives above the
  // early returns (rules of hooks).
  const { width: contentWidth, setWidth: setContentWidth, commitWidth } = useContentWidth()
  // #96: the column's insets — 76 under the floating pill, the composer's
  // published clearance below (lib/layout/surface-column).
  const { column, handle } = useSurfaceColumn(contentWidth)

  // The root page (#234). Life's blocks live on the reserved home row, created on
  // first access; it is read for every page because the path's root (the
  // `PondCommand` pill) is that page's own title — "Breadcrumb starts at the root
  // page" (AUDIT W9), not an assumed name.
  // #312: the root is per POND, so the cache key carries the pond and the query
  // waits for it. Without `enabled` a first render would create (or read) a root
  // in the wrong pond before the pond resolved.
  const { data: home, isPending: homePending } = useQuery({
    queryKey: ['home', pondId],
    // #320: the root is titled with its pond's name, so the pond's name is part of
    // creating it — not something a later rename has to repair.
    queryFn: () => getOrCreateHomePage(getSupabase(), pondId, pondName),
    // #312: wait for the pond LIST to settle, not for a pond to exist.
    //
    // Without any guard, the first render called `getOrCreateHomePage(null)`,
    // which falls back to the person's FIRST pond — so for one `listPonds`
    // round-trip the panel drew pond A's root under pond B's URL, and a keystroke
    // in that window saved blocks into the wrong pond's root.
    //
    // Guarding on `!!pondId` instead was worse: with no pond at all — before
    // migration 0018, or any surface outside the provider — the panel hung on its
    // loading state forever and the breadcrumb and ⌘K never rendered. `loading`
    // is false in the default context, so those surfaces behave exactly as they
    // did before ponds.
    enabled: !pondLoading,
  })
  // The page this panel shows: the URL's node, or — at the root — the home row.
  const pageId = nodeId ?? home?.id ?? null

  // The panel is layout-level, so it does NOT unmount when the page changes.
  // Flush pending block toasts (staged by BlockCanvas) when leaving a page — a
  // surviving toast's Undo would otherwise re-insert the old page's block into
  // the newly-opened page.
  useEffect(() => {
    return () => {
      flushScope('block')
    }
  }, [pageId, flushScope])

  const { data: page, isLoading } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => (pageId ? getPage(getSupabase(), pageId) : Promise.resolve(null)),
    enabled: !!pageId,
  })

  // The flat page tree — the same cache the rail reads — so this page's own
  // children can be shown below its blocks (ticket-22). `new Date()` is captured
  // per rows/node change, so the cards' "updated Xd ago" captions refresh with
  // the data rather than the wall clock. `rowsPending` holds the panel on the
  // loading state until they land, so a page never paints without its children.
  const { data: rows = [], isPending: rowsPending } = useQuery({
    queryKey: pagesKey(pondId),
    queryFn: () => fetchPages(pondId),
  })
  // The root's children are the top-level pages (`null` parent); the home row is
  // never among the rows (fetchPages strips it), so it is never its own child.
  const cards = useMemo(() => childCards(rows, nodeId, new Date()), [rows, nodeId])
  // Card → page is the one navigation (lib/pages/nav): a card carries its own
  // id/type/title, so the URL gets the same params a rail click would.
  function goTo(ref: WorkspaceNodeRef | null) {
    router.push(workspaceUrl(ref))
  }

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

  // ticket-41: ids of blocks just inserted this session, so a freshly-inserted
  // block SETTLES in (motion-settle-in) while blocks present on page load do
  // not. The mutating insert already commits an edit, so tracking it here adds no
  // extra render. Owned here (not BlockCanvas) so it survives the panel's stable
  // mount across ?nodeId changes.
  const [insertedIds] = useState<Set<string>>(() => new Set())

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

  function scheduleSave(nextTitle: string, nextBlocks: Block[]) {
    const id = loadedId.current
    if (!id) return
    setSaved(false)
    const beforeAtSchedule = lastSavedOf(id) ?? []
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
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
        if (
          advanced &&
          lastSaved.current?.pageId === id &&
          lastSaved.current.blocks === nextBlocks
        ) {
          lastSaved.current = { pageId: id, blocks: before }
        }
        console.error('[document] save failed', id, err)
        return
      }
      // keep the ['page'] cache — and the signature the adopt compares against —
      // in step with what we just saved, so the same-page adopt above only fires
      // for genuinely external writes.
      if (loadedId.current === id) serverSig.current = JSON.stringify(nextBlocks)
      queryClient.setQueryData(['page', id], (prev: typeof page) =>
        prev ? { ...prev, title: nextTitle, blocks: nextBlocks } : prev
      )
      // The root page's title is also the breadcrumb's root crumb on every page.
      queryClient.setQueryData(['home'], (prev: typeof home) =>
        prev && prev.id === id ? { ...prev, title: nextTitle } : prev
      )
      setSaved(true)
      setSavedAt(new Date())
    }, EDIT_PAUSE_MS)
  }

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
    queryClient.setQueryData(['page', id], (prev: typeof page) =>
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

  // "Changes to this page" (#103, storyboard frame 8): the log filtered to this
  // page, floating, ⌥⌘H. State, shortcut and surface all live with the panel; the
  // title row draws no button for it.
  const { overlay: changesOverlay } = usePageChangesPanel(pageId)
  // Typed properties (#17): present only when the page carries a schema (it is
  // a collection). Read here, above the early returns, so the JSX below stays flat.
  const propSchema = page ? readSchema(page.props) : null
  const eyebrow = titleEyebrow(page?.props?.kind, saved, savedAt)

  // The shell's `PondCommand` reads this page's path at rest: the root, the
  // ancestors, then this page — its name read off the row until the page lands.
  usePublishCommandPath(
    commandPath(rows, nodeId, {
      rootTitle: home?.title || pondName || 'life',
      current: viewTitle || rows.find((r) => r.id === nodeId)?.title || 'Untitled',
      pondGlyph: pond?.glyph ?? LIFE_GLYPH,
    })
  )

  if ((!nodeId && homePending) || isLoading || rowsPending || !page) {
    return (
      <div className="h-full flex items-center justify-center text-mn-13 text-mn-text-secondary">
        Loading…
      </div>
    )
  }

  // ── The page (+ children grid when it has nested pages) ───────────────────────
  // "Everything is a page": a page may hold BOTH its own blocks AND children, and
  // nothing here reads a type tag — a page with pages inside it is simply a page
  // with a children grid under its content (#108, #234).
  return (
    <PageCanvas className="h-full overflow-y-auto">
      {/* #58: the column's max-width is user-set (was a fixed max-w-2xl) — the
          handle on the right edge drags/arrow-keys it, useContentWidth clamps
          and persists it. Everything inside (the #57 timeline's %-positioned
          bars included) reflows because the width is applied here, at the
          column wrapper. */}
      {/* #96: the column's top/bottom insets (76 under the floating pill; the
          composer's published clearance + 24 below) come from useSurfaceColumn,
          and the handle is bounded to the READABLE column — it stops where the
          content stops, so the drag strip never runs through the composer's region. */}
      <div {...column} data-testid="page-column">
        <ContentWidthHandle
          {...handle}
          width={contentWidth}
          onWidthChange={setContentWidth}
          onWidthCommit={commitWidth}
        />
        {/* The title row (`Pond 06.21` 6u.1): the page's name at left, and at right
            one eyebrow — `{kind} — {save state}`. The save state lives here and
            nowhere else; no kind set, and the eyebrow is the state alone. */}
        <div className="mt-2 mb-4 flex items-end justify-between gap-3 px-[4px]">
          <input
            className="min-w-0 flex-1 bg-transparent font-sans text-[38px] leading-[1.15] font-bold tracking-[-0.01em] text-foreground uppercase outline-none placeholder:text-mn-text-secondary"
            value={viewTitle}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Untitled"
            aria-label="Page title"
          />
          <span
            data-part="title-eyebrow"
            className="flex-none text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase"
            aria-live="polite"
          >
            {eyebrow}
          </span>
        </div>

        {/* Provenance (#97, 6a frame 5): the thread moment this page was made
            from, when it was. Hide keeps the stamp; nothing removes it. */}
        <PageProvenance pageId={page.id} props={page.props} className="mb-5" />

        {/* Typed properties (#17): shown only when the page carries a schema (it
            is a collection). Edits write optimistically, bypassing the AI gate.
            #260: framed in the board's `properties` card (ADR 0007 — the inspector
            IS that kind), empty when the schema has no fields. */}
        {propSchema && (
          <PondBlock {...propertiesFrame(propSchema)} className="mb-6">
            <PropertyInspector
              schema={propSchema}
              values={readValues(page.props)}
              onChange={onProperty}
            />
          </PondBlock>
        )}

        {/* The shared authoring surface (ticket-44): the `/` palette, hover `+`
            InsertBetween, reorder, bound metrics, and the always-visible palette-
            first "+ Add a block" foot affordance. Controlled — it emits the full
            next array and this panel schedules the debounced whole-array save. */}
        <BlockCanvas
          blocks={viewBlocks}
          pageId={page.id}
          pageTitle={viewTitle}
          onChange={commitLocalEdit}
          onUndoRemove={undoRemove}
          insertedIds={insertedIds}
        />

        <PageMentioned props={page.props} className="mt-8" />

        {/* Content above, children below — the page's own blocks stay primary; its
            nested pages read as a quiet index beneath them (ticket-22). Collapses
            to nothing when the page has no children. */}
        {cards.length > 0 && (
          <div className="mt-12 border-t border-mn-hair pt-6">
            <ChildrenGrid cards={cards} onOpenCard={goTo} />
          </div>
        )}

        {/* Backlinks (#39): the reverse of the one-way relations pointing at this page —
            derived on read, read-only, hidden when nothing links here. A row's collection
            is its parent (so targeted relations into that collection match); a plain page
            has none (only untargeted relations can link it). */}
        <BacklinksPanel
          targetId={page.id}
          targetCollectionId={page.type === ROW_TYPE ? page.parentId : null}
          className="mt-12 border-t border-mn-hair pt-6"
        />
      </div>

      {changesOverlay}
    </PageCanvas>
  )
}
