'use client'

/**
 * The shared block editor body — the full manual-authoring surface
 * extracted from DocumentPanel so EVERY editable page renders it identically: the
 * document editor, an area page with content, AND the Life home page.
 *
 * It renders a `SiblingBlocksProvider`-wrapped list of blocks with the `/` palette
 * on an empty text block or an empty line inside one, Return on a focused block
 * opening a line after it, drag/⌥↑/⌥↓ reorder, per-block delete with undo — and,
 * at the foot, an always-visible "+ Add a block". The handle is the only block chrome: nothing is drawn between
 * blocks.
 *
 * Persistence is the CALLER's concern: BlockCanvas is controlled (it takes
 * `blocks` and emits the full next array via `onChange`), so DocumentPanel keeps
 * its debounced whole-array save and the Life home surface keeps its own. This is
 * the same "blocks are never partially persisted" contract, just hoisted so two
 * surfaces share one editor.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { blockDomId, focusPageTitle, scrollToBlock } from '@/lib/modules/block-dom'
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
import type { PickerSize } from '@/components/molecules/picker-chrome'
import type { PickerAnchorBox, PickerSide } from '@/components/molecules/use-anchored-box'
import { SourcePicker, type SourcePick } from '@/components/molecules/SourcePicker'
import { sourcePickerHeight, type SourceBlock } from '@/components/molecules/source-entries'
import { caretRect, roomTowardSide, sideTowardFreeSpace } from '@/lib/layout/caret-anchor'
import { composerBottomBound } from '@/lib/layout/composer-clearance'
import {
  PondMenu,
  type PondMenuGroup,
  type PondMenuPlacement,
  type PondMenuSize,
} from '@/components/molecules/PondMenu'
import { AddBlockButton } from '@/components/molecules/AddBlockButton'
import { BlockWidthRow } from '@/components/molecules/BlockWidthRow'
import {
  BLOCK_ROW_GAP_PX,
  blockWidthStyle,
  classifyDropZone,
  layoutRows,
  planBesideDrop,
  rowHolds,
  type DropZone,
} from '@/lib/modules/layout-rows'
import { SlashLineContext, type SlashLineAt } from '@/lib/modules/text/slash-line'
import { useSlashLine } from '@/components/organisms/use-slash-line'
import { focusTextBlock, hasTextBeforeCaret } from '@/lib/modules/text/focus'
import { UNTOUCHED_HINT_CLASS } from '@/lib/modules/text/prose'
import {
  landAtSlash,
  undoLanding,
  useSlashPick,
  type Landing,
  type SlashTarget,
} from '@/components/organisms/use-slash-pick'
import {
  blockMenuGroups,
  runBlockMenuAction,
  type BlockMenuAction,
} from '@/components/organisms/block-menu'
import type { ConversionTarget, LineConversion, TableConversion } from '@/lib/modules/conversions'
import { isBlockMenuChord, isDeleteBlockChord } from '@/lib/shell-commands'
import { slashRows, emptyBlockForType } from '@/lib/modules/palette'
import { descriptorFor } from '@/lib/modules/registry'
import { useBelowMd } from '@/lib/layout/use-below-md'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { formatThreadTime } from '@/lib/conversation/page-proposals'
import { TEXT_BLOCK_INSET_PX } from '@/lib/layout/surface-column'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { instantiateTemplate, type InstantiatedTemplate } from '@/lib/templates/instantiate'
import { getTemplate, listTemplates } from '@/lib/templates/client'
import { templateBlocksFrom } from '@/lib/templates/from-page'
import { stampProvenance, siblingTemplateRanking } from '@/lib/templates/provenance'
import { applyTemplate, type TemplateApplyPick } from '@/lib/templates/apply'
import { justSaved } from '@/lib/templates/just-saved'
import { templateOutlineRows } from '@/lib/templates/preview'
import { TemplatePreviewOutline } from '@/components/molecules/TemplatePreviewOutline'
import { inferListDatabaseTitle } from '@/lib/pages/list-to-table'
import { replaceBlockWithView } from '@/lib/pages/promote-table'
import {
  createPage,
  defineSchema,
  deletePage,
  getPage,
  saveBlocks,
  saveProps,
  type PondPage,
} from '@/lib/pages/client'
import { createDatabase } from '@/lib/pages/create-database'
import { fetchRecordCounts, sourceDatabases } from '@/lib/pages/source-databases'
import { insertPageOptimistic } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { usePagesRows } from '@/lib/pages/use-pages'
import { flushPendingPageSave } from '@/lib/pages/page-flush'
import { appendOwnEdit } from '@/lib/change-log/store'
import { changeLogKey } from '@/lib/change-log/keys'
import { sessionUndo } from '@/lib/change-log/session-undo'
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
import type { BlockWidth } from '@/lib/modules/content'

/** What a block is called to assistive tech: its heading, else its kind. */
const blockName = (block: Block, frame: BlockFrame | null): string =>
  frame?.heading ?? descriptorFor(block.type)?.label ?? block.type

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

/**
 * The block list is the one flex container — gutted from a per-row wrapper div
 * plus per-block sizing div: a flat sizing div per block, keyed `block.id`, with
 * `flexWrap` so a 100%-wide sizing div (a stacked block) takes its own line,
 * which IS the stack. No row-level element exists to carry a regrouping key, so
 * a block changing rows can never remount — structurally impossible, not merely
 * untested. A host's `listStyle` (zen's 22px) only overrides `rowGap`; `display`,
 * `flexWrap` and `flexDirection` are reasserted here so a host passing
 * `flexDirection:'column'` (zen's own shape) can't turn off wrapping.
 */
function canvasListStyle(listStyle: CSSProperties | undefined): CSSProperties {
  return {
    ...listStyle,
    display: 'flex',
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: BLOCK_ROW_GAP_PX,
    rowGap: listStyle?.rowGap ?? BLOCK_ROW_GAP_PX,
  }
}

/**
 * The same list, but visually gone while a template previews over it.
 * `display:none`/`visibility:hidden` both blur a focused descendant the
 * instant they apply — the person is typing `/query` into the host block right
 * up to the moment it previews, and arrow/esc/typing afterward must keep
 * reaching it (round 3 live finding 1) — so neither is used. `opacity:0` hides
 * it without touching focusability; `height:0`/`overflow:hidden` collapse it
 * out of the flow (it sits absolutely so it never widens the preview row);
 * `pointerEvents:'none'` keeps a stray click from landing on it.
 */
function hiddenCanvasListStyle(listStyle: CSSProperties | undefined): CSSProperties {
  return {
    ...canvasListStyle(listStyle),
    position: 'absolute',
    opacity: 0,
    height: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  }
}

/**
 * The drop line's geometry, off `PondBlock.dc.html`'s `dropBar` (6x): beside
 * sits 9px into the 16px gap off the block's own near edge, full height; an
 * own-line drop sits 9px off the top/bottom edge, spanning `span` — the full
 * content column, not just this block's width — when the caller supplied one.
 */
function dropBarGeometry(dropZone: {
  zone: DropZone
  span?: { left: number; width: number }
}): CSSProperties {
  switch (dropZone.zone) {
    case 'left':
      return { left: -9, top: 0, bottom: 0, width: 2 }
    case 'right':
      return { right: -9, top: 0, bottom: 0, width: 2 }
    case 'above':
      return { top: -9, height: 2, left: dropZone.span?.left ?? 0, width: dropZone.span?.width }
    case 'below':
      return { bottom: -9, height: 2, left: dropZone.span?.left ?? 0, width: dropZone.span?.width }
  }
}

/**
 * Focus the neighbour of a removed block — the one before, else the one
 * after — the same way across every delete path. With no neighbour left (the
 * page's only block was removed), focus falls to the page title.
 *
 * Deferred a tick: a handle-menu delete removes the trigger along with its
 * block, and the open menu's own close-focus (Base UI, back to the trigger)
 * only runs after this event handler returns, via a microtask — so a
 * same-tick `.focus()` here would be the one it then overrides. A macrotask
 * runs after any microtask, settling this one last.
 */
function focusBlockNeighbour(blocks: Block[], index: number) {
  const neighbour = blocks[index - 1] ?? blocks[index + 1]
  setTimeout(() => {
    if (!neighbour) {
      focusPageTitle()
      return
    }
    const element = document.getElementById(blockDomId(neighbour.id))
    if (neighbour.type === 'text' && focusTextBlock(element, index === 0 ? 'start' : 'end')) return
    if (element instanceof HTMLElement) element.focus()
  }, 0)
}

/**
 * Belt and braces for a preview's end (round 3 live finding 1): with the
 * block list never `display:none` any more, the host editor should simply
 * never have lost focus — but if something else already did (the
 * caret-chasing above, a browser quirk), this puts it back at the end of its
 * `/query` text rather than leaving the person to click in again. A no-op
 * whenever focus is already somewhere real.
 */
function restoreHostFocus(blocks: Block[], hostIndex: number | null) {
  if (hostIndex === null) return
  if (document.activeElement && document.activeElement !== document.body) return
  const host = blocks[hostIndex]
  if (!host) return
  const element = document.getElementById(blockDomId(host.id))
  if (host.type === 'text') focusTextBlock(element, 'end')
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
   * A write that already persisted directly (KAN-124's template apply: its own
   * `saveBlocks` + `appendOwnEdit`, bypassing the debounced save). Call this
   * BEFORE `onChange` so the caller's save baseline already matches what was
   * just written — otherwise the save `onChange` triggers next fires with a
   * stale `before` and double-logs the same change. Optional: a caller with no
   * debounce to protect (the blank-page test harness) can leave it unset.
   */
  onBlocksPersisted?: (next: Block[]) => void
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
  /** False hides the editing chrome — every block's handle and the foot add — mounted (zen: the page and nothing else). */
  chrome?: boolean
  /**
   * The page is untouched (6f): no title, one empty text block. Hides the foot
   * "+ Add a block" on top of the `chrome` check — the blank body draws no
   * add-block affordance, only its one hint line.
   */
  untouched?: boolean
  /**
   * The new-page menu's "from a template" row (KAN-198): a page id carried
   * one-shot through navigation (`?templates=1`, read by the caller). When it
   * matches `pageId`, the `/` menu opens on block 0 once, leading with
   * templates exactly as it does for any blank page — never re-fires for the
   * same id, so a later re-render with the same prop value is a no-op.
   */
  openTemplatesFor?: string | null
  /** The block list's own layout, where a host spaces blocks its way. */
  listStyle?: CSSProperties
  /**
   * The previewed template's name (6f frame 3) — the premade kind label or a
   * `yours` template's own name — so the host's title-row eyebrow can read
   * `preview — {name}` in place of its own. Called with `null` once the
   * preview clears (esc, apply, or a deleted-mid-preview no-op). Transient,
   * like `previewing` itself — never read back from here.
   */
  onPreviewNameChange?: (name: string | null) => void
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
  onBlocksPersisted,
  onUndoRemove,
  insertedIds,
  onMoveIntoNewPage,
  chrome = true,
  untouched = false,
  openTemplatesFor = null,
  listStyle,
  onPreviewNameChange,
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
  // G9: guards `applyTemplateInPlace` itself against a double ↵ — a ref, not
  // state, since the second pick can land mid-await, before a state update
  // guarding on a render would have committed.
  const applyInFlightRef = useRef(false)
  // F27: link capabilities for card→page links, parented at THIS page. Provided to
  // every module view below via context — modules that don't link (all but kanban
  // today) simply never read it.
  const pageLinks = usePageLinkCapabilities(pageId)

  const {
    slashMenuOpenAt,
    openSlashMenuAt,
    closeSlashMenu,
    handleSlashSelect,
    handleSlashPickTemplate,
  } = useSlashPick({
    blocks,
    onChange,
    markInserted,
    openSourcePicker,
    makePageFromRow: (placement, target) =>
      void makePage(instantiateTemplate(PREMADE_TEMPLATES.page), placement, target),
    makePageFromTemplate: (pick, target, index) => void makePageFromTemplate(pick, target, index),
  })
  // KAN-198: the carried `?templates=1` names a page by id, not a boolean, so
  // the ref guard below survives the caller leaving the prop set after the
  // param is stripped — a later page that never asked for this never matches.
  const openedTemplatesForRef = useRef<string | null>(null)
  useEffect(() => {
    if (openTemplatesFor !== pageId) return
    if (openedTemplatesForRef.current === pageId) return
    openedTemplatesForRef.current = pageId
    openSlashMenuAt(0)
  }, [openTemplatesFor, pageId, openSlashMenuAt])
  // Which block index is mid-drag (null = no drag).
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  // The drop line hovered during a drag: which block it's over, which edge
  // (classifyDropZone), and — for an own-line (above/below) drop only — the
  // span to stretch it across the FULL content column rather than just this
  // one block's own width (6x: `PondBlock.dc.html`'s `dropSpan`), measured
  // relative to the hovered block's own rect so it renders with no DOM
  // ancestor but that block's root.
  const [dropIndicator, setDropIndicator] = useState<{
    index: number
    zone: DropZone
    span?: { left: number; width: number }
  } | null>(null)
  // The source picker: which `/` pick summoned it, and where its view
  // lands. Table, gallery and chart all open the same picker.
  const [sourcePicker, setSourcePicker] = useState<{
    block: SourceBlock
    target: SlashTarget
    /** Where to look for a nearby source (AUDIT C9) — a position, read once at open. */
    at: number
    anchor: Element | null
    /** Toward the composer's free space (KAN-100) — read once at open, same as `/`'s own. */
    side: PickerSide
    maxHeight: number
  } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  // While previewing, `canvasRef` collapses to zero height (6f frame 3's
  // outline swap, `hiddenCanvasListStyle` above) rather than going
  // `display:none` — so its own rect, and every block's inside it, is a real
  // but useless sliver. The glass needs a VISIBLE stand-in to anchor off
  // instead: this slot, rendered beside the outline at the board's own
  // 250px/gap-16 position.
  const previewAnchorRef = useRef<HTMLDivElement>(null)
  // An empty, invisible node to hand the browser as the drag image (below) —
  // without it, the browser draws its own full-width snapshot of the dragged
  // row, which would compete with the lifted copy this surface draws itself.
  // Appended to the body (not this tree) so it has a layout box even while
  // `canvasRef` is collapsed (previewing, above).
  const dragImageRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = document.createElement('div')
    el.style.width = '1px'
    el.style.height = '1px'
    el.style.opacity = '0'
    document.body.appendChild(el)
    dragImageRef.current = el
    return () => {
      el.remove()
      dragImageRef.current = null
    }
  }, [])
  // A page with nothing on it yet opens the menu on its templates (6f). Read
  // here (not just below, where it's used again) because the pages query's
  // `enabled` needs it: a non-blank `/` has no sibling ranking to look up, so
  // it must not fetch `pageRows` at all.
  const isBlankBesides = (index: number) =>
    blocks.every((b, bi) => bi === index || (b.type === 'text' && b.content.trim() === ''))
  const blankMenuOpen = slashMenuOpenAt !== null && isBlankBesides(slashMenuOpenAt)
  // The shared ['pages'] cache: the source picker's databases root AND (KAN-138)
  // the blank list's parent/sibling lookup, so it's read while either is open —
  // the ranking query below needs this one's data `isSuccess` first, or a `/`
  // opened before pageRows has ever loaded would rank off a `null` parentId
  // (the pond's ROOT pages) and flash the wrong order once pageRows lands.
  const { data: pageRows, isSuccess: pageRowsLoaded } = usePagesRows(pondId, {
    enabled: sourcePicker !== null || blankMenuOpen,
  })
  const { data: recordCounts } = useQuery({
    queryKey: ['record-counts', pondId],
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? fetchRecordCounts(supabase, user.id, pondId) : new Map<string, number>()
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

  // KAN-138: this page's parent and its title, off the same `pageRows` read
  // above — `null` when this page has no parent at all (distinct from a real,
  // title-less parent, which falls back to `Untitled` below).
  const parentId = pageRows.find((r) => r.id === pageId)?.parent_id ?? null
  const parentTitle = useMemo(() => {
    if (parentId === null) return null
    return pageRows.find((r) => r.id === parentId)?.title.trim() || 'Untitled'
  }, [pageRows, parentId])

  // The parent's other children's template use (KAN-138), read only while the
  // blank list is open AND `pageRows` has resolved at least once — before
  // that, `parentId` falls back to `null`, which would rank the pond's ROOT
  // pages' template use, not this page's actual siblings.
  const { data: siblingRanking = [] } = useQuery({
    queryKey: ['sibling-template-ranking', pondId, parentId],
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? siblingTemplateRanking(supabase, user.id, pondId, parentId) : []
    },
    enabled: blankMenuOpen && pageRowsLoaded,
    staleTime: 0,
  })

  // Which block index has the block menu open (null = closed).
  const [menuOpenAt, setMenuOpenAt] = useState<number | null>(null)
  useBlockLinkArrival(blocks)

  // The width row's preview (6x): page-local, transient widths that never
  // write to `blocks`. The width row sets one entry (whichever block's menu
  // is open); a beside drag-over sets one entry per block `planBesideDrop`
  // changes, so a target row already shows the width it will take before the
  // drop lands, not just the dragged block's own. Cleared at every site that
  // moves `menuOpenAt` (Esc and any other menu-close path all route through
  // `onOpenChange` to `handleMenuOpenChange` below) and at every drag exit, so
  // a stale preview can never survive the menu or drag it came from.
  const [previewWidth, setPreviewWidth] = useState<
    { blockId: string; width: BlockWidth }[] | null
  >(null)

  // 6f frame 3: the template under preview, as flat outlines over the blank
  // page — transient, never in `blocks`, the store or the change log.
  const [previewing, setPreviewing] = useState<{ pick: TemplatePick; blocks: Block[] } | null>(null)

  // Bumped on every preview start and every cancel/apply — guards
  // `handlePreviewTemplate`'s `await applyPickFor` against a stale resolution
  // (esc/↓/↵, or a second `→`, landing first) setting state for a pick the
  // person already left. `handlePreviewTemplate` only commits its result if
  // the token it captured is still current.
  const previewTokenRef = useRef(0)

  // The slash menu's own close (esc, a press outside) drops the preview
  // instead of the whole menu while one is up — the menu's place
  // (`slashMenuOpenAt`) is left alone, so it reopens on `templates` once the
  // outline clears and the block editor (and its menu) come back.
  // The clear a preview alone needs — never the whole menu. Passed to
  // `SlashMenu` as `onPreviewCancel`, which fires on every ↑↓← (6f frame 3:
  // "moving onto a template"), so it must do nothing when there is none up.
  const handlePreviewCancel = useCallback(() => {
    previewTokenRef.current++
    if (previewing) {
      setPreviewing(null)
      onPreviewNameChange?.(null)
      setTimeout(() => restoreHostFocus(blocks, slashMenuOpenAt), 0)
    }
  }, [previewing, onPreviewNameChange, blocks, slashMenuOpenAt])

  const handleSlashClose = useCallback(() => {
    previewTokenRef.current++
    if (previewing) {
      setPreviewing(null)
      onPreviewNameChange?.(null)
      setTimeout(() => restoreHostFocus(blocks, slashMenuOpenAt), 0)
      return
    }
    closeSlashMenu()
  }, [previewing, closeSlashMenu, onPreviewNameChange, blocks, slashMenuOpenAt])

  // `DocumentPanel` stays mounted across ?nodeId changes and `BlockCanvas` is
  // never keyed by page, so a preview left running mid-navigation would
  // otherwise carry its outline onto the next page. Adjusted during render
  // (React's own pattern for resetting state on a prop change, not an effect
  // — this is a plain comparison and a setState call, never a ref read/write,
  // so it stays clear of `react-hooks/refs`), so it commits in the SAME
  // render as the new `pageId` rather than flashing the stale preview for one
  // extra paint. This resets only BlockCanvas's OWN state — calling
  // `onPreviewNameChange` (DocumentPanel's `setPreviewName`) from here would
  // be a parent setState during a different component's render (React:
  // "Cannot update a component while rendering a different component").
  // `DocumentPanel` clears `previewName` itself, the same way, on its own
  // `nodeId` change.
  const [previousPageId, setPreviousPageId] = useState(pageId)
  if (pageId !== previousPageId) {
    setPreviousPageId(pageId)
    if (previewing) {
      setPreviewing(null)
    }
  }

  // The token itself is a ref (read inside an already-in-flight async
  // closure, per its own doc above), so it is bumped from a layout effect
  // instead of the render-phase check above — refs may not be touched during
  // render. A layout effect (not a passive one) so the bump lands before any
  // paint, closing the same race a passive effect would leave open for one
  // frame.
  useLayoutEffect(() => {
    previewTokenRef.current++
  }, [pageId])

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

  /**
   * The width row's keep (6x): the same in-place-swap-by-id route as
   * `convertBlock`, so the undo toast restores the block's previous width
   * (absent means `full`). Pond binds no ⌘Z anywhere — inside a focused text
   * block that key reaches the editor instead — so the toast is the undo the
   * board's "click to keep, with undo" has here.
   */
  const setBlockWidth = (before: Block, width: BlockWidth) => {
    const after = { ...before, width } as Block
    onChange(blocks.map((b) => (b.id === before.id ? after : b)))
    stageUndo({
      message: 'Set the block width',
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

  const handleMenuOpenChange = (index: number, open: boolean) => {
    setPreviewWidth(null)
    setMenuOpenAt((current) => {
      if (open) return index
      return current === index ? null : current
    })
  }

  const handleMenuSelect = (index: number, action: BlockMenuAction) => {
    setMenuOpenAt(null)
    setPreviewWidth(null)
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
      'set-width': ({ width }) => setBlockWidth(block, width),
    })
  }

  function setBlockAt(index: number, next: Block) {
    onChange(blocks.map((b, i) => (i === index ? next : b)))
  }

  function removeBlockAt(index: number) {
    const removed = blocks[index]
    if (!removed) return
    onChange(blocks.filter((_, i) => i !== index))
    focusBlockNeighbour(blocks, index)
    stageDeletion({
      message: `Deleted ${removed.type} block`,
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
   * Backspace in an empty text block takes the line away and leaves focus on the
   * block before it, at the end of its text — or on the block after it when it
   * was the first. An unlabelled empty line holds nothing to undo, so removing it
   * is not a deletion; the page's only block stays.
   */
  function removeEmptyLineAt(index: number) {
    const line = blocks[index]
    const neighbour = blocks[index - 1] ?? blocks[index + 1]
    if (!line || !neighbour) return
    if (line.type === 'text' && !line.label) {
      onChange(blocks.filter((_, i) => i !== index))
      focusBlockNeighbour(blocks, index)
    } else {
      removeBlockAt(index)
    }
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
   * A view kind's `/` row (`SOURCE_BLOCKS`) opens the source picker rather than
   * minting a block (PROJECT_RULES: "a table is always a view of a database"). The
   * glass hangs off the `/` line, or the block it was typed in. AUDIT C9,
   * decided: a chart auto-wires "when one table is nearby" — the nearest linked
   * view on the page becomes its source and the picker opens on the chart types;
   * otherwise it opens on the sources.
   */
  function openSourcePicker(
    block: SourceBlock,
    target: SlashTarget,
    at: number,
    line: Element | null
  ) {
    const anchor = line ?? document.getElementById(blockDomId(target.hostId)) ?? canvasRef.current
    const caret = anchor ? caretRect(anchor) : { top: 0, bottom: 0 }
    const bound = composerBottomBound(window.innerHeight)
    const side = sideTowardFreeSpace(caret, bound, sourcePickerHeight(databases, window.innerHeight))
    const maxHeight = Math.max(0, roomTowardSide(caret, bound, side))
    setSourcePicker({ block, target, at, anchor, side, maxHeight })
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
   * Put the picked view block where the `/` was, read against the blocks as they
   * are now: making a database is an await, and the page can change under it. A
   * `/…` block that went away while the glass was open gets the view appended
   * rather than dropped. Returns what the undo needs to put the `/` back.
   */
  function placeView(view: ViewBlock, target: SlashTarget): Landing {
    const current = blocksRef.current
    const appended = { next: [...current, view], landed: view, split: null, slash: null }
    const landing = landAtSlash(current, target, view) ?? appended
    if (landing.landed) markInserted(landing.landed.id)
    onChange(landing.next)
    return landing
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
      placeView(view, open.target)
      return
    }
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
      const landing = placeView(made.view, open.target)
      queryClient.invalidateQueries({ queryKey: pagesKey() })
      queryClient.invalidateQueries({ queryKey: ['record-counts', pondId] })
      stageUndo({
        message: 'Made a database',
        scope: 'block',
        undo: async () => {
          onChange(undoLanding(blocksRef.current, landing))
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
  // copied with its content and stamped once with where it came from. Once the page
  // exists, the `/` that summoned the menu goes — read against the blocks as they
  // are then, since the awaits below outlive any snapshot. A failure leaves it.
  // Returns whether the page actually got made — KAN-138's nested-page apply
  // path needs this to know its write landed before retiring "just saved".
  const makePage = async (
    source: NewPage | null,
    placement: 'sibling' | 'child',
    target: SlashTarget
  ): Promise<boolean> => {
    if (!source) return false
    try {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return false
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
      const landing = landAtSlash(blocksRef.current, target, null)
      if (landing) onChange(landing.next)
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
      return true
    } catch (err) {
      console.error('Failed to make the page', err)
      return false
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

  const applyPickFor = async (pick: TemplatePick): Promise<TemplateApplyPick | null> => {
    if (pick.origin === 'premade') return { origin: 'premade', kind: pick.kind }
    const template =
      templates.find((t) => t.id === pick.id) ?? (await getTemplate(getSupabase(), pick.id))
    return template ? { origin: 'yours', template } : null
  }

  // 6f frame 3: resolves through the SAME builder `applyTemplateInPlace` uses
  // (`applyPickFor` + `applyTemplate`) — no second instantiation path — and
  // only sets state, so the preview writes nothing. A pick that no longer
  // resolves (deleted mid-preview, AUDIT G2) leaves whatever was already
  // previewed as it was.
  const handlePreviewTemplate = async (pick: TemplatePick) => {
    const token = ++previewTokenRef.current
    const applyPick = await applyPickFor(pick)
    // The person moved on (esc/↓/↵) or started a newer preview before this
    // resolved — drop it rather than setting state for a pick nobody is on.
    if (!applyPick || previewTokenRef.current !== token) return
    setPreviewing({ pick, blocks: applyTemplate(applyPick).blocks })
    onPreviewNameChange?.(applyPick.origin === 'premade' ? applyPick.kind : applyPick.template.name)
  }

  // 6f: a blank page's own templates pick lands IN PLACE — this page's blocks
  // become the instantiated stack, no nested page, no navigate.
  //
  // Apply is one undo step (KAN-93): the blocks write is logged directly as a
  // single own-edit record and remembered with `sessionUndo`, the same way
  // Rail's glyph/colour picks are — NOT the ordinary debounced save, which
  // would log its own second record for the same change. The `['page', id]`
  // cache carries the new blocks first, so `use-page-draft.ts`'s same-page
  // "adopt" branch folds them into the open draft's own baseline (while it is
  // still `saved`, before `onChange` below schedules anything) — by the time
  // that debounced save fires, its before/after are both these blocks, so it
  // logs nothing.
  const applyTemplateInPlace = async (pick: TemplatePick, target: SlashTarget) => {
    // G9: a second ↵ before this one finishes must not re-run the write — guard
    // the function itself (not menu-close timing, which races the same awaits).
    if (applyInFlightRef.current) return
    applyInFlightRef.current = true
    try {
      await applyTemplateInPlaceUnguarded(pick, target)
    } finally {
      applyInFlightRef.current = false
    }
  }

  /**
   * Writes `after` directly — bypassing the debounced save — and logs it as
   * one own-edit record, remembered with `sessionUndo`, so the write is ONE
   * ⌘Z-undoable change (KAN-93's template-apply pattern, shared here with
   * drag-drop's commits, KAN-247, so neither grows a second write path). The
   * `['page', pageId]` cache carries `after` optimistically first, so
   * `use-page-draft.ts`'s same-page "adopt" branch folds it into the open
   * draft's baseline before the caller's own debounced save can schedule
   * anything against stale blocks. Rolls the cache back to `before` and
   * returns `false` only if `saveBlocks` itself fails; a failed `appendOwnEdit`
   * does not roll back — the write already landed, only its own-edit log
   * didn't, same as `applyTemplateInPlaceUnguarded` always treated it.
   */
  const persistBlocksAsOwnEdit = async (before: Block[], after: Block[]): Promise<boolean> => {
    await flushPendingPageSave(pageId)
    const supabase = getSupabase()
    queryClient.setQueryData<PondPage | null>(['page', pageId], (prev) =>
      prev ? { ...prev, blocks: after } : prev
    )
    try {
      await saveBlocks(supabase, pageId, after)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        try {
          const record = await appendOwnEdit(supabase, {
            userId: user.id,
            pondId,
            action: 'edit',
            targetPageId: pageId,
            before,
            after,
          })
          if (pondId) sessionUndo.remember({ pondId, recordIds: [record.id] })
          await queryClient.invalidateQueries({ queryKey: changeLogKey() })
        } catch (err) {
          console.error('[change-log] edit not logged', pageId, err)
        }
      }
    } catch (err) {
      console.error('Failed to save the blocks', pageId, err)
      queryClient.setQueryData<PondPage | null>(['page', pageId], (prev) =>
        prev ? { ...prev, blocks: before } : prev
      )
      return false
    }
    // Before `onChange`: the caller's own debounced save (if any) must see this
    // write as its baseline, or it fires again with a stale `before` and logs a
    // second own-edit record for the same write.
    onBlocksPersisted?.(after)
    onChange(after)
    return true
  }

  const applyTemplateInPlaceUnguarded = async (pick: TemplatePick, target: SlashTarget) => {
    previewTokenRef.current++
    const applyPick = await applyPickFor(pick)
    // Clear whether this resolves (a normal apply) or not (AUDIT G2: the
    // template was deleted mid-preview) — the outline must never survive its
    // own apply, applied or not.
    setPreviewing(null)
    onPreviewNameChange?.(null)
    if (!applyPick) return
    const applied = applyTemplate(applyPick)
    // `before` is the page as it read before the `/` was typed — not
    // `blocksRef.current`, which still holds it. `landAtSlash(…, null)` isn't
    // this: it strips the host outright, modeling content moving to a new page
    // (`makePage`'s use), not reverting one still in place. The host stays here,
    // just without its slash line — or, if it was edited since the pick began,
    // `blocksRef.current` as it is now.
    const host = blocksRef.current.find((b) => b.id === target.hostId)
    const before =
      host?.type === 'text' && host.content === target.content
        ? blocksRef.current.map((b) =>
            b.id !== target.hostId
              ? b
              : {
                  ...b,
                  content: target.line
                    ? [target.line.before, target.line.after]
                        .filter((s) => s.trim() !== '')
                        .join('\n\n')
                    : '',
                }
          )
        : blocksRef.current
    // A fast `/` + pick can still have the slash keystroke's own debounced save
    // pending in `use-page-draft.ts` — `persistBlocksAsOwnEdit` flushes it
    // before writing, so the slash save can't land after us with a stale
    // baseline and double-log this same apply. Shared with drag-drop's
    // commits (KAN-247), so this is the only direct-write path.
    const supabase = getSupabase()
    if (!(await persistBlocksAsOwnEdit(before, applied.blocks))) return
    // KAN-138: applying a `yours` template retires its "just saved" lead — but
    // only once the blocks write above actually landed; a failed apply keeps
    // the lead so the person's retry still sees it first.
    if (pick.origin === 'yours' && pondId) justSaved.clear(pondId, pick.id)
    if (applied.schema) {
      try {
        await defineSchema(supabase, pageId, applied.schema)
      } catch (err) {
        console.error('Failed to define the template schema', err)
      }
    }
    // Read-modify-write against whatever this page's props already carry (a
    // glyph, an area role, …) rather than overwriting them with just the
    // kind/stamp the template adds.
    try {
      const current = await getPage(supabase, pageId)
      const nextProps = { ...(current?.props ?? {}), ...applied.props }
      await saveProps(supabase, pageId, nextProps)
      queryClient.setQueryData<PondPage | null>(['page', pageId], (prev) =>
        prev ? { ...prev, props: nextProps } : prev
      )
    } catch (err) {
      console.error('Failed to write the template props', err)
    }
    // `onBlocksPersisted`/`onChange` already ran inside `persistBlocksAsOwnEdit`,
    // ahead of the schema/props writes above — this apply's own blocks are
    // already the caller's baseline by the time those (independent) writes land.
    focusPageTitle()
  }

  const makePageFromTemplate = async (pick: TemplatePick, target: SlashTarget, index: number) => {
    // A `/` line has text around it, so the page is not blank — same guard
    // the menu's own `leadWithTemplates` uses (`slash.line ? false : blank`).
    if (isBlankBesides(index) && !target.line) {
      await applyTemplateInPlace(pick, target)
      return
    }
    const made = await makePage(await newPageFromPick(pick), 'child', target)
    // KAN-138: the nested-page apply path retires `yours · just saved` too —
    // but only once the page actually got made; a failed apply keeps the lead.
    if (made && pick.origin === 'yours' && pondId) justSaved.clear(pondId, pick.id)
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

  // Rows are derived, never stored (6x): consecutive blocks whose widths add up
  // to full or less share one row, in array order. Packing (and the sizing
  // below) reads the PREVIEWED width for whichever one block has it, so
  // hovering a width reflows the row live; rendering still passes the real
  // block (looked up by id, see `renderList` below) to `renderBlockEditor`, so
  // the previewed block's own content and its width row's filled cell are
  // never touched by the preview.
  const blocksForLayout = useMemo(
    () =>
      previewWidth
        ? blocks.map((b) => {
            const preview = previewWidth.find((p) => p.blockId === b.id)
            return preview ? { ...b, width: preview.width } : b
          })
        : blocks,
    [blocks, previewWidth]
  )

  // The row a beside hover would actually land in, from the SAME planner the
  // commit uses (`planBesideDrop`) — not `blocksForLayout`'s per-block preview,
  // which carries widths only, never a reorder. `null` off a drag, off an
  // own-line hover, or wherever the planner itself returns `null` (a full row,
  // or a repack that would split the planned row apart).
  const besidePlan = useMemo(() => {
    if (draggingIndex === null || !dropIndicator) return null
    if (dropIndicator.zone !== 'left' && dropIndicator.zone !== 'right') return null
    const target = blocks[dropIndicator.index]
    if (!target) return null
    return planBesideDrop(blocks, draggingIndex, target.id, dropIndicator.zone)
  }, [blocks, draggingIndex, dropIndicator])

  // The render order while a beside drop is planned (6x frame 3): the dragged
  // block renders TWICE — a `::ghost`-suffixed id at the planned slot, at the
  // planned width (the lifted copy), and the real id reinserted at its OLD
  // slot, at its OLD width (the origin — opacity-40 only, never the preview
  // width; applying the preview to the real block was the "shrinks the old
  // place" bug). `besidePlan` already preserves every other block's relative
  // order, so the ghost lands exactly where `besidePlan` already has it just
  // by tagging its id. The origin's old slot is found by locating its old
  // RIGHT neighbour's id in that same array and inserting right before it (or
  // at the end with no neighbour) — but that slot can fall inside the row the
  // ghost just joined (the neighbour is itself a row-mate), which would split
  // the planned row apart in `layoutRows`' packing; when it does, the origin
  // goes after the row's last member instead, so the planned row always
  // renders as one unbroken run. Off a drag, or off anything but a beside
  // hover, this is just `blocksForLayout`, one entry per block.
  const renderList = useMemo<{ id: string; width: BlockWidth; ghost: boolean }[]>(() => {
    if (!besidePlan || draggingIndex === null) {
      return blocksForLayout.map((b) => ({ id: b.id, width: b.width ?? 'full', ghost: false }))
    }
    const dragged = blocks[draggingIndex]
    const ghostId = `${dragged.id}::ghost`
    const plannedWidth = besidePlan.find((b) => b.id === dragged.id)?.width ?? 'full'
    const withGhost = besidePlan.map((b) =>
      b.id === dragged.id
        ? { id: ghostId, width: plannedWidth, ghost: true }
        : { id: b.id, width: b.width ?? 'full', ghost: false }
    )
    const neighborId = draggingIndex < blocks.length - 1 ? blocks[draggingIndex + 1].id : null
    const neighborAt = neighborId ? withGhost.findIndex((item) => item.id === neighborId) : -1
    let insertAt = neighborId ? neighborAt : withGhost.length

    const plannedRow = layoutRows(withGhost).find((row) =>
      row.some((item) => item.id === ghostId)
    )
    let rowEnd = -1
    if (plannedRow) {
      const rowIndices = withGhost.reduce<number[]>((acc, item, i) => {
        const inRow = plannedRow.some((rowItem) => rowItem.id === item.id)
        return inRow ? [...acc, i] : acc
      }, [])
      const rowStart = rowIndices[0]
      rowEnd = rowIndices[rowIndices.length - 1]
      if (insertAt > rowStart && insertAt <= rowEnd) insertAt = rowEnd + 1
    }

    const origin = { id: dragged.id, width: dragged.width ?? 'full', ghost: false }
    const withOrigin = [...withGhost]
    withOrigin.splice(insertAt, 0, origin)

    // The index guard above only catches an insertAt that falls strictly
    // between the planned row's ends; it misses a narrow origin landing
    // AT the row's own start, which can still pack into the row's first
    // member (D 1/3 next to T 1/2 both fit in 12 twelfths) and push the
    // ghost onto its own line. So re-pack the real render list and check
    // the planned row's members (ghost included) are still one whole row
    // — if not, the origin goes after the row's last member instead.
    if (plannedRow) {
      const keepsRowTogether = layoutRows(withOrigin).some(
        (row) =>
          row.length === plannedRow.length &&
          plannedRow.every((item) => row.some((r) => r.id === item.id))
      )
      if (!keepsRowTogether) {
        const fallback = [...withGhost]
        fallback.splice(rowEnd + 1, 0, origin)
        return fallback
      }
    }

    return withOrigin
  }, [besidePlan, draggingIndex, blocks, blocksForLayout])

  const blockRows = useMemo(() => layoutRows(renderList), [renderList])

  /**
   * Commits a beside drop (6x): `planBesideDrop` (the same planner the hover
   * line and preview read) splices the dragged block into the target's row
   * and applies its widths to every block now in that row — including the
   * ones whose width didn't change — in one `persistBlocksAsOwnEdit` write,
   * so the move and the widths it sets are one change with one undo (KAN-247,
   * routed through the same direct-write pattern as template apply —
   * KAN-124). Reads the real `blocks` (not the live-preview `blocksForLayout`),
   * since this is the commit, not another preview.
   */
  async function commitBesideDrop(fromIndex: number, targetIndex: number, zone: 'left' | 'right') {
    const next = planBesideDrop(blocks, fromIndex, blocks[targetIndex].id, zone)
    if (!next) return
    await persistBlocksAsOwnEdit(blocks, next)
  }

  /**
   * Commits an own-line drop (6x): splices the dragged block before/after the
   * TARGET'S ROW as a whole, not before/after the target block itself — so
   * dropping below the second block of a ½+½ row lands after both, not
   * between them. Only the dragged block's width changes, to `full`; every
   * other block is the same object reference, untouched (AGENTS.md: Pond
   * doesn't widen what's left behind). One `persistBlocksAsOwnEdit` write, same
   * as `commitBesideDrop` (KAN-247, KAN-124's direct-write pattern).
   */
  async function commitOwnLineDrop(fromIndex: number, targetIndex: number, zone: 'above' | 'below') {
    const dragged = { ...blocks[fromIndex], width: 'full' as BlockWidth }
    const target = blocks[targetIndex]
    const withoutDragged = blocks.filter((_, i) => i !== fromIndex)
    const row = layoutRows(withoutDragged).find((r) => r.some((b) => b.id === target.id))
    if (!row) return
    const rowIds = new Set(row.map((b) => b.id))
    const rowAt = withoutDragged.reduce<number[]>(
      (acc, b, i) => (rowIds.has(b.id) ? [...acc, i] : acc),
      []
    )
    const insertAt = zone === 'above' ? rowAt[0] : rowAt[rowAt.length - 1] + 1
    const spliced = [...withoutDragged]
    spliced.splice(insertAt, 0, dragged)
    await persistBlocksAsOwnEdit(blocks, spliced)
  }

  /**
   * Commits exactly the `dropIndicator` currently shown — not a fresh
   * classification of wherever the release landed. The lifted ghost is
   * `pointer-events-none` and the gap between blocks has no handler of its
   * own, so a release over either reaches no block's `onDrop`; the canvas
   * root calls this directly for those. A block's own `onDrop` calls it too
   * (and stops propagation first), so the canvas root's own listener never
   * double-commits the same release.
   */
  function commitDropIndicator() {
    const fromIndex = draggingIndex
    const indicator = dropIndicator
    setDropIndicator(null)
    setPreviewWidth(null)
    setDraggingIndex(null)
    if (fromIndex === null || !indicator || indicator.index === fromIndex) return
    if (indicator.zone === 'left' || indicator.zone === 'right') {
      void commitBesideDrop(fromIndex, indicator.index, indicator.zone)
      return
    }
    void commitOwnLineDrop(fromIndex, indicator.index, indicator.zone)
  }

  // Stacking (6x): measured off the content column itself (ResizeObserver on the
  // canvas), not the viewport, so the side panel and window-narrowing both
  // trigger it. 0 means "not yet measured" (jsdom never measures) and is read as
  // "holds" — a page with no widths set (every block full) renders identically
  // either way, since "holds" only narrows a sub-240px block's own share and a
  // full block's share is always 100%. A layout effect, not a passive one: it
  // measures and (if narrow) flips to stacked before the browser paints, so a
  // genuinely narrow window never paints the un-stacked share for one frame first.
  const [columnWidth, setColumnWidth] = useState(0)
  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const read = () => setColumnWidth(el.getBoundingClientRect().width)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /**
   * The lifted copy shown at the planned slot while a beside drop is hovered
   * (6x frame 3, `PondBlock.dc.html`'s `lifted` state): a read-only render of
   * the dragged block's own content — no handle, no drag wiring, no keyboard
   * handling, since the origin node (the real, still-draggable block) is what
   * the pointer and keyboard actually act on. `aria-hidden`/`inert` keep it
   * out of the accessibility tree and the tab order entirely.
   */
  function renderGhostBlock(block: Block) {
    const frame = blockFrame(block)
    const view = <ModuleView type={block.type} data={block} editable={false} onChange={() => {}} />
    return (
      <div
        id={blockDomId(`${block.id}::ghost`)}
        aria-hidden
        inert
        className="pointer-events-none shadow-mn-lifted rotate-[-.6deg] translate-x-[12px] translate-y-[18px] z-[4]"
      >
        {frame ? (
          <PondBlock kind={frame.kind} heading={frame.heading} headNote={frame.headNote} state="rest">
            {view}
          </PondBlock>
        ) : block.type === 'text' ? (
          <div className="py-0.5" style={{ paddingInline: TEXT_BLOCK_INSET_PX }}>
            {view}
          </div>
        ) : (
          view
        )}
      </div>
    )
  }

  function renderBlockEditor(block: Block, i: number) {
    const blank = isBlankBesides(i)
    return (
      <BlockEditor
        key={block.id}
        block={block}
        pageId={pageId}
        settleOnMount={insertedIds?.has(block.id) ?? false}
        chrome={chrome}
        untouched={untouched && i === 0}
        onChange={(next) => setBlockAt(i, next)}
        onRemoveEmpty={() => removeEmptyLineAt(i)}
        onDeleteBlock={() => removeBlockAt(i)}
        onReturn={() => insertLineAfter(i)}
        onMoveUp={() => moveBlockAt(i, 'up')}
        onMoveDown={() => moveBlockAt(i, 'down')}
        onSlashKey={() => openSlashMenuAt(i)}
        slashMenuOpen={slashMenuOpenAt === i}
        blank={blank}
        slashSize={slashSize}
        yourTemplates={yourTemplates}
        siblingRanking={siblingRanking}
        justSavedId={pondId ? justSaved.get(pondId) : null}
        parentTitle={parentTitle}
        onSlashSelect={(row, at) => handleSlashSelect(i, row, at)}
        onSlashPickTemplate={(pick, at) => handleSlashPickTemplate(i, pick, at)}
        onPreviewTemplate={blank ? (pick) => void handlePreviewTemplate(pick) : undefined}
        previewing={
          previewing ? { pick: previewing.pick, blocks: previewing.blocks.length } : undefined
        }
        previewAnchorRef={previewAnchorRef}
        onPreviewCancel={handlePreviewCancel}
        onSlashClose={handleSlashClose}
        menuOpen={menuOpenAt === i}
        // Only the OPEN block's groups are derived: this render runs on every
        // keystroke anywhere on the page.
        menuGroups={
          menuOpenAt === i
            ? blockMenuGroups(block, {
                moveIntoNewPage: onMoveIntoNewPage !== undefined,
                width: (
                  <BlockWidthRow
                    width={block.width}
                    size={slashSize}
                    onSelect={(width) => handleMenuSelect(i, { type: 'set-width', width })}
                    onPreview={(width) =>
                      setPreviewWidth(width === null ? null : [{ blockId: block.id, width }])
                    }
                  />
                ),
              })
            : undefined
        }
        menuSize={slashSize}
        onMenuOpenChange={(open) => handleMenuOpenChange(i, open)}
        onMenuSelect={(action) => handleMenuSelect(i, action)}
        isDragging={draggingIndex === i}
        dropZone={dropIndicator?.index === i ? dropIndicator : undefined}
        onDragStart={(e) => {
          if (dragImageRef.current) e.dataTransfer?.setDragImage(dragImageRef.current, 0, 0)
          setMenuOpenAt(null)
          setPreviewWidth(null)
          setDraggingIndex(i)
        }}
        onDragEnd={() => {
          setDraggingIndex(null)
          setDropIndicator(null)
          setPreviewWidth(null)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (draggingIndex === null) return
          if (draggingIndex === i) {
            // Hovering the held block's own origin: no drop is offered here,
            // so whatever indicator/preview the last hovered target left up
            // must clear too — otherwise a release here would still commit
            // that earlier target's plan (the drop just below commits
            // whatever indicator is shown, not what's under the pointer now).
            setDropIndicator(null)
            setPreviewWidth(null)
            return
          }
          const rect = e.currentTarget.getBoundingClientRect()
          const zone = classifyDropZone(rect, { x: e.clientX, y: e.clientY })
          if (zone === 'left' || zone === 'right') {
            const planned = planBesideDrop(blocks, draggingIndex, blocks[i].id, zone)
            // `null`: the row already holds 4, or the widths this drop would
            // set let `layoutRows` repack the planned row apart — no beside
            // line here, though the row's own-line (above/below) zone still works.
            // Clears unconditionally, same reason as the origin-hover branch
            // above: a stale indicator from an earlier target must not survive
            // into a zone that offers no plan of its own.
            if (planned === null) {
              setDropIndicator(null)
              setPreviewWidth(null)
              return
            }
            setDropIndicator({ index: i, zone })
            // Every block `planned` sets a new width for previews live, not
            // just the dragged block — so the target row already shows the
            // width it will take while hovering, before the drop lands.
            const changed = planned.reduce<{ blockId: string; width: BlockWidth }[]>(
              (acc, next) => {
                const current = blocks.find((b) => b.id === next.id)
                const nextWidth = next.width ?? 'full'
                if ((current?.width ?? 'full') !== nextWidth) {
                  acc.push({ blockId: next.id, width: nextWidth })
                }
                return acc
              },
              []
            )
            setPreviewWidth(changed)
            return
          }
          setPreviewWidth(null)
          const columnRect = canvasRef.current?.getBoundingClientRect()
          setDropIndicator({
            index: i,
            zone,
            span: columnRect
              ? { left: columnRect.left - rect.left, width: columnRect.width }
              : undefined,
          })
        }}
        onDrop={(e) => {
          e.preventDefault()
          // Stop here, not at the canvas root: the block that actually
          // received the release already knows what to commit (the shown
          // indicator), so the root's own `onDrop` — there for a release
          // over the ghost or the gap, which reach no block — must not
          // also fire for this same release.
          e.stopPropagation()
          commitDropIndicator()
        }}
      />
    )
  }

  return (
    <PageLinkProvider value={pageLinks}>
      {/* Provide sibling-block state so bound metrics derive live and their `→`
          can scroll to source (ticket-23). Keyed off the live `blocks`, so a
          checklist toggle re-derives every metric in the same render. `pageId`
          lets a cross-page rollup metric find this page's children (ticket-38). */}
      <SiblingBlocksProvider value={{ blocks, scrollToBlock, pageId }}>
        {/* 6f frame 3's `s3.1.3`: on desktop, the outline pane (`flex:1`) and a
            250px slot standing in for the still-open templates menu sit side
            by side, gap 16px. At phone width the 250px slot would leave the
            340px-wide glass overhanging the outline, so there the outline
            takes the full row instead and the glass anchors below it (the
            board's "moving onto a template" frame only ever shows the
            side-by-side layout at desktop width). The block list underneath
            (the blank page's one line, hosting the open `SlashMenu` and its
            focused editor) stays mounted and FOCUSABLE while previewing —
            collapsed via `hiddenCanvasListStyle` (absolute, zero-height,
            clipped), never `display:none`/`visibility:hidden`, both of which
            blur a focused descendant the instant they apply (round 3 live
            finding 1). A remount here would drop the menu along with it,
            which is the bug this item replaces. */}
        <div
          style={
            previewing
              ? {
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  flexDirection: slashSize === 'desktop' ? 'row' : 'column',
                }
              : undefined
          }
        >
          {previewing && (
            <div
              // Mobile has no separate slot (below): the outline pane itself is
              // the glass's anchor, so the glass lands right under it via the
              // ordinary `bottom + 4` placement `useAnchoredBox` already gives
              // any other anchor.
              ref={slashSize === 'desktop' ? undefined : previewAnchorRef}
              style={
                slashSize === 'desktop'
                  ? { flex: 1, minWidth: 0 }
                  : { width: '100%', minWidth: 0 }
              }
            >
              <TemplatePreviewOutline rows={templateOutlineRows(previewing.blocks)} />
            </div>
          )}
          {/* Desktop only: a visible stand-in for the glass's anchor (see
              `previewAnchorRef` above) — not the glass itself, which still
              floats via its own portal/`useAnchoredBox`. Reserves the board's
              own 250px so the row's layout matches 6f frame 3 even though
              nothing is drawn here. */}
          {previewing && slashSize === 'desktop' && (
            <div
              ref={previewAnchorRef}
              aria-hidden
              data-part="preview-anchor-slot"
              style={{ width: 250, flexShrink: 0, alignSelf: 'flex-start' }}
            />
          )}
          <div
            ref={canvasRef}
            style={previewing ? hiddenCanvasListStyle(listStyle) : canvasListStyle(listStyle)}
            // The ghost is `pointer-events-none` and the gap between blocks
            // has no element of its own, so a release over either reaches no
            // block's `onDrop` — this root commits the shown indicator for
            // those (a block's own `onDrop` stops propagation first, so it
            // never double-commits the same release). `onDragLeave` only
            // clears the indicator when the drag leaves the canvas itself
            // (`relatedTarget` outside it) — moving from a block into the
            // ghost or a gap is still inside the canvas, so the indicator
            // stays up rather than flickering off and on.
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              commitDropIndicator()
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as Node | null
              if (related && canvasRef.current?.contains(related)) return
              setDropIndicator(null)
              setPreviewWidth(null)
            }}
          >
            {/*
             * A single flat `.flatMap()`, not a `.map()` of each row's own
             * `.map()`: nested arrays give React an implicit key path scoped to
             * their outer array index, so a block moving from row 0 to row 1
             * would still remount even though its own `key` is unchanged — the
             * exact bug a flat array (one key namespace, block.id only) removes.
             */}
            {blockRows
              .flatMap((row) => {
                const widths = row.map((item) => item.width)
                // Widths and rows are kept, not shown: a row that stacks renders
                // each of its blocks' sizing divs at 100% width, which — because
                // the list itself wraps — puts each on its own line, in reading
                // order. That IS the stack; no row-level wrapper is rendered at
                // all, so a block shifting from one row to another regroups
                // `blockRows` without touching any ancestor element, and a
                // remount is impossible rather than merely untested.
                const stacks = columnWidth > 0 && !rowHolds(columnWidth, widths)
                return row.map((item) => ({ item, stacks }))
              })
              .map(({ item, stacks }) => {
                const sizingWidth =
                  stacks || item.width === 'full' ? '100%' : blockWidthStyle(item.width)
                // The ghost's id has no entry in `blocks` — it renders the
                // dragged block's own content read-only (`renderGhostBlock`),
                // not through `renderBlockEditor`, which only real slots use.
                if (item.ghost) {
                  return draggingIndex === null ? null : (
                    <div key={item.id} style={{ width: sizingWidth }}>
                      {renderGhostBlock(blocks[draggingIndex])}
                    </div>
                  )
                }
                // Looked up by id, not position: `renderList` can hold one more
                // entry than `blocks` (the ghost) while a beside drop is
                // planned, so a flattened position no longer lines up with
                // `blocks`' own index.
                const i = blocks.findIndex((b) => b.id === item.id)
                return (
                  <div
                    key={item.id}
                    className="min-w-0 transition-[width] duration-[var(--motion-settle)] ease-[var(--ease-mn)] motion-reduce:transition-none"
                    style={{ width: sizingWidth }}
                  >
                    {renderBlockEditor(blocks[i], i)}
                  </div>
                )
              })}
          </div>
        </div>
      </SiblingBlocksProvider>

      {/* The always-visible foot add (UI-audit Slice 2a): drops a text block; `/`
          in it summons the palette to swap type. Hidden on an untouched page
          (6f) and while a template is previewing (6f frame 3's outline stack
          replaces the whole body) too — the blank body's only help is its one
          hint line. */}
      <AddBlockButton onAdd={addTextBlock} hidden={!chrome || untouched || !!previewing} />
      {/* The source picker, hung off the `/` line that summoned it. */}
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
          side={sourcePicker.side}
          maxHeight={sourcePicker.maxHeight}
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
      const verdict = viewFrameState(block, rows, processed, frame, schema)
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
 * `/` in an empty text block, or at the start of an empty line inside one, opens
 * the block palette (`useSlashLine`). The slash stays as text — it is the query —
 * until a pick lands in its place. ⌥↑/⌥↓
 * reorders the focused block; the handle drags to reorder. `draggable` is armed
 * only while the pointer is down on the handle — an always-draggable block would
 * hijack text-selection drags.
 *
 * Return on the block itself — not on anything inside it — opens a line after a
 * block that is not text. A text block's Return is its editor's.
 *
 * A press on the handle, or ⌘/ (Ctrl+/ off Apple) anywhere in the block, opens
 * the block menu (`PondMenu` kind `block`), and the block wears the open ring
 * while it is open. A drag from the handle closes the menu its press opened.
 */
function BlockEditor({
  block,
  pageId,
  settleOnMount = false,
  chrome = true,
  untouched = false,
  onChange,
  onRemoveEmpty,
  onDeleteBlock,
  onReturn,
  onMoveUp,
  onMoveDown,
  onSlashKey,
  onSlashPickTemplate,
  onPreviewTemplate,
  previewing,
  previewAnchorRef,
  onPreviewCancel,
  slashMenuOpen,
  blank = false,
  slashSize = 'desktop',
  yourTemplates,
  siblingRanking = [],
  justSavedId = null,
  parentTitle = null,
  onSlashSelect,
  onSlashClose,
  menuOpen,
  menuGroups = [],
  menuSize = 'desktop',
  onMenuOpenChange,
  onMenuSelect,
  isDragging,
  dropZone,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  block: Block
  pageId: string
  settleOnMount?: boolean
  chrome?: boolean
  /** This block is the untouched page's one hint line (6f): its placeholder draws in the mono override. */
  untouched?: boolean
  onChange: (next: Block) => void
  /** Backspace in an empty text block. */
  onRemoveEmpty: () => void
  /** ⌘⌫ / Ctrl+⌫ on the focused block. */
  onDeleteBlock: () => void
  /** Return on a focused block that is not text. */
  onReturn: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onSlashKey?: () => void
  slashMenuOpen?: boolean
  /** A page with nothing on it yet besides this block (6f): `/` leads with templates. */
  blank?: boolean
  slashSize?: PickerSize
  yourTemplates?: readonly YourTemplate[]
  /** The blank list's ranking (KAN-138): the parent's other children, by `siblingTemplateRanking` count. */
  siblingRanking?: readonly string[]
  /** The template saved this session and not yet applied. */
  justSavedId?: string | null
  /** The parent page's title, for the `used in {parent}` hint. */
  parentTitle?: string | null
  /** `at` is the `/` line the menu opened on inside the block, if it did. */
  onSlashSelect?: (row: SlashRow, at: SlashLineAt | null) => void
  onSlashPickTemplate?: (pick: TemplatePick, at: SlashLineAt | null) => void
  /** `/` → `→` on a template row (6f frame 3): previews it, in place of a pick. Only passed while the page is blank. */
  onPreviewTemplate?: (pick: TemplatePick) => void
  /** Set once a preview has resolved — threaded straight to `SlashMenu`'s own prop of the same name. */
  previewing?: { pick: TemplatePick; blocks: number }
  /** The visible slot standing in for this block's own (hidden-while-previewing) anchor. */
  previewAnchorRef?: RefObject<HTMLDivElement | null>
  onPreviewCancel?: () => void
  onSlashClose?: () => void
  menuOpen?: boolean
  menuGroups?: PondMenuGroup<BlockMenuAction>[]
  menuSize?: PondMenuSize
  onMenuOpenChange?: (open: boolean) => void
  onMenuSelect?: (action: BlockMenuAction) => void
  isDragging?: boolean
  /** The drop line to draw on THIS block, if the drag is hovering it — `BlockCanvas` decides which block that is. */
  dropZone?: { zone: DropZone; span?: { left: number; width: number } }
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  const [dragArmed, setDragArmed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const frame = blockFrame(block)
  const slash = useSlashLine({
    block,
    rootRef,
    open: slashMenuOpen ?? false,
    size: slashSize,
    leadWithTemplates: blank,
    yourTemplates,
    onOpen: onSlashKey,
    onClose: onSlashClose,
  })
  // While previewing, `rootRef`'s own rect is zeroed (its ancestor is
  // `hidden`) — the glass anchors off the visible slot beside the outline
  // instead, so it stays put rather than landing at the viewport origin.
  const previewAnchor = useMemo<PickerAnchorBox>(
    () => ({
      getBoundingClientRect: () => {
        const r =
          previewAnchorRef?.current?.getBoundingClientRect() ?? document.body.getBoundingClientRect()
        // Desktop: the slot is the zero-height stand-in beside the outline (board
        // 6f frame 3 s3.1.3 top-aligns the glass with its row, not `bottom + 4`
        // below it) — shift the rect up 4px so `useAnchoredBox`'s own, untouched
        // `bottom + 4` placement lands exactly on the slot's top. Mobile anchors
        // off the outline pane itself (real height), where landing 4px below its
        // bottom IS the board's "glass below it, under the outline" — no shift.
        return slashSize === 'desktop' ? { top: r.top - 4, bottom: r.top - 4, left: r.left } : r
      },
    }),
    [previewAnchorRef, slashSize]
  )
  const { state, onEmptyAction, emptyLine } = useBlockEmptyState(block, frame, pageId, onChange)

  const view = (
    <SlashLineContext.Provider value={slash.handleSlashLine}>
      <ModuleView
        type={block.type}
        data={block}
        editable
        onChange={(next) => {
          slash.handleTextChange(next as Block)
          onChange(next as Block)
        }}
      />
    </SlashLineContext.Provider>
  )

  // ⌘⌫ deletes the focused block (`Pond 08 Edges` 8e) — on the CAPTURE phase,
  // because tiptap's own Mod-Backspace keymap listens directly on the editor's
  // contenteditable DOM node, and a capture listener on this row (its ancestor)
  // always runs before a listener on the node itself. Catching it on bubble (as
  // `handleKeyDown` below does for every other chord) is too late: tiptap has
  // already handled or ignored the key by then.
  // Only fires when the block ROW itself is focused, or (text blocks only) the
  // caret is in that block's own tiptap editor with no text before it — the
  // editor's own delete-to-line-start wins otherwise (AUDIT K1–K4). A chord
  // typed into a table cell, a todo item's label, or any other field the block
  // hosts is left alone so that field's own native ⌘⌫ runs.
  function handleKeyDownCapture(e: React.KeyboardEvent) {
    if (!isDeleteBlockChord(e.nativeEvent)) return
    const rowFocused = e.target === e.currentTarget
    const inOwnEditor =
      block.type === 'text' &&
      e.target instanceof Element &&
      e.target.closest('[role="textbox"][contenteditable]') != null
    if (!rowFocused && !(inOwnEditor && !hasTextBeforeCaret(rootRef.current))) return
    e.preventDefault()
    e.stopPropagation()
    onDeleteBlock()
  }

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
    // which stops propagation) — only a bare empty block deletes. Any of
    // ⌘/Ctrl/⌥ held means the editor's own chord already acted (select-all then
    // ⌘⌫ must leave the empty block, KAN-307), so the rule is modifier-gated,
    // not `defaultPrevented`-gated: ProseMirror's own capture handler calls
    // preventDefault on every bare Backspace at a textblock start, so gating on
    // that would kill the rule entirely.
    if (
      e.key === 'Backspace' &&
      !slashMenuOpen &&
      block.type === 'text' &&
      block.content === '' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
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
        'group relative',
        block.type === 'text'
          ? 'outline-none'
          : 'rounded-mn-card focus-visible:ring-2 focus-visible:ring-mn-text',
        settleOnMount && 'motion-settle-in',
        // `origin` (old place) from `PondBlock.dc.html` is opacity .4 ONLY — the
        // tilt and stepped-up shadow belong to the separate `lifted` copy, built
        // where the drag preview is drawn (not this node).
        isDragging &&
          'opacity-40 transition-opacity duration-[var(--motion-quick)] ease-[var(--ease-mn)] motion-reduce:transition-none',
        menuOpen && 'rounded-[20px] [box-shadow:0_0_0_2px_rgb(from_var(--mn-text)_r_g_b/0.18)]'
      )}
      id={blockDomId(block.id)}
      data-block-id={block.id}
      // Focusable so a copied link to the block can land on it, and a tab stop
      // when it is not text so Return can reach it; a text block's focus is its editor.
      tabIndex={block.type === 'text' ? -1 : 0}
      {...(block.type === 'text'
        ? {}
        : { role: 'group', 'aria-label': blockName(block, frame), 'aria-keyshortcuts': 'Enter' })}
      draggable={dragArmed}
      onDragStart={onDragStart}
      onDragEnd={() => {
        setDragArmed(false)
        onDragEnd?.()
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onKeyDownCapture={handleKeyDownCapture}
      onKeyDown={handleKeyDown}
    >
      {/* The drop line (6x `PondBlock.dc.html`'s `dropBar`): beside is a 2px bar
          9px into the gap off this block's near edge; above/below is a 2px bar
          9px off this block's top/bottom edge, spanning `dropZone.span` — the
          full content column, not just this block's own width, since a block in
          a row can be narrower than the column it belongs to. */}
      {dropZone &&
        (() => {
          const geo = dropBarGeometry(dropZone)
          return (
            <span
              data-part="drop-bar"
              data-zone={dropZone.zone}
              data-left={geo.left}
              data-right={geo.right}
              data-top={geo.top}
              data-bottom={geo.bottom}
              data-width={geo.width}
              data-height={geo.height}
              className="pointer-events-none absolute rounded-[1px] bg-mn-text"
              style={geo}
            />
          )
        })()}
      {/* The handle: the only block chrome. Desktop (KAN-43) sits OUTSIDE the
          card at `left -14`, revealed on hover and on keyboard focus. Phone
          (KAN-259) sits INSIDE the card at `right 2 · top 2 · 44x44` — a touch
          target can't float off-card or wait on a hover that never fires — so
          it is always visible there; PondBlock's head row reserves the 40px
          this takes (`size="mobile"`, below). Press-and-drag reorders, a click
          opens the block menu, which is where `delete` lives. Inside the card
          it must stack ABOVE the body that follows it in the DOM (the card's
          paper, a text block's editor) or taps land on the body: `z-[1]`, the
          lowest lift that does it, under every floating surface (z ≥ 4). */}
      <div
        data-part="handle"
        hidden={!chrome}
        className={cn(
          'absolute',
          menuSize === 'mobile'
            ? 'right-0.5 top-0.5 z-[1]'
            : [
                '-left-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
                // A card centres the 24px handle on its head row; bare prose has no head
                // row, so it centres on the first line (2px inset + half the 28px line).
                !frame && block.type === 'text' ? 'top-1' : 'top-3',
                menuOpen && 'opacity-100',
              ]
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
                'flex cursor-grab items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-mn-text',
                menuSize === 'mobile' ? 'h-11 w-11 rounded-[14px]' : 'h-6 w-3 rounded-[6px]',
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
          query={slash.query}
          anchor={previewing ? previewAnchor : slash.anchor}
          side={slash.side}
          maxHeight={slash.maxHeight}
          size={slashSize}
          onSelect={(row) => onSlashSelect?.(row, slash.line)}
          onPickTemplate={onSlashPickTemplate && ((pick) => onSlashPickTemplate(pick, slash.line))}
          onPreviewTemplate={onPreviewTemplate}
          previewing={previewing}
          onPreviewCancel={onPreviewCancel}
          yourTemplates={yourTemplates}
          siblingRanking={siblingRanking}
          justSavedId={justSavedId}
          parentTitle={parentTitle}
          // A `/` line has text around it, so the page is not blank.
          leadWithTemplates={slash.line ? false : blank}
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
          size={menuSize}
        >
          {view}
        </PondBlock>
      ) : block.type === 'text' ? (
        // Bare prose: `padding 2px 4px`, no card.
        <div
          className={cn('py-0.5', untouched && UNTOUCHED_HINT_CLASS)}
          style={{ paddingInline: TEXT_BLOCK_INSET_PX }}
        >
          {block.pondStampAt && (
            <div className="flex items-baseline gap-[10px] pb-[10px]">
              <span className={pageEyebrowClass}>pond</span>
              <span className="text-[10.5px] font-medium text-mn-text-meta">
                {formatThreadTime(block.pondStampAt)}
              </span>
            </div>
          )}
          {view}
        </div>
      ) : (
        // #227: a block that is its OWN card — the chart card — sits on the page as it is.
        view
      )}
    </div>
  )
}
