'use client'

/**
 * The shared block editor body (ticket-44) — the full manual-authoring surface
 * extracted from DocumentPanel so EVERY editable page renders it identically: the
 * document editor, an area page with content, AND the Life home page.
 *
 * It renders a `SiblingBlocksProvider`-wrapped list of blocks with, at every seam,
 * the ticket-37 machinery — the `/` palette on an empty text block, the hover `+`
 * InsertBetween, drag/⌥↑/⌥↓ reorder, per-block delete with undo — and, at the
 * foot, the ticket-44 always-visible palette-first "+ Add a block".
 *
 * Persistence is the CALLER's concern: BlockCanvas is controlled (it takes
 * `blocks` and emits the full next array via `onChange`), so DocumentPanel keeps
 * its debounced whole-array save and the Life home surface keeps its own. This is
 * the same "blocks are never partially persisted" contract, just hoisted so two
 * surfaces share one editor.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { blockDomId, scrollToBlock } from '@/lib/modules/block-dom'
import { ModuleView } from '@/lib/modules/renderers'
import {
  blockEmptyBox,
  blockFrame,
  blockIsEmpty,
  viewCollectionId,
  viewFrameState,
  type BlockFrame,
  type PondBlockState,
} from '@/lib/modules/block-frame'
import { useCollectionRows } from '@/lib/modules/view/use-collection-rows'
import { applyView } from '@/lib/modules/view/apply'
import { CHART_EMPTY_LINE } from '@/lib/modules/chart/card'
import { addTodoItem } from '@/lib/modules/todo/view'
import { addTableRow } from '@/lib/modules/table/view'
import { addEntry } from '@/lib/modules/entries/view'
import { PondBlock } from '@/components/organisms/PondBlock'
import { SlashMenu, type SlashRow, type TemplatePick } from '@/components/molecules/SlashMenu'
import { SourcePicker, type SourcePick } from '@/components/molecules/SourcePicker'
import { sourceBlockOf, type SourceBlock } from '@/components/molecules/source-entries'
import { BlockHandleMenu, type BlockMenuItem } from '@/components/molecules/BlockHandleMenu'
import { InsertBetween, AddBlockButton } from '@/components/molecules/BlockInserters'
import { slashRows, mintPreset, emptyBlockForType } from '@/lib/modules/palette'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { instantiateTemplate } from '@/lib/templates/instantiate'
import {
  createDatabaseFromList,
  inferListDatabaseTitle,
  previewListTable,
} from '@/lib/pages/list-to-table'
import { replaceBlockWithView } from '@/lib/pages/promote-table'
import { createPage, defineSchema, deletePage, getPage } from '@/lib/pages/client'
import { createDatabase } from '@/lib/pages/create-database'
import { fetchRecordCounts, sourceDatabases } from '@/lib/pages/source-databases'
import { fetchPages, insertPageOptimistic } from '@/lib/pages/tree'
import { readSchema } from '@/lib/properties/schema'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { useWorkspace } from '@/lib/workspace/context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { PageLinkProvider } from '@/lib/modules/page-link/context'
import { usePageLinkCapabilities } from '@/lib/modules/page-link/use-capabilities'
import { cn } from '@/lib/utils'
import type { Block } from '@/lib/documents/types'

/** A short, human label for a block in the undo toast ("Deleted text block"). */
function blockLabel(block: Block): string {
  return `Deleted ${block.type} block`
}

/**
 * The handle menu's items for one block (#101, board 6j frame 2). `turn into ›
 * table` is offered only on a LIST block, with the preview of what will come out
 * ("4 rows · 3 columns"); the `block` group carries the block's own actions.
 *
 * Called only for the block whose menu is OPEN — the preview scans the block's
 * whole content, which is not work to redo for every block on every keystroke.
 */
function menuItemsFor(block: Block): BlockMenuItem[] {
  const items: BlockMenuItem[] = []
  const preview = previewListTable(block)
  if (preview) {
    const rows = `${preview.rows} ${preview.rows === 1 ? 'row' : 'rows'}`
    const cols = `${preview.columns} ${preview.columns === 1 ? 'column' : 'columns'}`
    items.push({
      id: 'turn-into-table',
      group: 'turn into',
      label: 'table',
      preview: `${rows} · ${cols}`,
      icon: 'table',
    })
  }
  items.push({ id: 'delete', group: 'block', label: 'delete block', icon: 'delete' })
  return items
}

export interface BlockCanvasProps {
  /** The blocks to render — controlled by the caller. */
  blocks: Block[]
  /** The page these blocks belong to (drives bound-metric cross-page lookups). */
  pageId: string
  /**
   * The page's title (#101): the fallback name for a database made from a list
   * when no heading sits above it. Optional — a surface without one falls back
   * to "Untitled".
   */
  pageTitle?: string
  /** Emit the full next block array; the caller owns persistence (debounced save). */
  onChange: (next: Block[]) => void
  /**
   * Undo a block removal (ticket-44 review). The caller re-inserts `block` at
   * `index` via a FUNCTIONAL state update against its LATEST blocks — NOT through
   * `onChange`, which would re-base on the stale `blocks` snapshot captured when
   * the toast was staged. This preserves DocumentPanel's original
   * `setBlocks((current) => …)` correctness: an edit between remove and Undo
   * must not be clobbered by the re-insert. Required whenever removal is possible.
   */
  onUndoRemove: (index: number, block: Block) => void
  /**
   * Block ids inserted this session, so a freshly-inserted block SETTLES in
   * (motion-settle-in) while blocks present on load do not (ticket-41). The Set is
   * OWNED BY THE PARENT (so it survives the panel's stable mount across page
   * changes), not by BlockCanvas — `markInserted` mutates it through this prop.
   * Optional — a surface that doesn't track it passes nothing and no block animates.
   */
  insertedIds?: Set<string>
}

/**
 * The controlled block editor. All edits go through `emit`, which hands the full
 * next array up; the caller schedules the persist. Reorder, insert, remove, and
 * the palette picks all reduce to one `emit`.
 */
export function BlockCanvas({
  blocks,
  pageId,
  pageTitle = '',
  onChange,
  onUndoRemove,
  insertedIds,
}: BlockCanvasProps) {
  const { stageDeletion, notify } = useDeletionUndo()
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()
  const workspace = useWorkspace()
  // The LATEST blocks, for the async paths below (the list→table write and its
  // undo). They run after awaits / from a toast, when the `blocks` their closure
  // captured may be stale — re-basing an edit on that snapshot would drop
  // whatever the person typed in between (the hazard onUndoRemove documents).
  const blocksRef = useRef(blocks)
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])
  // F27: link capabilities for card→page links, parented at THIS page. Provided to
  // every module view below via context — modules that don't link (all but kanban
  // today) simply never read it.
  const pageLinks = usePageLinkCapabilities(pageId)

  // Which block index has the `/` palette open (null = closed). Index, not id:
  // the palette replaces the text block AT that position (ticket-37).
  const [slashMenuOpenAt, setSlashMenuOpenAt] = useState<number | null>(null)
  // Which block index is mid-drag (null = no drag).
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  // The source picker (#280): which `/` pick summoned it, and where its block
  // lands — `at` replaces the `/…` block that opened the menu, or inserts
  // between. `Pond 02` 2e: table, gallery and chart all open the same picker.
  const [sourcePicker, setSourcePicker] = useState<{
    block: SourceBlock
    /** The block the view lands against — the `/…` block it replaces, or the one above an insert. */
    hostId: string | undefined
    replace: boolean
    /** Where to look for a nearby source (AUDIT C9) — a position, read once at open. */
    at: number
    anchor: Element | null
  } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  // What the picker lists, read only while it is open: the databases root's
  // children off the shared ['pages'] cache, and one count query over the pond's
  // records (`source-databases.ts`). Counts refetch on each open, so a record
  // added through a view is reflected the next time the picker is summoned.
  const { data: pageRows = [] } = useQuery({
    queryKey: ['pages', workspace],
    queryFn: () => fetchPages(workspace),
    enabled: sourcePicker !== null,
  })
  const { data: recordCounts } = useQuery({
    queryKey: ['record-counts', workspace],
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? fetchRecordCounts(supabase, user.id, workspace) : new Map<string, number>()
    },
    enabled: sourcePicker !== null,
    staleTime: 0,
  })
  const databases = useMemo(
    () => sourceDatabases(pageRows, recordCounts ?? new Map()),
    [pageRows, recordCounts]
  )

  // Which block index has the handle menu open (null = closed) — #101.
  const [menuOpenAt, setMenuOpenAt] = useState<number | null>(null)

  // Mark a freshly-inserted block on the PARENT-owned insertedIds Set (see the
  // prop doc): BlockCanvas doesn't own it, it just records into it.
  function markInserted(id: string) {
    insertedIds?.add(id)
  }

  /**
   * The handle menu's "turn into › table" on a LIST block (#101, board 6j). A
   * table is always a view of a database, so this CREATES a real database from
   * the list's rows (filed under the databases root) and swaps the list for a
   * table-mode view of it in place. It is the person's own gesture, so it applies
   * at once through the caller's ordinary save — no proposal card; only Pond's
   * changes arrive as diffs — with an undo that puts the list back and removes
   * the database it made. The page is left untouched when the write fails.
   */
  async function turnIntoTable(index: number) {
    const block = blocks[index]
    if (!block) return
    const title = inferListDatabaseTitle(blocks, index, pageTitle)
    try {
      const made = await createDatabaseFromList(getSupabase(), { block, title, workspace }, () =>
        crypto.randomUUID()
      )
      markInserted(made.view.id)
      onChange(replaceBlockWithView(blocksRef.current, block.id, made.view))
      // The rail lists the new database (and, on first use, the databases root).
      queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
      stageDeletion({
        message: 'Turned into a table',
        scope: 'block',
        // Everything already applied; nothing is deferred behind the grace window.
        commit: () => {},
        undo: async () => {
          onChange(blocksRef.current.map((b) => (b.id === made.view.id ? block : b)))
          try {
            // Removes its records too (parent_id cascade).
            await deletePage(getSupabase(), made.databaseId)
          } catch (err) {
            console.error('Failed to remove the database after undo', err)
          }
          queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        },
      })
    } catch (err) {
      console.error('Failed to turn the list into a table', err)
      notify("Couldn't turn the list into a table")
    }
  }

  function setBlockAt(index: number, next: Block) {
    onChange(blocks.map((b, i) => (i === index ? next : b)))
  }

  function removeBlockAt(index: number) {
    const removed = blocks[index]
    if (!removed) return
    onChange(blocks.filter((_, i) => i !== index))
    stageDeletion({
      message: blockLabel(removed),
      // The removal already persists via the caller's debounced save; undo
      // re-inserts and re-saves. Flushed via scope 'block' on page change.
      //
      // Route the re-insert through the caller's FUNCTIONAL update
      // (onUndoRemove), NOT onChange: `blocks` here is the snapshot at
      // stage-time, so an edit before Undo would otherwise re-base the insert on
      // stale state and drop that edit (ticket-44 review).
      scope: 'block',
      commit: () => {},
      undo: () => onUndoRemove(index, removed),
    })
  }

  // Insert the block a `/` row mints at `at` (ticket-37, #278). A row is a preset
  // — `list` is `todo` at the dot marker, `chart` is `view` in chart mode — so the
  // palette mints it; a row with no factory is a no-op, never a crash.
  function insertBlockAt(at: number, row: SlashRow) {
    const source = sourceBlockOf(row.id)
    if (source) {
      openSourcePicker(source, at, false)
      return
    }
    const nb = mintPreset(row.id)
    if (!nb) return
    markInserted(nb.id)
    onChange([...blocks.slice(0, at), nb, ...blocks.slice(at)])
  }

  /**
   * `/table`, `/gallery`, `/chart` open the source picker rather than minting a
   * block (#280; PROJECT_RULES: "a table is always a view of a database"). The
   * glass hangs off the block that summoned it — the `/…` block itself, or the
   * one above an insert-between (the canvas for the top slot). AUDIT C9, decided:
   * a chart auto-wires "when one table is nearby" — the nearest linked view on
   * the page becomes its source and the picker opens on the chart types;
   * otherwise it opens on the sources.
   */
  function openSourcePicker(block: SourceBlock, at: number, replace: boolean) {
    const host = blocks[replace ? at : at - 1]
    const anchor = host ? document.getElementById(blockDomId(host.id)) : canvasRef.current
    setSourcePicker({ block, hostId: host?.id, replace, at, anchor })
  }

  function nearestSource(at: number): string | null {
    for (let d = 0; d < blocks.length; d++) {
      for (const i of [at - d, at + d]) {
        const b = blocks[i]
        if (b?.type === 'view' && b.collectionId) return b.collectionId
      }
    }
    return null
  }

  /**
   * The chosen source's fields, for the chart step — its schema, read on demand.
   * `useCallback` because the picker's effect depends on this identity: a plain
   * function declaration changes on every render of this page and would refetch
   * the schema on every keystroke. A failure yields NO fields, which the picker
   * already draws as "nothing fits" — `all charts` alone, never a stuck glass.
   * The `id` rides along: a chart config names fields by schema id, not by name.
   */
  const loadFields = useCallback(
    async (databaseId: string) => {
      try {
        const page = await getPage(getSupabase(), databaseId)
        return (page ? (readSchema(page.props) ?? []) : []).map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
        }))
      } catch (err) {
        console.error('Failed to read the source’s fields', err)
        return []
      }
    },
    [getSupabase]
  )

  /**
   * Put the picked view block where the `/` was (replace) or between (insert).
   * Keyed on the HOST BLOCK'S ID, not the index the picker opened at: making a
   * database is an await, and a block inserted or removed meanwhile would move
   * that index under us. With no host (an insert at the top, or a block that went
   * away while the glass was open) the view lands at the end, which is where an
   * append belongs.
   */
  function placeView(view: ViewBlock, hostId: string | undefined, replace: boolean) {
    markInserted(view.id)
    const current = blocksRef.current
    const at = hostId ? current.findIndex((b) => b.id === hostId) : -1
    if (replace) {
      // The `/…` block went away while the glass was open — append rather than
      // drop the thing the person asked for; the undo takes it back.
      onChange(at === -1 ? [...current, view] : current.map((b, i) => (i === at ? view : b)))
      return
    }
    // An insert-between hangs off the block ABOVE the slot, so no host means the
    // top slot.
    const insertAt = at === -1 ? 0 : at + 1
    onChange([...current.slice(0, insertAt), view, ...current.slice(insertAt)])
  }

  /**
   * The picker's pick is the person's own gesture, so it applies at once through
   * the caller's ordinary save — no proposal card; only Pond's changes arrive as
   * diffs (the same reading as `turnIntoTable`, #101). An existing database is a
   * linked view of it. A new one is written through `createDatabase` (filed under
   * the databases root, named after this page), with an undo that puts the `/…`
   * block back and removes the database it made.
   */
  async function onSourcePick(pick: SourcePick) {
    const open = sourcePicker
    setSourcePicker(null)
    if (!open) return
    // The kind the person chose, over the two fields the row promised. An empty
    // `property` with `agg: 'count'` would plot 1 per record, and a config with no
    // `xProperty` buckets by record TITLE — `resolveChartConfig` infers an x axis
    // only when there is no stored config at all. So each half is written only
    // when the picker actually knows it, and the engine infers the rest.
    const chart = pick.chart
      ? {
          kind: pick.chart.kind,
          ...(pick.chart.xProperty ? { xProperty: pick.chart.xProperty } : {}),
          ...(pick.chart.yProperty
            ? { series: [{ property: pick.chart.yProperty, agg: 'sum' as const }] }
            : { series: [] }),
        }
      : undefined
    if (pick.kind === 'existing') {
      const view: ViewBlock = {
        id: crypto.randomUUID(),
        type: 'view',
        mode: pick.mode,
        collectionId: pick.database.id,
        ...(chart ? { chart } : {}),
      }
      placeView(view, open.hostId, open.replace)
      return
    }
    const replaced = open.replace ? blocksRef.current.find((b) => b.id === open.hostId) : undefined
    try {
      const made = await createDatabase(
        getSupabase(),
        {
          title: pick.title,
          schema: pick.fields.map((f) => ({ id: crypto.randomUUID(), name: f.name, type: f.type })),
          mode: pick.mode,
          chart,
          workspace,
        },
        () => crypto.randomUUID()
      )
      placeView(made.view, open.hostId, open.replace)
      queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
      queryClient.invalidateQueries({ queryKey: ['record-counts', workspace] })
      stageDeletion({
        message: 'Made a database',
        scope: 'block',
        commit: () => {},
        undo: async () => {
          const current = blocksRef.current
          onChange(
            replaced
              ? current.map((b) => (b.id === made.view.id ? replaced : b))
              : current.filter((b) => b.id !== made.view.id)
          )
          try {
            await deletePage(getSupabase(), made.databaseId)
          } catch (err) {
            console.error('Failed to remove the database after undo', err)
          }
          queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        },
      })
    } catch (err) {
      console.error('Failed to make the database', err)
      notify("Couldn't make the database")
    }
  }

  // `page from template › ↵ new nested page` (#278): make the page the template
  // describes UNDER this one — its title, its blocks and, for a collection, its
  // schema — through the same seams the AI's create_page path uses
  // (`instantiateTemplate`, #261), then go there. The `/…` text block that summoned
  // the menu was a command, so it goes. The one-way provenance stamp, the cursor
  // landing on the title and `→ preview` are #156's. A person's own templates
  // (`yours`, #157) are not passed in here yet, so only a premade kind arrives.
  async function makeNestedPageFromTemplate(pick: TemplatePick, replaceAt: number | null) {
    if (pick.origin !== 'premade') return
    try {
      const made = instantiateTemplate(PREMADE_TEMPLATES[pick.kind])
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const created = await createPage(supabase, user.id, {
        parentId: pageId,
        type: 'page',
        title: made.title,
        blocks: made.blocks,
        workspace,
      })
      if (made.schema) await defineSchema(supabase, created.id, made.schema)
      if (replaceAt !== null) onChange(blocksRef.current.filter((_, bi) => bi !== replaceAt))
      insertPageOptimistic(queryClient, workspace, {
        id: created.id,
        parentId: pageId,
        type: created.type,
        title: created.title,
      })
      void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
      pageLinks.navigateToPage({ id: created.id, title: created.title, type: created.type })
    } catch (err) {
      console.error('Failed to make a page from the template', err)
    }
  }

  // The foot add (UI-audit Slice 2a): drop an empty text block at the end, ready
  // to type. Typing `/` in it summons the palette to swap to another block type.
  function addTextBlock() {
    const nb = emptyBlockForType('text')
    if (!nb) return
    markInserted(nb.id)
    onChange([...blocks, nb])
  }

  function moveBlockAt(index: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <PageLinkProvider value={pageLinks}>
      {/* Provide sibling-block state so bound metrics derive live and their `→`
          can scroll to source (ticket-23). Keyed off the live `blocks`, so a
          checklist toggle re-derives every metric in the same render. `pageId`
          lets a cross-page rollup metric find this page's children (ticket-38). */}
      <SiblingBlocksProvider value={{ blocks, scrollToBlock, pageId }}>
        <div ref={canvasRef} className="space-y-0">
          <InsertBetween
            onInsert={(row) => insertBlockAt(0, row)}
            onPickTemplate={(pick) => void makeNestedPageFromTemplate(pick, null)}
          />
          {blocks.map((block, i) => (
            <React.Fragment key={block.id}>
              <BlockEditor
                block={block}
                pageId={pageId}
                settleOnMount={insertedIds?.has(block.id) ?? false}
                onChange={(next) => setBlockAt(i, next)}
                onRemove={() => removeBlockAt(i)}
                onMoveUp={() => moveBlockAt(i, 'up')}
                onMoveDown={() => moveBlockAt(i, 'down')}
                onSlashKey={() => setSlashMenuOpenAt(i)}
                slashMenuOpen={slashMenuOpenAt === i}
                onSlashSelect={(row) => {
                  // Replace the `/…` text block at i with the picked row's block
                  // (the `/` gesture: text block → chosen block). The three
                  // source rows go through the picker first (#280).
                  setSlashMenuOpenAt(null)
                  const source = sourceBlockOf(row.id)
                  if (source) {
                    openSourcePicker(source, i, true)
                    return
                  }
                  const nb = mintPreset(row.id)
                  if (!nb) return
                  markInserted(nb.id)
                  onChange(blocks.map((b, bi) => (bi === i ? nb : b)))
                }}
                onSlashPickTemplate={(pick) => {
                  setSlashMenuOpenAt(null)
                  void makeNestedPageFromTemplate(pick, i)
                }}
                onSlashClose={() => setSlashMenuOpenAt(null)}
                menuOpen={menuOpenAt === i}
                // Only the OPEN block's items are derived: menuItemsFor splits and
                // regex-scans a text block's whole content, and this render runs on
                // every keystroke anywhere on the page (#101 review).
                menuItems={menuOpenAt === i ? menuItemsFor(block) : undefined}
                onMenuToggle={() => setMenuOpenAt((open) => (open === i ? null : i))}
                onMenuClose={() => setMenuOpenAt(null)}
                onMenuSelect={(id) => {
                  setMenuOpenAt(null)
                  if (id === 'turn-into-table') void turnIntoTable(i)
                  else if (id === 'delete') removeBlockAt(i)
                }}
                isDragging={draggingIndex === i}
                onDragStart={() => setDraggingIndex(i)}
                onDragEnd={() => setDraggingIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggingIndex === null || draggingIndex === i) {
                    setDraggingIndex(null)
                    return
                  }
                  // Move the dragged block to position i (splice, not swap).
                  const next = [...blocks]
                  const [moved] = next.splice(draggingIndex, 1)
                  next.splice(i, 0, moved)
                  onChange(next)
                  setDraggingIndex(null)
                }}
              />
              <InsertBetween onInsert={(item) => insertBlockAt(i + 1, item)} />
            </React.Fragment>
          ))}
        </div>
      </SiblingBlocksProvider>

      {/* The always-visible foot add (UI-audit Slice 2a): drops a text block; `/`
          in it summons the palette to swap type. */}
      <AddBlockButton onAdd={addTextBlock} />
      {/* The source picker (#280), hung off the block that summoned it. */}
      {sourcePicker && (
        <SourcePicker
          block={sourcePicker.block}
          /* Lowercase on the machine surface — see `sourceDatabases`. */
          pageTitle={pageTitle || 'untitled'}
          databases={databases}
          loadFields={loadFields}
          /* ONE expression decides both: the step is `type` exactly when there IS
             a source to open it on. Deriving them separately opened the chart step
             with no source whenever the nearby view pointed at a collection that is
             not a child of the databases root (`promote-table.ts` files one under
             its own page) or the `['pages']` cache had not warmed — and the picker
             reads both props once, in `useState`, so it never recovered: finishing
             there wrote a brand-new empty database instead of charting the table
             the person was standing next to. AUDIT C9 wires a chart to a nearby
             database; it does not invent one. */
          {...(() => {
            const near =
              sourcePicker.block === 'chart'
                ? databases.find((d) => d.id === nearestSource(sourcePicker.at))
                : undefined
            return {
              defaultStep: near ? ('type' as const) : ('source' as const),
              defaultSource: near,
            }
          })()}
          anchor={sourcePicker.anchor}
          onPick={(pick) => void onSourcePick(pick)}
          onClose={() => setSourcePicker(null)}
        />
      )}
    </PageLinkProvider>
  )
}

// ── Per-block editor ───────────────────────────────────────────────────────────

/**
 * The frame's state, offered action and (when the kind's line would be false) the
 * empty line for one block (#239). Emptiness is read off the block when it can be
 * (`blockIsEmpty`); a view block's rows live with the host collection, so the canvas
 * reads them through the SAME hook the view does (one shared React Query cache — no
 * second fetch) and runs the SAME `applyView` the view draws from, so the frame and
 * the view agree on what is on screen. Two empty causes, told apart because the
 * board's line must be TRUE:
 *
 *   no rows at all              → the kind's `EL` copy + action (`no rows yet` · `add a row`)
 *   rows, but the filter hides  → `nothing matches this filter`, no action — clearing a
 *   every one                     filter is not wired through the frame, and a dead
 *                                 button is never drawn
 *
 * The action is the module's EXISTING insert path, never a new persistence mechanism:
 *
 *   todo   → `addTodoItem` through onChange          `add a step`
 *   table  → `addTableRow` through onChange          `add a row`
 *   entries→ `addEntry` through onChange             `write one`   (#250)
 *   view   → the collection's `addRow`               `add a row` / `add a record`
 *   view of kind `number` → none: `pick a field` has no engine path yet
 *          (`POND_BLOCK_EMPTY_ACTION_WIRED`), so the line renders alone.
 *   view in `gantt` mode → none: the board's voidBox has no action slot (#260);
 *          the line is the template's `tasks with a start and a due date draw here`.
 *
 * A view still loading, or over a non-collection, is NOT empty — the view keeps its
 * own notice. Wiring the frame's `loading` state to `isLoading` is a sibling
 * concern, not this slice's.
 */
function useBlockEmptyState(
  block: Block,
  frame: BlockFrame | null,
  pageId: string,
  onChange: (next: Block) => void
): { state: PondBlockState; onEmptyAction?: () => void; emptyLine?: string } {
  const collectionId = block.type === 'view' ? viewCollectionId(block, pageId) : undefined
  const { schema, rows, isLoading, addRow } = useCollectionRows(collectionId)
  // The rows the view will actually draw — its filter (and sort) applied.
  const processed = useMemo(
    () => (block.type === 'view' && schema ? applyView(rows, schema, block) : rows),
    [block, rows, schema]
  )

  switch (block.type) {
    case 'todo':
      return blockIsEmpty(block)
        ? { state: 'empty', onEmptyAction: () => onChange(addTodoItem(block)) }
        : { state: 'rest' }
    case 'table':
      return blockIsEmpty(block)
        ? { state: 'empty', onEmptyAction: () => onChange(addTableRow(block)) }
        : { state: 'rest' }
    case 'entries':
      return blockIsEmpty(block)
        ? { state: 'empty', onEmptyAction: () => onChange(addEntry(block)) }
        : { state: 'rest' }
    case 'view': {
      if (isLoading || schema === null) return { state: 'rest' }
      // The rule itself is `viewFrameState` in `block-frame.ts`, shared with the
      // template story so the story asserts what the product runs (#261 review).
      // This host adds the two things a pure rule cannot carry: the chart mark's
      // copy, which lives in a React module, and the write action.
      const verdict = viewFrameState(block, rows, processed, frame)
      if (verdict.state === 'rest') return { state: 'rest' }
      if (verdict.chartLine) return { state: 'empty', emptyLine: CHART_EMPTY_LINE }
      if (verdict.addRow) return { state: 'empty', onEmptyAction: () => void addRow() }
      return { state: 'empty', emptyLine: verdict.line }
    }
    default:
      return { state: 'rest' }
  }
}

/**
 * One block row: drag handle + delete affordance + the module's own view, editable.
 * Rendering goes through the ModuleView registry — no per-type branches, so every
 * registered module (and any future one) is editable here with zero edits. Views
 * that fold editing in (text/todo/table) emit full-state onChange; display-only
 * views ignore `editable`.
 *
 * Ticket-37: `/` in an empty text block opens the block palette (intercepted in the
 * onChange below, so the slash never persists); ⌥↑/⌥↓ reorders the focused block;
 * the handle drags to reorder. `draggable` is armed only while the pointer is
 * down on the handle — an always-draggable block would hijack text-selection drags.
 *
 * #101 (board 6j): a CLICK on the handle (a press with no drag) opens the block
 * menu — `turn into › table` on a list, the block's own actions — anchored under
 * the handle at the block's left edge, where frame 2 draws it.
 */
function BlockEditor({
  block,
  pageId,
  settleOnMount = false,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onSlashKey,
  onSlashPickTemplate,
  slashMenuOpen,
  onSlashSelect,
  onSlashClose,
  menuOpen,
  menuItems = [],
  onMenuToggle,
  onMenuSelect,
  onMenuClose,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  block: Block
  pageId: string
  settleOnMount?: boolean
  onChange: (next: Block) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onSlashKey?: () => void
  slashMenuOpen?: boolean
  onSlashSelect?: (row: SlashRow) => void
  onSlashPickTemplate?: (pick: TemplatePick) => void
  onSlashClose?: () => void
  menuOpen?: boolean
  menuItems?: BlockMenuItem[]
  onMenuToggle?: () => void
  onMenuSelect?: (id: string) => void
  onMenuClose?: () => void
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  const [dragArmed, setDragArmed] = useState(false)
  const handleRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const frame = blockFrame(block)
  // The `/` menu's query is what follows the slash in THIS text block (#278): the
  // board has no filter input — the person keeps typing on the page.
  const slashQuery =
    slashMenuOpen && block.type === 'text' ? (block as { content: string }).content.slice(1) : ''
  const { state, onEmptyAction, emptyLine } = useBlockEmptyState(block, frame, pageId, onChange)

  const view = (
    <ModuleView
      type={block.type}
      data={block}
      editable
      onChange={(next) => {
        const nextBlock = next as Block
        if (nextBlock.type === 'text' && block.type === 'text') {
          const was = (block as { content: string }).content
          const now = (nextBlock as { content: string }).content
          // `/` typed into an EMPTY text block opens the menu (ticket-37, #278).
          // The slash STAYS as text — it is the query the person is typing, and
          // esc keeps it. Deleting it back out closes the menu.
          if (was === '' && now === '/') onSlashKey?.()
          else if (slashMenuOpen && !now.startsWith('/')) onSlashClose?.()
        }
        onChange(nextBlock)
      }}
    />
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault()
      onMoveUp?.()
    }
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      onMoveDown?.()
    }
    // Backspace in an EMPTY text block removes it (Notion-style). Guarded so it
    // never fires while the `/` palette is open (that Backspace closes the menu,
    // which stops propagation) — only a bare empty block deletes.
    if (
      e.key === 'Backspace' &&
      !slashMenuOpen &&
      block.type === 'text' &&
      (block as { content: string }).content === ''
    ) {
      e.preventDefault()
      onRemove()
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'group relative',
        settleOnMount && 'motion-settle-in',
        isDragging && 'opacity-50'
      )}
      id={blockDomId(block.id)}
      draggable={dragArmed}
      onDragStart={onDragStart}
      onDragEnd={() => {
        setDragArmed(false)
        onDragEnd?.()
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onKeyDown={handleKeyDown}
    >
      {/* Gutter affordances (ticket-37): the block menu handle + delete, revealed on
          hover/focus. Both live in one flex row, in identical 20×16 boxes, so the
          two hand-drawn marks share a centre — their own artwork differs in optical
          weight, and without the shared box they read as misaligned. Both sit on
          the 68% ink tier: PROJECT_RULES allows three tiers only (100 / 80 small
          meta / 68), so neither gutter mark may drop to a fainter ink. The handle is
          the six-dot mark 6j draws (10×14, dots r 1.1); press-and-drag reorders, a
          click opens the block menu (#101). */}
      <div className="absolute -left-10 top-1 flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100">
        <button
          ref={handleRef}
          type="button"
          className="flex h-5 w-4 items-center justify-center rounded text-mn-text-secondary hover:text-mn-text outline-none focus-visible:ring-2 focus-visible:ring-mn-text cursor-grab"
          title="Block menu · drag to reorder"
          aria-label="Block menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen ? true : undefined}
          onPointerDown={() => setDragArmed(true)}
          onPointerUp={() => setDragArmed(false)}
          onClick={onMenuToggle}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
            <circle cx="3" cy="3" r="1.1" />
            <circle cx="7" cy="3" r="1.1" />
            <circle cx="3" cy="7" r="1.1" />
            <circle cx="7" cy="7" r="1.1" />
            <circle cx="3" cy="11" r="1.1" />
            <circle cx="7" cy="11" r="1.1" />
          </svg>
        </button>
        <button
          className="flex h-5 w-4 items-center justify-center rounded text-mn-text-secondary hover:text-mn-text focus-visible:text-mn-text outline-none focus-visible:ring-2 focus-visible:ring-mn-text"
          title="Delete block"
          aria-label="Delete block"
          onClick={onRemove}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* The block menu (#101, 6j frame 2): under the handle, at the block's left
          edge — measured left −10 / top 36 off the frame. */}
      {menuOpen && (
        <BlockHandleMenu
          items={menuItems}
          onSelect={onMenuSelect ?? (() => {})}
          onClose={onMenuClose ?? (() => {})}
          anchorRef={handleRef}
          className="absolute -left-2.5 top-9 z-10"
        />
      )}

      {/* The `/` menu, hung under this block (ticket-37, #278). */}
      {slashMenuOpen && (
        <SlashMenu
          rows={slashRows}
          query={slashQuery}
          anchor={rootRef}
          onSelect={onSlashSelect ?? (() => {})}
          onPickTemplate={onSlashPickTemplate}
          onClose={onSlashClose ?? (() => {})}
        />
      )}

      {/* #237: the board's card around the module view — PondBlock.dc.html's
          frame + head row, by kind (blockFrame). Prose is bare: PondTemplate draws
          a text block with no label at `padding 2px 4px` and no card. The view
          itself renders exactly as before — the frame is chrome, not a rewrite.
          #239: an EMPTY block hands the frame its state and the module's own
          insert path; the frame suppresses the view and offers that one action. */}
      {frame ? (
        <PondBlock
          kind={frame.kind}
          heading={frame.heading}
          headNote={frame.headNote}
          state={state}
          onEmptyAction={onEmptyAction}
          emptyLine={emptyLine}
          emptyBox={blockEmptyBox(block)}
        >
          {view}
        </PondBlock>
      ) : (
        <div className="px-1 py-0.5">{view}</div>
      )}
    </div>
  )
}
