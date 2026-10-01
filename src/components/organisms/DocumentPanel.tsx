'use client'

/**
 * The main-panel page editor. Reads the open page id from the URL (?nodeId=),
 * loads the page, and lets you edit its title and content blocks. Everything is
 * a page, so this is the editor for areas, sub-pages, projects — all of them.
 *
 * Saves are debounced and write the whole block array (per the spec, blocks are
 * never partially persisted). Renaming refreshes the sidebar via the ['pages']
 * query. Re-embedding on save is wired in Slice 6 alongside the retrieval switch.
 *
 * Manual block authoring (ticket-37, ticket-44): the user is an equal author to
 * the AI. The editor body — the `/` palette, hover `+` insert, reorder, and the
 * always-visible palette-first "+ Add a block" foot affordance — is the shared
 * <BlockCanvas>, so the Life home page, area pages, and document pages all author
 * identically. This panel owns the title header, the debounced save, and the
 * children grid; BlockCanvas owns the blocks.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { getPage, setProperty, updateTitle } from '@/lib/pages/client'
import { commitBlocks } from '@/lib/pages/commit'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'
import { BacklinksPanel } from '@/components/organisms/BacklinksPanel'
import { CrumbMark } from '@/components/organisms/PageMarkButton'
import { usePageChangesPanel } from '@/components/organisms/PageChangesPanel'
import {
  readSchema,
  readValues,
  withValue,
  ROW_TYPE,
  type PropertyValue,
} from '@/lib/properties/schema'
import {
  AreaOverviewPanel,
  LifeOverviewPanel,
  useNavigateCrumb,
  useOpenCard,
} from '@/components/organisms/OverviewSurface'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { ChildrenGrid } from '@/components/molecules/ChildrenGrid'
import { Breadcrumb } from '@/components/molecules/Breadcrumb'
import { ContentWidthHandle } from '@/components/molecules/ContentWidthHandle'
import { useContentWidth } from '@/lib/layout/content-width'
import { ShellBreadcrumb } from '@/lib/layout/breadcrumb-slot'
import { useSurfaceColumn } from '@/lib/layout/surface-column'
import { requestCommandPalette } from '@/lib/shell-commands'
import { childCards, crumbTrail } from '@/lib/pages/overview'
import { fetchPages } from '@/lib/pages/tree'
import { useWorkspace } from '@/lib/workspace/context'
import { emptyBlockForType } from '@/lib/modules/palette'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { PageMentioned, PageProvenance } from '@/components/organisms/PageProvenance'
import type { SlashMenuItem } from '@/components/molecules/SlashMenu'
import type { Block } from '@/lib/documents/types'

export function DocumentPanel() {
  const searchParams = useSearchParams()
  const nodeId = searchParams.get('nodeId')
  // Lazily created on first use, not at render — so an envless mount (Storybook,
  // CI) never constructs a real client and throws (#38); the page query and the
  // save/property paths below construct it only when they actually run.
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()
  const workspace = useWorkspace()
  const { flushScope } = useDeletionUndo()
  // #58: the editor column's user-set width — persisted, clamped, adjusted by
  // the ContentWidthHandle on the column's right edge. Hook lives above the
  // early returns (rules of hooks); only the editor branch below renders it.
  const { width: contentWidth, setWidth: setContentWidth, commitWidth } = useContentWidth()
  // #96: the column's insets — 76 under the floating pill, the composer's
  // published clearance below — shared with the overview (lib/layout/surface-column).
  const { column, handle } = useSurfaceColumn(contentWidth)

  // The panel is layout-level, so it does NOT unmount when ?nodeId changes.
  // Flush pending block toasts (staged by BlockCanvas) when leaving a page — a
  // surviving toast's Undo would otherwise re-insert the old page's block into
  // the newly-opened page.
  useEffect(() => {
    return () => {
      flushScope('block')
    }
  }, [nodeId, flushScope])

  const { data: page, isLoading } = useQuery({
    queryKey: ['page', nodeId],
    queryFn: () => (nodeId ? getPage(getSupabase(), nodeId) : Promise.resolve(null)),
    enabled: !!nodeId,
  })

  // The flat page tree — the same cache the rail and overview surfaces read — so
  // this node's own children can be shown alongside its blocks (ticket-22).
  // `new Date()` is captured per rows/nodeId change, so the cards' "updated Xd
  // ago" captions refresh with the data rather than the wall clock — the same
  // coarse recency the overview surfaces accept (AreaOverviewPanel does likewise).
  // #108: the surface switch now reads CHILDREN, not a type tag, so these rows are
  // load-bearing for *which* surface renders — `rowsPending` holds the panel on the
  // loading state until they land, rather than flashing the editor at a container
  // page whose children hadn't arrived yet.
  const { data: rows = [], isPending: rowsPending } = useQuery({
    queryKey: ['pages', workspace],
    queryFn: () => fetchPages(workspace),
  })
  const openCard = useOpenCard()
  const navigateCrumb = useNavigateCrumb()
  const cards = useMemo(() => (nodeId ? childCards(rows, nodeId, new Date()) : []), [rows, nodeId])
  // The ancestor trail for the editor header — the title input stays the tail, so the
  // pill shows only the path down to (not including) this node, starting at the ROOT it
  // descends from (#101 review: `databases` is 3c's second root, not one of life's).
  // No node (or an unknown one) resolves to the empty life-rooted trail.
  const trail = useMemo(() => crumbTrail(rows, nodeId ?? ''), [rows, nodeId])

  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [saved, setSaved] = useState(true)
  // Which page the local title/blocks state was seeded from. State (not the ref)
  // so render can branch on it; the ref below serves the event-handler save path.
  // Never reset on navigate-away: it can only ever match a page whose local state
  // came from that same page, so a stale value is harmless (re-seeded on return).
  const [seededId, setSeededId] = useState<string | null>(null)
  const loadedId = useRef<string | null>(null)
  const serverSig = useRef<string>('') // signature of the server blocks we've reconciled
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        setBlocks(page.blocks)
      }
    }
    if (!nodeId) loadedId.current = null
  }, [page, nodeId, saved])

  // Until the seeding effect above has run for THIS page, the local title/blocks
  // state still holds the previous node's values (effects run after paint). Every
  // read below — the type-switch branch included — goes through these derived
  // values so the correct surface and content paint on the very first frame: no
  // overview→editor flash on an area with blocks, no one-frame leak of the
  // previous page's state on node change (ticket-22 review).
  const seeded = !!page && page.id === seededId
  const viewBlocks: Block[] = seeded ? blocks : (page?.blocks ?? [])
  const viewTitle = seeded ? title : (page?.title ?? '')

  function scheduleSave(nextTitle: string, nextBlocks: Block[]) {
    const id = loadedId.current
    if (!id) return
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      // Title first, then blocks + sidebar-refresh + re-embed via the shared
      // commitBlocks (same tail the accepted-AI-edit path uses). Sequential so
      // the ['pages'] invalidation inside commitBlocks lands after the rename,
      // keeping the sidebar rename immediate.
      const supabase = getSupabase()
      await updateTitle(supabase, id, nextTitle)
      await commitBlocks(supabase, queryClient, id, nextBlocks, workspace)
      // keep the ['page'] cache in step with what we just saved, so the
      // same-page adopt above only fires for genuinely external writes.
      queryClient.setQueryData(['page', id], (prev: typeof page) =>
        prev ? { ...prev, title: nextTitle, blocks: nextBlocks } : prev
      )
      setSaved(true)
    }, 600)
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

  // The area "+ Add content" pick (ticket-44 §2): the overview surface now opens
  // the palette directly, so this inserts the CHOSEN module's empty state (not a
  // bare text block), flipping the pure area to the composite editor below.
  function addContentFromPalette(item: SlashMenuItem) {
    const nb = emptyBlockForType(item.id)
    if (!nb) return
    insertedIds.add(nb.id)
    commitLocalEdit([...viewBlocks, nb])
  }

  // "Changes to this page" (#103, storyboard frame 8): the log filtered to this
  // page, floating, ⌥⌘H. State, shortcut and surface all live with the panel.
  const { toggle: toggleChanges, overlay: changesOverlay } = usePageChangesPanel(nodeId)
  // Typed properties (#17): present only when the page carries a schema (it is
  // a collection). Read here, above the early returns, so the JSX below stays flat.
  const propSchema = page ? readSchema(page.props) : null

  // ── Root: the Life overview owns the panel (no more empty state) ──────────
  if (!nodeId) return <LifeOverviewPanel />
  if (isLoading || rowsPending || !page) {
    return (
      <div className="h-full flex items-center justify-center text-mn-13 text-mn-text-faint">
        Loading…
      </div>
    )
  }

  // ── Surface switch (ticket-22, #108) ──────────────────────────────────────
  // "Everything is a page": a node may hold BOTH its own blocks AND children.
  // Nothing here reads a type tag any more — a page is a container because it HAS
  // children, per the design ("an area is a page with pages inside it").
  //   • A pure container (children, no blocks of its own) keeps the calm overview
  //     — its focal treatment earns its place. A "+ Add content" affordance
  //     (palette-first, ticket-44) lets it gain blocks, which flips it to the
  //     composite below.
  //   • Any node WITH blocks, and any childless leaf, shows the full editor — with
  //     the "Everything within" children grid *below* it when it has children. So
  //     an accepted edit is immediately visible, and no page can ever hide its own
  //     content behind a folder view.
  if (viewBlocks.length === 0 && cards.length > 0) {
    return (
      <AreaOverviewPanel areaId={page.id} title={page.title} onAddContent={addContentFromPalette} />
    )
  }

  // ── Editor (+ children grid when the node has sub-pages) ──────────────────────
  return (
    <div className="h-full overflow-y-auto">
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
        {/* Breadcrumb shows the ancestor path (ticket-25); the title input below
            is the editable tail, so the crumb never duplicates the current name. */}
        {/* #134: the trail's lead mark is clickable — it opens the picker for the
            area the trail starts in. */}
        {/* #96: the pill is a SHELL-level absolute (2t / `Pond 05 Shell`) — it
            portals into the shell's slot and the page scrolls under it; ⌘K rides
            in it (ADR 0002). Rendered alone, it sits here in the flow. */}
        <ShellBreadcrumb>
          <Breadcrumb
            {...trail}
            onNavigate={navigateCrumb}
            leadMark={<CrumbMark rows={rows} crumbs={trail.crumbs} />}
            onCommandK={requestCommandPalette}
          />
        </ShellBreadcrumb>
        <div className="flex items-center justify-between gap-3 mt-2 mb-4">
          <input
            className="flex-1 font-sans text-mn-28 font-semibold text-foreground outline-none bg-transparent placeholder:text-mn-text-faint"
            value={viewTitle}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Untitled"
            aria-label="Page title"
          />
          <span
            className="font-mono lowercase tracking-wider text-mn-11 text-mn-text-faint flex-shrink-0"
            aria-live="polite"
          >
            {saved ? 'saved' : 'saving…'}
          </span>
          {/* The panel's only pointer-reachable entry. The design also names "the
              page menu › changes", but this build has no page menu to hang it on,
              so a quiet toggle beside the save state keeps the log from being a
              keyboard-only feature. */}
          <button
            type="button"
            onClick={toggleChanges}
            className="shrink-0 font-mono text-mn-11 lowercase tracking-wider text-mn-text-faint hover:text-mn-text-secondary"
          >
            changes
          </button>
        </div>

        {/* Provenance (#97, 6a frame 5): the thread moment this page was made
            from, when it was. Hide keeps the stamp; nothing removes it. */}
        <PageProvenance pageId={page.id} props={page.props} className="mb-5" />

        {/* Typed properties (#17): shown only when the page carries a schema (it
            is a collection). Edits write optimistically, bypassing the AI gate. */}
        {propSchema && (
          <div className="mb-6 border-b border-mn-hair pb-6">
            <PropertyInspector
              schema={propSchema}
              values={readValues(page.props)}
              onChange={onProperty}
            />
          </div>
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
            sub-pages read as a quiet index beneath them (ticket-22). Collapses to
            nothing when the node has no children. */}
        {cards.length > 0 && (
          <div className="mt-12 border-t border-mn-hair pt-6">
            <ChildrenGrid cards={cards} onOpenCard={openCard} />
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
    </div>
  )
}
