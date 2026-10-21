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
 * (#108). Its nested pages are the top-level pages, shown as page-link blocks
 * on its own content (KAN-415), same as any other page's children.
 *
 * The title and blocks being edited, and their debounced save, are the page's
 * draft (`lib/pages/use-page-draft`).
 *
 * Manual block authoring (ticket-37, ticket-44): the user is an equal author to
 * the AI. The editor body — the `/` palette, Return after a block, reorder, and the
 * hover-only trailing hit area that opens a new line (KAN-345) — is the shared
 * <BlockCanvas>, so every page authors identically. This panel owns the title
 * header and the debounced save; BlockCanvas owns the blocks, page-link blocks
 * included.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { defineSchema, getPage, saveProps, type PondPage } from '@/lib/pages/client'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { getOrCreateHomePage } from '@/lib/pages/home'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'
import { PondBlock } from '@/components/organisms/PondBlock'
import { propertiesFrame } from '@/lib/modules/block-frame'
import { BacklinksPanel } from '@/components/organisms/BacklinksPanel'
import { usePageChangesPanel } from '@/components/organisms/PageChangesPanel'
import {
  addOption,
  readSchema,
  readValues,
  ROW_TYPE,
  withSchema,
  withValue,
} from '@/lib/properties/schema'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
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
import { isVirtualNodeId, TRASH_NODE_ID } from '@/lib/change-log/trash-view'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import { ChangeLogRecordPage } from '@/components/organisms/ChangeLogRecordPage'
import { TrashPage } from '@/components/organisms/TrashPage'
import { RECORD_PARAM, recordBreadcrumbTitle } from '@/lib/change-log/record-page'
import { recordKey } from '@/lib/change-log/keys'
import { getRecord } from '@/lib/change-log/store'
import { DATABASES_ROOT_TITLE } from '@/lib/pages/databases-root'
import { isUntouchedPage, titleEyebrow } from '@/lib/pages/title-eyebrow'
import { readMadeFrom } from '@/lib/pages/made-from'
import { isNewNestedPage, markOpened } from '@/lib/pages/nested-page'
import { applyPagePropsOptimistic } from '@/lib/pages/tree'
import { WORKSPACE_PATH } from '@/lib/pages/nav'
import { homeQueryKey, pagesKey } from '@/lib/pages/keys'
import { usePagesRows } from '@/lib/pages/use-pages'
import {
  appendChildLink,
  childLinkTargets,
  markChildLinksMigrated,
  saveThenStamp,
  stampChildLinksMigratedInCache,
} from '@/lib/pages/child-links'
import { flushPendingPageSave } from '@/lib/pages/page-flush'
import { usePond } from '@/lib/pond/context'
import { PageCanvas } from '@/lib/modules/page-canvas'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { PageMentioned, PageProvenance } from '@/components/organisms/PageProvenance'
import { readAskParam, urlWithoutAsk } from '@/lib/pages/ask-param'
import { readTemplatesParam, urlWithoutTemplates } from '@/lib/pages/templates-param'
import { requestTerminalFocus } from '@/lib/terminal-focus'
import { writeRecent } from '@/lib/pages/recent-pages'
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
  // The reserved trash page (KAN-451): same shape as the change log — a
  // virtual node with no `pages` row, rendered by `TrashPage` instead.
  const isTrashNode = nodeId === TRASH_NODE_ID
  // A record route under the virtual change-log node (`?record=`, KAN-152):
  // read here (not inside `ChangeLogRecordPage`) because the breadcrumb below
  // needs the record's title before that component ever mounts.
  const recordId = isChangeLogNode ? searchParams.get(RECORD_PARAM) : null
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

  // The new-page menu's "from a template" row (KAN-198) carries `?templates=1`
  // to the fresh page it just made: read it once for THIS node, strip it, and
  // hand BlockCanvas the node id it names — kept by id, not a boolean, since
  // the panel never unmounts across a `?nodeId` change and a stale true would
  // otherwise reopen the menu on a later, unrelated page.
  const [templatesTargetId, setTemplatesTargetId] = useState<string | null>(null)
  const templatesCarriedFor = useRef<string | null>(null)
  // Responds to an external navigation (the `?templates=1` the menu carried), and
  // is guarded to fire once per node — not a derived-state computation.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!nodeId || templatesCarriedFor.current === nodeId) return
    if (!readTemplatesParam(searchParams)) return
    templatesCarriedFor.current = nodeId
    setTemplatesTargetId(nodeId)
    router.replace(urlWithoutTemplates(WORKSPACE_PATH, searchParams))
  }, [nodeId, searchParams, router])
  /* eslint-enable react-hooks/set-state-in-effect */

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
    enabled: !!pageId && !isVirtualNodeId(pageId),
  })

  // KAN-122: a page made by `/ nested page` carries `new` (the chip on its
  // parent's page-link row, the rail row note) until it is first opened for
  // reading — stamped here, the one mount point that owns `pageId` for every
  // page surface. Guarded by `openedMarked` (not just `page.props`) so the
  // write fires once per page, not on every re-render while the server write
  // is still in flight.
  const openedMarked = useRef<string | null>(null)
  useEffect(() => {
    if (!page || !isNewNestedPage(page.props) || openedMarked.current === page.id) return
    openedMarked.current = page.id
    applyPagePropsOptimistic(
      queryClient,
      { id: page.id, props: { openedAt: new Date().toISOString() } },
      pondId
    )
    // A failed write leaves the optimistic `openedAt` wrong (the chip/row note
    // cleared client-side with nothing landed) — invalidate so the next refetch
    // reconciles with server truth, rather than an unhandled rejection.
    void markOpened(getSupabase(), page.id).catch((err) => {
      console.error('Failed to mark the nested page opened', err)
      queryClient.invalidateQueries({ queryKey: pagesKey(pondId) })
    })
  }, [page, pondId, queryClient, getSupabase])
  // KAN-350: a row page's `_schema` lives on its PARENT collection — the row's own
  // `props` holds only its values. The parent is read through the SAME `['page', id]`
  // cache every other page read shares (no bespoke key), keyed off `page.parentId`
  // so it tracks if the row moves.
  const isRowPage = page?.type === ROW_TYPE
  const parentId = isRowPage ? page.parentId : null
  const { data: parentPage } = useQuery({
    queryKey: ['page', parentId],
    queryFn: () => (parentId ? getPage(getSupabase(), parentId) : Promise.resolve(null)),
    enabled: !!parentId,
  })

  // KAN-390: the one owner of the ⌘K/@ recent-visits list. Every route that
  // lands a page — rail, card, link, breadcrumb, undo, composer, ⌘K — resolves
  // through the `page` query above, so recording the visit here (instead of at
  // each caller) covers all of them. Guarded by `recentRecordedRef` so a
  // re-render with the same page/pond pair (a refetch, a prop-driven re-render)
  // doesn't re-write the already-front entry.
  const recentRecordedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!page) return
    const key = `${pondId ?? ''}:${page.id}`
    if (recentRecordedRef.current === key) return
    recentRecordedRef.current = key
    writeRecent({ id: page.id, type: page.type, title: page.title }, pondId)
  }, [page, pondId])

  // The flat page tree — the same cache the rail reads — so this page's own
  // children (now ordinary page-link blocks, KAN-415) resolve against current
  // rows/titles. `rowsPending` holds the panel on the loading state until they
  // land, so a page never paints before its children are known. `usePagesRows`
  // (KAN-310 gap 1) drops a staged-for-delete id at once, so a page-link a rail
  // delete just staged resolves as gone here with no refetch.
  const { data: rows, isPending: rowsPending } = usePagesRows(pondId)

  // ticket-41: ids of blocks just inserted this session, so a freshly-inserted
  // block SETTLES in (motion-settle-in) while blocks present on page load do
  // not. The mutating insert already commits an edit, so tracking it here adds no
  // extra render. Owned here (not BlockCanvas) so it survives the panel's stable
  // mount across ?nodeId changes.
  const [insertedIds] = useState<Set<string>>(() => new Set())

  // 6f frame 3: while a template previews, the eyebrow reads `preview —
  // {name}` in place of its own save state — transient, set/cleared by
  // `BlockCanvas` itself, never written through `titleEyebrow()`.
  const [previewName, setPreviewName] = useState<string | null>(null)

  // `BlockCanvas` is not keyed by page and never calls back into this panel's
  // state from ITS OWN render (that was the setState-during-a-different-
  // component's-render bug) — so a preview left running when the person
  // navigates (`nodeId` changes, this panel stays mounted) is cleared here,
  // on this panel's own render, the same way `BlockCanvas` resets its own
  // `previewing` state on a `pageId` change.
  const [previousNodeId, setPreviousNodeId] = useState(nodeId)
  if (nodeId !== previousNodeId) {
    setPreviousNodeId(nodeId)
    if (previewName !== null) setPreviewName(null)
  }

  const {
    viewTitle,
    viewBlocks,
    saved,
    savedAt,
    onTitle,
    onProperty,
    commitLocalEdit,
    undoRemove,
    writeStructural,
  } = usePageDraft({ page, pageId, pondId, getSupabase })

  // KAN-415: child pages are ordinary page-link blocks on their parent now, not
  // an auto-drawn grid, so a page saved before this ticket needs each of its
  // CURRENT children appended once — the same scope and order the deleted
  // `childCards` used (direct children, root scoped via `withoutDatabasesRoot`
  // when `nodeId` is null, i.e. this is the home row). Goes through the
  // editor's own `commitLocalEdit`, not a direct write, because this page is —
  // by construction — the one currently open. Guarded by `migratedRef`, every
  // page id migrated so far (not just the last one), so a double-mount/
  // strict-mode re-render never re-appends. The stamp also lands on the
  // `['page', id]` cache at once (`stampChildLinksMigratedInCache`), not only
  // the DB — navigating away and back while `markChildLinksMigrated`'s write
  // is still in flight, or already landed but unrefetched, must not re-read an
  // unstamped cached page and re-append a link the person just removed. The
  // appended blocks only reach the DB through this page's own 600ms-debounced
  // save, so the DB stamp (`markChildLinksMigrated`) waits on that save's
  // flush (`saveThenStamp`) — a reload inside the debounce window must not see
  // the stamp without the links it promises.
  const migratedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!page || rowsPending || migratedRef.current.has(page.id)) return
    if (page.props?.childLinksMigrated === true) return
    migratedRef.current.add(page.id)

    const nextBlocks = childLinkTargets(rows, nodeId).reduce(
      (blocks, childId) => appendChildLink(blocks, childId),
      viewBlocks
    )
    if (nextBlocks !== viewBlocks) commitLocalEdit(nextBlocks)

    stampChildLinksMigratedInCache(queryClient, page.id)

    void saveThenStamp({
      flush: () => flushPendingPageSave(page.id),
      stamp: () => markChildLinksMigrated(getSupabase(), page.id),
    }).catch((err) => {
      console.error('Failed to mark child links migrated', page.id, err)
    })
  }, [page, rows, rowsPending, nodeId, viewBlocks, commitLocalEdit, getSupabase, queryClient])

  // KAN-350 "+ new tag": adds the label as a new option on the field's owning
  // schema, then sets THIS page's value to the minted option id. When the
  // schema and the value live on the SAME page (this page is itself the
  // database), that's one combined props write — `defineSchema` and
  // `setProperty` each read-modify-write the WHOLE `props` object
  // independently, so firing both at the same page would race and the last
  // one in would drop the other's change. When the schema lives on a
  // different page (a row's parent), the writes target different rows and
  // can't collide, but still chain: the value is only set once the schema
  // write it depends on has actually landed. Either way, a failure rolls the
  // optimistic schema-cache write back rather than leaving the cache ahead of
  // what's stored.
  async function onAddOption(fieldId: string, label: string) {
    if (!schemaOwnerId || !propSchema) return
    const { schema: nextSchema, optionId } = addOption(propSchema, fieldId, label)
    if (optionId === null) return

    if (schemaOwnerId === pageId) {
      const previousProps = page?.props ?? {}
      const nextProps = withValue(withSchema(previousProps, nextSchema), fieldId, optionId)
      queryClient.setQueryData(['page', pageId], (prev: PondPage | null | undefined) =>
        prev ? { ...prev, props: nextProps } : prev
      )
      try {
        await saveProps(getSupabase(), pageId, nextProps)
      } catch (err) {
        queryClient.setQueryData(['page', pageId], (prev: PondPage | null | undefined) =>
          prev ? { ...prev, props: previousProps } : prev
        )
        console.error('[document] add option failed', pageId, err)
      }
      return
    }

    const previousParentProps = parentPage?.props ?? {}
    queryClient.setQueryData(['page', schemaOwnerId], (prev: PondPage | null | undefined) =>
      prev ? { ...prev, props: withSchema(prev.props, nextSchema) } : prev
    )
    try {
      await defineSchema(getSupabase(), schemaOwnerId, nextSchema)
      onProperty(fieldId, optionId)
    } catch (err) {
      queryClient.setQueryData(['page', schemaOwnerId], (prev: PondPage | null | undefined) =>
        prev ? { ...prev, props: previousParentProps } : prev
      )
      console.error('[document] add option failed', schemaOwnerId, err)
    }
  }

  // "Changes to this page" (#103, storyboard frame 8): the log filtered to this
  // page, floating, ⌥⌘H. State, shortcut and surface all live with the panel; the
  // title row draws no button for it.
  const { overlay: changesOverlay } = usePageChangesPanel(pageId)
  // Typed properties (#17): present only when the page carries a schema (it is
  // a collection), OR — KAN-350 — is a row whose parent carries one. Read here,
  // above the early returns, so the JSX below stays flat.
  const propSchema = isRowPage
    ? parentPage
      ? readSchema(parentPage.props)
      : null
    : page
      ? readSchema(page.props)
      : null
  // The id of the page that actually carries `_schema` — a row's parent, or the
  // page itself when it IS the database (KAN-350: "+ new tag" writes here, never
  // to a row's own `props`, which holds only its values).
  const schemaOwnerId = isRowPage ? parentId : pageId
  // The properties card's note: a row names its parent database; a collection
  // (or any other page) names itself (KAN-350).
  const propertiesNote = isRowPage ? parentPage?.title || 'Untitled' : viewTitle || 'Untitled'
  // Board 6f frame 1: a fresh, untouched page reads `new — in {parent}` instead
  // of the usual kind/save-state eyebrow, until the person types anything.
  const untouched = isUntouchedPage(viewTitle, viewBlocks)
  const parentTitle = rows.find((r) => r.id === page?.parentId)?.title ?? null
  // A page with a kind (an applied template) is not "untouched" for the eyebrow, even
  // if its blocks still read as the untouched shape — the eyebrow names the kind, not `new`.
  const madeAtStamp = readMadeFrom(page?.props)?.madeAt
  const madeAt = madeAtStamp ? new Date(madeAtStamp) : null
  const eyebrow = titleEyebrow(
    page?.props?.kind,
    saved,
    savedAt,
    untouched && !page?.props?.kind,
    parentTitle,
    madeAt,
  )
  // Board 6f frame 4: an empty title after an apply names the kind, e.g. `recipe name`.
  const titlePlaceholder = page?.props?.kind ? `${page.props.kind} name` : 'Untitled'

  // The record route's own title (`?record=`, KAN-152): read once here so the
  // breadcrumb's `current` can show it, same cache key `ChangeLogRecordPage`
  // itself reads with so the two never double-fetch.
  const { data: breadcrumbRecord, isLoading: breadcrumbRecordLoading } = useQuery({
    queryKey: recordKey(recordId ?? ''),
    queryFn: () => getRecord(getSupabase(), recordId as string),
    enabled: recordId !== null,
  })

  // The shell's `PondCommand` reads this page's path at rest: the root, the
  // ancestors, then this page — its name read off the row until the page lands.
  usePublishCommandPath(
    isChangeLogNode
      ? {
          glyph: pond?.glyph ?? LIFE_GLYPH,
          trail: recordId
            ? [home?.title || pondName || 'life', DATABASES_ROOT_TITLE, 'change log']
            : [home?.title || pondName || 'life', DATABASES_ROOT_TITLE],
          // `viewTitle`'s own fallback (an ordinary page's title read off the
          // row until it lands) has no row to read here — a record's title
          // only exists once the record query resolves, so the placeholder is
          // a loading word instead of a cached title. Once that query SETTLES
          // with nothing (a missing or not-visible record, AUDIT G6), the
          // crumb must not keep reading `loading…` forever — it names the
          // not-found state instead.
          current: recordId
            ? breadcrumbRecord
              ? recordBreadcrumbTitle(breadcrumbRecord)
              : breadcrumbRecordLoading
                ? 'loading…'
                : 'not found'
            : 'change log',
          role: null,
        }
      : isTrashNode
        ? {
            glyph: pond?.glyph ?? LIFE_GLYPH,
            // Trash is its own top-level rail row (KAN-504), not a databases
            // child — unlike change log above, its trail carries no databases crumb.
            trail: [home?.title || pondName || 'life'],
            current: 'trash',
            role: null,
          }
        : commandPath(rows, nodeId, {
            rootTitle: home?.title || pondName || 'life',
            current: viewTitle || rows.find((r) => r.id === nodeId)?.title || 'Untitled',
            pondGlyph: pond?.glyph ?? LIFE_GLYPH,
          })
  )

  // The virtual change-log page: the breadcrumb above has already taken effect;
  // `ChangeLogPage`/`ChangeLogRecordPage` own their own data fetching — this
  // surface takes none of the `getPage`/rows path below.
  if (isChangeLogNode) {
    return recordId ? <ChangeLogRecordPage recordId={recordId} /> : <ChangeLogPage />
  }

  // The virtual trash page: same shape as the change log above — the
  // breadcrumb has already taken effect, and `TrashPage` owns its own data
  // fetching, so this surface takes none of the `getPage`/rows path below.
  if (isTrashNode) {
    return <TrashPage />
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

  // ── The page (its children render as page-link blocks, not a grid) ─────────
  // "Everything is a page": a page may hold BOTH its own blocks AND children, and
  // nothing here reads a type tag — a page with pages inside it is simply a page
  // whose blocks include a page-link per child (#108, #234, KAN-415).
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
            placeholder={titlePlaceholder}
            aria-label="Page title"
            data-pond-page-title
          />
          <span
            data-part="title-eyebrow"
            className="flex-none text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase"
            hidden={zen !== null}
            aria-live="polite"
          >
            {previewName ? `preview — ${previewName}` : eyebrow}
          </span>
        </div>

        <div className={hiddenInZen}>
          {/* Provenance (#97, 6a frame 5): the thread moment this page was made
              from, when it was. Hide keeps the stamp; nothing removes it. */}
          <PageProvenance pageId={page.id} props={page.props} className="mb-5" />
          {/* Typed properties (#17): shown when the page carries a schema (it is a
              collection) OR is a ROW of one (its parent carries the schema; KAN-350).
              Edits write optimistically, bypassing the AI gate. #260: framed in the
              board's `properties` card (ADR 0007 — the inspector IS that kind), empty
              when the schema has no fields. The note (KAN-350) names the parent
              database for a row, or the page's own title when it IS the database. */}
          {propSchema && (
            <PondBlock {...propertiesFrame(propSchema, propertiesNote)} className="mb-6">
              <PropertyInspector
                schema={propSchema}
                values={readValues(page.props)}
                onChange={onProperty}
                onAddOption={onAddOption}
              />
            </PondBlock>
          )}
        </div>

        {/* The shared authoring surface (ticket-44): the `/` palette, Return after
            a block, reorder, bound metrics, and the hover-only trailing hit area
            that opens a new line (KAN-345). Controlled — it emits the full next
            array and this panel schedules the debounced whole-array save. */}
        <BlockCanvas
          blocks={viewBlocks}
          pageId={page.id}
          pageTitle={viewTitle}
          onChange={commitLocalEdit}
          onStructuralWrite={writeStructural}
          onUndoRemove={undoRemove}
          insertedIds={insertedIds}
          chrome={!zen}
          untouched={untouched}
          openTemplatesFor={templatesTargetId}
          listStyle={zen ? ZEN_BLOCK_LIST_STYLE : undefined}
          onPreviewNameChange={setPreviewName}
        />

        <div className={hiddenInZen}>
          <PageMentioned props={page.props} className="mt-8" />

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
