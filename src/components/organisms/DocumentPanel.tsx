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
 * The title and blocks being edited, and their debounced save, are the page's
 * draft (`lib/pages/use-page-draft`).
 *
 * Manual block authoring (ticket-37, ticket-44): the user is an equal author to
 * the AI. The editor body — the `/` palette, Return after a block, reorder, and the
 * always-visible "+ Add a block" foot affordance — is the shared <BlockCanvas>,
 * so every page authors identically. This panel owns the title header, the
 * debounced save, and the children grid; BlockCanvas owns the blocks.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { getPage } from '@/lib/pages/client'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { getOrCreateHomePage } from '@/lib/pages/home'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'
import { PondBlock } from '@/components/organisms/PondBlock'
import { propertiesFrame } from '@/lib/modules/block-frame'
import { BacklinksPanel } from '@/components/organisms/BacklinksPanel'
import { usePageChangesPanel } from '@/components/organisms/PageChangesPanel'
import { readSchema, readValues, ROW_TYPE } from '@/lib/properties/schema'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { ChildrenGrid } from '@/components/molecules/ChildrenGrid'
import { ContentWidthHandle } from '@/components/molecules/ContentWidthHandle'
import { useContentWidth } from '@/lib/layout/content-width'
import { TEXT_BLOCK_INSET_PX, useSurfaceColumn } from '@/lib/layout/surface-column'
import {
  useZen,
  zenColumn,
  ZEN_BLOCK_LIST_STYLE,
  ZEN_COLUMN_PX,
  ZEN_TITLE_CLASS,
} from '@/lib/layout/zen'
import { usePublishCommandPath } from '@/lib/layout/command-path'
import { commandPath } from '@/lib/pages/command-path'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import { DATABASES_ROOT_TITLE } from '@/lib/pages/databases-root'
import { childCards } from '@/lib/pages/child-cards'
import { isUntouchedPage, titleEyebrow } from '@/lib/pages/title-eyebrow'
import { workspaceUrl, type WorkspaceNodeRef } from '@/lib/pages/nav'
import { fetchPages } from '@/lib/pages/tree'
import { homeQueryKey, pagesKey } from '@/lib/pages/keys'
import { usePond } from '@/lib/pond/context'
import { PageCanvas } from '@/lib/modules/page-canvas'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { PageMentioned, PageProvenance } from '@/components/organisms/PageProvenance'
import { readAskParam, urlWithoutAsk } from '@/lib/pages/ask-param'
import { requestTerminalFocus } from '@/lib/terminal-focus'
import { FirstRunHints } from '@/components/organisms/FirstRunHints'
import { useFirstRunPending } from '@/lib/first-run/use-first-run-pending'

export function DocumentPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pond, loading: pondLoading } = usePond()
  const pondId = pond?.id ?? null
  const pondName = pond?.name ?? null
  const nodeId = searchParams.get('nodeId')
  // The reserved change-log page (KAN-94): a virtual node with no `pages` row, so
  // it takes none of the getPage/rows-driven path below — rendered by
  // `ChangeLogPage` instead, further down.
  const isChangeLogNode = nodeId === CHANGE_LOG_NODE_ID
  // Lazily created on first use, not at render — so an envless mount (Storybook,
  // CI) never constructs a real client and throws (#38); the page query and the
  // save/property paths below construct it only when they actually run.
  const getSupabase = useLazySupabase()
  const { flushScope } = useDeletionUndo()
  // #58: the editor column's user-set width — persisted, clamped, adjusted by
  // the ContentWidthHandle on the column's right edge. Hook lives above the
  // early returns (rules of hooks).
  const { width: contentWidth, setWidth: setContentWidth, commitWidth } = useContentWidth()
  // Zen (`Pond 06.17` 6q frame 3): the same page in zen's own column and type.
  const { zen } = useZen()
  // #96: the column's insets — 76 under the floating pill, the composer's
  // published clearance below (lib/layout/surface-column).
  const { column, handle } = useSurfaceColumn(zen ? ZEN_COLUMN_PX : contentWidth)

  // The root page (#234). Life's blocks live on the reserved home row, created on
  // first access; it is read for every page because the path's root (the
  // `PondCommand` pill) is that page's own title — "Breadcrumb starts at the root
  // page" (AUDIT W9), not an assumed name.
  // #312: the root is per POND, so the cache key carries the pond and the query
  // waits for it. Without `enabled` a first render would create (or read) a root
  // in the wrong pond before the pond resolved.
  const { data: home, isPending: homePending } = useQuery({
    queryKey: homeQueryKey(pondId),
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

  // The cover's `?ask=` carries typed text into the root's composer (KAN-195):
  // read once on mount, fire the same focus signal the palette uses, then strip
  // the param so a reload never replays it. `askCarried` guards the one-shot —
  // without it a dev-mode double-invoke or a later re-render would refire it.
  const askCarried = useRef(false)
  useEffect(() => {
    if (nodeId || askCarried.current) return
    const ask = readAskParam(searchParams)
    if (ask === null) return
    askCarried.current = true
    requestTerminalFocus(ask)
    router.replace(urlWithoutAsk('/workspace', searchParams))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once for the carried `?ask=` on mount; re-running on nodeId/searchParams/router churn would replay it
  }, [])

  // The empty-shell hints (6d f2): shown at the root only, and only until the
  // first page is ever made through the make-this-a-page card — after that
  // `first_run_done_at` is set and they never return (KAN-195). The panel
  // never unmounts across a ?nodeId change, so re-entering the root after
  // visiting a page needs its own refetch — the query's 0 staleTime alone
  // only covers a fresh mount.
  const { pending: firstRunPending, refetch: refetchFirstRunPending } = useFirstRunPending()
  const wasAtPage = useRef(!!nodeId)
  useEffect(() => {
    if (!nodeId && wasAtPage.current) refetchFirstRunPending()
    wasAtPage.current = !!nodeId
  }, [nodeId, refetchFirstRunPending])

  const { data: page, isLoading } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => (pageId ? getPage(getSupabase(), pageId) : Promise.resolve(null)),
    enabled: !!pageId && !isChangeLogNode,
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

  // ticket-41: ids of blocks just inserted this session, so a freshly-inserted
  // block SETTLES in (motion-settle-in) while blocks present on page load do
  // not. The mutating insert already commits an edit, so tracking it here adds no
  // extra render. Owned here (not BlockCanvas) so it survives the panel's stable
  // mount across ?nodeId changes.
  const [insertedIds] = useState<Set<string>>(() => new Set())

  const {
    viewTitle,
    viewBlocks,
    saved,
    savedAt,
    onTitle,
    onProperty,
    commitLocalEdit,
    undoRemove,
  } = usePageDraft({ page, pageId, pondId, getSupabase })

  // "Changes to this page" (#103, storyboard frame 8): the log filtered to this
  // page, floating, ⌥⌘H. State, shortcut and surface all live with the panel; the
  // title row draws no button for it.
  const { overlay: changesOverlay } = usePageChangesPanel(pageId)
  // Typed properties (#17): present only when the page carries a schema (it is
  // a collection). Read here, above the early returns, so the JSX below stays flat.
  const propSchema = page ? readSchema(page.props) : null
  // Board 6f frame 1: a fresh, untouched page reads `new — in {parent}` instead
  // of the usual kind/save-state eyebrow, until the person types anything.
  const untouched = isUntouchedPage(viewTitle, viewBlocks)
  const parentTitle = rows.find((r) => r.id === page?.parentId)?.title ?? null
  const eyebrow = titleEyebrow(page?.props?.kind, saved, savedAt, untouched, parentTitle)

  // The shell's `PondCommand` reads this page's path at rest: the root, the
  // ancestors, then this page — its name read off the row until the page lands.
  usePublishCommandPath(
    isChangeLogNode
      ? {
          glyph: pond?.glyph ?? LIFE_GLYPH,
          trail: [home?.title || pondName || 'life', DATABASES_ROOT_TITLE],
          current: 'change log',
          role: null,
        }
      : commandPath(rows, nodeId, {
          rootTitle: home?.title || pondName || 'life',
          current: viewTitle || rows.find((r) => r.id === nodeId)?.title || 'Untitled',
          pondGlyph: pond?.glyph ?? LIFE_GLYPH,
        })
  )

  // The virtual change-log page: the breadcrumb above has already taken effect;
  // `ChangeLogPage` owns its own table/view-bar and data fetching — this surface
  // takes none of the `getPage`/rows path below.
  if (isChangeLogNode) {
    return <ChangeLogPage />
  }

  if ((!nodeId && homePending) || isLoading || rowsPending || !page) {
    return (
      <div className="h-full flex items-center justify-center text-mn-13 text-mn-text-secondary">
        Loading…
      </div>
    )
  }

  if (!nodeId && firstRunPending) {
    return (
      <PageCanvas className="h-full overflow-y-auto">
        <FirstRunHints />
      </PageCanvas>
    )
  }

  // ── The page (+ children grid when it has nested pages) ───────────────────────
  // "Everything is a page": a page may hold BOTH its own blocks AND children, and
  // nothing here reads a type tag — a page with pages inside it is simply a page
  // with a children grid under its content (#108, #234).
  //
  // In zen "what's left is the page's own text" (6q frame 3): its title and blocks.
  // What is drawn ABOUT the page — the eyebrow, provenance, properties, mentioned,
  // the children index, backlinks — stays mounted and hidden; the width handle is
  // not drawn, since zen's column has its own width.
  const hiddenInZen = zen ? 'hidden' : undefined
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
      <div {...(zen ? zenColumn(column) : column)} data-testid="page-column">
        {!zen && (
          <ContentWidthHandle
            {...handle}
            width={contentWidth}
            onWidthChange={setContentWidth}
            onWidthCommit={commitWidth}
          />
        )}
        {/* The title row (`Pond 06.21` 6u.1): the page's name at left, and at right
            one eyebrow — `{kind} — {save state}`. The save state lives here and
            nowhere else; no kind set, and the eyebrow is the state alone. */}
        <div
          className={`${zen ? 'mb-[var(--zen-gap)]' : 'mt-2 mb-4'} flex items-end justify-between gap-3`}
          style={{ paddingInline: TEXT_BLOCK_INSET_PX }}
        >
          <input
            className={`min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-mn-text-secondary ${zen ? ZEN_TITLE_CLASS : 'font-sans text-[38px] leading-[1.15] font-bold tracking-[-0.01em] uppercase'}`}
            value={viewTitle}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Untitled"
            aria-label="Page title"
            data-pond-page-title
          />
          <span
            data-part="title-eyebrow"
            className="flex-none text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase"
            hidden={zen !== null}
            aria-live="polite"
          >
            {eyebrow}
          </span>
        </div>

        <div className={hiddenInZen}>
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
        </div>

        {/* The shared authoring surface (ticket-44): the `/` palette, Return after
            a block, reorder, bound metrics, and the always-visible "+ Add a block"
            foot affordance. Controlled — it emits the full next array and this
            panel schedules the debounced whole-array save. */}
        <BlockCanvas
          blocks={viewBlocks}
          pageId={page.id}
          pageTitle={viewTitle}
          onChange={commitLocalEdit}
          onUndoRemove={undoRemove}
          insertedIds={insertedIds}
          chrome={!zen}
          untouched={untouched}
          listStyle={zen ? ZEN_BLOCK_LIST_STYLE : undefined}
        />

        <div className={hiddenInZen}>
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
      </div>

      {changesOverlay}
    </PageCanvas>
  )
}
