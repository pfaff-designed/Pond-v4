'use client'

/**
 * The shared block editor body — the full manual-authoring surface
 * extracted from DocumentPanel so EVERY editable page renders it identically: the
 * document editor, an area page with content, AND the Life home page.
 *
 * It renders a `SiblingBlocksProvider`-wrapped list of blocks with the `/` palette
 * on an empty text block or an empty line inside one, Return on a focused block
 * opening a line after it, drag/⌥↑/⌥↓ reorder, per-block delete with undo — and,
 * below the last block, a hover-only hit area that opens a new line (KAN-345). The
 * handle is the block menu. A view, image or table also has height strips on its
 * top and bottom edges (KAN-442) — an extension of 07.05, which draws the handle
 * as the only chrome. Nothing is drawn between blocks at rest.
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
import { createPortal } from 'react-dom'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { BlockRowProvider } from '@/lib/modules/block-row-context'
import { blockDomId, focusPageTitle, scrollToBlock } from '@/lib/modules/block-dom'
import { requestTitleFocus } from '@/lib/pages/title-focus'
import { requestBlockMovePick } from '@/lib/terminal-focus'
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
import { readCachedSchema, useCollectionRows } from '@/lib/modules/view/use-collection-rows'
import { isContextMenuField, shouldSelectCardFromClick } from '@/lib/modules/view/card-click'
import { applyView } from '@/lib/modules/view/apply'
import { activeSavedView } from '@/lib/modules/view/schema'
import {
  ActiveViewSelectionContext,
  SavedViewHostContext,
} from '@/lib/modules/view/active-view-context'
import { SavedViewBar } from '@/lib/modules/view/saved-view-bar'
import { compactChartMark, isChartCard } from '@/lib/modules/view/chart-compact'
import type { PropertySchema } from '@/lib/properties/schema'
import { CHART_EMPTY_LINE } from '@/lib/modules/chart/card'
import { addTodoItem } from '@/lib/modules/todo/view'
import { addTableRow } from '@/lib/modules/table/view'
import { addEntryFocused } from '@/lib/modules/entries/view'
import { TOGGLE_FOLD_ROW_PX } from '@/lib/modules/toggle/view'
import { PondBlock, POND_BLOCK_SELECTED_RING_ROUNDED } from '@/components/organisms/PondBlock'
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
  pointAnchor,
  type PondMenuGroup,
  type PondMenuPlacement,
  type PondMenuSize,
} from '@/components/molecules/PondMenu'
import { BlockWidthRow } from '@/components/molecules/BlockWidthRow'
import { TrailingBlockGap } from '@/components/molecules/TrailingBlockGap'
import { BlockGapLine } from '@/components/molecules/BlockGapLine'
import { BlockEdgeHandle } from '@/components/molecules/BlockEdgeHandle'
import {
  BLOCK_ROW_GAP_PX,
  blockWidthStyle,
  classifyDropZone,
  detachKeepingRows,
  isWithinPaddedZone,
  layoutRows,
  drawnWidthPercent,
  planBesideDrop,
  planOwnLineDrop,
  planRowSwap,
  planStepMove,
  rowZeroZone,
  zoneWhenDrawnStacked,
  rowStacks,
  widthPercent,
  widthTenths,
  withoutRowStart,
  type DropZone,
  type Rect,
} from '@/lib/modules/layout-rows'
import {
  KEY_WIDTHS,
  commitSharedEdgeWidths,
  handOffRowStartOnResize,
  resizeAlone,
  resizeSharedEdge,
  roundFreePercent,
} from '@/lib/modules/block-resize'
import { SlashLineContext, type SlashLineAt } from '@/lib/modules/text/slash-line'
import { useSlashLine } from '@/components/organisms/use-slash-line'
import {
  captureTextSelection,
  focusTextBlock,
  focusTextBlockAt,
  hasTextBeforeCaret,
  restoreTextSelection,
  type TextSelectionSnapshot,
} from '@/lib/modules/text/focus'
import { HOVER_GHOST_CLASS, UNTOUCHED_HINT_CLASS } from '@/lib/modules/text/prose'
import { useAcceptMarks } from '@/lib/change-log/accept-marks'
import { markTarget } from '@/lib/change-log/accept-marks-diff'
import { ChangedMark, formatChangedLabel } from '@/lib/change-log/changed-mark'
import {
  landAtSlash,
  useSlashPick,
  type Landing,
  type SlashTarget,
} from '@/components/organisms/use-slash-pick'
import { sessionUndo, type UndoHandle } from '@/lib/change-log/session-undo'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { blockName as changeBlockName } from '@/lib/change-log/summary'
import { appendOwnEdit, listRecords } from '@/lib/change-log/store'
import { changeLogKey } from '@/lib/change-log/keys'
import { restorePage, trashPage } from '@/lib/change-log/trash'
import { blockHoldsContent, removedOnExit } from '@/lib/modules/block-holds-content'
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog'
import {
  blockMenuGroups,
  runBlockMenuAction,
  type BlockMenuAction,
} from '@/components/organisms/block-menu'
import { BlockHeightHandles } from '@/components/organisms/BlockHeightHandles'
import { BlockHeightProvider } from '@/components/organisms/block-height-context'
import { blockAcceptsHeight, blockWithoutHeight } from '@/lib/modules/block-height'
import type { ConversionTarget, LineConversion, TableConversion } from '@/lib/modules/conversions'
import { moveIntoPagePrep } from '@/lib/modules/conversions'
import {
  isBlockMenuChord,
  isContextMenuKey,
  isDeleteBlockChord,
  useApplePlatform,
} from '@/lib/shell-commands'
import { slashRows, emptyBlockForType } from '@/lib/modules/palette'
import { descriptorFor } from '@/lib/modules/registry'
import { useBelowMd } from '@/lib/layout/use-below-md'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { formatThreadTime } from '@/lib/conversation/page-proposals'
import { TEXT_BLOCK_INSET_PX, TEXT_BLOCK_TOP_INSET_PX } from '@/lib/layout/surface-column'
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
  saveProps,
  type PondPage,
} from '@/lib/pages/client'
import { createDatabase } from '@/lib/pages/create-database'
import {
  getOrCreateTasksDatabase,
  pickTasksDatabase,
  projectFieldOf,
} from '@/lib/pages/tasks-database'
import { fetchRecordCounts, sourceDatabases } from '@/lib/pages/source-databases'
import { insertPageOptimistic } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { usePagesRows } from '@/lib/pages/use-pages'
import { flushPendingPageSave } from '@/lib/pages/page-flush'
import { addOption, readSchema, withSchema } from '@/lib/properties/schema'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePondId } from '@/lib/pond/context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { BaseUIEvent } from '@base-ui/react/types'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { PageLinkProvider } from '@/lib/modules/page-link/context'
import { usePageLinkCapabilities } from '@/lib/modules/page-link/use-capabilities'
import { stampNestedPage } from '@/lib/pages/nested-page'
import { cn } from '@/lib/utils'
import type { Block, TextBlock } from '@/lib/documents/types'
import type { BlockWidth } from '@/lib/modules/content'

/** What a block is called to assistive tech: its heading, else its kind. */
const blockName = (block: Block, frame: BlockFrame | null): string =>
  frame?.heading ?? descriptorFor(block.type)?.label ?? block.type

const TURNED_INTO: Record<Exclude<ConversionTarget, 'table'>, string> = {
  'heading-1': 'Turned into heading 1',
  'heading-2': 'Turned into heading 2',
  'heading-3': 'Turned into heading 3',
  quote: 'Turned into a quote',
  code: 'Turned into code',
  list: 'Turned into a list',
  checklist: 'Turned into a checklist',
  text: 'Turned into text',
  page: 'Turned into a page',
}

/** The block menu's own `move into a new page` row — distinct from `turn
 * into: page`'s `TURNED_INTO.page`, which names a conversion, not a move. */
const MOVED_INTO_A_NEW_PAGE = 'Moved into a new page'

const MENU_PLACEMENT: Record<PondMenuSize, Omit<PondMenuPlacement, 'anchor'>> = {
  desktop: { align: 'start', top: 40, alignOffset: -8 },
  mobile: { align: 'end', top: 48, alignOffset: 0 },
}

/** A right-click's point (KAN-485): `align: 'start'` and `top: 0` line the
 *  popup's top-left up with it, and PondMenu's own `sideOffset` math copes
 *  with the zero height (plain subtraction). */
const POINT_MENU_PLACEMENT: Omit<PondMenuPlacement, 'anchor'> = {
  align: 'start',
  top: 0,
  alignOffset: 0,
}

/** The page a `/` pick makes: a template's shape, or a person's own copied whole. */
type NewPage = InstantiatedTemplate & { props?: Record<string, unknown> }

/** The gap above row 0 lies outside `canvasRef`, so a real drag there reaches
 * no element of the canvas; this band, a child, makes those dragover/drop
 * events bubble to the root's handlers. */
const TOP_DROP_BAND_PX = 40

/**
 * The block list is the one flex container — gutted from a per-row wrapper div
 * plus per-block sizing div: a flat sizing div per block, keyed `block.id`, with
 * `flexWrap` so a 100%-wide sizing div (a stacked block) takes its own line,
 * which IS the stack. No row-level element exists to carry a regrouping key, so
 * a block changing rows can never remount — structurally impossible, not merely
 * untested. `rowGap` stays 0 here: a flex line's cross size clamps at zero
 * (CSS Flexbox §9.4 step 8), so the forced row-break line below would double
 * it. The vertical gap is carried on the blocks themselves instead (each
 * sizing div's own `marginTop`, below) — `rowGapValue` is still the one home
 * for a host's override (zen's 22px). `display`, `flexWrap` and
 * `flexDirection` are reasserted here so a host passing `flexDirection:'column'`
 * (zen's own shape) can't turn off wrapping.
 */
function canvasListStyle(listStyle: CSSProperties | undefined): CSSProperties {
  return {
    ...listStyle,
    display: 'flex',
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: BLOCK_ROW_GAP_PX,
    rowGap: 0,
    // Rule 4's row-boundary line (KAN-345) is an absolutely positioned child
    // of this list — out of the flex flow, so it adds no vertical spacing of
    // its own — positioned against THIS box, not a further-out ancestor.
    position: 'relative',
  }
}

/** The one home for the list's effective row gap — every sizing div that
 * carries it (below) reads it from here, so a host's `rowGap` override stays
 * in sync at every read site by construction. */
function rowGapValue(listStyle: CSSProperties | undefined): NonNullable<CSSProperties['rowGap']> {
  return listStyle?.rowGap ?? BLOCK_ROW_GAP_PX
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
 * ↑/↓ on a SELECTED block (KAN-367): moves the selection to the block at
 * `index`, by focusing its row directly — selection never enters a field,
 * only Return does that.
 */
function selectBlockAt(blocks: Block[], index: number) {
  const target = blocks[index]
  if (!target) return
  document.getElementById(blockDomId(target.id))?.focus()
}

/**
 * ↑/↓ leaving a block's edge (KAN-367): a text editor's first/last visual line, or
 * (now) a checklist's first/last item. Lands in the neighbour's own editable field,
 * at column `x` — a text neighbour's editor (nearest the caret's column), a
 * checklist's last (↑) / first (↓) item, or (any other card, which has no field of
 * its own) its row, selected via `selectBlockAt`. Only wired where a neighbour
 * exists; block 0's own ArrowUp goes to the page title instead (`renderBlockEditor`),
 * never here.
 */
function leaveBlockEdge(blocks: Block[], index: number, dir: 'up' | 'down', x: number) {
  const neighbourIndex = dir === 'up' ? index - 1 : index + 1
  const neighbour = blocks[neighbourIndex]
  if (!neighbour) return
  if (neighbour.type === 'text') {
    const element = document.getElementById(blockDomId(neighbour.id))
    focusTextBlockAt(element, x, dir === 'up' ? 'bottom' : 'top')
    return
  }
  if (neighbour.type === 'todo' && neighbour.items.length > 0) {
    const item = dir === 'up' ? neighbour.items[neighbour.items.length - 1] : neighbour.items[0]
    focusTodoItem(neighbour.id, dir === 'up' ? 'end' : 'start', item.id)
    return
  }
  selectBlockAt(blocks, neighbourIndex)
}

/**
 * Focus a todo block's item field after it lands (KAN-355 fix): a `/list`/
 * `/checklist` pick mints the block and lands it via `onChange` alone — a text
 * landing keeps the host editor's focus, but a todo block has no editor of its
 * own, so focus fell to `<body>` and the next keystroke was lost. Deferred a
 * tick for the same reason as `focusBlockNeighbour` — the row that will hold
 * `itemId` only exists once this render commits. Without `itemId`, the first
 * item (a freshly minted list's only one). `caret`: 'end' when ↑ lands in the
 * checklist's last item from the text block below it (KAN-367); every other
 * caller keeps today's 'start'.
 */
function focusTodoItem(blockId: string, caret: 'start' | 'end', itemId?: string) {
  setTimeout(() => {
    const host = document.getElementById(blockDomId(blockId))
    const row = itemId
      ? host?.querySelector<HTMLElement>(`[data-item-id="${itemId}"]`)
      : host?.querySelector<HTMLElement>('[data-item-id]')
    const input = row?.querySelector<HTMLInputElement>('input')
    input?.focus()
    const pos = caret === 'end' ? (input?.value.length ?? 0) : 0
    input?.setSelectionRange(pos, pos)
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

/** Rule 2/3/4's one home (KAN-345): the empty text line a trailing/row-gap click
 * focuses instead of inserting a second one (G9). */
function isEmptyTextLine(block: Block | undefined): block is TextBlock {
  return block?.type === 'text' && block.content.trim() === ''
}

/**
 * Rule 3/4's shared G9 guard (KAN-345): a second click that would otherwise
 * land on an already-empty text line focuses that line instead of minting a
 * second one. `insert` only runs when `candidate` isn't an empty line to
 * focus — an empty line never gets a second insert, even when its editor
 * isn't mounted yet: `focusTextBlock` returning `false` there is a documented
 * expected state (`focus.ts`, `immediatelyRender: false`), not a bug, so this
 * retries once on the next frame and otherwise leaves it: a line that arrived
 * with the page never autofocuses on mount by itself (rule 1), so a retry that
 * still can't find a mounted editor simply gives up rather than claiming a
 * guarantee that no longer holds.
 */
function focusEmptyLineOrInsert(candidate: Block | undefined, insert: () => void) {
  if (!isEmptyTextLine(candidate)) {
    insert()
    return
  }
  focusTextBlockSoon(candidate.id, 'end')
}

/**
 * Focuses a text block's editor, retrying once on the next frame when it
 * isn't mounted yet: `focusTextBlock` returning `false` there is a documented
 * expected state (`focus.ts`, `immediatelyRender: false`), not a bug. A retry
 * that still can't find a mounted editor simply gives up rather than claiming
 * a guarantee that no longer holds.
 */
function focusTextBlockSoon(id: string, at: 'start' | 'end') {
  if (focusTextBlock(document.getElementById(blockDomId(id)), at)) return
  requestAnimationFrame(() => {
    focusTextBlock(document.getElementById(blockDomId(id)), at)
  })
}

/**
 * Restores a selection a structural move captured (KAN-376: moving a block
 * past its row re-inserts its own DOM node, blurring the editor it was
 * focused in). Runs once in the commit and once more on the next frame, unless
 * focus is by then somewhere else: in development React 19's StrictMode
 * re-runs a moved fiber's effects after the commit, and tiptap's EditorContent
 * unmounts and remounts around the same editor DOM, blurring it again after
 * the first restore (seen live, KAN-376 re-verify). The frame pass also covers
 * an editor that is still drawing its stand-in.
 */
function restoreTextSelectionSoon(id: string, selection: TextSelectionSnapshot) {
  restoreTextSelection(document.getElementById(blockDomId(id)), selection)
  requestAnimationFrame(() => {
    // Focus kept, or the person has moved it on: nothing to restore.
    if (document.activeElement && document.activeElement !== document.body) return
    restoreTextSelection(document.getElementById(blockDomId(id)), selection)
  })
}

/**
 * Same mount-race retry as `focusTextBlockSoon`, for a non-text block: its
 * frame only takes a tabIndex, never typed keys, so the caret belongs on its
 * first editable descendant (an `input`/`textarea`/`contenteditable`, e.g. a
 * `list` template's lone todo item) — falling back to the frame only when it
 * has none.
 */
function focusBlockFieldSoon(id: string) {
  const focusOnce = () => {
    const frame = document.getElementById(blockDomId(id))
    const editableField = frame?.querySelector<HTMLElement>(
      'input, textarea, [contenteditable="true"]'
    )
    const target = editableField ?? frame
    target?.focus()
    return target !== null && target !== undefined
  }
  if (focusOnce()) return
  requestAnimationFrame(focusOnce)
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
   * The ONE structural entry point into the page's write queue (KAN-495): a
   * direct write (⌘⌫, drag-drop, template apply, width change) calls this
   * INSTEAD of `onChange` — the caller owns both the local state update and
   * the queue enqueue, so no second (typed) write of the same blocks queues
   * up behind it. Optional: a caller with no queue (Storybook, the blank-page
   * test harness) falls back to plain `onChange`.
   *
   * `discardOnFailure` (template apply only, KAN-495): a failed write is
   * dropped outright and local state repainted back to what's actually
   * stored, instead of the default retry semantics (⌘⌫, drag-drop) where a
   * halted op stays for the next write to auto-retry.
   */
  onStructuralWrite?: (
    next: Block[],
    opts?: {
      discardOnFailure?: boolean
      onUndone?: () => Promise<void> | void
      onRedone?: () => Promise<void> | void
      onUndoHandle?: (handle: UndoHandle) => void
    }
  ) => Promise<boolean>
  /**
   * Undo a block removal (ticket-44 review). The caller re-inserts `block` at
   * `index` against its LATEST blocks (read from a ref, not the `blocks` prop
   * closed over at stage-time) and writes the result through its own
   * structural write queue — NOT through `onChange`, which would re-base on
   * the stale `blocks` snapshot captured when the toast was staged. This
   * preserves DocumentPanel's original correctness: an edit between remove
   * and Undo must not be clobbered by the re-insert. Optional: a removal's
   * undo is the structural write's own step. A host that still re-inserts
   * itself may pass this; a host that does not leaves it unset.
   *
   * `handedRowStartTo` (KAN-440): the id of the row-mate `detachKeepingRows`
   * handed the removed block's `rowStart` to, if any — omit when there was no
   * handoff. The undo must omit `rowStart` from that block, against the LATEST
   * blocks in the same functional update, so a removal that moved the row's
   * start doesn't leave it moved after the removal itself is undone.
   */
  onUndoRemove?: (index: number, block: Block, handedRowStartTo?: string | null) => void
  /**
   * Block ids inserted this session, so a freshly-inserted block SETTLES in
   * (motion-settle-in) while blocks present on load do not (ticket-41). The Set is
   * OWNED BY THE PARENT (so it survives the panel's stable mount across page
   * changes), not by BlockCanvas — `markInserted` mutates it through this prop.
   * Optional — a surface that doesn't track it passes nothing and no block animates.
   */
  insertedIds?: Set<string>
  /** False hides the editing chrome — every block's handle and the trailing gap — mounted (zen: the page and nothing else). */
  chrome?: boolean
  /**
   * The page is untouched (6f): no title, one empty text block. Passed to
   * block 0 only (`untouched && i === 0`) so its placeholder paints in the
   * mono hint style (`UNTOUCHED_HINT_CLASS`); the trailing gap's own
   * visibility is unaffected by this prop.
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
   * KAN-369: the host's handle to Return/↓ leaving the title — assigned
   * `enterFromTitle` in an effect, so a host with a title (DocumentPanel)
   * can call it without BlockCanvas reaching up into title DOM/state. A
   * host with no title (Storybook, the blank-page harness) omits it.
   */
  titleExitRef?: RefObject<(() => void) | null>
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
  onStructuralWrite,
  insertedIds,
  chrome = true,
  untouched = false,
  openTemplatesFor = null,
  listStyle,
  titleExitRef,
  onPreviewNameChange,
}: BlockCanvasProps) {
  const { stageUndo, notify } = useDeletionUndo()
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()
  const pondId = usePondId()
  const apple = useApplePlatform()
  // The LATEST blocks, for the async paths below (the list→table write and its
  // undo). They run after awaits / from a toast, when the `blocks` their closure
  // captured may be stale — re-basing an edit on that snapshot would drop
  // whatever the person typed in between (the hazard onUndoRemove documents).
  const blocksRef = useRef(blocks)
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])
  // ⌥↑/⌥↓ from the caret (KAN-376, live verify): a structural move re-inserts
  // the moved block's own DOM node, blurring whatever editor was focused in
  // it, before this effect's own render commits — so the restore can only run
  // AFTER that DOM mutation lands, never synchronously inside `moveBlockAt`
  // itself (the node it would restore onto there is the one about to move).
  const pendingCaretFocusRef = useRef<{ id: string; selection: TextSelectionSnapshot } | null>(null)
  useLayoutEffect(() => {
    const pending = pendingCaretFocusRef.current
    if (!pending) return
    pendingCaretFocusRef.current = null
    restoreTextSelectionSoon(pending.id, pending.selection)
  }, [blocks])
  // G9: guards `applyTemplateInPlace` itself against a double ↵ — a ref, not
  // state, since the second pick can land mid-await, before a state update
  // guarding on a render would have committed.
  const applyInFlightRef = useRef(false)
  // G9: guards `makePage` against a double pick on the same `/` line — keyed
  // by the slash target's host, since two different lines making pages at
  // once is fine, only the same one twice (before `createPage` resolves) is
  // the double-submit.
  const makePageInFlightRef = useRef<Set<string>>(new Set())
  // G9: guards `moveBlockIntoNewPage` against a double pick on the same
  // block, keyed by the block's id — the same guard shape as
  // `makePageInFlightRef` above.
  const moveInFlightRef = useRef<Set<string>>(new Set())
  // Rule 2's fix (KAN-345): ids `markInserted` has minted THIS session, so a
  // fresh empty line autofocuses on mount while one that merely arrived with
  // the page never does — BlockCanvas is the one place that knows which ids
  // it inserted, so it keeps its own record rather than the (optional,
  // parent-owned) `insertedIds` prop, which a host may not pass at all. State,
  // not a ref: this file's own lint bans reading `.current` during render
  // (react-hooks/refs), and `renderBlockEditor` reads this set every render
  // to compute each block's `autofocus` prop.
  const [autofocusIds, setAutofocusIds] = useState<Set<string>>(() => new Set())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
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
    // The bare `/page` row is not a user template — its "untitled" is a stand-in
    // name, never meant to land in the title field (KAN-464). Blank it so the
    // opened page shows its placeholder instead of "untitledwhatever you type".
    makePageFromRow: (placement, target) =>
      void makePage(
        { ...instantiateTemplate(PREMADE_TEMPLATES.page), title: '' },
        placement,
        target
      ),
    makePageFromTemplate: (pick, target, index) => void makePageFromTemplate(pick, target, index),
    // Only `todo` (list/checklist) has no editor of its own to keep focus in
    // (KAN-355) — every other landed type keeps today's behaviour.
    onLanded: (landed) => {
      if (landed.type === 'todo') focusTodoItem(landed.id, 'start')
    },
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
  // Rule 3's fix (KAN-345): the pointer is over the trailing gap. Only read
  // when the last block is already an empty text line (`trailingLineIsEmptyText`
  // below) — that's the one case where the ghost text must paint on the real
  // line's own position instead of a second row drawn below it. `TrailingBlockGap`
  // clears this on `onMouseLeave`, which never fires if the gap unmounts or
  // hides while the pointer is over it — `trailingGapVisible` below gates the
  // paint and resets this flag for that case.
  const [trailingGapHovered, setTrailingGapHovered] = useState(false)
  // Every block's rect, by id, as of the last snapshot (KAN-440): `onDragOver`
  // classifies the hovered block's zone against THIS, never the live
  // `getBoundingClientRect()` — the live rect moves under the pointer as soon
  // as a beside preview resizes the row, which is the flicker this ticket
  // fixes. Snapshotted fresh on dragstart, and on scroll while a drag is live
  // (the listener below removes itself the moment it isn't).
  const dragRectsRef = useRef<Map<string, Rect>>(new Map())
  function snapshotDragRects() {
    const next = new Map<string, Rect>()
    for (const block of blocks) {
      const rect = document.getElementById(blockDomId(block.id))?.getBoundingClientRect()
      if (rect) next.set(block.id, rect)
    }
    dragRectsRef.current = next
  }
  // The zone currently shown for a live drag (KAN-440 hysteresis): held while the
  // pointer stays within that zone's own padded sub-rect of the snapshot (above),
  // so a preview-induced shift or a few px of jitter never reclassifies it. `null`
  // whenever no zone is shown (drag not started, or hovering the dragged block's
  // own origin). Reset alongside `dragRectsRef`'s re-snapshots, since a fresh
  // snapshot means the next dragover starts from nothing sticky.
  const stickyZoneRef = useRef<{ index: number; zone: DropZone } | null>(null)
  // The small copy that follows the pointer. Position is written on the node
  // itself so a dragover does not re-render the page.
  const dragFloatRef = useRef<HTMLDivElement>(null)
  const dragFloatPointRef = useRef<{ x: number; y: number } | null>(null)
  function placeDragFloat(x: number, y: number) {
    dragFloatPointRef.current = { x, y }
    const el = dragFloatRef.current
    if (!el) return
    el.style.left = `${x + 14}px`
    el.style.top = `${y + 16}px`
  }
  useLayoutEffect(() => {
    if (draggingIndex === null) return
    const point = dragFloatPointRef.current
    const el = dragFloatRef.current
    if (!point || !el) return
    el.style.left = `${point.x + 14}px`
    el.style.top = `${point.y + 16}px`
  }, [draggingIndex])
  useEffect(() => {
    if (draggingIndex === null) return
    window.addEventListener('scroll', snapshotDragRects, true)
    return () => window.removeEventListener('scroll', snapshotDragRects, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `snapshotDragRects` reads `blocks` fresh on every call; it doesn't need to be a dep for the listener to stay current.
  }, [draggingIndex])
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
  // Whether a text editor inside this canvas has focus (KAN-535) — gates both
  // hover ghosts (`hoverGhost` below, `TrailingBlockGap`'s own ghost row) so
  // hovering the trailing gap never draws a second hint beside a line that's
  // already showing its own via focus. `focusin`/`focusout` on the canvas
  // root, not each editor's own handler, since a line's ProseMirror instance
  // mounts and unmounts as lines are added/removed — this watches the one
  // DOM node that's always there instead of ones that come and go.
  const [editingText, setEditingText] = useState(false)
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const isEditorWithin = (node: EventTarget | null) => {
      const editor = node instanceof Element ? node.closest('.ProseMirror') : null
      return editor != null && el.contains(editor)
    }
    // Seeded once on attach: an editor can autofocus (`autofocus` prop below)
    // before this effect runs, and the first focus/focusout pair would
    // otherwise never fire to tell us about it.
    setEditingText(isEditorWithin(document.activeElement))
    const handleFocusIn = (e: FocusEvent) => setEditingText(isEditorWithin(e.target))
    // `relatedTarget` is the element GAINING focus — reading
    // `document.activeElement` here is unreliable, since on a plain blur
    // (focus going nowhere) it already reads `body` while this event is
    // still in flight.
    const handleFocusOut = (e: FocusEvent) => setEditingText(isEditorWithin(e.relatedTarget))
    el.addEventListener('focusin', handleFocusIn)
    el.addEventListener('focusout', handleFocusOut)
    return () => {
      el.removeEventListener('focusin', handleFocusIn)
      el.removeEventListener('focusout', handleFocusOut)
    }
  }, [])
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
  // `canvasRef` is collapsed (previewing, above). `position: fixed` keeps it
  // out of normal flow — in static position it made the document 1px taller
  // than the viewport, so End/PageDown and the composer's closed-tab offset
  // were both off by a pixel (KAN-366 conductor fix round).
  const dragImageRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = document.createElement('div')
    el.style.position = 'fixed'
    el.style.top = '-1px'
    el.style.left = '-1px'
    el.style.width = '1px'
    el.style.height = '1px'
    el.style.opacity = '0'
    el.style.pointerEvents = 'none'
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
    blocks.every((b, bi) => bi === index || isEmptyTextLine(b))
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

  /**
   * The board's `project` step (KAN-536) offers the shared tasks database's
   * existing `project` options, read off the SAME `['pages']` rows `databases`
   * derives from — no second fetch. `created_at` falls back to `updated_at`
   * only for a row a fixture built by hand without it; `pickTasksDatabase`'s
   * oldest-wins tie-break is the one reader that cares. Undefined (not `[]`)
   * while no role database exists yet, so the picker still opens, offering
   * only `new project — <title>`. `pickTasksDatabase` throws in development
   * on more than one role row (an impossible, restore-only state) — caught
   * here, not let through, so that state degrades to "no projects yet"
   * instead of crashing every canvas render.
   */
  const projects = useMemo(() => {
    try {
      const picked = pickTasksDatabase(
        pageRows.map((r) => ({
          id: r.id,
          props: r.props ?? {},
          created_at: r.created_at ?? r.updated_at,
        }))
      )
      if (!picked) return undefined
      const schema = readSchema(picked.props) ?? []
      const projectField = projectFieldOf(schema)
      return {
        options: (projectField?.options ?? []).map((o) => ({ id: o.id, label: o.label })),
        pageTitle: pageTitle || 'untitled',
      }
    } catch (err) {
      console.error(err)
      return undefined
    }
  }, [pageRows, pageTitle])

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
    { blockId: string; width: BlockWidth | number }[] | null
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
    // Rule 2's autofocus fact (KAN-345): `autofocusIds` otherwise outlives the
    // page it was minted on — `BlockCanvas` isn't keyed by page (see above), so
    // navigating away and back would re-autofocus (and re-show the hint on) a
    // line this session inserted on a DIFFERENT page.
    if (autofocusIds.size > 0) setAutofocusIds(new Set())
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
  // prop doc): BlockCanvas doesn't own it, it just records into it. Also marks
  // `autofocusIds`, BlockCanvas's own record, for rule 2's autofocus fact —
  // every insert path (trailing gap, between-row gap, `/` picks, Return)
  // already calls this one function, so it stays the one place a session
  // insert is recorded.
  function markInserted(id: string) {
    insertedIds?.add(id)
    setAutofocusIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
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

  // A page or database a block action made (a view's new database, a moved
  // block's new page) leaves with that action's ⌘Z and returns with ⇧⌘Z:
  // trashed, never deleted, so redo can find it in the change log again.
  const trashMadePage = async (id: string) => {
    try {
      await trashPage(getSupabase(), id)
    } catch (err) {
      console.error('Failed to trash the page this block action made', id, err)
    }
    queryClient.invalidateQueries({ queryKey: pagesKey() })
  }
  const restoreMadePage = async (id: string) => {
    try {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !pondId) return
      const [deleted] = await listRecords(supabase, {
        userId: user.id,
        pondId,
        targetPageId: id,
        action: 'delete',
        limit: 1,
      })
      if (deleted) await restorePage(supabase, deleted.id)
    } catch (err) {
      console.error('Failed to restore the page this block action made', id, err)
    }
    queryClient.invalidateQueries({ queryKey: pagesKey() })
  }

  /**
   * The engine under both "turn into › page" and the block menu's "move into
   * a new page": moves `moveIntoPagePrep`'s prepared copy of the block (ANY
   * type but a page-link, which has nothing to move) into a new CHILD page
   * (as `/page` does in `makePage`, above) and leaves a page-link row in its
   * place, swapped in by id rather than landed at a slash target — and with
   * NO navigation, since leaving the page would blow past the undo toast
   * before anyone could reach it. The swap writes through
   * `persistBlocksAsOwnEdit` with `onUndone`/`onRedone` (as the view's
   * made-database path does, above), so ⌘Z and the toast's undo are the
   * SAME step: either trashes the page it made (never just the blocks
   * record alone, which would leave an orphan in the rail), and ⇧⌘Z restores
   * it. Guarded against a second pick on the same block while the first is
   * still in flight (G9). `message` is the undo toast's copy: the menu's own
   * "move into a new page" row and "turn into › page" read differently, even
   * though they share this one engine.
   */
  const moveBlockIntoNewPage = async (index: number, message: string) => {
    const block = blocks[index]
    if (!block) return
    const prepared = moveIntoPagePrep(block, pageId)
    if (!prepared) return
    if (moveInFlightRef.current.has(block.id)) return
    moveInFlightRef.current.add(block.id)
    try {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const created = await createPage(supabase, user.id, {
        parentId: pageId,
        pondId,
        type: 'page',
        title: prepared.title,
        blocks: [prepared.block],
        props: stampNestedPage({}, pageId),
      })
      // The link takes the moved block's own width and its rowStart (which
      // `prepared.block` drops: it names a row on this page, not the new one),
      // so a ½ block moved out of a side-by-side row leaves a ½ link in its place.
      const pageLink: Block = {
        id: crypto.randomUUID(),
        type: 'page-link',
        pageId: created.id,
        ...(block.width !== undefined ? { width: block.width } : {}),
        ...(block.rowStart !== undefined ? { rowStart: block.rowStart } : {}),
      }
      insertPageOptimistic(
        queryClient,
        {
          id: created.id,
          parentId: pageId,
          type: created.type,
          title: created.title,
          props: created.props,
        },
        pondId
      )
      queryClient.invalidateQueries({ queryKey: pagesKey() })
      // ⌘Z and the toast's undo are the same step (KAN-368, as the view's
      // made-database path above): the handle `onStructuralWrite` reserves
      // here is what the toast calls through `sessionUndo.undoHandle`, so
      // either one trashes the made page (never `deletePage` — redo must be
      // able to bring it back) rather than leaving it orphaned in the rail.
      let handle: UndoHandle | undefined
      void persistBlocksAsOwnEdit(
        blocksRef.current.map((b) => (b.id === block.id ? pageLink : b)),
        {
          onUndoHandle: (next) => {
            handle = next
          },
          onUndone: () => trashMadePage(created.id),
          onRedone: () => restoreMadePage(created.id),
        }
      )
      stageUndo({
        message,
        scope: 'block',
        // With a write queue, `handle` is the step ⌘Z already takes — the
        // toast must run THAT, not a second revert, or ⌘Z and the toast
        // would race to undo the same move twice. A host with no queue
        // (Storybook, this canvas rendered bare) never reserves a handle,
        // so the toast stays its own undo, exactly as before.
        undo:
          onStructuralWrite && pondId
            ? () => {
                if (!handle) return
                return sessionUndo
                  .undoHandle(pondId, handle)
                  .then((result) => applyUndoOutcome('undo', result, queryClient))
              }
            : async () => {
                onChange(blocksRef.current.map((b) => (b.id === pageLink.id ? block : b)))
                try {
                  // Removes its own blocks too (parent_id cascade).
                  await deletePage(getSupabase(), created.id)
                } catch (err) {
                  console.error('Failed to remove the page after undo', err)
                }
                queryClient.invalidateQueries({ queryKey: pagesKey() })
              },
      })
    } catch (err) {
      console.error('Failed to move the block into a page', err)
      notify("Couldn't move the block into a page")
    } finally {
      moveInFlightRef.current.delete(block.id)
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
   * The width row's keep (6x) and an edge-drag release (KAN-441): the same
   * in-place-swap-by-id route, extended to take a free numeric width and to
   * run it through `handOffRowStartOnResize` — a shrink that just opened room
   * for the next block hands it `rowStart` so the row stays as it was (the
   * rowStart contract, SPEC.md). The undo toast restores the block's previous
   * width (absent means `full`) AND, when this write handed off `rowStart`,
   * clears it from whichever block inherited it — one undo step for both.
   * Pond binds no ⌘Z anywhere — inside a focused text block that key reaches
   * the editor instead — so the toast is the undo the board's "click to keep,
   * with undo" has here.
   */
  const setBlockWidth = (before: Block, width: BlockWidth | number) => {
    const index = blocks.findIndex((b) => b.id === before.id)
    if (index === -1) return
    const after = handOffRowStartOnResize(blocks, index, width)
    const nextBlock = blocks[index + 1]
    const handedRowStartToId =
      nextBlock && nextBlock.rowStart !== true && after[index + 1]?.rowStart === true
        ? nextBlock.id
        : null
    // On the page's queue this is its own undo step (KAN-368). A host with no
    // queue keeps the width toast.
    if (onStructuralWrite) {
      commitStructuralBlocks(after)
      return
    }
    onChange(after)
    stageUndo({
      message: 'Set the block width',
      scope: 'block',
      undo: () =>
        onChange(
          blocksRef.current.map((b) => {
            if (b.id === before.id) return before
            if (handedRowStartToId && b.id === handedRowStartToId) return withoutRowStart(b)
            return b
          })
        ),
    })
  }

  /**
   * A shared-edge drag's release (KAN-505): the same in-place-swap-by-id
   * route as `setBlockWidth`, but for both row-mates at once — their pair
   * sum never changes, so no `rowStart` handoff is possible (a shared-edge
   * resize never changes which blocks share a row, unlike an outer-edge
   * shrink). One write, one undo step; the fallback toast's undo restores
   * BOTH blocks' previous widths together.
   */
  const setRowWidths = (
    leftBefore: Block,
    rightBefore: Block,
    leftWidth: BlockWidth | number,
    rightWidth: BlockWidth | number
  ) => {
    const after = blocks.map((b) => {
      if (b.id === leftBefore.id) return { ...b, width: leftWidth }
      if (b.id === rightBefore.id) return { ...b, width: rightWidth }
      return b
    })
    if (onStructuralWrite) {
      commitStructuralBlocks(after)
      return
    }
    onChange(after)
    stageUndo({
      message: 'Set the row widths',
      scope: 'block',
      undo: () =>
        onChange(
          blocksRef.current.map((b) => {
            if (b.id === leftBefore.id) return leftBefore
            if (b.id === rightBefore.id) return rightBefore
            return b
          })
        ),
    })
  }

  /**
   * One edge-drag, or one "fit height": the same in-place swap as
   * `setBlockWidth`, so the undo toast restores the block's previous height
   * (absent means fit). A drag previews locally and calls this once, on release.
   */
  const setBlockHeight = (before: Block, after: Block) => {
    if ((before.height ?? null) === (after.height ?? null)) return
    onChange(blocks.map((b) => (b.id === before.id ? after : b)))
    stageUndo({
      message: after.height == null ? 'Fit the block height' : 'Set the block height',
      scope: 'block',
      undo: () => onChange(blocksRef.current.map((b) => (b.id === before.id ? before : b))),
    })
  }

  /**
   * An alone-on-line edge drag (KAN-441), now shared with a row's own outer
   * edges (KAN-505): a ref, not state, for the live pointer math —
   * `resizeAlone`'s own hysteresis (`lockedPercent`) threads call to call,
   * and a drag fires many moves per gesture that only need to update the
   * rendered preview, not re-run an effect. `edgePreview` is that preview:
   * the live percent, lock state and dragged `side` for whichever block
   * (`id`) is mid-drag, read by the sizing div below to override its
   * width and by the handle's readout chip. `side` is kept so only the strip
   * actually grabbed lights its pill — a mirrored block's other edge stays
   * unlit even though the same `id` is mid-drag. `maxPercent` is `100` for
   * an alone block and `100 - sum(the row's other members)` for a row's
   * outer edge, so growing it can never push the row's total past 100 and
   * split it — the row's own other members never move. `null` off a drag.
   * The dragged block's `id`, not its `blocks` index, is what the ref holds —
   * the index is resolved fresh at move/release time, so a concurrent
   * `blocks` change mid-drag (another tab's edit landing, an accepted diff)
   * can't leave this drag writing to whatever block now sits at a stale index.
   */
  const edgeDragRef = useRef<{
    pointerId: number
    id: string
    side: 'left' | 'right'
    startClientX: number
    startPercent: number
    lockedPercent: number | null
    livePercent: number
    maxPercent: number
  } | null>(null)
  const [edgePreview, setEdgePreview] = useState<{
    id: string
    percent: number
    locked: boolean
    side: 'left' | 'right'
  } | null>(null)

  /**
   * A shared-edge drag (KAN-505): the same ref-for-live-math, state-for-render
   * shape as `edgeDragRef`/`edgePreview` above, but for the pair at once —
   * `resizeSharedEdge`'s own hysteresis threads through `lockedPercent` the
   * same way, and `locked` is kept on the ref too (not just read off each
   * move's return) so release can commit the named widths without redoing
   * the snap math. `leftId`/`rightId` are the pair's own `blocks` ids, not
   * indices — resolved to indices only at release, so a concurrent `blocks`
   * change mid-drag can't write the wrong pair (same reasoning as
   * `edgeDragRef`'s own `id` above).
   */
  const sharedEdgeDragRef = useRef<{
    pointerId: number
    leftId: string
    rightId: string
    startClientX: number
    startLeftPercent: number
    pairSumPercent: number
    lockedPercent: number | null
    liveLeft: number
    liveRight: number
    locked: boolean
  } | null>(null)
  const [sharedEdgePreview, setSharedEdgePreview] = useState<{
    leftId: string
    rightId: string
    leftPercent: number
    rightPercent: number
    locked: boolean
  } | null>(null)
  const [edgeDragActive, setEdgeDragActive] = useState(false)

  // Esc cancels with no write, and the whole gesture shows the resize cursor
  // even where the pointer leaves the 8px strip (pointer capture keeps the
  // move/up events, not the OS cursor) — both acquired and released in this
  // one effect, which also covers an unmount mid-drag for free. Shared with
  // the shared-edge drag below: only one of the two refs is ever armed at a
  // time (each pointer-down refuses to start while the other is active).
  useEffect(() => {
    if (!edgeDragActive) return
    function handleEdgeResizeKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      edgeDragRef.current = null
      setEdgePreview(null)
      sharedEdgeDragRef.current = null
      setSharedEdgePreview(null)
      setEdgeDragActive(false)
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ew-resize'
    document.addEventListener('keydown', handleEdgeResizeKeyDown)
    return () => {
      document.removeEventListener('keydown', handleEdgeResizeKeyDown)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
  }, [edgeDragActive])

  function handleEdgeResizePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    id: string,
    side: 'left' | 'right',
    maxPercent = 100
  ) {
    if (edgeDragRef.current) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture can fail for an already-released pointer; the drag still works while over the strip */
    }
    const block = blocks.find((b) => b.id === id)
    // The drawn width, not the stored one: a width that stacks is drawn full,
    // and the drag must begin from what the person sees.
    const startPercent = drawnWidthPercent(columnWidth, block?.width)
    edgeDragRef.current = {
      pointerId: e.pointerId,
      id,
      side,
      startClientX: e.clientX,
      startPercent,
      lockedPercent: null,
      livePercent: startPercent,
      maxPercent,
    }
    setEdgePreview({ id, percent: startPercent, locked: false, side })
    setEdgeDragActive(true)
  }

  function handleEdgeResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const st = edgeDragRef.current
    if (!st || e.pointerId !== st.pointerId) return
    const deltaPx = st.side === 'right' ? e.clientX - st.startClientX : st.startClientX - e.clientX
    const { percent, locked } = resizeAlone(
      columnWidth,
      st.startPercent,
      deltaPx,
      st.lockedPercent,
      st.maxPercent
    )
    st.lockedPercent = locked ? percent : null
    st.livePercent = percent
    setEdgePreview({ id: st.id, percent, locked, side: st.side })
  }

  function handleEdgeResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const st = edgeDragRef.current
    if (!st || e.pointerId !== st.pointerId) return
    edgeDragRef.current = null
    setEdgePreview(null)
    setEdgeDragActive(false)
    // Resolved by id, now, not the index read at press: a concurrent `blocks`
    // change mid-drag can't make this write land on the wrong block.
    const before = blocks.find((b) => b.id === st.id)
    if (!before) return
    // Locked commits the named width (KEY_WIDTHS is the one home for the
    // glyph→named mapping), not the number its position happens to round to —
    // snapping to ½ must keep reading as '1/2' in the width row, not "custom".
    const lockedKey =
      st.lockedPercent !== null ? KEY_WIDTHS.find((k) => k.percent === st.lockedPercent) : undefined
    const committed: BlockWidth | number = lockedKey
      ? lockedKey.width
      : roundFreePercent(st.livePercent, columnWidth)
    // Unchanged from the stored width, or from the drawn start (a stacked
    // block's press-and-release commits 'full' against a stored '1/3'): no write.
    const unchanged =
      widthTenths(committed) === widthTenths(before.width) ||
      widthTenths(committed) === widthTenths(st.startPercent)
    if (unchanged) return
    setBlockWidth(before, committed)
  }

  function handleEdgeResizePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    const st = edgeDragRef.current
    if (!st || e.pointerId !== st.pointerId) return
    edgeDragRef.current = null
    setEdgePreview(null)
    setEdgeDragActive(false)
  }

  function handleSharedEdgeResizePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    leftId: string,
    rightId: string
  ) {
    if (edgeDragRef.current || sharedEdgeDragRef.current) return
    const leftBlock = blocks.find((b) => b.id === leftId)
    const rightBlock = blocks.find((b) => b.id === rightId)
    if (!leftBlock || !rightBlock) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture can fail for an already-released pointer; the drag still works while over the strip */
    }
    // The row already holds both members side by side (a shared strip only
    // mounts when `!stacks`), so each one's drawn percent IS its stored
    // percent — unlike `handleEdgeResizePointerDown`'s `drawnWidthPercent`,
    // which exists only for a lone block stacked past the floor.
    const startLeftPercent = widthPercent(leftBlock.width)
    const pairSumPercent = startLeftPercent + widthPercent(rightBlock.width)
    sharedEdgeDragRef.current = {
      pointerId: e.pointerId,
      leftId,
      rightId,
      startClientX: e.clientX,
      startLeftPercent,
      pairSumPercent,
      lockedPercent: null,
      liveLeft: startLeftPercent,
      liveRight: pairSumPercent - startLeftPercent,
      locked: false,
    }
    setSharedEdgePreview({
      leftId,
      rightId,
      leftPercent: startLeftPercent,
      rightPercent: pairSumPercent - startLeftPercent,
      locked: false,
    })
    setEdgeDragActive(true)
  }

  function handleSharedEdgeResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const st = sharedEdgeDragRef.current
    if (!st || e.pointerId !== st.pointerId) return
    const deltaPx = e.clientX - st.startClientX
    const { left, right, locked } = resizeSharedEdge(
      columnWidth,
      st.startLeftPercent,
      st.pairSumPercent,
      deltaPx,
      st.lockedPercent
    )
    st.lockedPercent = locked ? left : null
    st.liveLeft = left
    st.liveRight = right
    st.locked = locked
    setSharedEdgePreview({
      leftId: st.leftId,
      rightId: st.rightId,
      leftPercent: left,
      rightPercent: right,
      locked,
    })
  }

  function handleSharedEdgeResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const st = sharedEdgeDragRef.current
    if (!st || e.pointerId !== st.pointerId) return
    sharedEdgeDragRef.current = null
    setSharedEdgePreview(null)
    setEdgeDragActive(false)
    // Resolved by id, now, not the indices read at press — see `edgeDragRef`'s
    // own `id` field above for why.
    const leftBefore = blocks.find((b) => b.id === st.leftId)
    const rightBefore = blocks.find((b) => b.id === st.rightId)
    if (!leftBefore || !rightBefore) return
    const committed = commitSharedEdgeWidths(columnWidth, st.pairSumPercent, {
      left: st.liveLeft,
      right: st.liveRight,
      locked: st.locked,
    })
    // Unchanged from the stored widths: no write (mirrors `handleEdgeResizePointerUp`'s own check).
    const unchanged =
      widthTenths(committed.left) === widthTenths(leftBefore.width) &&
      widthTenths(committed.right) === widthTenths(rightBefore.width)
    if (unchanged) return
    setRowWidths(leftBefore, rightBefore, committed.left, committed.right)
  }

  function handleSharedEdgeResizePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    const st = sharedEdgeDragRef.current
    if (!st || e.pointerId !== st.pointerId) return
    sharedEdgeDragRef.current = null
    setSharedEdgePreview(null)
    setEdgeDragActive(false)
  }

  /** The handle's readout chip (KAN-441): the key glyph while snapped, a free percent otherwise. */
  function edgeResizeReadout(percent: number, locked: boolean): string {
    const key = locked ? KEY_WIDTHS.find((k) => k.percent === percent) : undefined
    return key ? key.label : `${Math.round(percent)}%`
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

  // The block menu's `move to…` row (KAN-479 slice 1): asks `ShellCommands`
  // to open its one palette in block-pick mode.
  const onMoveTo = (block: Block) => {
    requestBlockMovePick({
      blockId: block.id,
      sourcePageId: pageId,
      label: blockFrame(block)?.heading ?? block.type,
    })
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
        if (conversion.target === 'page') {
          void moveBlockIntoNewPage(index, TURNED_INTO.page)
          return
        }
        convertBlock(block, conversion)
      },
      'move-into-new-page': () => void moveBlockIntoNewPage(index, MOVED_INTO_A_NEW_PAGE),
      'move-to': ({ block: moved }) => onMoveTo(moved),
      'copy-link': () => void copyBlockLink(block.id),
      delete: () => requestDelete(index),
      'set-width': ({ width }) => setBlockWidth(block, width),
      'fit-height': () => setBlockHeight(block, blockWithoutHeight(block)),
    })
  }

  function setBlockAt(index: number, next: Block) {
    onChange(blocks.map((b, i) => (i === index ? next : b)))
  }

  // Deleting, moving, or inserting is its own undo step the instant it
  // happens (KAN-368), on the page's write queue (KAN-495). `rowStart` is
  // already decided by the caller — this only chooses the write path. A host
  // with no queue (Storybook) falls back to the debounced save.
  function commitStructuralBlocks(
    next: Block[],
    opts?: {
      onUndone?: () => Promise<void> | void
      onRedone?: () => Promise<void> | void
      onUndoHandle?: (handle: UndoHandle) => void
    }
  ) {
    blocksRef.current = next
    if (onStructuralWrite) {
      void onStructuralWrite(next, opts)
      return
    }
    onChange(next)
  }

  /**
   * KAN-243 fix: `SavedViewBar`'s undo writes through THIS, never a plain
   * `onChange(blocks.map(...))` closed over an index — that closure (as
   * `renderBlockEditor`'s `(next) => setBlockAt(i, next)` is, below) spreads
   * `next` over whatever `blocks` THAT RENDER saw, so a toast staged earlier and
   * fired later would silently drop an edit made to another block in between
   * (and, after a reorder, could even land on the wrong block by index).
   * `blocksRef.current` is always the latest list, and matching by id rather
   * than index survives a reorder too.
   */
  const writeBlock = useCallback(
    (next: ViewBlock) =>
      onChange(
        blocksRef.current.map((b) =>
          b.id === next.id ? { ...next, activeViewId: (b as ViewBlock).activeViewId } : b
        )
      ),
    [onChange]
  )

  function requestDelete(index: number) {
    const block = blocks[index]
    if (!block) return
    if (blockHoldsContent(block)) {
      setPendingDeleteId(block.id)
      return
    }
    removeBlockAt(index)
  }

  function confirmDelete() {
    const id = pendingDeleteId
    if (!id) return
    const index = blocks.findIndex((block) => block.id === id)
    setPendingDeleteId(null)
    if (index !== -1) removeBlockAt(index)
  }

  function removeBlockAt(index: number, focusNeighbour = true) {
    const removed = blocks[index]
    if (!removed) return
    const { blocks: after } = detachKeepingRows(blocks, index)
    // The ONE structural entry point (KAN-495): `onStructuralWrite` updates
    // the caller's local state AND enqueues this delete as its own structural
    // op, so no second (typed) write of `after` ever queues up behind it.
    // The toast's undo is that same step (KAN-368): `undoHandle` refuses to
    // act once a later ⌘Z has moved it off the top.
    let handle: UndoHandle | undefined
    commitStructuralBlocks(after, {
      onUndoHandle: (next) => {
        handle = next
      },
    })
    if (focusNeighbour) focusBlockNeighbour(blocks, index)
    stageUndo({
      message: `deleted ${changeBlockName(removed)} ·`,
      undoLabel: 'undo',
      scope: 'block',
      undo: () => {
        if (!pondId || !handle) return
        return sessionUndo
          .undoHandle(pondId, handle)
          .then((result) => applyUndoOutcome('undo', result, queryClient))
      },
    })
  }

  /**
   * Backspace in an empty text block takes the line away and leaves focus on the
   * block before it, at the end of its text — or, when it was the first block,
   * at the end of the title (KAN-369). An unlabelled empty line holds nothing
   * to undo, so removing it is not a deletion; the page's only block stays,
   * and Backspace there still returns focus to the title.
   */
  function removeEmptyLineAt(index: number) {
    const line = blocks[index]
    const neighbour = blocks[index - 1] ?? blocks[index + 1]
    if (!line) return
    if (index === 0) {
      if (neighbour && line.type === 'text' && !line.label) {
        commitStructuralBlocks(detachKeepingRows(blocks, index).blocks)
      } else if (neighbour) {
        // Not `requestDelete`: it defaults `focusNeighbour` to true, and
        // `focusBlockNeighbour`'s own `setTimeout(0)` would steal focus from
        // the title a tick after this. An empty block never holds content
        // (`blockHoldsContent`), so this never needed the confirm dialog
        // `requestDelete` would open for a block that does.
        removeBlockAt(index, false)
      }
      focusPageTitle('end')
      return
    }
    if (!neighbour) return
    if (line.type === 'text' && !line.label) {
      // Via `detachKeepingRows` (KAN-440): an empty line can carry `rowStart`
      // the same as any other block, so taking it out must hand that off to
      // its row-mate the same way a real delete does, or the row-mate silently
      // re-packs beside whatever came before.
      commitStructuralBlocks(detachKeepingRows(blocks, index).blocks)
      focusBlockNeighbour(blocks, index)
    } else {
      requestDelete(index)
    }
  }

  // Focus left the block. Only an unlabelled empty text line goes with it
  // (KAN-558), the same way Backspace takes it: nothing to undo. Every other
  // block — a checklist, a table, a toc — is a deliberate structure and
  // stays until the person deletes it themselves. The page's only block
  // stays too. Focus is already where they went.
  function removeEmptyOnExit(id: string) {
    const current = blocksRef.current
    if (current.length < 2) return
    const index = current.findIndex((block) => block.id === id)
    const block = current[index]
    if (!block || !removedOnExit(block)) return
    commitStructuralBlocks(detachKeepingRows(current, index).blocks)
  }

  // A row is never split by landing a new block between its members (KAN-506):
  // when `base[atIndex]` is stored as part of a multi-member row, the insert
  // point redirects to just before the row's first member ('above') or just
  // after its last ('below') — the one home both `insertLineAfter` branches
  // read, so neither can redirect past the row's own edge differently from
  // the other. `rowStart` is never set on the redirected block: it is always
  // full width, and a full-width block already overflows any row ahead of it
  // by itself (`layoutRows`'s own `used + width > 1000` check), so `rowStart`
  // would only ever repeat what the width already forces.
  function rowRedirectedIndex(
    base: Block[],
    atIndex: number,
    where: 'above' | 'below'
  ): { insertAt: number; inRow: boolean } {
    const row = layoutRows(base).find((member) =>
      member.some((block) => block.id === base[atIndex].id)
    )
    if (!row || row.length < 2)
      return { insertAt: where === 'above' ? atIndex : atIndex + 1, inRow: false }
    const insertAt =
      where === 'above'
        ? base.findIndex((b) => b.id === row[0].id)
        : base.findIndex((b) => b.id === row[row.length - 1].id) + 1
    return { insertAt, inRow: true }
  }

  // Return on a focused block opens an empty text block after it; its editor
  // opens with the caret in it, ready for `/`. An optional `patch` replaces the
  // block at `index` in the SAME call (KAN-344's checklist: the empty item that
  // triggered this must be gone in the array this inserts into, not left for a
  // second `onChange` that would rebuild from the pre-patch `blocks` and drop it).
  // `content` seeds the new block's text (KAN-506's split on Enter). `where` is
  // explicit, never inferred from `patch`/`content`'s shapes (KAN-506 fix: that
  // inference also mis-fired for a side-by-side row's own `'above'` case): Enter
  // at the START of a non-empty block, and Enter on an empty FIRST list item,
  // both land `'above'` — the empty block goes there instead of after.
  function insertLineAfter(
    index: number,
    patch?: Block,
    content = '',
    where: 'above' | 'below' = 'below'
  ) {
    const nb = emptyBlockForType('text')
    if (!nb) return
    const base = patch ? blocks.map((b, i) => (i === index ? patch : b)) : blocks
    const { insertAt, inRow } = rowRedirectedIndex(base, index, where)
    const nbPlaced = { ...nb, content, ...(inRow ? { width: 'full' as BlockWidth } : {}) }

    if (where === 'above') {
      commitStructuralBlocks([...base.slice(0, insertAt), nbPlaced, ...base.slice(insertAt)])
      // `patch` only exists here when the caret's own line was removed (the
      // empty FIRST list item case, "- \n- two": the list block keeps its id
      // but loses that item) — its editor's content just moved out from under
      // it, so focus has to move to the fresh empty block instead of staying.
      if (patch) {
        markInserted(nbPlaced.id)
        focusTextBlockSoon(nbPlaced.id, 'start')
      }
      return
    }

    markInserted(nbPlaced.id)
    commitStructuralBlocks([...base.slice(0, insertAt), nbPlaced, ...base.slice(insertAt)])
    if (content) focusTextBlockSoon(nbPlaced.id, 'start')
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
    const side = sideTowardFreeSpace(
      caret,
      bound,
      sourcePickerHeight(databases, window.innerHeight)
    )
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
    if (pick.kind === 'tasks') {
      // One shared tasks database per pond (KAN-536) — never a database of this
      // page's own. `getOrCreateTasksDatabase` always finds or makes it; a new
      // `project` option is written as its own `edit_schema` change-log record
      // (one `/board` gesture, two writes) rather than through `createDatabase`,
      // which mints a fresh collection every time. Undo removes the inserted
      // block only — the shared database, and the option, are never trashed.
      try {
        const supabase = getSupabase()
        const { id: tasksId, schema } = await getOrCreateTasksDatabase(supabase, pondId)
        // `projectFieldOf` (not a bare name match): a `project` field retyped to
        // `text` cannot hold an option, so it is impossible here, never a path
        // to an unfiltered board (KAN-536) — `getOrCreateTasksDatabase` already
        // guarantees a real one.
        const projectField = projectFieldOf(schema)
        if (!projectField) throw new Error('The tasks database has no project field')
        let optionId = pick.project.id ?? null
        let finalSchema = schema
        if (!optionId) {
          // Never add a blank option (KAN-536): the picker already carries the
          // trimmed label (`newProjectLabel`), and the host refuses one too
          // rather than trust the picker alone.
          const label = pick.project.label.trim()
          if (!label) throw new Error('A project needs a name')
          const minted = addOption(schema, projectField.id, label)
          optionId = minted.optionId
          if (!optionId) throw new Error('Could not add the project option')
          finalSchema = minted.schema
          await defineSchema(supabase, tasksId, minted.schema)
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (user) {
            try {
              await appendOwnEdit(supabase, {
                userId: user.id,
                pondId,
                action: 'edit_schema',
                targetPageId: tasksId,
                before: schema,
                after: minted.schema,
              })
              queryClient.invalidateQueries({ queryKey: changeLogKey() })
            } catch (err) {
              console.error('[change-log] schema edit not logged', tasksId, err)
            }
          }
        }
        // `defineSchema` (here, and inside `getOrCreateTasksDatabase` re-adding a
        // missing `project` field) writes straight to Supabase and never touches
        // the `['page', tasksId]` cache the view reads its schema from — a second
        // board made within the app-wide 30s staleTime would otherwise mount
        // against the schema as it stood before this pick's write (KAN-536).
        queryClient.setQueryData<PondPage | null>(['page', tasksId], (prev) =>
          prev ? { ...prev, props: withSchema(prev.props, finalSchema) } : prev
        )
        const statusField = finalSchema.find((f) => f.type === 'status')
        const view: ViewBlock = {
          id: crypto.randomUUID(),
          type: 'view',
          mode: 'board',
          collectionId: tasksId,
          ...(statusField ? { groupBy: statusField.id } : {}),
          ...(optionId ? { filter: { property: projectField.id, op: 'eq', value: optionId } } : {}),
        }
        const landing = placeView(view, open.target)
        queryClient.invalidateQueries({ queryKey: pagesKey() })
        void persistBlocksAsOwnEdit(landing.next)
      } catch (err) {
        console.error('Failed to make the tasks board', err)
        notify("Couldn't make the tasks board")
      }
      return
    }
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
      const landing = placeView(view, open.target)
      void persistBlocksAsOwnEdit(landing.next)
      return
    }
    try {
      const made = await createDatabase(
        getSupabase(),
        {
          title: pick.title,
          // A picked field's `options` (a board's default `status` lanes, or any
          // status/select the person added in the picker) carry no ids yet — the
          // picker never writes a database, only the host minting one here does.
          schema: pick.fields.map((f) => ({
            id: crypto.randomUUID(),
            name: f.name,
            type: f.type,
            ...(f.options
              ? { options: f.options.map((o) => ({ id: crypto.randomUUID(), label: o.label })) }
              : {}),
          })),
          mode: pick.mode,
          chart,
          pondId,
        },
        () => crypto.randomUUID()
      )
      const landing = placeView(made.view, open.target)
      queryClient.invalidateQueries({ queryKey: pagesKey() })
      queryClient.invalidateQueries({ queryKey: ['record-counts', pondId] })
      void persistBlocksAsOwnEdit(landing.next, {
        onUndone: () => trashMadePage(made.databaseId),
        onRedone: () => restoreMadePage(made.databaseId),
      })
    } catch (err) {
      console.error('Failed to make the database', err)
      notify("Couldn't make the database")
    }
  }

  // The page a `/` pick makes, under this page or beside it, through the seams the
  // AI's create_page path uses (`instantiateTemplate`). A person's own template is
  // copied with its content and stamped once with where it came from.
  //
  // `child` (the `/ nested page` row and `makePageFromTemplate`'s child path alike —
  // both read as "does the same with nothing to move" under KAN-122's board) swaps
  // the `/` line for a page-link block at the same index; the made page is stamped
  // nested-under-this-page once, read later by the rail's `new` row note and the
  // link row's own chip. Both placements then open the made page with the caret
  // in its title (KAN-464, superseding KAN-122's "stays on the parent" for `child`).
  // Read against the blocks as they are then, since the awaits below outlive any
  // snapshot. A failure leaves the `/` line. Returns whether the page actually got
  // made — KAN-138's nested-page apply path needs this to know its write landed
  // before retiring "just saved".
  const makePage = async (
    source: NewPage | null,
    placement: 'sibling' | 'child',
    target: SlashTarget
  ): Promise<boolean> => {
    if (!source) return false
    // G9: a second pick on the same `/` line while `createPage` below is still
    // in flight is a no-op — two different lines each making a page is fine.
    if (makePageInFlightRef.current.has(target.hostId)) return false
    makePageInFlightRef.current.add(target.hostId)
    try {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return false
      const parentId =
        placement === 'child' ? pageId : ((await getPage(supabase, pageId))?.parentId ?? null)
      const props =
        placement === 'child' ? stampNestedPage(source.props ?? {}, pageId) : source.props
      const created = await createPage(supabase, user.id, {
        parentId,
        type: 'page',
        title: source.title,
        blocks: source.blocks,
        ...(props ? { props } : {}),
        pondId,
      })
      if (source.schema) await defineSchema(supabase, created.id, source.schema)
      const pageLinkBlock: Block | null =
        placement === 'child'
          ? { id: crypto.randomUUID(), type: 'page-link', pageId: created.id }
          : null
      const landing = landAtSlash(blocksRef.current, target, pageLinkBlock)
      if (landing) onChange(landing.next)
      insertPageOptimistic(
        queryClient,
        {
          id: created.id,
          parentId,
          type: created.type,
          title: created.title,
          props,
        },
        pondId
      )
      void queryClient.invalidateQueries({ queryKey: pagesKey() })
      // KAN-464 (superseding KAN-122's "stays on the parent" for `child`):
      // every new-page path opens the made page with the caret in its
      // title, `/page`/`/nested page` included — the link above is still
      // left in the parent either way.
      requestTitleFocus(created.id)
      pageLinks.navigateToPage({
        id: created.id,
        title: created.title,
        type: created.type,
        isNew: false,
      })
      return true
    } catch (err) {
      console.error('Failed to make the page', err)
      return false
    } finally {
      makePageInFlightRef.current.delete(target.hostId)
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
  // Apply is one undo step (KAN-93): the blocks write goes through
  // `onStructuralWrite` (the page's one write queue, KAN-495), so it lands as
  // a single structural op — NOT the ordinary debounced save, which would
  // enqueue its own second op for the same change.
  const applyTemplateInPlace = async (pick: TemplatePick) => {
    // G9: a second ↵ before this one finishes must not re-run the write — guard
    // the function itself (not menu-close timing, which races the same awaits).
    if (applyInFlightRef.current) return
    applyInFlightRef.current = true
    try {
      await applyTemplateInPlaceUnguarded(pick)
    } finally {
      applyInFlightRef.current = false
    }
  }

  /**
   * Writes `after` directly — bypassing the debounced save — through the
   * caller's ONE structural entry point (KAN-93's template-apply pattern,
   * shared here with drag-drop's commits, KAN-247, so neither grows a second
   * write path). `onStructuralWrite`'s queue reads its own `before` from
   * `head()` at apply time. A host with no queue (Storybook) falls back to
   * plain `onChange`.
   */
  const persistBlocksAsOwnEdit = async (
    after: Block[],
    opts?: {
      discardOnFailure?: boolean
      onUndone?: () => Promise<void> | void
      onRedone?: () => Promise<void> | void
      onUndoHandle?: (handle: UndoHandle) => void
    }
  ): Promise<boolean> => {
    blocksRef.current = after
    if (onStructuralWrite) return onStructuralWrite(after, opts)
    onChange(after)
    return true
  }

  const applyTemplateInPlaceUnguarded = async (pick: TemplatePick) => {
    previewTokenRef.current++
    const applyPick = await applyPickFor(pick)
    // Clear whether this resolves (a normal apply) or not (AUDIT G2: the
    // template was deleted mid-preview) — the outline must never survive its
    // own apply, applied or not.
    setPreviewing(null)
    onPreviewNameChange?.(null)
    if (!applyPick) return
    const applied = applyTemplate(applyPick)
    // A fast `/` + pick can still have the slash keystroke's own debounced save
    // pending in `use-page-draft.ts` — `persistBlocksAsOwnEdit` flushes it
    // before writing, so the slash save can't land after us with a stale
    // baseline and double-log this same apply. Shared with drag-drop's
    // commits (KAN-247), so this is the only direct-write path.
    const supabase = getSupabase()
    // Rule 2's autofocus fact (KAN-345): these blocks are session inserts too —
    // without this, none of the applied template's unwritten lines would ever
    // take the caret, since `markInserted` is the only thing that puts an id in
    // `autofocusIds`. Marked BEFORE the write below, not after: the structural
    // write sets these blocks locally ahead of its queued save, so marking them
    // after would let the real editors mount — and read `autofocus` once, at
    // mount — before this ever ran. A failed write discards the blocks, so
    // stale ids left in the set are harmless.
    for (const block of applied.blocks) markInserted(block.id)
    if (!(await persistBlocksAsOwnEdit(applied.blocks, { discardOnFailure: true }))) return
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
    // `onStructuralWrite`/`onChange` already ran inside `persistBlocksAsOwnEdit`,
    // ahead of the schema/props writes above — this apply's own blocks are
    // already the caller's baseline by the time those (independent) writes land.
    // The caret belongs in the template's first line, not the title (KAN-499) —
    // `focusTextBlockSoon` for text, else `focusBlockFieldSoon` for a non-text
    // block (the frame itself only takes a tabIndex, not typed keys — a
    // `list` template's lone todo item needs its own input). The props write
    // just above is awaited, so a person who has already moved the caret while it
    // focusing, not before the await, since that's the only moment that
    // matters. No "already inside the first block" exemption: `focusTextBlock`
    // (`src/lib/modules/text/focus.ts`) calls `editor.commands.focus('start')`,
    // which resets the selection even on an editor that already has focus, so
    // a person who typed into the (mount-autofocused) first line while this
    // was in flight would otherwise have their own caret position overwritten.
    // An unwritten first line's mount-time autofocus has already run by now,
    // so `document.body` still holding focus means nobody has touched the
    // page at all — the only case this call needs to cover.
    const first = applied.blocks[0]
    const activeElement = document.activeElement
    const caretMovedElsewhere = activeElement !== null && activeElement !== document.body
    // `templateBlocksFrom` can strip every block (a `yours` template that is
    // only a page-link, never carried) — there is no first line to land in, so
    // fall back to the title, the safest state (AGENTS.md, crash early).
    if (!first) {
      if (!caretMovedElsewhere) focusPageTitle()
      return
    }
    if (caretMovedElsewhere) return
    if (first.type === 'text') {
      focusTextBlockSoon(first.id, 'start')
      return
    }
    focusBlockFieldSoon(first.id)
  }

  const makePageFromTemplate = async (pick: TemplatePick, target: SlashTarget, index: number) => {
    // A `/` line has text around it, so the page is not blank — same guard
    // the menu's own `leadWithTemplates` uses (`slash.line ? false : blank`).
    if (isBlankBesides(index) && !target.line) {
      await applyTemplateInPlace(pick)
      return
    }
    const made = await makePage(await newPageFromPick(pick), 'child', target)
    // KAN-138: the nested-page apply path retires `yours · just saved` too —
    // but only once the page actually got made; a failed apply keeps the lead.
    if (made && pick.origin === 'yours' && pondId) justSaved.clear(pondId, pick.id)
  }

  // The trailing gap's add (UI-audit Slice 2a): drop an empty text block at
  // the end, ready to type. The new block's own editor auto-focuses on mount
  // (its content is "unwritten", `editor.tsx`'s `autofocus` rule) — nothing
  // here focuses it.
  function addTextBlock() {
    const nb = emptyBlockForType('text')
    if (!nb) return
    markInserted(nb.id)
    onChange([...blocks, nb])
  }

  // KAN-369: Return/↓ leaving the title lands on the page's first block — its
  // own start when that block is already text, or a fresh empty line above
  // whatever it is otherwise (a card gets a line to type above it, never
  // text forced into its own fields). The fresh line's autofocus-on-mount
  // (rule 2, `markInserted`) is what actually puts the caret there.
  function enterFromTitle() {
    if (blocks[0]?.type === 'text') {
      focusTextBlockSoon(blocks[0].id, 'start')
      return
    }
    const nb = emptyBlockForType('text')
    if (!nb) return
    markInserted(nb.id)
    onChange([nb, ...blocks])
  }

  useEffect(() => {
    if (!titleExitRef) return
    titleExitRef.current = enterFromTitle
    return () => {
      titleExitRef.current = null
    }
  })

  // Rule 3's trailing gap (KAN-345): `focusEmptyLineOrInsert`'s shared G9 guard
  // — a fresh block's autofocus (above) covers the add branch; only the
  // already-empty branch needs a manual focus.
  function handleTrailingGapClick() {
    focusEmptyLineOrInsert(blocks[blocks.length - 1], addTextBlock)
  }

  // ⌥↑/⌥↓ steps a block past a whole STORED row, or out of a stored row onto
  // its own line, never splitting a row (KAN-376) — `planStepMove` carries
  // the row-aware rules and never looks at how a row is drawn; `null` means
  // there is nowhere to go (e.g. the first block, ⌥↑). Fired from inside the
  // block's own text editor (not a selected row, which keeps its own focus):
  // the commit re-inserts the moved block's DOM node and blurs its editor, so
  // a second ⌥↓/⌥↑ would have nowhere to fire from — the caret's own
  // selection is captured here and left for `pendingCaretFocusRef`'s layout
  // effect (above) to restore once the move's own re-render has landed.
  function moveBlockAt(index: number, dir: 'up' | 'down') {
    const next = planStepMove(blocks, index, dir)
    if (!next) return
    const moved = blocks[index]
    const selection = captureTextSelection(document.getElementById(blockDomId(moved.id)))
    if (selection) pendingCaretFocusRef.current = { id: moved.id, selection }
    commitStructuralBlocks(next)
  }

  // ⌥←/⌥→ swaps a block with its row-mate on that side (KAN-376); `null`
  // means there is no row-mate there (a solo block, or already at that edge).
  function swapInRowAt(index: number, dir: 'left' | 'right') {
    const next = planRowSwap(blocks, index, dir)
    if (!next) return
    commitStructuralBlocks(next)
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

  // One entry per block, in page order, at the width it already has. A drag
  // does not preview the landing by rearranging or cloning the block: the
  // drop bar is the only mark of where it will land, and the widths apply
  // on release.
  const renderList = useMemo<
    { id: string; width: BlockWidth | number; ghost: boolean; rowStart?: boolean }[]
  >(
    () =>
      blocksForLayout.map((b) => ({
        id: b.id,
        width: b.width ?? 'full',
        ghost: false,
        rowStart: b.rowStart,
      })),
    [blocksForLayout]
  )

  const blockRows = useMemo(() => layoutRows(renderList), [renderList])

  // Rule 3's fix (KAN-345): feeds the hover-ghost placement, which needs this
  // read before `handleTrailingGapClick` is defined.
  const trailingLine = blocks[blocks.length - 1]
  const trailingLineIsEmptyText = isEmptyTextLine(trailingLine)

  // Fix (KAN-345 rule 2): whether the trailing gap is actually visible —
  // matches the conditions under which `TrailingBlockGap` below mounts
  // (`chrome`) and is unhidden (`draggingIndex`, `previewing`). Gates
  // `hoverGhost` directly (so a hide/unmount can't leave the stale flag
  // painting the unfocused last line) and resets the flag itself, so
  // becoming visible again later (e.g. leaving zen) starts un-hovered
  // rather than resurrecting a ghost the pointer never re-entered — a
  // guarded one-shot reset, not a cascade (same idiom as
  // `use-animated-series-path.ts`).
  const trailingGapVisible = chrome && draggingIndex === null && !previewing
  useEffect(() => {
    if (trailingGapVisible) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded one-shot reset, not a cascade
    setTrailingGapHovered(false)
  }, [trailingGapVisible])

  // Rule 4's between-row gap (KAN-345): a click anywhere along the boundary
  // line below row `rowIndex` inserts after that ROW's last block, not the
  // one item the clicked segment happens to render under — a side-by-side
  // row has one boundary below it, not one per block. Same
  // `focusEmptyLineOrInsert` G9 guard as `handleTrailingGapClick`.
  function insertAfterRow(rowIndex: number) {
    const row = blockRows[rowIndex]
    const last = row[row.length - 1]
    const index = blocks.findIndex((b) => b.id === last.id)
    if (index === -1) return
    focusEmptyLineOrInsert(blocks[index + 1], () => insertLineAfter(index))
  }

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
    await persistBlocksAsOwnEdit(next)
  }

  /**
   * Commits an own-line drop (6x) through `planOwnLineDrop`: before or after
   * the target's row when that row is actually side by side, and between the
   * drawn lines when the row is only stored as one row and drawn stacked.
   */
  function drawsStacked(blockId: string): boolean {
    const row = layoutRows(blocks).find((member) => member.some((block) => block.id === blockId))
    if (!row || row.length < 2) return false
    return rowStacks(
      columnWidth,
      row.map((block) => block.width ?? 'full')
    )
  }

  async function commitOwnLineDrop(
    fromIndex: number,
    targetIndex: number,
    zone: 'above' | 'below'
  ) {
    const next = planOwnLineDrop(blocks, fromIndex, blocks[targetIndex].id, zone, columnWidth)
    if (!next) return
    await persistBlocksAsOwnEdit(next)
  }

  /**
   * The zone currently shown lives in two places — `dropIndicator`/
   * `previewWidth` state and `stickyZoneRef` — so every site that stops
   * showing a zone clears both through this one function. Missing either
   * leaves the other stale: `onDragOver`'s hysteresis check reads
   * `stickyZoneRef` to decide whether a dragover is "unchanged" and, if so,
   * returns before touching the state at all, so a ref left behind an
   * already-cleared indicator makes the next dragover into that same zone a
   * no-op forever.
   */
  function clearDropPreview() {
    setDropIndicator(null)
    setPreviewWidth(null)
    stickyZoneRef.current = null
  }

  /**
   * The own-line (above/below) indicator's span is the canvas's own rect
   * relative to the target block's snapshot rect — both the per-block
   * branch (hovering a block's own above/below padding) and the canvas
   * root branch (the gap above row 0) show the same line against the same
   * target, so they share this one computation rather than re-spelling it.
   */
  function showOwnLineIndicator(index: number, zone: DropZone, rect: Rect | undefined) {
    stickyZoneRef.current = { index, zone }
    setPreviewWidth(null)
    const columnRect = canvasRef.current?.getBoundingClientRect()
    setDropIndicator({
      index,
      zone,
      span:
        columnRect && rect
          ? { left: columnRect.left - rect.left, width: columnRect.width }
          : undefined,
    })
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
    clearDropPreview()
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
  // Rule 4's row-boundary line (KAN-345) anchors to the ROW's bottom, not any
  // one item's — a side-by-side row's items can render at different heights
  // (`alignItems: flex-start`), so the boundary is the tallest of them, read
  // off their own rendered boxes (nothing in `layoutRows` carries height,
  // only width). `itemSizingRefs` is keyed by block id, filled by each item's
  // own sizing div below; a row's boundary is `max(item.bottom) - container.top`.
  const itemSizingRefs = useRef(new Map<string, HTMLDivElement>())
  const [rowBoundaryTops, setRowBoundaryTops] = useState<number[]>([])
  // The last measurement `read` (below) stored. `blockRows` is a new array on
  // every render that changes a drag's preview, re-running the effect; a set
  // state from a layout effect re-renders and commits even when the value is
  // unchanged (React only bails out eagerly with no work pending), and
  // KAN-440's hysteresis promises one commit per zone change. So `read` sets
  // state only when the measurement actually moved.
  const lastMeasureRef = useRef<{ width: number; tops: number[] } | null>(null)
  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const read = () => {
      const containerRect = el.getBoundingClientRect()
      const tops = blockRows
        .slice(0, -1)
        .map(
          (row) =>
            Math.max(
              ...row.map(
                (item) => itemSizingRefs.current.get(item.id)?.getBoundingClientRect().bottom ?? 0
              )
            ) - containerRect.top
        )
      const last = lastMeasureRef.current
      if (
        last &&
        last.width === containerRect.width &&
        last.tops.length === tops.length &&
        last.tops.every((top, i) => top === tops[i])
      ) {
        return
      }
      lastMeasureRef.current = { width: containerRect.width, tops }
      setColumnWidth(containerRect.width)
      setRowBoundaryTops(tops)
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    for (const node of itemSizingRefs.current.values()) ro.observe(node)
    return () => ro.disconnect()
  }, [blockRows])

  /** The other blocks in this block's row, named the way the height readout reads them. */
  function heightNeighbours(blockId: string): { id: string; label: string }[] {
    const row = blockRows.find((items) => items.some((item) => item.id === blockId && !item.ghost))
    if (!row) return []
    return row.flatMap((item) => {
      if (item.ghost || item.id === blockId) return []
      const mate = blocks.find((candidate) => candidate.id === item.id)
      if (!mate) return []
      return [{ id: mate.id, label: blockName(mate, blockFrame(mate)) }]
    })
  }

  function renderBlockEditor(block: Block, i: number) {
    const blank = isBlankBesides(i)
    return (
      <BlockEditor
        key={block.id}
        block={block}
        pageId={pageId}
        settleOnMount={insertedIds?.has(block.id) ?? false}
        autofocus={autofocusIds.has(block.id)}
        chrome={chrome}
        untouched={untouched && i === 0}
        hoverGhost={
          i === blocks.length - 1 &&
          trailingLineIsEmptyText &&
          trailingGapVisible &&
          trailingGapHovered &&
          !editingText
        }
        onChange={(next) => setBlockAt(i, next)}
        writeBlock={writeBlock}
        onRemoveEmpty={() => removeEmptyLineAt(i)}
        onExitEmpty={() => removeEmptyOnExit(block.id)}
        onDeleteBlock={() => requestDelete(i)}
        onReturn={(patch, content, where) => insertLineAfter(i, patch, content, where)}
        onLeaveUp={
          i === 0 ? () => focusPageTitle('end') : (x) => leaveBlockEdge(blocks, i, 'up', x)
        }
        onLeaveDown={
          i === blocks.length - 1 ? undefined : (x) => leaveBlockEdge(blocks, i, 'down', x)
        }
        onSelectPrev={i === 0 ? () => focusPageTitle('end') : () => selectBlockAt(blocks, i - 1)}
        onSelectNext={i === blocks.length - 1 ? undefined : () => selectBlockAt(blocks, i + 1)}
        onMoveUp={() => moveBlockAt(i, 'up')}
        onMoveDown={() => moveBlockAt(i, 'down')}
        onSwapLeft={() => swapInRowAt(i, 'left')}
        onSwapRight={() => swapInRowAt(i, 'right')}
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
            ? blockMenuGroups(
                block,
                {
                  // Every block but a page-link has something to move — it has
                  // nothing of its own, so the row is dropped for it.
                  moveIntoNewPage: block.type !== 'page-link',
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
                },
                apple,
                slashSize
              )
            : undefined
        }
        menuSize={slashSize}
        onMenuOpenChange={(open) => handleMenuOpenChange(i, open)}
        onMenuSelect={(action) => handleMenuSelect(i, action)}
        onHeightCommit={(next) => setBlockHeight(block, next)}
        heightNeighbours={heightNeighbours(block.id)}
        reorderDrag={draggingIndex !== null}
        isDragging={draggingIndex === i}
        dropZone={dropIndicator?.index === i ? dropIndicator : undefined}
        onDragStart={(e) => {
          if (dragImageRef.current) e.dataTransfer?.setDragImage(dragImageRef.current, 0, 0)
          setMenuOpenAt(null)
          clearDropPreview()
          placeDragFloat(e.clientX, e.clientY)
          setDraggingIndex(i)
          snapshotDragRects()
        }}
        onDragEnd={() => {
          dragFloatPointRef.current = null
          setDraggingIndex(null)
          clearDropPreview()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          placeDragFloat(e.clientX, e.clientY)
          if (draggingIndex === null) return
          if (draggingIndex === i) {
            // Hovering the held block's own origin: no drop is offered here,
            // so whatever indicator/preview the last hovered target left up
            // must clear too — otherwise a release here would still commit
            // that earlier target's plan (the drop just below commits
            // whatever indicator is shown, not what's under the pointer now).
            clearDropPreview()
            return
          }
          // The snapshot taken at dragstart (re-taken on scroll while this
          // drag is live), never the live rect: a beside preview resizes
          // this very block mid-drag, and classifying against that moving
          // target is the flicker this ticket fixes. Falls back to the live
          // rect only if the snapshot never saw this block (it wasn't on the
          // page at dragstart — a realtime insert mid-drag).
          const rect = dragRectsRef.current.get(block.id) ?? e.currentTarget.getBoundingClientRect()
          const point = { x: e.clientX, y: e.clientY }
          // Hysteresis (KAN-440): once this block has a zone shown, keep it while
          // the pointer stays within THAT zone's own padded sub-rect — never
          // reclassify just because the preview itself moved. Only a point that
          // actually clears the padding re-runs `classifyDropZone` from scratch.
          // A row drawn stacked has no beside, so a sticky left/right from the
          // frame before the column was measured must not keep that zone.
          const drawnStacked = drawsStacked(block.id)
          const sticky = stickyZoneRef.current
          const stickyHolds =
            sticky !== null &&
            sticky.index === i &&
            isWithinPaddedZone(rect, point, sticky.zone) &&
            !(drawnStacked && (sticky.zone === 'left' || sticky.zone === 'right'))
          // Row 0's own-line band overrides a held beside zone (KAN-548): a
          // short first block's sticky left/right would otherwise survive
          // into its top corner, where the drop line shown is `above`.
          const isRowZero = blockRows[0]?.some((b) => b.id === block.id) ?? false
          const zone =
            rowZeroZone(rect, point, isRowZero) ??
            zoneWhenDrawnStacked(
              stickyHolds && sticky ? sticky.zone : classifyDropZone(rect, point),
              rect,
              point,
              drawnStacked
            )
          // Nothing classified differently from what's already shown for this
          // block: `planned`/`changed` below are pure functions of
          // (blocks, draggingIndex, target id, zone), none of which moved, so
          // skip the state updates outright rather than recompute and reapply
          // an identical plan on every one of the ~20 dragovers/s a still
          // pointer fires.
          const unchanged = sticky !== null && sticky.index === i && sticky.zone === zone
          stickyZoneRef.current = { index: i, zone }
          if (unchanged) return
          if (zone === 'left' || zone === 'right') {
            const planned = planBesideDrop(blocks, draggingIndex, blocks[i].id, zone)
            // `null`: the row already holds 4, or the widths this drop would
            // set let `layoutRows` repack the planned row apart — no beside
            // line here, though the row's own-line (above/below) zone still works.
            // Clears unconditionally, same reason as the origin-hover branch
            // above: a stale indicator from an earlier target must not survive
            // into a zone that offers no plan of its own.
            if (planned === null) {
              clearDropPreview()
              return
            }
            setDropIndicator({ index: i, zone })
            // The bar is the whole preview. Widths in `planned` apply on
            // release (`commitDropIndicator`), not while the pointer is still
            // moving — a live reflow of the row is what made the drag jump.
            setPreviewWidth(null)
            return
          }
          showOwnLineIndicator(i, zone, rect)
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
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null)
        }}
        title="Delete this block?"
        consequence="It has something in it."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
      {draggingIndex !== null &&
        blocks[draggingIndex] &&
        createPortal(
          <div
            ref={dragFloatRef}
            data-part="drag-float"
            aria-hidden
            className="pointer-events-none fixed z-50 w-[220px] max-h-[148px] -rotate-[0.6deg] overflow-hidden bg-mn-card shadow-mn-lifted motion-reduce:rotate-0"
          >
            {/* `zoom` shrinks layout, so the frame hugs the block and the
                max height crops the bottom square. `scale` would leave the
                unscaled box in place and the frame would round off empty space. */}
            <div className="w-[524px]" style={{ zoom: 0.42 }}>
              {(() => {
                const block = blocks[draggingIndex]
                const frame = blockFrame(block)
                const view = (
                  <ModuleView type={block.type} data={block} editable={false} onChange={() => {}} />
                )
                if (frame) {
                  return (
                    <PondBlock
                      kind={frame.kind}
                      heading={frame.heading}
                      headNote={frame.headNote}
                      state="rest"
                    >
                      {view}
                    </PondBlock>
                  )
                }
                if (block.type === 'text') {
                  return (
                    <div
                      style={{
                        paddingBlock: TEXT_BLOCK_TOP_INSET_PX,
                        paddingInline: TEXT_BLOCK_INSET_PX,
                      }}
                    >
                      {view}
                    </div>
                  )
                }
                return view
              })()}
            </div>
          </div>,
          document.body
        )}
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
                slashSize === 'desktop' ? { flex: 1, minWidth: 0 } : { width: '100%', minWidth: 0 }
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
            // never double-commits the same release). The gap above row 0
            // DOES have an element now (`drop-band-top`, below) — its events
            // bubble here, which is why this handles that case too.
            // `onDragLeave` only clears the indicator when the drag leaves
            // the canvas itself (`relatedTarget` outside it) — moving from a
            // block into the ghost or a gap is still inside the canvas, so
            // the indicator stays up rather than flickering off and on.
            onDragOver={(e) => {
              e.preventDefault()
              placeDragFloat(e.clientX, e.clientY)
              if (draggingIndex === null) return
              // KAN-529/547: the space above row 0 has no block DOM node to
              // carry its own `onDragOver`, so a point above the first row's
              // snapshot top reaches only here (via the band's bubbled
              // event). Shows the same `above` indicator row 0's first block
              // would show for a point at its own top edge, so a release
              // there still lands the drag first.
              const firstRowFirst = blockRows[0]?.[0]
              if (!firstRowFirst) return
              const firstIndex = blocks.findIndex((b) => b.id === firstRowFirst.id)
              if (firstIndex === -1) return
              const rect = dragRectsRef.current.get(firstRowFirst.id)
              const top = rect?.top ?? canvasRef.current?.getBoundingClientRect().top
              // This handler also receives every dragover bubbled up from a
              // block below row 0 (no block stops propagation on this event),
              // so the "above row 0" classification below must gate on the
              // point actually being above `top` — never on `draggingIndex`
              // alone, or every hover anywhere on the canvas while dragging
              // the first block would hit it.
              if (top === undefined || e.clientY >= top) return
              if (firstIndex === draggingIndex) {
                // Dragging the first block above itself: an indicator left
                // behind from hovering a later zone must not survive into
                // this band, or a release here would commit that earlier
                // target instead.
                clearDropPreview()
                return
              }
              const sticky = stickyZoneRef.current
              if (sticky !== null && sticky.index === firstIndex && sticky.zone === 'above') return
              showOwnLineIndicator(firstIndex, 'above', rect)
            }}
            onDrop={(e) => {
              e.preventDefault()
              commitDropIndicator()
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as Node | null
              if (related && canvasRef.current?.contains(related)) return
              // Clears `stickyZoneRef` too (`clearDropPreview`), not just the
              // indicator: otherwise a dragover back into the SAME zone right
              // after re-entering reads the ref as unchanged and returns
              // before ever reshowing what this just cleared.
              clearDropPreview()
            }}
          >
            {draggingIndex !== null && !previewing && (
              <div
                aria-hidden
                data-part="drop-band-top"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: -TOP_DROP_BAND_PX,
                  height: TOP_DROP_BAND_PX,
                }}
              />
            )}
            {/*
             * A single flat `.flatMap()`, not a `.map()` of each row's own
             * `.map()`: nested arrays give React an implicit key path scoped to
             * their outer array index, so a block moving from row 0 to row 1
             * would still remount even though its own `key` is unchanged — the
             * exact bug a flat array (one key namespace, block.id only) removes.
             *
             * `blockRows`' boundaries are not always where CSS would wrap on its
             * own: a row left short of full by a `rowStart` block (KAN-440) has
             * room for the next row's first block to pack in beside it, which is
             * exactly the bug `rowStart` exists to stop. So every row after the
             * first gets a forced break — a sibling, not a wrapper, so no block's
             * own key or parent ever changes. The list's own `rowGap` is 0 (its
             * doc comment above), so the break carries no margin of its own —
             * the gap lives entirely on each row's sizing divs, below.
             */}
            {blockRows
              .flatMap((row, rowIndex) => {
                const widths = row.map((item) => item.width)
                // Widths and rows are kept, not shown: a row that stacks renders
                // each of its blocks' sizing divs at 100% width, which — because
                // the list itself wraps — puts each on its own line, in reading
                // order. That IS the stack; no row-level wrapper is rendered at
                // all, so a block shifting from one row to another regroups
                // `blockRows` without touching any ancestor element, and a
                // remount is impossible rather than untested.
                const stacks = rowStacks(columnWidth, widths)
                // The shared strip (KAN-505) is an 8px (`w-2`) strip centred in
                // the row's own gap, not hugging either block's border: its
                // `right` offset is half the gap plus half the strip's own
                // width, so a 16px gap (the default) gives -12px, matching the
                // SPEC's own "-12px-ish". Read from `rowGapValue`, not the
                // BLOCK_ROW_GAP_PX constant, so a host override (zen's wider
                // gap) keeps the strip centred too.
                const rowGapPx = rowGapValue(listStyle)
                const sharedOffsetPx = typeof rowGapPx === 'number' ? -(rowGapPx / 2 + 4) : -12
                // Every sizing div starts its own flex line EXCEPT the page's
                // very first block, and (within row 0, non-stacking) the rest of
                // that one shared line: those stay at the top with no gap above
                // them, every other sizing div gets one `rowGapValue` of
                // `marginTop`. A stacking row puts each of its own members on
                // their own line too, so only its first member (if that's also
                // the page's first block) is spared.
                const entries = row.map((item, itemIndex) => ({
                  item,
                  stacks,
                  // A row of MULTIPLE members that stacks (each wraps to its
                  // own line, too narrow to hold side by side) draws no strip
                  // at all — there is no row left to resize against. A block
                  // alone on its line (row.length === 1) is never gated on
                  // `stacks`: `stacks` there only means ITS OWN stored width
                  // underflows the floor and is drawn full (KAN-441, the
                  // "narrower than the stack floor" case) — both its edges
                  // still resize it. Else: the row's first member gets its
                  // own left edge, the row's last gets its own right edge,
                  // and every boundary between members (KAN-505) gets ONE
                  // shared strip, carried by the boundary's LEFT member so a
                  // 2-block row renders exactly 3 strips, not 4 (its own
                  // right edge and the next block's left edge would
                  // otherwise double up the same boundary).
                  showLeftEdge: itemIndex === 0 && (row.length === 1 || !stacks),
                  showSharedEdge: row.length > 1 && !stacks && itemIndex < row.length - 1,
                  // The shared strip's drag needs its row-mate's own `blocks`
                  // id (resolved to an index once, on press) — carried here
                  // rather than recomputed from `i + 1` below, since a ghost
                  // mid-row (a block-drag reorder, KAN-440) would otherwise
                  // throw that index off; chrome hides every strip during
                  // that drag anyway (`draggingIndex !== null`), so this id
                  // is only ever read while it's actually safe to use.
                  sharedRightId: itemIndex < row.length - 1 ? row[itemIndex + 1].id : undefined,
                  showRightEdge: itemIndex === row.length - 1 && (row.length === 1 || !stacks),
                  sharedOffsetPx,
                  // The right member of every boundary (KAN-505): its own sizing
                  // div — NOT the card inside it — needs an explicit z-index
                  // above the shared strip's `z-[1]` (carried by the LEFT
                  // member), because the card can gain its own stacking context
                  // mid-session (`motion-settle-in`'s transform, left `both`)
                  // that would otherwise trap any z-index set inside it. This
                  // wrapper sits outside any card transform, so it stacks the
                  // whole subtree — grip included — above the strip regardless.
                  liftAboveSharedStrip: itemIndex > 0 && row.length > 1 && !stacks,
                  // A row-sharing block's outer edge (KAN-505) resizes only
                  // itself — its row-mates never move — so growing it is
                  // capped at `100 - sum(the row's other members)`: the
                  // complement of whatever share they already hold, which is
                  // exactly how far this one can grow before the row's total
                  // would pass 100 and split. An alone block has no row-mates
                  // to cap against, so its own edges keep the default (100).
                  outerMaxPercent:
                    row.length > 1 && !stacks
                      ? 100 -
                        (widths.reduce<number>((sum, w) => sum + widthPercent(w), 0) -
                          widthPercent(item.width))
                      : 100,
                  marginTop:
                    rowIndex === 0 && (!stacks || itemIndex === 0) ? 0 : rowGapValue(listStyle),
                }))
                return rowIndex === 0 ? entries : [{ rowBreakBeforeId: row[0].id }, ...entries]
              })
              .map((entry) => {
                if ('rowBreakBeforeId' in entry) {
                  return (
                    <div
                      key={`row-break-${entry.rowBreakBeforeId}`}
                      aria-hidden
                      style={{ flexBasis: '100%', height: 0, margin: 0 }}
                    />
                  )
                }
                const {
                  item,
                  stacks,
                  showLeftEdge,
                  showSharedEdge,
                  sharedRightId,
                  showRightEdge,
                  outerMaxPercent,
                  sharedOffsetPx,
                  liftAboveSharedStrip,
                  marginTop,
                } = entry
                // A live edge drag previews this block's width locally — never
                // written to `blocks` until release — so it overrides the
                // committed width here rather than going through `stacks`.
                const resizing =
                  !item.ghost && edgePreview && edgePreview.id === item.id ? edgePreview : null
                // A shared-edge drag previews BOTH row-mates at once: this
                // item reads whichever side of the pair it is, by id (not
                // index — the dragged pair's own ids are fixed for the
                // gesture, `sharedEdgePreview` doesn't track `i`).
                const sharedResizing =
                  !item.ghost && sharedEdgePreview && sharedEdgePreview.leftId === item.id
                    ? { percent: sharedEdgePreview.leftPercent, locked: sharedEdgePreview.locked }
                    : !item.ghost && sharedEdgePreview && sharedEdgePreview.rightId === item.id
                      ? {
                          percent: sharedEdgePreview.rightPercent,
                          locked: sharedEdgePreview.locked,
                        }
                      : null
                const sizingWidth = resizing
                  ? blockWidthStyle(resizing.percent)
                  : sharedResizing
                    ? blockWidthStyle(sharedResizing.percent)
                    : stacks || item.width === 'full'
                      ? '100%'
                      : blockWidthStyle(item.width)
                const i = blocks.findIndex((b) => b.id === item.id)
                // Measured by `itemSizingRefs` (above) so the row-boundary
                // line below — rendered once per ROW, not here — can anchor
                // to this row's tallest item rather than this one's own box.
                return (
                  <div
                    key={item.id}
                    ref={(node) => {
                      if (node) itemSizingRefs.current.set(item.id, node)
                      else itemSizingRefs.current.delete(item.id)
                    }}
                    className={cn(
                      'relative min-w-0 transition-[width] duration-[var(--motion-settle)] ease-[var(--ease-mn)] motion-reduce:transition-none',
                      liftAboveSharedStrip && 'z-[2]'
                    )}
                    style={{ width: sizingWidth, marginTop }}
                  >
                    {renderBlockEditor(blocks[i], i)}
                    {showLeftEdge && (
                      <BlockEdgeHandle
                        side="left"
                        hidden={!chrome || draggingIndex !== null}
                        // Only the strip actually grabbed lights its pill: an
                        // alone block's mirrored right edge stays unlit while
                        // its left is mid-drag, even though both share `resizing`.
                        dragging={resizing !== null && resizing.side === 'left'}
                        readout={
                          resizing && resizing.side === 'left'
                            ? edgeResizeReadout(resizing.percent, resizing.locked)
                            : undefined
                        }
                        valueNow={
                          resizing ? resizing.percent : drawnWidthPercent(columnWidth, item.width)
                        }
                        // A toggle's own fold button sits in this edge's gutter (its
                        // first 28px row) and is lifted above this strip by z-index
                        // (KAN-480, bounded round-3 fix) — clip the strip's own top
                        // short of that row so the two never contest the same
                        // pointer-down; every other block type's left edge is
                        // untouched (prop left unset, full height).
                        topInsetPx={blocks[i]?.type === 'toggle' ? TOGGLE_FOLD_ROW_PX : undefined}
                        // This strip only ever mounts on a row's first member
                        // (`showLeftEdge`'s own gate) — alone or sharing a row,
                        // it's always that row's own left edge, so both wire
                        // the same handler; `outerMaxPercent` is the row's
                        // other members' complement for a shared row, and 100
                        // (no cap) for an alone block.
                        onPointerDown={(e) =>
                          handleEdgeResizePointerDown(e, item.id, 'left', outerMaxPercent)
                        }
                        onPointerMove={handleEdgeResizePointerMove}
                        onPointerUp={handleEdgeResizePointerUp}
                        onPointerCancel={handleEdgeResizePointerCancel}
                      />
                    )}
                    {showSharedEdge && (
                      // The boundary strip between this block and its row-mate
                      // to the right: mounted here (carried by the boundary's
                      // left member) so a row renders one strip per boundary,
                      // not two.
                      <BlockEdgeHandle
                        side="shared"
                        hidden={!chrome || draggingIndex !== null}
                        // This boundary's own drag, not just its width changing: the
                        // right row-mate's width previews too (`sharedResizing` matches
                        // either side, for `sizingWidth` above), but only the LEFT
                        // member of THIS boundary carries its pill and readout — the
                        // right mate is also the left member of a DIFFERENT boundary,
                        // whose own strip must stay dark while this one drags.
                        dragging={
                          sharedEdgePreview !== null && sharedEdgePreview.leftId === item.id
                        }
                        readout={
                          sharedEdgePreview !== null &&
                          sharedEdgePreview.leftId === item.id &&
                          sharedResizing
                            ? edgeResizeReadout(sharedResizing.percent, sharedResizing.locked)
                            : undefined
                        }
                        valueNow={
                          sharedResizing ? sharedResizing.percent : widthPercent(item.width)
                        }
                        sharedOffsetPx={sharedOffsetPx}
                        onPointerDown={
                          sharedRightId !== undefined
                            ? (e) => handleSharedEdgeResizePointerDown(e, item.id, sharedRightId)
                            : undefined
                        }
                        onPointerMove={handleSharedEdgeResizePointerMove}
                        onPointerUp={handleSharedEdgeResizePointerUp}
                        onPointerCancel={handleSharedEdgeResizePointerCancel}
                      />
                    )}
                    {showRightEdge && (
                      <BlockEdgeHandle
                        side="right"
                        hidden={!chrome || draggingIndex !== null}
                        dragging={resizing !== null && resizing.side === 'right'}
                        readout={
                          resizing && resizing.side === 'right'
                            ? edgeResizeReadout(resizing.percent, resizing.locked)
                            : undefined
                        }
                        valueNow={
                          resizing ? resizing.percent : drawnWidthPercent(columnWidth, item.width)
                        }
                        // This strip only ever mounts on a row's last member
                        // (`showRightEdge`'s own gate) — alone or sharing a
                        // row, it's always that row's own right edge, so both
                        // wire the same handler; `outerMaxPercent` caps a
                        // shared row's growth at its other members'
                        // complement, so this edge resizes only itself and
                        // the row never splits.
                        onPointerDown={(e) =>
                          handleEdgeResizePointerDown(e, item.id, 'right', outerMaxPercent)
                        }
                        onPointerMove={handleEdgeResizePointerMove}
                        onPointerUp={handleEdgeResizePointerUp}
                        onPointerCancel={handleEdgeResizePointerCancel}
                      />
                    )}
                  </div>
                )
              })}
            {/* Rule 4's boundary line (KAN-345): one per ROW boundary, full
                content width — a side-by-side row's items can render at
                different heights, so this is a sibling of the row's own
                sizing divs, not nested in any one of them (nesting it in a
                single item only spans that item's own width). `position:
                absolute` takes it out of the flex flow entirely, so it adds
                no `rowGap` edge of its own ("the gap stays 16px: no layout
                shift" stays true). Skipped above the first row and below the
                last (no boundary there). `top` is `rowBoundaryTops[rowIndex]`
                — the row's own measured bottom — falling back to nothing
                rendered until the first measurement lands (avoids a
                mis-placed line at `top: 0` for one frame). */}
            {chrome &&
              draggingIndex === null &&
              blockRows.slice(0, -1).map((_row, rowIndex) => {
                const top = rowBoundaryTops[rowIndex]
                if (top === undefined) return null
                return (
                  <div
                    key={`gap-${rowIndex}`}
                    className="absolute inset-x-0"
                    style={{ top, height: BLOCK_ROW_GAP_PX }}
                  >
                    <BlockGapLine onClick={() => insertAfterRow(rowIndex)} />
                  </div>
                )
              })}
          </div>
        </div>
      </SiblingBlocksProvider>

      {/* Rule 3's trailing gap (KAN-345): same spot the old always-visible add
          foot used to occupy. `chrome` gates mounting — false renders no DOM
          node at all, matching `BlockGapLine`'s own absence above. Once
          mounted, `hidden` fades it (not unmount) during a drag or while a
          template preview has replaced the body. */}
      {chrome && (
        <TrailingBlockGap
          onClick={handleTrailingGapClick}
          hidden={draggingIndex !== null || !!previewing}
          // Rule 3 (KAN-345): when the last block is already an empty text
          // line, that line's own placeholder paints in place (via
          // `hoverGhost` above) instead — a second ghost row here would put
          // the text in two places at once. And (KAN-535) while any editor
          // in the canvas has focus, that line already shows its own hint
          // from its own focus, so this one must not draw a second.
          showGhostText={!trailingLineIsEmptyText && !editingText}
          onHoverChange={setTrailingGapHovered}
          leadGap={blocks.length > 0}
        />
      )}

      {/* The source picker, hung off the `/` line that summoned it. */}
      {sourcePicker && (
        <SourcePicker
          block={sourcePicker.block}
          /* Lowercase on the machine surface — see `sourceDatabases`. */
          pageTitle={pageTitle || 'untitled'}
          databases={databases}
          projects={projects}
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

// KAN-355: the one place a structural list/checklist edit (add/remove/move) is
// committed — flushes the pending save before and after `apply`, so it lands as
// its own debounced save/change-log record instead of merging with whatever
// edit comes right before or after it. Shared by `useBlockEmptyState`'s todo
// action and `BlockEditor`'s `commitStep` below.
function commitStructural(pageId: string, apply: () => void) {
  flushPendingPageSave(pageId)
  apply()
  flushPendingPageSave(pageId)
}

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
 *
 * A fresh `gantt` view with zero rows steps aside (`rest`) just as `board` does
 * (KAN-352, mirroring KAN-351): the frame's own void line would otherwise replace
 * the task column, and the view's own void branch draws that same line PLUS the
 * `add a task` row the frame has no action slot for.
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
): {
  state: PondBlockState
  onEmptyAction?: () => void
  emptyLine?: string
  schema: PropertySchema | null
  updateSchema: (next: PropertySchema) => void
  /** KAN-243 fix: reads the collection's schema straight off react-query's cache
   *  (`SavedViewHost`) — the host-owned getter `SavedViewBar`'s undo needs, since
   *  `schema` above is a snapshot from render time, not "right now". */
  getLatestSchema: () => PropertySchema | null
} {
  const collectionId = block.type === 'view' ? viewCollectionId(block, pageId) : undefined
  const queryClient = useQueryClient()
  const { schema, rows, isLoading, addRow, updateSchema } = useCollectionRows(collectionId)
  const getLatestSchema = useCallback(
    () => readCachedSchema(queryClient, collectionId),
    [queryClient, collectionId]
  )
  // The rows the view will actually draw — its filter (and sort) applied.
  const processed = useMemo(
    () => (block.type === 'view' && schema ? applyView(rows, schema, block) : rows),
    [block, rows, schema]
  )

  const result = ((): {
    state: PondBlockState
    onEmptyAction?: () => void
    emptyLine?: string
  } => {
    switch (block.type) {
      case 'todo':
        return blockIsEmpty(block)
          ? {
              state: 'empty',
              onEmptyAction: () => {
                commitStructural(pageId, () => {
                  const next = addTodoItem(block)
                  onChange(next)
                  focusTodoItem(block.id, 'start', next.items[next.items.length - 1].id)
                })
              },
            }
          : { state: 'rest' }
      case 'table':
        return blockIsEmpty(block)
          ? { state: 'empty', onEmptyAction: () => onChange(addTableRow(block)) }
          : { state: 'rest' }
      case 'entries':
        // `write one` fires while the log is still `empty`, so `EntriesView` isn't
        // mounted yet to hold a pending-focus ref — the id has to be registered
        // before `onChange` swaps the frame to `rest` and mounts it (KAN-444).
        return blockIsEmpty(block)
          ? {
              state: 'empty',
              onEmptyAction: () => onChange(addEntryFocused(block)),
            }
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
  })()

  return { ...result, schema, updateSchema, getLatestSchema }
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
 * The handle is drag-only on desktop (KAN-485): a press that ends in
 * pointerup within `HANDLE_PRESS_MOVE_THRESHOLD_PX` of where it started, or
 * Enter/Space on the focused handle, selects the row — it never opens the
 * menu. A press that moves past the threshold still drags, unchanged. The
 * menu opens from right-click on the block, ⌘/ (Ctrl+/ off Apple) anywhere in
 * it, or ⇧F10/the ContextMenu key on a selected row; the handle itself shows
 * its own open fill (`PondBlock.dc.html`), no ring on the block. Phone
 * (`size="mobile"`) keeps the old
 * tap-opens-the-menu path on the handle itself — iOS Safari fires no
 * `contextmenu` on a long-press. Base UI's own trigger opens on pointerdown;
 * `handlePointerOpenChange` below drops that and any open that arrives after
 * the press has moved past the threshold, so a press that becomes a drag
 * never opens it (KAN-440 comment 1) — ⌘/ is never gated by this, so a stuck
 * press state from an earlier drag can't block it.
 */
const HANDLE_PRESS_MOVE_THRESHOLD_PX = 4
function BlockEditor({
  block,
  pageId,
  settleOnMount = false,
  autofocus = false,
  chrome = true,
  untouched = false,
  hoverGhost = false,
  onChange,
  writeBlock,
  onRemoveEmpty,
  onExitEmpty,
  onDeleteBlock,
  onReturn,
  onLeaveUp,
  onLeaveDown,
  onSelectPrev,
  onSelectNext,
  onMoveUp,
  onMoveDown,
  onSwapLeft,
  onSwapRight,
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
  onHeightCommit,
  heightNeighbours = [],
  reorderDrag = false,
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
  /** This id was minted by one of BlockCanvas's own insert paths this session
   *  (rule 2, KAN-345) — the text module's empty line autofocuses on mount
   *  only then, never for a line that merely arrived with the page. */
  autofocus?: boolean
  chrome?: boolean
  /** This block is the untouched page's one hint line (6f): its placeholder draws in the mono override. */
  untouched?: boolean
  /** This block is the last, already-empty text line, and the trailing gap below it
   *  is hovered (rule 3's fix, KAN-345): its own placeholder paints in place of a
   *  second ghost row, so a click never moves which element shows the text. */
  hoverGhost?: boolean
  onChange: (next: Block) => void
  /** `BlockCanvas`'s own by-id write (KAN-243 fix) — see `SavedViewHost.writeBlock`.
   *  Threaded to `savedViewHost` and the empty-state `SavedViewBar` directly,
   *  since it's rendered outside the context provider below. */
  writeBlock: (next: ViewBlock) => void
  /** Backspace in an empty text block. */
  onRemoveEmpty: () => void
  /** Focus left this block. The canvas removes it when the block is empty. */
  onExitEmpty?: () => void
  /** ⌘⌫ / Ctrl+⌫ on the focused block. */
  onDeleteBlock: () => void
  /** Return on a focused block that is not text. An optional `patch` replaces
   *  this block in the same call (KAN-344: the checklist's "remove the empty
   *  last item, then step out" is one `onChange`, never two). An optional
   *  `content` seeds the new block's text (KAN-506's split on Enter). `where`
   *  is explicit (never inferred from `patch`/`content`'s shapes): `'below'`
   *  (default) is today's "after this block"; `'above'` is Enter at the start
   *  of a non-empty block. */
  onReturn: (patch?: Block, content?: string, where?: 'above' | 'below') => void
  /** ↑ at this block's own edge — a text editor's first visual line, or a checklist's
   *  first item (KAN-367): lands in the previous block's own field at the caret's
   *  column, or (block 0) the page title. */
  onLeaveUp?: (x: number) => void
  /** ↓ at this block's own edge — a text editor's last visual line, or a checklist's
   *  last item (KAN-367): lands in the next block's own field at the caret's column.
   *  Undefined on the LAST block. */
  onLeaveDown?: (x: number) => void
  /** ↑ on this block's row while SELECTED (KAN-367): selects the previous block's row, or
   *  (block 0) the page title. Always set — unlike `onLeaveUp`, every row can be selected. */
  onSelectPrev?: () => void
  /** ↓ on this block's row while SELECTED (KAN-367): selects the next block's row. Undefined
   *  on the last block — its row handler falls back to KAN-344's step-out instead. */
  onSelectNext?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** ⌥←/⌥→ on the selected row — never from inside a text editor or field,
   *  where ⌥←/→ jump words (KAN-376). */
  onSwapLeft?: () => void
  onSwapRight?: () => void
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
  /** One finished height gesture — the stored block, with `height` set or cleared. */
  onHeightCommit?: (next: Block) => void
  /** The other blocks in this block's row, for the height snap. */
  heightNeighbours?: { id: string; label: string }[]
  /** A reorder drag is in progress — the height strips stay off the page. */
  reorderDrag?: boolean
  isDragging?: boolean
  /** The drop line to draw on THIS block, if the drag is hovering it — `BlockCanvas` decides which block that is. */
  dropZone?: { zone: DropZone; span?: { left: number; width: number } }
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  const [dragArmed, setDragArmed] = useState(false)
  // Gate for the handle's menu — PHONE ONLY (KAN-440 comment 1; desktop drops
  // this trigger-open path entirely, KAN-485, `handlePointerOpenChange`
  // below): Base UI's `Menu.Trigger` opens on native `mousedown`, before a
  // press is known to be a click or the start of a drag. `pressRef` tracks
  // whether the handle's press is still down, whether it has moved past the
  // drag threshold since `onPointerDown`, and (for the toggle-click fix
  // below) whether the menu was already open when this press started. On
  // phone, `handlePointerOpenChange` drops any `open === true` while `down`
  // or `moved` is true, so only a genuine click (pointerup with no movement
  // past the threshold) opens the menu from the handle — a drag never does.
  // An HTML5 drag ends in `pointercancel`/the row's `dragend`, never
  // `pointerup`, so both reset `pressRef` too — otherwise `down` stays true
  // forever and blocks every later open from this handle (phone) or select
  // (desktop, Enter/Space included); ⌘/ is never gated by this either way.
  const pressRef = useRef({ down: false, moved: false, startX: 0, startY: 0, openAtDown: false })
  // A press that drifts off the handle before releasing never fires the
  // handle's own `pointerup` — without `setPointerCapture`, the browser
  // delivers `pointerup` to whatever element is under the pointer at release,
  // not the one that started the press (KAN-440). `down` then stays stuck
  // true forever, which blocks a later Enter/Space OPEN on phone the same way
  // a stuck drag does (desktop's Enter/Space only reads `moved`, so it still
  // selects the row). A document-level listener, armed on this handle's own
  // `pointerdown`, catches the release wherever it lands. Torn down on the
  // next `pointerdown` (so only one is ever live) and on unmount (AGENTS.md
  // "finish what you start").
  const pressEndCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => pressEndCleanupRef.current?.(), [])
  const rootRef = useRef<HTMLDivElement>(null)
  // Set by a right-click that opens the menu (below); null for every other
  // open path, which keeps the handle's own anchor (`rootRef`). Cleared on
  // close so a later handle-opened menu never inherits a stale point.
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null)
  // Memoised on `contextPoint` alone, so a right-click's anchor object is
  // stable across the row's other re-renders while the menu stays open —
  // Base UI's positioner effect re-measures whenever the `anchor` prop's
  // identity changes, so a fresh object every render would re-run it for no
  // reason.
  const contextAnchor = useMemo(
    () =>
      contextPoint
        ? { getBoundingClientRect: () => pointAnchor(contextPoint.x, contextPoint.y) }
        : null,
    [contextPoint]
  )
  // macOS Chrome/Safari select the word under the pointer as the right
  // button's own default action, which runs after bubbling listeners but
  // before `contextmenu` fires — so a `window.getSelection()` read inside
  // `handleContextMenu` itself sees a selection the right-press just made,
  // not one that predates it, and the native-menu check below it is true on
  // almost every right-click on prose. Recorded here, on the row's own
  // `pointerdown`, before that default action runs.
  const rightPressSelectionRef = useRef(false)
  // Set when ⇧F10/ContextMenu (`handleKeyDown` below) opens this row's menu
  // from the keyboard; Windows then fires a trailing native `contextmenu` for
  // the same key press. Cleared by the next real pointerdown, so a stale
  // `true` never swallows a later genuine right-click.
  const keyboardMenuOpenRef = useRef(false)
  const wasMenuOpenRef = useRef(menuOpen)
  // Desktop's handle is a plain button, not a `Menu.Trigger` (KAN-485), so
  // Base UI has nothing of its own to return focus to on close when a
  // right-click opened the menu. ⇧F10/ContextMenu/⌘/ already land focus back
  // on the row via Base UI's own restore (the row was the active element
  // when the menu opened), so this only needs to cover the point-anchored
  // path.
  useEffect(() => {
    if (wasMenuOpenRef.current && !menuOpen) {
      const shouldRefocusRow = !!contextPoint
      setContextPoint(null)
      if (shouldRefocusRow) rootRef.current?.focus()
    }
    wasMenuOpenRef.current = menuOpen
  }, [menuOpen, contextPoint])
  // Read in the exit timeout, which runs after the render that opened a menu
  // or a template preview. A `/` menu and the block menu portal outside this
  // row, so their focus looks like leaving.
  const exitGuardRef = useRef({ slash: false, menu: false, preview: false, dragging: false })
  exitGuardRef.current = {
    slash: !!slashMenuOpen,
    menu: !!menuOpen,
    preview: !!previewing,
    dragging: !!isDragging,
  }
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current)
    },
    []
  )
  // KAN-321: the empty-state fetch must read whichever saved view the bar has
  // switched to, not the block's top-level mode/filter.
  const [activeViewId, setActiveViewId] = useState<string | undefined>(undefined)
  const resolvedBlock = block.type === 'view' ? activeSavedView(block, activeViewId) : block
  // Live-verifier ruling (a): the CARD choice is read off the persisted block, not
  // the active saved view — a views-shaped block keeps ONE frame (bare branch, or
  // the same PondBlock card) across every view it holds, so the head row and the
  // bar never remount on a tab click. `block.mode` never changes as the bar
  // switches (only `views[].config` does), so this is already stable for a
  // views-shaped block; it only matters here because it used to read
  // `resolvedBlock` instead, whose mode DOES track the active view.
  const frame = blockFrame(block)
  // KAN-143: the block-level accept-mark cue, kind-agnostic — a touched `todo`
  // with rows draws its mark per row instead (`todo/view.tsx`'s own fallback),
  // so this steps aside only there, and only while it has a row to carry it;
  // a zero-item todo has no row renderer to fall back to, so it still lands
  // here, same as a table, a labelled text block or any other row-less kind.
  const acceptMarks = useAcceptMarks(pageId)
  const blockMark =
    block.type === 'todo' && block.items.length > 0
      ? undefined
      : acceptMarks.find((mark) => mark.target === markTarget(block.id))
  const changedMark = <ChangedMark label={blockMark && formatChangedLabel(blockMark.acceptedAt)} />
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
          previewAnchorRef?.current?.getBoundingClientRect() ??
          document.body.getBoundingClientRect()
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
  const {
    state: baseState,
    onEmptyAction,
    emptyLine,
    schema: collectionSchema,
    updateSchema: updateCollectionSchema,
    getLatestSchema,
  } = useBlockEmptyState(resolvedBlock, frame, pageId, onChange)
  // Pointer-selected (07.05): a click on the row's own chrome — never a nested
  // cell/input/button, which keeps its own focus — focuses the row and this
  // becomes `selected`. Mirrors keyboard focus (`onFocus`/`onBlur` below), gated
  // the same way: only when the ROW itself is the focus target, never a bubbled
  // focus from a field it hosts. Renders through PondBlock's own `selected`
  // state, never a second ring, so it only applies on top of `rest` — never
  // overrides empty/loading/error.
  const [rowSelected, setRowSelected] = useState(false)
  const sizable = blockAcceptsHeight(block)
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)
  const shownHeight = previewHeight ?? (sizable ? block.height : undefined)
  const constrained = shownHeight != null
  const sizeRef = useRef<HTMLDivElement>(null)
  const naturalFitRef = useRef<number | null>(null)
  // Keep the unsized height current. A board's rows arrive after the first
  // paint, and `block` does not change when they do — without an observer the
  // memory stays at the loading height and a later drag snaps to it.
  useLayoutEffect(() => {
    const node = sizeRef.current
    if (!node || constrained) return
    const remember = () => {
      const measured = node.offsetHeight
      if (measured > 0) naturalFitRef.current = measured
    }
    remember()
    const observer = new ResizeObserver(remember)
    observer.observe(node)
    return () => observer.disconnect()
  }, [constrained])
  const state = rowSelected && baseState === 'rest' ? 'selected' : baseState

  // `frame`'s CARD kind never flips for an existing block (it reads the persisted,
  // never-changing `block.mode`, not the active saved view's — the ruling above).
  // What DOES remount the module view underneath is `PondBlock` swapping `children`
  // for `PondBlockEmpty` on the empty↔rest `state` flip (e.g. picking a view whose
  // own kind isn't empty, or its remedy field landing a row) — CollectionView's own
  // `localActiveViewId` would then reseed from the block's PERSISTED `activeViewId`
  // and silently revert the bar to its stored tab. Carrying the bar's live selection
  // through `activeViewId` here lets the remount reseed to the same tab instead.
  const moduleData = useMemo(
    () => (block.type === 'view' && activeViewId ? { ...block, activeViewId } : block),
    [block, activeViewId]
  )

  // KAN-243 fix: `runAddView`'s undo must read "what is current right now" off
  // something that outlives EITHER `SavedViewBar` instance below (the
  // empty-state bar and `ViewControls`' own live bar swap in and out of this
  // very render as `state` flips empty/rest) — this per-block `BlockEditor`
  // instance never unmounts across that flip, so a ref owned here does.
  // Typed to `ViewBlock` since the two readers (below, and `SavedViewHostContext`'s
  // consumer) only ever exist for a `view`-type block.
  const latestViewBlockRef = useRef<ViewBlock>(moduleData as ViewBlock)
  useEffect(() => {
    if (block.type === 'view') latestViewBlockRef.current = moduleData as ViewBlock
  }, [block.type, moduleData])
  const savedViewHost = useMemo(
    () => ({ latestBlock: latestViewBlockRef, getLatestSchema, writeBlock }),
    [getLatestSchema, writeBlock]
  )

  // KAN-321 fix: `state === 'empty'` swaps `children` (the module view, bar
  // included) for `PondBlockEmpty` below — a views-shaped block's active saved
  // view with an emptying filter would otherwise strand the person with no tab
  // back to one that isn't. Rendered through `PondBlock`'s `headBar` slot,
  // which sits above whichever body (bar-and-rows or the empty box) draws.
  // KAN-243: adding a view is a real edit, but the PERSISTED `activeViewId`
  // stays whatever it already was — switching is reading, #421, same as the
  // ModuleView path's `committed` write below. The add's own activation
  // reaches this block only through `setActiveViewId` (the context below),
  // the same path a bar click already uses.
  const commitViewChange = (next: ViewBlock) =>
    onChange({ ...next, activeViewId: block.type === 'view' ? block.activeViewId : undefined })

  // A compact chart mark's voidBox draws its own line alone — no tabs, no
  // ＋ view — so it's excluded here whether or not it's wrapped in views[].
  const emptyStateViewBar =
    state === 'empty' && block.type === 'view' && compactChartMark(block) === null ? (
      <SavedViewBar
        block={activeViewId ? { ...block, activeViewId } : block}
        schema={collectionSchema}
        updateSchema={updateCollectionSchema}
        activeId={activeViewId}
        onSelect={setActiveViewId}
        editable
        onChange={commitViewChange}
        latestBlock={latestViewBlockRef}
        getLatestSchema={getLatestSchema}
        writeBlock={writeBlock}
      />
    ) : undefined

  // `moduleData` carries the bar's LIVE `activeViewId` (above), so a config
  // edit's `applyConfigPatch` spread would otherwise write it into the
  // persisted block — switching the bar is reading, not editing (#421).
  // Restore the block's own persisted `activeViewId` before this leaves
  // `BlockCanvas`; the views-array patch itself already landed correctly.
  function handleModuleChange(next: unknown) {
    const committed =
      block.type === 'view'
        ? ({ ...(next as ViewBlock), activeViewId: block.activeViewId } as Block)
        : (next as Block)
    slash.handleTextChange(committed)
    onChange(committed)
  }

  // KAN-355: a structural edit (add/remove/move/reorder) flushes the save the
  // typing before it left pending, applies itself, then flushes again — so it
  // lands as its own debounced save/change-log record instead of merging into
  // whatever edit comes next inside the same 600ms pause.
  function commitStep(patch: Block) {
    commitStructural(pageId, () => handleModuleChange(patch))
  }

  const view = (
    <BlockRowProvider
      value={{
        selected: state === 'selected',
        stepOut: onReturn,
        commitStep,
        leaveUp: onLeaveUp,
        leaveDown: onLeaveDown,
        select: selectRow,
      }}
    >
      <SlashLineContext.Provider value={slash.handleSlashLine}>
        <ActiveViewSelectionContext.Provider value={setActiveViewId}>
          <SavedViewHostContext.Provider value={savedViewHost}>
            <ModuleView
              type={block.type}
              data={moduleData}
              editable
              autofocus={autofocus}
              onChange={handleModuleChange}
            />
          </SavedViewHostContext.Provider>
        </ActiveViewSelectionContext.Provider>
      </SlashLineContext.Provider>
    </BlockRowProvider>
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
      handleMenuOpenChange(true)
      return
    }
    // ⇧F10 / the ContextMenu key (KAN-485): only on the row itself, so a field
    // the block hosts (a table cell, a todo label) keeps its own native menu.
    // `contextPoint` stays null, so the menu opens at the row's own anchor.
    if (isContextMenuKey(e.nativeEvent) && e.target === e.currentTarget) {
      e.preventDefault()
      // Windows follows this keydown with a native `contextmenu` for the same
      // key press (`handleContextMenu` below swallows it).
      keyboardMenuOpenRef.current = true
      handleMenuOpenChange(true)
      return
    }
    // Return on a selected row (KAN-367/KAN-344): a text row goes back into
    // editing, caret at the end; any other kind opens a line below it.
    if (
      e.key === 'Enter' &&
      e.target === e.currentTarget &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      e.preventDefault()
      if (block.type === 'text') {
        focusTextBlockSoon(block.id, 'end')
      } else {
        onReturn()
      }
      return
    }
    // ↑/↓ on a selected row (KAN-367) move the selection, in array order —
    // `onSelectPrev` always lands somewhere (the previous row, or block 0's
    // title); `onSelectNext` is only unset on the LAST block, where ↓ instead
    // keeps KAN-344's step-out (opens a line below it).
    if (
      e.key === 'ArrowUp' &&
      e.target === e.currentTarget &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      e.preventDefault()
      onSelectPrev?.()
      return
    }
    if (
      e.key === 'ArrowDown' &&
      e.target === e.currentTarget &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      e.preventDefault()
      if (onSelectNext) {
        onSelectNext()
      } else {
        onReturn()
      }
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
    // ⌥←/⌥→ only on the selected row itself (`e.target === e.currentTarget`):
    // inside a text editor or field, ⌥←/→ jump a word, and must keep doing so.
    if (e.altKey && e.key === 'ArrowLeft' && e.target === e.currentTarget) {
      e.preventDefault()
      onSwapLeft?.()
    }
    if (e.altKey && e.key === 'ArrowRight' && e.target === e.currentTarget) {
      e.preventDefault()
      onSwapRight?.()
    }
    // Esc clears the pointer-selected row (07.05) — the row itself does not blur
    // on Escape by default, so this blurs it explicitly; `handleBlur` below then
    // drops `rowSelected`.
    if (e.key === 'Escape' && e.target === e.currentTarget) {
      rootRef.current?.blur()
    }
    // Delete on the selected row removes the block. The key a Mac labels
    // Delete is Backspace; a forward-delete key is Delete. A field inside the
    // block is the event target then, so this never takes that field's own
    // delete — and ⌘⌫ stays the chord for a text caret (`handleKeyDownCapture`).
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      e.target === e.currentTarget &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      e.preventDefault()
      onDeleteBlock()
      return
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

  // The ungated setter — ⌘/ (`handleKeyDown` above) calls this directly, never
  // `handlePointerOpenChange` below: a stuck pointer state from an earlier
  // drag must never block the keyboard. A close always passes through here
  // regardless of caller.
  function handleMenuOpenChange(open: boolean) {
    onMenuOpenChange?.(open)
  }

  // Every open request the TRIGGER itself makes — Base UI opens it on
  // pointerdown and on a keyboard Enter/Space keydown, neither of which
  // touches `pressRef` — arrives here, never `handleMenuOpenChange` directly.
  // Desktop (KAN-485): the trigger never opens the menu, full stop — the
  // handle only drags, so every `open` request from it is dropped regardless
  // of how it was made; a close (Escape, outside click, picking an item)
  // still passes through. Phone keeps the tap-opens-the-menu path, gated the
  // old way: dropped while the press is still down or has moved past the
  // drag threshold, so a drag never opens it.
  function handlePointerOpenChange(open: boolean) {
    if (open && menuSize !== 'mobile') return
    if (open && (pressRef.current.down || pressRef.current.moved)) return
    handleMenuOpenChange(open)
  }

  function handleTriggerPointerDown(e: React.PointerEvent) {
    pressRef.current = {
      down: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      openAtDown: menuOpen ?? false,
    }
    setDragArmed(true)

    pressEndCleanupRef.current?.()
    const handleNode = e.currentTarget
    const handleDocumentPressEnd = (ev: PointerEvent) => {
      pressEndCleanupRef.current = null
      document.removeEventListener('pointerup', handleDocumentPressEnd)
      document.removeEventListener('pointercancel', handleDocumentPressEnd)
      // A `pointerup` ON the handle itself is followed by this same press's
      // own `click` (see `handleTriggerClick`), which still needs `moved`/
      // `openAtDown` exactly as this press left them — its own `onPointerUp`
      // below already resets `down` for that case. Only a release that lands
      // elsewhere, where no click is ever coming, is safe to reset here. A
      // `pointercancel` never leads to a click either way, wherever it lands.
      const onHandleRelease =
        ev.type === 'pointerup' &&
        (ev.target === handleNode || (ev.target instanceof Node && handleNode.contains(ev.target)))
      if (onHandleRelease) return
      pressRef.current.down = false
      pressRef.current.moved = false
      pressRef.current.openAtDown = false
      setDragArmed(false)
    }
    document.addEventListener('pointerup', handleDocumentPressEnd)
    document.addEventListener('pointercancel', handleDocumentPressEnd)
    pressEndCleanupRef.current = () => {
      document.removeEventListener('pointerup', handleDocumentPressEnd)
      document.removeEventListener('pointercancel', handleDocumentPressEnd)
    }
  }
  // Moved only past `HANDLE_PRESS_MOVE_THRESHOLD_PX` from the pointerdown
  // point — the spec is silent on a threshold (Notion uses one); a 1px jitter
  // on a shaky click must not suppress the click that follows (KAN-440).
  function handleTriggerPointerMove(e: React.PointerEvent) {
    if (!pressRef.current.down) return
    const dx = e.clientX - pressRef.current.startX
    const dy = e.clientY - pressRef.current.startY
    if (dx * dx + dy * dy > HANDLE_PRESS_MOVE_THRESHOLD_PX * HANDLE_PRESS_MOVE_THRESHOLD_PX) {
      pressRef.current.moved = true
    }
  }
  function handleTriggerPointerUp() {
    pressRef.current.down = false
    setDragArmed(false)
    // The click that follows this release (`handleTriggerClick` below) is
    // what selects the row on a no-move desktop release — doing it here too
    // would run `selectRow()` twice per press (KAN-485).
  }
  // An HTML5 drag never fires `pointerup` on the handle — it ends in
  // `pointercancel` (here) or the row's `dragend` below — so without this,
  // `down`/`moved` stay stuck true forever: on phone that blocks every later
  // open from this handle (`handlePointerOpenChange` gates the trigger's
  // click on both; ⌘/'s own gate-free path never minds), on desktop a stuck
  // `moved` blocks the trigger's click from selecting the row instead.
  function handleTriggerPointerCancel() {
    pressRef.current.down = false
    pressRef.current.moved = false
    setDragArmed(false)
  }
  // Phone (KAN-485) keeps the old click-opens-the-menu path: toggle against
  // the open state the PRESS saw at pointerdown, not the live prop — Base
  // UI's own trigger closes an already-open menu on this same press's
  // mousedown (before this click fires), so a click that started on an open
  // menu is that close's trailing click, not a new open request, and must
  // not reopen it. Desktop drops that path entirely (the handle only drags);
  // its own click — the one that follows a no-move mouse release, or
  // Enter/Space, which never sets `pressRef` at all — selects the row
  // instead, unless a drag past the threshold is what produced this click.
  function handleTriggerClick() {
    if (menuSize === 'mobile') {
      if (pressRef.current.openAtDown) return
      handlePointerOpenChange(true)
      return
    }
    if (pressRef.current.moved) return
    selectRow()
  }

  // ⌥↑/⌥↓ on the handle reorder the block: Menu.Trigger would otherwise take
  // the arrow to open the menu and keep it from reaching the block — but
  // desktop's handle (KAN-485) is a plain button, not a Menu.Trigger, so
  // there's no Base UI handler to suppress there; `preventBaseUIHandler` only
  // exists on the mobile path's Base UI-wrapped event. ⌘⌫ on the handle
  // deletes the block (board 8e) the same way a selected row's own ⌘⌫ does —
  // the handle has no `onKeyDownCapture` of its own, so this is that chord's
  // only path when the handle, not the row, holds focus.
  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      ;(e as BaseUIEvent<typeof e>).preventBaseUIHandler?.()
    }
    if (isDeleteBlockChord(e.nativeEvent)) {
      e.preventDefault()
      onDeleteBlock()
    }
  }

  // The row itself is "selected", never a bubbled focus from a field it hosts
  // (a table cell, a todo item's input) — those keep their own focus ring.
  function handleFocus(e: React.FocusEvent) {
    if (e.target === e.currentTarget) setRowSelected(true)
  }
  function handleBlur(e: React.FocusEvent) {
    if (e.target === e.currentTarget) setRowSelected(false)
    const next = e.relatedTarget
    if (next instanceof Node && e.currentTarget.contains(next)) return
    // The file dialog blurs the upload field with nowhere to land. That is
    // the picker opening, not the person leaving the block.
    if (e.target instanceof HTMLInputElement && e.target.type === 'file') return
    const root = e.currentTarget
    if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current)
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null
      const guard = exitGuardRef.current
      if (guard.slash || guard.menu || guard.preview || guard.dragging) return
      const active = document.activeElement
      if (active && root.contains(active)) return
      onExitEmpty?.()
    }, 0)
  }
  // A click anywhere on the row's own chrome (padding, header, empty space)
  // focuses the row; a click inside a cell/input/button/link leaves that
  // field's own focus alone (`shouldSelectCardFromClick`, shared with the
  // view's own row click). jsdom (unlike a real browser) never focuses a
  // clicked `tabIndex=0` div on its own, so the explicit `.focus()` also
  // makes this testable with `userEvent.click`.
  // A portaled child (RecordPeek) renders outside this row in the DOM but
  // stays inside it in the React tree, so its click still bubbles here even
  // though `e.target` is not a DOM descendant of `e.currentTarget`.
  function handleClick(e: React.MouseEvent) {
    if (block.type === 'text') return
    if (!e.currentTarget.contains(e.target as Node)) return
    if (!shouldSelectCardFromClick(e.target)) return
    rootRef.current?.focus()
  }

  // Right-button press (KAN-485): record whether a non-collapsed selection
  // inside the row already existed, before the browser's own right-click
  // word-select (its `pointerdown` default action, which runs after this
  // bubbling listener) can create one. `handleContextMenu` reads this
  // recorded fact instead of the live selection. macOS ctrl+click is a
  // button-0 pointerdown followed by a `contextmenu`, same as a real
  // right-press, so it needs the same recorded selection.
  //
  // `keyboardMenuOpenRef` clears on ANY pointerdown on the row, not just a
  // right-press: ⇧F10 opens the menu from the keyboard without a trailing
  // `contextmenu` on macOS, so a later left-click elsewhere on the row (which
  // only fires a plain pointerdown) must still drop the stale flag before a
  // ctrl+click's own `contextmenu` arrives.
  function handleRowPointerDown(e: React.PointerEvent) {
    if (!e.currentTarget.contains(e.target as Node)) return
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      const sel = window.getSelection()
      rightPressSelectionRef.current = !!(
        sel &&
        !sel.isCollapsed &&
        sel.rangeCount > 0 &&
        rootRef.current?.contains(sel.anchorNode)
      )
    }
    keyboardMenuOpenRef.current = false
  }

  // Right-click opens the block menu at the pointer (KAN-485), replacing the
  // browser's own menu. `chrome=false` (zen) leaves the native menu, same as
  // the hidden handle. `isContextMenuField` is narrower than the plain-click
  // guard `shouldSelectCardFromClick` (whose `INTERACTIVE` list is a whole
  // `td`/`role="button"` card, not just a field) — a right-click only needs
  // to leave the native menu for an actual text field (a table cell's input,
  // a todo item's own field), so a page-link card, a highlight passage or a
  // table cell itself still open the block menu. A non-collapsed selection
  // that already existed at the right-button press is a copy/paste in
  // progress: the native menu stays for that, whatever the block type.
  function handleContextMenu(e: React.MouseEvent) {
    if (!e.currentTarget.contains(e.target as Node)) return
    if (!chrome) return
    if (isContextMenuField(e.target)) return
    if (keyboardMenuOpenRef.current) {
      keyboardMenuOpenRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (rightPressSelectionRef.current) return
    e.preventDefault()
    e.stopPropagation()
    setContextPoint({ x: e.clientX, y: e.clientY })
    handleMenuOpenChange(true)
  }

  // Esc inside a text editor (KAN-367): focusing the row's own element is
  // what `handleFocus` above already reads `rowSelected` off, same as a
  // card's own click-to-select.
  function selectRow() {
    rootRef.current?.focus()
  }

  function handleHeightPreview(next: number) {
    setPreviewHeight(next)
  }
  function handleHeightCancel() {
    setPreviewHeight(null)
  }
  function handleHeightCommit(result: { clear: true } | { height: number }) {
    setPreviewHeight(null)
    if (!onHeightCommit) return
    if ('clear' in result) {
      if (block.height == null) return
      onHeightCommit(blockWithoutHeight(block))
      return
    }
    if (block.height === result.height) return
    onHeightCommit({ ...block, height: result.height })
  }

  const viewScrollsItself = block.type === 'view' && (state === 'rest' || state === 'selected')
  const card = frame ? (
    <PondBlock
      kind={frame.kind}
      heading={frame.heading}
      headNote={frame.headNote}
      state={state}
      onEmptyAction={onEmptyAction}
      emptyLine={emptyLine}
      emptyBox={blockEmptyBox(resolvedBlock)}
      headBar={emptyStateViewBar}
      size={menuSize}
      constrained={constrained}
      bodyScroll={viewScrollsItself ? 'self' : 'pane'}
    >
      {view}
      {changedMark}
    </PondBlock>
  ) : block.type === 'text' ? (
    // Bare prose: `padding 2px 4px`, no card. Selected draws the library's
    // ring here instead of on the row (the row excludes text, ~:3699) since
    // there is no card for that ring to sit on.
    <div
      data-part="prose"
      className={cn(
        untouched && UNTOUCHED_HINT_CLASS,
        hoverGhost && HOVER_GHOST_CLASS,
        state === 'selected' && POND_BLOCK_SELECTED_RING_ROUNDED
      )}
      data-hover-ghost={hoverGhost || undefined}
      style={{ paddingBlock: TEXT_BLOCK_TOP_INSET_PX, paddingInline: TEXT_BLOCK_INSET_PX }}
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
      {changedMark}
    </div>
  ) : (
    // #227: a block that is its OWN card — the chart card — sits on the page as it is.
    <>
      {view}
      {changedMark}
    </>
  )

  // Desktop (KAN-485): a plain button, never Base UI's `Menu.Trigger` — the
  // handle only drags/selects here, so wiring it as the trigger would wear
  // `aria-haspopup`/`aria-expanded` for a popup this element never opens.
  // Phone still passes it as PondMenu's `trigger` (the old tap-opens path).
  const handleButton = (
    <button
      type="button"
      className={cn(
        'flex cursor-grab items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-mn-text',
        menuSize === 'mobile' ? 'h-11 w-11 rounded-[14px]' : 'h-6 w-3 rounded-[6px]',
        menuOpen ? 'bg-mn-hover-fill text-mn-text' : 'text-mn-text-secondary'
      )}
      title="drag to move"
      aria-label="drag to move"
      onPointerDown={handleTriggerPointerDown}
      onPointerMove={handleTriggerPointerMove}
      onPointerUp={handleTriggerPointerUp}
      onPointerCancel={handleTriggerPointerCancel}
      onClick={handleTriggerClick}
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
  )

  return (
    <div
      ref={rootRef}
      className={cn(
        'group relative',
        'outline-none',
        // A calendar sits in a card, so selecting it draws the card's ring.
        // A board draws its own lanes and has no card, so the same ring goes
        // on the row itself — otherwise a click selects it and nothing shows.
        // A chart card and a page-link draw no `frame` either, but each rings
        // ITS OWN card via `useBlockRow().selected`
        // (`src/lib/modules/chart/card.tsx`, `src/lib/modules/page-link/view.tsx`),
        // so the row excludes both here too.
        state === 'selected' &&
          !frame &&
          block.type !== 'text' &&
          block.type !== 'page-link' &&
          !(block.type === 'view' && isChartCard(block)) &&
          POND_BLOCK_SELECTED_RING_ROUNDED,
        settleOnMount && 'motion-settle-in',
        // `origin` (old place) from `PondBlock.dc.html` is opacity .4 ONLY — the
        // tilt and stepped-up shadow belong to the separate `lifted` copy, built
        // where the drag preview is drawn (not this node).
        isDragging &&
          'opacity-40 transition-opacity duration-[var(--motion-quick)] ease-[var(--ease-mn)] motion-reduce:transition-none'
      )}
      id={blockDomId(block.id)}
      data-block-id={block.id}
      // Focusable so a copied link to the block can land on it, and a tab stop
      // when it is not text so Return can reach it; a text block's focus is its editor.
      tabIndex={block.type === 'text' ? -1 : 0}
      {...(block.type === 'text'
        ? {}
        : {
            role: 'group',
            'aria-label': blockName(block, frame),
            'aria-keyshortcuts': 'Enter Shift+F10 ContextMenu',
          })}
      draggable={dragArmed}
      onDragStart={onDragStart}
      onDragEnd={() => {
        setDragArmed(false)
        // The row's own dragend, not the handle's pointerup, is how an HTML5
        // drag from this handle ends (KAN-440) — reset here too, or `down`
        // stays true and blocks every later open from this handle.
        pressRef.current.down = false
        pressRef.current.moved = false
        onDragEnd?.()
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onKeyDownCapture={handleKeyDownCapture}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleClick}
      onPointerDown={handleRowPointerDown}
      onContextMenu={handleContextMenu}
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
          this takes (`size="mobile"`, below). Press-and-drag reorders; a
          no-move release selects the row. Phone keeps a tap opening the
          block menu (KAN-485); mobile's `delete` row lives there. Desktop has
          no menu row for it (board 8e) — ⌘⌫ on the handle itself (focused via
          Tab, below) deletes the block directly, same as a selected row's own
          ⌘⌫ (`handleKeyDownCapture`). Inside the card
          it must stack ABOVE the body that follows it in the DOM (the card's
          paper, a text block's editor) or taps land on the body: `z-[1]`, the
          lowest lift that does it, under every floating surface (z ≥ 4).
          Desktop's own grip sits further out (`-left-3.5`), where a row-mate's
          shared edge strip (KAN-505, `z-[1]`) reaches into the same pixels —
          but that fight is won one level up, on the sizing div outside this
          card (`liftAboveSharedStrip`, above): a card with `motion-settle-in`
          keeps a `transform` (fill-mode `both`) long after it finishes,
          which makes the card its own stacking context and would trap any
          z-index raised in here instead. This `z-[1]` only has to clear the
          body beside it, same as before KAN-505. */}
      <div
        data-part="handle"
        hidden={!chrome}
        className={cn(
          'absolute',
          menuSize === 'mobile'
            ? 'right-0.5 top-0.5 z-[1]'
            : [
                '-left-3.5 z-[1] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
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
          onOpenChange={handlePointerOpenChange}
          onSelect={onMenuSelect ?? (() => {})}
          placement={
            contextAnchor
              ? { anchor: contextAnchor, ...POINT_MENU_PLACEMENT }
              : { anchor: rootRef, ...MENU_PLACEMENT[menuSize] }
          }
          trigger={menuSize === 'mobile' ? handleButton : undefined}
        />
        {menuSize !== 'mobile' && handleButton}
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

      {/* A view, image or table (KAN-442) is sized here when it has a height;
          the strips sit on that box. The card itself — frame, prose, or a
          block that is its own card — is `card`, and carries the accept mark. */}
      {sizable ? (
        <div
          ref={sizeRef}
          data-part="block-size"
          className={cn('relative', constrained && 'flex min-h-0 flex-col')}
          style={constrained ? { height: shownHeight } : undefined}
        >
          <BlockHeightProvider constrained={constrained}>{card}</BlockHeightProvider>
          {chrome && !reorderDrag && (
            <BlockHeightHandles
              sizeRef={sizeRef}
              height={block.height ?? null}
              rememberedFitRef={naturalFitRef}
              neighbours={heightNeighbours}
              onPreview={handleHeightPreview}
              onCommit={handleHeightCommit}
              onCancel={handleHeightCancel}
            />
          )}
        </div>
      ) : (
        card
      )}
    </div>
  )
}
