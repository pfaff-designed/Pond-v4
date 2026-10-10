'use client'

/**
 * The shared block editor body (ticket-44) — the full manual-authoring surface
 * extracted from DocumentPanel so EVERY editable page renders it identically: the
 * document editor, an area page with content, AND the Life home page.
 *
 * It renders a `SiblingBlocksProvider`-wrapped list of blocks with the ticket-37
 * machinery — the `/` palette on an empty text block or an empty line inside one,
 * Return on a focused block opening a line after it (6g: "Return after the table,
 * then /"), drag/⌥↑/⌥↓ reorder, per-block delete with undo — and, at the foot,
 * the ticket-44 always-visible "+ Add a block". The handle is the only block
 * chrome (7e): nothing is drawn between blocks.
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
import { blockLinkUrl, useBlockLinkArrival } from '@/lib/modules/block-link'
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
import {
  SlashMenu,
  type SlashRow,
  type TemplatePick,
  type YourTemplate,
} from '@/components/molecules/SlashMenu'
import { slashMenuHeight, type SlashPane } from '@/components/molecules/slash-entries'
import type { PickerSize } from '@/components/molecules/picker-chrome'
import { SourcePicker, type SourcePick } from '@/components/molecules/SourcePicker'
import { sourceBlockOf, type SourceBlock } from '@/components/molecules/source-entries'
import {
  PondMenu,
  type PondMenuGroup,
  type PondMenuPlacement,
  type PondMenuSize,
} from '@/components/molecules/PondMenu'
import { AddBlockButton } from '@/components/molecules/BlockInserters'
import {
  SlashLineContext,
  splitAtSlashLine,
  type SlashLine,
  type SlashLineListener,
} from '@/lib/modules/text/slash-line'
import {
  blockMenuGroups,
  runBlockMenuAction,
  type BlockMenuAction,
} from '@/components/organisms/block-menu'
import type { ConversionTarget, LineConversion, TableConversion } from '@/lib/modules/conversions'
import { isBlockMenuChord } from '@/lib/shell-commands'
import { slashRows, mintPreset, emptyBlockForType } from '@/lib/modules/palette'
import type { PickerAnchorBox, PickerSide } from '@/components/molecules/use-anchored-box'
import { caretRect, sideTowardFreeSpace } from '@/lib/layout/caret-anchor'
import { useBelowMd } from '@/lib/layout/use-below-md'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { instantiateTemplate, type InstantiatedTemplate } from '@/lib/templates/instantiate'
import { getTemplate, listTemplates } from '@/lib/templates/client'
import { templateBlocksFrom } from '@/lib/templates/from-page'
import { stampProvenance } from '@/lib/templates/provenance'
import { inferListDatabaseTitle } from '@/lib/pages/list-to-table'
import { replaceBlockWithView } from '@/lib/pages/promote-table'
import { createPage, defineSchema, deletePage, getPage } from '@/lib/pages/client'
import { createDatabase } from '@/lib/pages/create-database'
import { fetchRecordCounts, sourceDatabases } from '@/lib/pages/source-databases'
import { fetchPages, insertPageOptimistic } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { readSchema } from '@/lib/properties/schema'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePondId } from '@/lib/pond/context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { BaseUIEvent } from '@base-ui/react/types'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { PageLinkProvider } from '@/lib/modules/page-link/context'
import { usePageLinkCapabilities } from '@/lib/modules/page-link/use-capabilities'
import { cn } from '@/lib/utils'
import type { Block } from '@/lib/documents/types'

/** A short, human label for a block in the undo toast ("Deleted text block"). */
function blockLabel(block: Block): string {
  return `Deleted ${block.type} block`
}

const TURNED_INTO: Record<Exclude<ConversionTarget, 'table'>, string> = {
  list: 'Turned into a list',
  checklist: 'Turned into a checklist',
  text: 'Turned into text',
}

const MENU_PLACEMENT: Record<PondMenuSize, Omit<PondMenuPlacement, 'anchor'>> = {
  desktop: { align: 'start', top: 40, alignOffset: -8 },
  mobile: { align: 'end', top: 48, alignOffset: 0 },
}

/** The page a `/` pick makes: a template's shape, or a person's own copied whole. */
type NewPage = InstantiatedTemplate & { props?: Record<string, unknown> }

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
  /** Move a block into a page of its own. Without it the block menu does not offer the move. */
  onMoveIntoNewPage?: (block: Block) => void
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
  onMoveIntoNewPage,
}: BlockCanvasProps) {
  const { stageDeletion, stageUndo, notify } = useDeletionUndo()
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()
  const pondId = usePondId()
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
  // The source picker (#280): which `/` pick summoned it, and the `/…` block its
  // view replaces. `Pond 02` 2e: table, gallery and chart all open the same picker.
  const [sourcePicker, setSourcePicker] = useState<{
    block: SourceBlock
    /** The `/…` block the view replaces. */
    hostId: string
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
    queryKey: pagesKey(pondId),
    queryFn: () => fetchPages(pondId),
    enabled: sourcePicker !== null,
  })
  const { data: recordCounts } = useQuery({
    queryKey: ['record-counts', pondId],
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? fetchRecordCounts(supabase, user.id) : new Map<string, number>()
    },
    enabled: sourcePicker !== null,
    staleTime: 0,
  })
  const databases = useMemo(
    () => sourceDatabases(pageRows, recordCounts ?? new Map()),
    [pageRows, recordCounts]
  )

  // The person's own templates, read only while a `/` menu is open — the pane's
  // `yours` group. Refetched on each open, so one saved a moment ago is there.
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', pondId],
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? listTemplates(supabase, user.id, pondId) : []
    },
    enabled: slashMenuOpenAt !== null,
    staleTime: 0,
  })
  const yourTemplates = useMemo<YourTemplate[]>(
    () => templates.filter((t) => t.origin === 'yours').map((t) => ({ id: t.id, name: t.name })),
    [templates]
  )
  const slashSize: PickerSize = useBelowMd() ? 'mobile' : 'desktop'
  // A page with nothing on it yet opens the menu on its templates (6f).
  const isBlankBesides = (index: number) =>
    blocks.every((b, bi) => bi === index || (b.type === 'text' && b.content.trim() === ''))

  // Which block index has the block menu open (null = closed).
  const [menuOpenAt, setMenuOpenAt] = useState<number | null>(null)
  useBlockLinkArrival(blocks)

  // Mark a freshly-inserted block on the PARENT-owned insertedIds Set (see the
  // prop doc): BlockCanvas doesn't own it, it just records into it.
  function markInserted(id: string) {
    insertedIds?.add(id)
  }

  /**
   * The block menu's "turn into › table" on a list. A table is always a view of
   * a database, so this CREATES a real database from the list's rows (filed
   * under the databases root) and swaps the list for a table-mode view of it in
   * place. It is the person's own gesture, so it applies at once through the
   * caller's ordinary save — no proposal card; only Pond's changes arrive as
   * diffs — with an undo that puts the list back and removes the database it
   * made. The page is left untouched when the write fails.
   */
  const turnIntoTable = async (index: number, conversion: TableConversion) => {
    const block = blocks[index]
    if (!block) return
    const title = inferListDatabaseTitle(blocks, index, pageTitle)
    try {
      const made = await conversion.apply(getSupabase(), { title, pondId }, () =>
        crypto.randomUUID()
      )
      markInserted(made.view.id)
      onChange(replaceBlockWithView(blocksRef.current, block.id, made.view))
      // The rail lists the new database (and, on first use, the databases root).
      queryClient.invalidateQueries({ queryKey: pagesKey() })
      stageUndo({
        message: 'Turned into a table',
        scope: 'block',
        undo: async () => {
          onChange(blocksRef.current.map((b) => (b.id === made.view.id ? block : b)))
          try {
            // Removes its records too (parent_id cascade).
            await deletePage(getSupabase(), made.databaseId)
          } catch (err) {
            console.error('Failed to remove the database after undo', err)
          }
          queryClient.invalidateQueries({ queryKey: pagesKey() })
        },
      })
    } catch (err) {
      console.error('Failed to turn the list into a table', err)
      notify("Couldn't turn the list into a table")
    }
  }

  /**
   * list ⇄ checklist ⇄ text: the same block, drawn another way. It keeps its id,
   * so it swaps in place by id, and the undo swaps the original back against the
   * LATEST blocks, so an edit made in between elsewhere on the page survives.
   */
  const convertBlock = (before: Block, conversion: LineConversion) => {
    const after = conversion.apply()
    onChange(blocks.map((b) => (b.id === before.id ? after : b)))
    stageUndo({
      message: TURNED_INTO[conversion.target],
      scope: 'block',
      undo: () => onChange(blocksRef.current.map((b) => (b.id === before.id ? before : b))),
    })
  }

  /** The page's own URL, anchored at the block — arriving there lands on it. */
  const copyBlockLink = async (blockId: string) => {
    try {
      await navigator.clipboard.writeText(blockLinkUrl(window.location.href, blockId))
      notify('Copied the link to this block')
    } catch (err) {
      console.error('Failed to copy the link to the block', err)
      notify("Couldn't copy the link")
    }
  }

  const handleMenuOpenChange = (index: number, open: boolean) =>
    setMenuOpenAt((current) => {
      if (open) return index
      return current === index ? null : current
    })

  const handleMenuSelect = (index: number, action: BlockMenuAction) => {
    setMenuOpenAt(null)
    const block = blocks[index]
    if (!block) return
    runBlockMenuAction(action, {
      'turn-into': ({ conversion }) => {
        if (conversion.target === 'table') {
          void turnIntoTable(index, conversion)
          return
        }
        convertBlock(block, conversion)
      },
      'move-into-new-page': () => onMoveIntoNewPage?.(block),
      'copy-link': () => void copyBlockLink(block.id),
      delete: () => removeBlockAt(index),
    })
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

  /**
   * Backspace in an empty text block removes it. When the block above is not
   * text, focus goes back to it, so Return then Backspace leaves the person where
   * they started.
   */
  function removeEmptyLineAt(index: number) {
    const above = blocks[index - 1]
    removeBlockAt(index)
    if (!above || above.type === 'text') return
    document.getElementById(blockDomId(above.id))?.focus()
  }

  // Return on a focused block opens an empty text block after it; its editor
  // opens with the caret in it, ready for `/`.
  function insertLineAfter(index: number) {
    const nb = emptyBlockForType('text')
    if (!nb) return
    markInserted(nb.id)
    onChange([...blocks.slice(0, index + 1), nb, ...blocks.slice(index + 1)])
  }

  /**
   * `/table`, `/gallery`, `/chart` open the source picker rather than minting a
   * block (#280; PROJECT_RULES: "a table is always a view of a database"). The
   * glass hangs off the block the `/` was typed in (`anchorId`). AUDIT C9,
   * decided: a chart auto-wires "when one table is nearby" — the nearest linked
   * view on the page becomes its source and the picker opens on the chart types;
   * otherwise it opens on the sources.
   */
  function openSourcePicker(block: SourceBlock, hostId: string, at: number, anchorId: string) {
    const anchor = document.getElementById(blockDomId(anchorId)) ?? canvasRef.current
    setSourcePicker({ block, hostId, at, anchor })
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
   * Put the picked view block where the `/` was. Keyed on the HOST BLOCK'S ID,
   * not the index the picker opened at: making a database is an await, and a
   * block inserted or removed meanwhile would move that index under us. A `/…`
   * block that went away while the glass was open gets the view appended rather
   * than dropped; the undo takes it back.
   */
  function placeView(view: ViewBlock, hostId: string) {
    markInserted(view.id)
    const current = blocksRef.current
    const at = current.findIndex((b) => b.id === hostId)
    onChange(at === -1 ? [...current, view] : current.map((b, i) => (i === at ? view : b)))
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
      placeView(view, open.hostId)
      return
    }
    const replaced = blocksRef.current.find((b) => b.id === open.hostId)
    try {
      const made = await createDatabase(
        getSupabase(),
        {
          title: pick.title,
          schema: pick.fields.map((f) => ({ id: crypto.randomUUID(), name: f.name, type: f.type })),
          mode: pick.mode,
          chart,
          pondId,
        },
        () => crypto.randomUUID()
      )
      placeView(made.view, open.hostId)
      queryClient.invalidateQueries({ queryKey: pagesKey() })
      queryClient.invalidateQueries({ queryKey: ['record-counts', pondId] })
      stageUndo({
        message: 'Made a database',
        scope: 'block',
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
          queryClient.invalidateQueries({ queryKey: pagesKey() })
        },
      })
    } catch (err) {
      console.error('Failed to make the database', err)
      notify("Couldn't make the database")
    }
  }

  // The page a `/` pick makes, under this page or beside it, through the seams the
  // AI's create_page path uses (`instantiateTemplate`). A person's own template is
  // copied with its content and stamped once with where it came from. The `/…` block
  // that summoned the menu goes — by id, since the awaits below outlive any index.
  const makePage = async (
    source: NewPage | null,
    placement: 'sibling' | 'child',
    replaceId: string
  ) => {
    if (!source) return
    try {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const parentId =
        placement === 'child' ? pageId : ((await getPage(supabase, pageId))?.parentId ?? null)
      const created = await createPage(supabase, user.id, {
        parentId,
        type: 'page',
        title: source.title,
        blocks: source.blocks,
        ...(source.props ? { props: source.props } : {}),
        pondId,
      })
      if (source.schema) await defineSchema(supabase, created.id, source.schema)
      onChange(blocksRef.current.filter((b) => b.id !== replaceId))
      insertPageOptimistic(
        queryClient,
        {
          id: created.id,
          parentId,
          type: created.type,
          title: created.title,
        },
        pondId
      )
      void queryClient.invalidateQueries({ queryKey: pagesKey() })
      pageLinks.navigateToPage({ id: created.id, title: created.title, type: created.type })
    } catch (err) {
      console.error('Failed to make the page', err)
    }
  }

  const newPageFromPick = async (pick: TemplatePick): Promise<NewPage | null> => {
    if (pick.origin === 'premade') return instantiateTemplate(PREMADE_TEMPLATES[pick.kind])
    const template =
      templates.find((t) => t.id === pick.id) ?? (await getTemplate(getSupabase(), pick.id))
    if (!template) return null
    return {
      title: template.name,
      blocks: templateBlocksFrom(template.blocks, () => crypto.randomUUID(), { keepContent: true }),
      props: stampProvenance({}, template),
    }
  }

  const makePageFromTemplate = async (pick: TemplatePick, replaceId: string) =>
    makePage(await newPageFromPick(pick), 'child', replaceId)

  /**
   * Where a `/` pick lands: in place of the `/…` block, or — for a `/` line inside
   * a text block — in place of that line, split out of the block with the text
   * above and below kept as blocks of their own (the boards are silent on the
   * split; it is "Return after the table, then /" applied inside prose).
   */
  const slashTargetOf = (
    index: number,
    line: SlashLine | null
  ): { next: Block[]; host: Block } | null => {
    const block = blocks[index]
    if (!block) return null
    if (!line || block.type !== 'text') return { next: blocks, host: block }
    const split = splitAtSlashLine(block, line, () => crypto.randomUUID())
    return {
      next: [...blocks.slice(0, index), ...split.blocks, ...blocks.slice(index + 1)],
      host: split.host,
    }
  }

  /**
   * The `/` gesture (ticket-37, #278): the picked row's block takes the `/…`
   * block's place. A row is a preset — `list` is `todo` at the dot marker, `chart`
   * is `view` in chart mode — so the palette mints it, as one page change with
   * any split; a row with no factory is a no-op. The three source rows go through
   * the picker first (#280), and the page rows make a page and drop the `/…` block.
   */
  function handleSlashSelect(index: number, row: SlashRow, line: SlashLine | null) {
    setSlashMenuOpenAt(null)
    const target = slashTargetOf(index, line)
    if (!target) return
    const { next, host } = target
    const source = sourceBlockOf(row.id)
    const { placement } = row
    if (source || placement) {
      if (next !== blocks) onChange(next)
      if (source) openSourcePicker(source, host.id, next.indexOf(host), blocks[index].id)
      else if (placement)
        void makePage(instantiateTemplate(PREMADE_TEMPLATES.page), placement, host.id)
      return
    }
    const nb = mintPreset(row.id)
    if (!nb) return
    markInserted(nb.id)
    onChange(next.map((b) => (b.id === host.id ? nb : b)))
  }

  function handleSlashPickTemplate(index: number, pick: TemplatePick, line: SlashLine | null) {
    setSlashMenuOpenAt(null)
    const target = slashTargetOf(index, line)
    if (!target) return
    if (target.next !== blocks) onChange(target.next)
    void makePageFromTemplate(pick, target.host.id)
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
          {blocks.map((block, i) => (
            <BlockEditor
              key={block.id}
              block={block}
              pageId={pageId}
              settleOnMount={insertedIds?.has(block.id) ?? false}
              onChange={(next) => setBlockAt(i, next)}
              onRemoveEmpty={() => removeEmptyLineAt(i)}
              onReturn={() => insertLineAfter(i)}
              onMoveUp={() => moveBlockAt(i, 'up')}
              onMoveDown={() => moveBlockAt(i, 'down')}
              onSlashKey={() => setSlashMenuOpenAt(i)}
              slashMenuOpen={slashMenuOpenAt === i}
              slashPane={isBlankBesides(i) ? 'templates' : 'rows'}
              slashSize={slashSize}
              yourTemplates={yourTemplates}
              onSlashSelect={(row, line) => handleSlashSelect(i, row, line)}
              onSlashPickTemplate={(pick, line) => handleSlashPickTemplate(i, pick, line)}
              onSlashClose={() => setSlashMenuOpenAt(null)}
              menuOpen={menuOpenAt === i}
              // Only the OPEN block's groups are derived: this render runs on every
              // keystroke anywhere on the page.
              menuGroups={
                menuOpenAt === i
                  ? blockMenuGroups(block, { moveIntoNewPage: onMoveIntoNewPage !== undefined })
                  : undefined
              }
              menuSize={slashSize}
              onMenuOpenChange={(open) => handleMenuOpenChange(i, open)}
              onMenuSelect={(action) => handleMenuSelect(i, action)}
              isDragging={draggingIndex === i}
              onDragStart={() => {
                setMenuOpenAt(null)
                setDraggingIndex(i)
              }}
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
 * onChange below, so the slash never persists); so does `/` on an empty line
 * inside one, which the text editor reports through `SlashLineContext`. ⌥↑/⌥↓
 * reorders the focused block; the handle drags to reorder. `draggable` is armed
 * only while the pointer is down on the handle — an always-draggable block would
 * hijack text-selection drags.
 *
 * Return on the block itself — not on anything inside it — opens a line after a
 * block that is not text (6g). A text block's Return is its editor's.
 *
 * A press on the handle, or ⌘/ (Ctrl+/ off Apple) anywhere in the block, opens
 * the block menu (`PondMenu` kind `block`), and the block wears the open ring
 * while it is open. A drag from the handle closes the menu its press opened.
 */
function BlockEditor({
  block,
  pageId,
  settleOnMount = false,
  onChange,
  onRemoveEmpty,
  onReturn,
  onMoveUp,
  onMoveDown,
  onSlashKey,
  onSlashPickTemplate,
  slashMenuOpen,
  slashPane = 'rows',
  slashSize = 'desktop',
  yourTemplates,
  onSlashSelect,
  onSlashClose,
  menuOpen,
  menuGroups = [],
  menuSize = 'desktop',
  onMenuOpenChange,
  onMenuSelect,
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
  /** Backspace in an empty text block. */
  onRemoveEmpty: () => void
  /** Return on a focused block that is not text. */
  onReturn: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onSlashKey?: () => void
  slashMenuOpen?: boolean
  slashPane?: SlashPane
  slashSize?: PickerSize
  yourTemplates?: readonly YourTemplate[]
  /** `line` is the `/` line the menu opened on inside the block, if it did. */
  onSlashSelect?: (row: SlashRow, line: SlashLine | null) => void
  onSlashPickTemplate?: (pick: TemplatePick, line: SlashLine | null) => void
  onSlashClose?: () => void
  menuOpen?: boolean
  menuGroups?: PondMenuGroup<BlockMenuAction>[]
  menuSize?: PondMenuSize
  onMenuOpenChange?: (open: boolean) => void
  onMenuSelect?: (action: BlockMenuAction) => void
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  const [dragArmed, setDragArmed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [slashSide, setSlashSide] = useState<PickerSide>('bottom')
  // The `/` menu hangs off the caret, not the block (2c: "opens at the caret").
  const slashAnchor = useMemo<PickerAnchorBox>(
    () => ({
      getBoundingClientRect: () =>
        rootRef.current ? caretRect(rootRef.current) : document.body.getBoundingClientRect(),
    }),
    []
  )
  const frame = blockFrame(block)
  // The `/` line inside this text block the menu opened on. Kept after the menu
  // closes, so it is read only while the menu is open; every open sets it.
  const [slashLine, setSlashLine] = useState<SlashLine | null>(null)
  const openLine = slashMenuOpen ? slashLine : null
  // The `/` menu's query is what follows the slash in THIS text block (#278): the
  // board has no filter input — the person keeps typing on the page.
  const slashQuery =
    openLine?.query ?? (slashMenuOpen && block.type === 'text' ? block.content.slice(1) : '')
  const { state, onEmptyAction, emptyLine } = useBlockEmptyState(block, frame, pageId, onChange)

  const openSlashMenu = (line: SlashLine | null) => {
    setSlashLine(line)
    if (rootRef.current) {
      setSlashSide(
        sideTowardFreeSpace(
          caretRect(rootRef.current),
          window.innerHeight,
          slashMenuHeight(slashRows, slashSize, window.innerHeight)
        )
      )
    }
    onSlashKey?.()
  }

  // The editor reports the `/` line under the caret on every change: it opens
  // the menu when the `/` was just typed, narrows it as the query grows, and
  // closes it when the line stops being a `/` line.
  const handleSlashLine: SlashLineListener = (line, opened) => {
    if (opened && line) {
      openSlashMenu(line)
      return
    }
    if (!openLine) return
    setSlashLine(line)
    if (!line) onSlashClose?.()
  }

  const view = (
    <SlashLineContext.Provider value={handleSlashLine}>
      <ModuleView
        type={block.type}
        data={block}
        editable
        onChange={(next) => {
          const nextBlock = next as Block
          if (nextBlock.type === 'text' && block.type === 'text') {
            const was = block.content
            const now = nextBlock.content
            // `/` typed into an EMPTY text block opens the menu.
            // The slash STAYS as text — it is the query the person is typing, and
            // esc keeps it. Deleting it back out closes the menu.
            if (was === '' && now === '/') openSlashMenu(null)
            else if (slashMenuOpen && !openLine && !now.startsWith('/')) onSlashClose?.()
          }
          onChange(nextBlock)
        }}
      />
    </SlashLineContext.Provider>
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (isBlockMenuChord(e.nativeEvent)) {
      e.preventDefault()
      onMenuOpenChange?.(true)
      return
    }
    if (
      e.key === 'Enter' &&
      e.target === e.currentTarget &&
      block.type !== 'text' &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      e.preventDefault()
      onReturn()
      return
    }
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
    if (e.key === 'Backspace' && !slashMenuOpen && block.type === 'text' && block.content === '') {
      e.preventDefault()
      onRemoveEmpty()
    }
  }

  // ⌥↑/⌥↓ on the handle reorder the block: the menu's trigger would otherwise
  // take the arrow to open the menu and keep it from reaching the block.
  const handleTriggerKeyDown = (e: BaseUIEvent<React.KeyboardEvent<HTMLButtonElement>>) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) e.preventBaseUIHandler()
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'group relative outline-none',
        settleOnMount && 'motion-settle-in',
        isDragging && 'opacity-50',
        menuOpen && 'rounded-[20px] [box-shadow:0_0_0_2px_rgb(from_var(--mn-text)_r_g_b/0.18)]'
      )}
      id={blockDomId(block.id)}
      // Focusable so a copied link to the block can land on it, and a tab stop
      // when it is not text so Return can reach it; a text block's focus is its editor.
      tabIndex={block.type === 'text' ? -1 : 0}
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
      {/* The handle, as `PondBlock.dc.html` draws it (ADR 0011: the component DC
          over the storyboards' pasted copies) — the only block chrome (7e),
          revealed on hover and on keyboard focus. The six-dot mark (10×14, dots
          r 1.1) in a 12×24 box at left −14, top 12, radius 6, on the 68% ink
          tier; open, it is full ink on the 7% wash. Press-and-drag reorders, a
          click opens the block menu, which is where `delete` lives. */}
      <div
        data-part="handle"
        className={cn(
          'absolute -left-3.5 top-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          menuOpen && 'opacity-100'
        )}
      >
        <PondMenu
          kind="block"
          label="block menu"
          size={menuSize}
          groups={menuGroups}
          open={menuOpen ?? false}
          onOpenChange={onMenuOpenChange ?? (() => {})}
          onSelect={onMenuSelect ?? (() => {})}
          placement={{ anchor: rootRef, ...MENU_PLACEMENT[menuSize] }}
          trigger={
            <button
              type="button"
              className={cn(
                'flex h-6 w-3 cursor-grab items-center justify-center rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-mn-text',
                menuOpen ? 'bg-mn-hover-fill text-mn-text' : 'text-mn-text-secondary'
              )}
              title="Block menu · drag to reorder"
              aria-label="Block menu"
              onPointerDown={() => setDragArmed(true)}
              onPointerUp={() => setDragArmed(false)}
              onKeyDown={handleTriggerKeyDown}
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
          }
        />
      </div>

      {/* The `/` menu hangs at the caret. */}
      {slashMenuOpen && (
        <SlashMenu
          rows={slashRows}
          query={slashQuery}
          anchor={slashAnchor}
          side={slashSide}
          size={slashSize}
          onSelect={(row) => onSlashSelect?.(row, openLine)}
          onPickTemplate={onSlashPickTemplate && ((pick) => onSlashPickTemplate(pick, openLine))}
          yourTemplates={yourTemplates}
          // A `/` line has text around it, so the page is not blank.
          defaultPane={openLine ? 'rows' : slashPane}
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
      ) : block.type === 'text' ? (
        // Bare prose: `padding 2px 4px`, no card.
        <div className="px-1 py-0.5">{view}</div>
      ) : (
        // #227: a block that is its OWN card — the chart card — sits on the page as it is.
        view
      )}
    </div>
  )
}
