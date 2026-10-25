'use client'

/**
 * The left rail — a true VS Code-grade recursive file tree, rooted at Life
 * (ticket-28), on the Make Noise language: hairline indentation guides, a calm
 * authored chevron, breathing row rhythm, and the muted dot language. Each row
 * is a `RailRow` — the interactive treeitem host around a presentational
 * `PondMolecule list-row` (#95, the TreeRow absorption).
 *
 * ONE continuous tree. Life is the root folder at depth 0 — not a separate
 * header button, but the first `treeitem`. Everything nests under it:
 * Life › area › page › sub-page, to arbitrary depth. Any node with children is
 * a folder (disclosure chevron); any leaf is a file. A composite page (blocks
 * AND children, ticket-22) is a folder that also opens as a document — VS Code's
 * split, kept strict: the caret toggles expand, the label opens, and the label
 * never toggles.
 *
 * Life is the workspace root, NOT a row in `pages`: its label, rename and
 * delete go through the home row (KAN-490/491), and its caret is a collapse-all
 * (collapsing closes every folder, so re-opening shows the resting top level).
 * The data source is unchanged — the
 * `['pages']` query + parent_id tree — this is a view-layer restructure.
 *
 * Split for Storybook: <RailView> is presentational (all data and mutations
 * raised as props) but OWNS the roving focus + keyboard machine, since focus is
 * a view concern; <Rail> is the container that wires Supabase + React Query.
 *
 * Keyboard (WAI-ARIA APG tree — pure rules in `lib/rail/tree.ts`, jest-covered):
 * one roving tab stop; ↑/↓ move, → expands / steps into the first child,
 * ← collapses / steps out to the parent, Enter/Space open, Home/End jump,
 * Delete/⌫ deletes the focused row (through the same confirm/undo path as ×),
 * + adds a child, F2 renames in place. The row's ＋/× are not tab stops — the
 * tree has the one — and are reached through + and Delete. When the focused row vanishes (deleted, or hidden by an
 * ancestor collapse) focus falls to the nearest surviving neighbor, VS Code
 * style.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePagePrefetchHandlers } from '@/lib/pages/use-page-prefetch'
import { createPage, movePage, updateTitle } from '@/lib/pages/client'
import { DuplicateTitleError, nextAvailableTitle } from '@/lib/pages/dedupe-title'
import {
  fetchPages,
  insertPageOptimistic,
  applyMoveOptimistic,
  applyRenameOptimistic,
  applyGlyphOptimistic,
  applyAreaRoleOptimistic,
  type PageRow,
} from '@/lib/pages/tree'
import { setPageGlyph, setAreaRole } from '@/lib/pages/mark-client'
import { appendOwnEdit } from '@/lib/change-log/store'
import { changeLogKey } from '@/lib/change-log/keys'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { TrashRefusedError } from '@/lib/change-log/errors'
import { readMoveSnapshot, moveParentLabel } from '@/lib/change-log/page-changes'
import { jsonEqual } from '@/lib/json-equal'
import { homeQueryKey, pagesKey } from '@/lib/pages/keys'
import { appendChildLinkUnder, trashPageUnlinked } from '@/lib/pages/child-links'
import { usePondId, usePond } from '@/lib/pond/context'
import { useHomePage } from '@/lib/pages/use-home-page'
import { pushRecentGlyphToPond } from '@/lib/pond/client'
import { PondSwitcher } from './PondSwitcher'
import { openWorkspaceUrl, workspaceUrl } from '@/lib/pages/nav'
import { withTemplatesParam } from '@/lib/pages/templates-param'
import { markIndex, resolveMark, type MarkSource, type PageMark } from '@/lib/pages/mark'
import { isNewNestedPage } from '@/lib/pages/nested-page'
import { markAccent, pushRecentGlyph, isAreaRole, type AreaRole } from '@/lib/rail/glyph-library'
import { ancestorPath, areaOf } from '@/lib/pages/crumbs'
import { GlyphPicker, glyphPickerHeight } from '@/components/molecules/GlyphPicker'
import { GlyphPickerSheet } from '@/components/molecules/GlyphPickerSheet'
import type { PickerSide } from '@/components/molecules/use-anchored-box'
import { sideTowardFreeSpace } from '@/lib/layout/caret-anchor'
import { useBelowMd } from '@/lib/layout/use-below-md'
import { usePondGlyph } from '@/lib/pond/glyph'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import {
  DATABASES_ROOT_TITLE,
  getOrCreateDatabasesRoot,
  isDatabasesRoot,
} from '@/lib/pages/databases-root'
import { usePondName } from '@/lib/pond/name'
import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import { TRASH_NODE_ID } from '@/lib/change-log/trash-view'
import { RailToggle } from '@/components/organisms/RailToggle'
import { setRailMinimized } from '@/lib/layout/rail-chrome'
import { RAIL_WIDTH_PX } from '@/lib/layout/rail-width'
import {
  LIFE_ID,
  buildTree,
  flattenVisible,
  isAreaRow,
  isExtraRootNode,
  splitExtraRoots,
  treeKeyCommand,
  focusFallback,
  canMove,
  computeMove,
  type RailNode,
  type FlatRow,
  type DropZone,
  type TreeKeyCommand,
} from '@/lib/rail/tree'
import {
  countDescendants,
  subtreeIds,
  needsConfirm,
  blastRadiusLabel,
} from '@/lib/deletion/blast-radius'
import { removeRow, restoreRow } from '@/lib/deletion/row-cache'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { isStaged, priorLifeIds, unstageId } from '@/lib/deletion/staged-ids'
import type { CommitReason } from '@/lib/deletion/deferred-commit'
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { AreaMark } from '@/components/atoms/AreaMark'
import { PondMark } from '@/components/atoms/PondMark'
import { KindDot } from '@/components/atoms/PondAtom'
import { Caret } from '@/components/atoms/Caret'
import { RailRenameField } from './RailRenameField'
import { instantiateTemplate } from '@/lib/templates/instantiate'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { NewPageMenu, type NewPageMenuAction } from '@/components/molecules/NewPageMenu'
import { readExpandedIds, writeExpandedIds, pruneExpandedIds } from '@/lib/rail/expanded-store'

// Re-exported so stories and consumers keep one import site for the tree types.
export { LIFE_ID, buildTree, flattenVisible, isFolderNode, isAreaRow } from '@/lib/rail/tree'
export type { RailNode, FlatRow } from '@/lib/rail/tree'

// ── The rail's tree row (the TreeRow absorption, #95) ────────────────────────
//
// The interactive treeitem HOST around a presentational `PondMolecule
// list-row`. The molecule renders the row's body (dot · label · state washes)
// off the Make Noise role tokens; this host owns everything behavioural — the
// WAI-ARIA treeitem contract (aria-level/posinset/setsize, the roving tab
// stop), drag-to-reparent, the indentation guides, the caret, and the
// hover-CRUD — and docks its affordances through the molecule's `leading` /
// `trailing` slots. Focus / keydown fire only for the row itself (guarded on
// event target) so inner controls never double-drive the tree.
//
// The HOST draws the row box `PondRail.dc.html` specifies — padding
// `5px 8px 5px 4px`, gap 7, radius 10 and the whole-row wash — so the wash
// covers the caret and the indent, not just the label. The molecule inside is
// the label body only: no padding, no wash.

/** The foot's databases row while the pond has no databases root: the board always draws it. */
const DATABASES_PLACEHOLDER_ID = '__databases__'
const DATABASES_PLACEHOLDER_ROW: FlatRow = {
  id: DATABASES_PLACEHOLDER_ID,
  node: {
    id: DATABASES_PLACEHOLDER_ID,
    parentId: null,
    type: 'page',
    title: DATABASES_ROOT_TITLE,
    order: 0,
    children: [],
  },
  depth: 0,
  isFolder: false,
  posInSet: 1,
  setSize: 1,
}

/** The databases root's first child, reserved (KAN-94): no row, no migration,
 *  same virtual shape as `DATABASES_PLACEHOLDER_ROW` — only shown once the root
 *  itself is expanded, exactly like a real child. */
const changeLogRow = (rootId: string): FlatRow => ({
  id: CHANGE_LOG_NODE_ID,
  node: {
    id: CHANGE_LOG_NODE_ID,
    parentId: rootId,
    type: 'page',
    title: 'change log',
    order: -1,
    children: [],
  },
  depth: 1,
  isFolder: false,
  posInSet: 1,
  setSize: 1,
})

/** The rail foot's own top-level row (KAN-504), between the databases tree
 *  and `settings` — not a databases child, so it needs no root to exist
 *  under and no expand to show: a plain module-level constant, same
 *  reserved-virtual shape as `DATABASES_PLACEHOLDER_ROW`, same reasons as
 *  `changeLogRow` (no row, no migration). */
const TRASH_ROW: FlatRow = {
  id: TRASH_NODE_ID,
  node: {
    id: TRASH_NODE_ID,
    parentId: null,
    type: 'page',
    title: 'trash',
    order: 0,
    children: [],
  },
  depth: 0,
  isFolder: false,
  posInSet: 1,
  setSize: 1,
}

/** Px of extra left-pad per depth level — the guides land on these gridlines. */
/** What the rail lets a row do, derived once per row so no site re-derives it. */
interface RowCapabilities {
  /** Can be picked up and moved. */
  draggable: boolean
  /** Can take a drop: a before/after reorder or an into-reparent. */
  droppable: boolean
  /** Can take a child: the ＋ tool and the `+` key. */
  addable: boolean
  /** Can be deleted: the × tool and the Delete key. */
  deletable: boolean
  /** Can be renamed from the rail: F2 and double-click. */
  renameable: boolean
}

const NO_CAPABILITIES: RowCapabilities = {
  draggable: false,
  droppable: false,
  addable: false,
  deletable: false,
  renameable: false,
}

/**
 * The pond root is a drop target and the one row a page is added under when the
 * pond is empty — but not while it is, since an empty pond's root draws no ＋. The
 * placeholder is no page at all. The databases root is a foot row: it can be moved
 * and dropped on, never added to, deleted or renamed.
 */
const rowCapabilities = (id: string, node: RailNode): RowCapabilities => {
  // KAN-491: the home root renames and deletes like any other row. It still
  // does not drag — it is the workspace root, not a page you reparent.
  if (id === LIFE_ID)
    return { ...NO_CAPABILITIES, droppable: true, addable: true, deletable: true, renameable: true }
  if (id === DATABASES_PLACEHOLDER_ID || id === CHANGE_LOG_NODE_ID || id === TRASH_NODE_ID)
    return NO_CAPABILITIES
  if (isDatabasesRoot(node)) return { ...NO_CAPABILITIES, draggable: true, droppable: true }
  // KAN-490/491: an extra root never drags — a drop must not leave `props.root`
  // on a page with a parent, so dragging is disallowed outright rather than
  // special-cased at drop time.
  if (isExtraRootNode(node))
    return { draggable: false, droppable: true, addable: true, deletable: true, renameable: true }
  return { draggable: true, droppable: true, addable: true, deletable: true, renameable: true }
}

/** Does the row allow the tree command? Navigation commands are always allowed. */
const allowsCommand = (cap: RowCapabilities, kind: TreeKeyCommand['kind']): boolean => {
  if (kind === 'addChild') return cap.addable
  if (kind === 'rename') return cap.renameable
  return true
}

const INDENT_STEP = 14
/** The board row's own left padding; depth indentation adds to it. */
const INDENT_BASE = 4
/** Half the caret slot (9px) — where a guide sits under its ancestor's caret. */
const GUIDE_OFFSET = 4

interface RailRowProps {
  id: string
  title: string
  depth: number
  isFolder: boolean
  isExpanded: boolean
  isSelected: boolean
  /** The single roving tab stop lands here; arrow keys move it (APG tree). */
  isFocused: boolean
  isBusy: boolean
  /** The home root. It renames and deletes (KAN-491); the flag is the row's
   *  own voice (area label, full ink), not a capability gate. */
  isRoot?: boolean
  /** An area row — the raised label voice + its accent dot. The caller decides
   *  with `isAreaRow` (a top-level page). */
  isArea?: boolean
  /** The databases root: the foot band's LAST row (KAN-486: it never moves —
   *  its own rows render above it), caret up when open, right when closed. */
  isDbRoot?: boolean
  posInSet?: number
  setSize?: number
  /** Muted accent for the area dot; omit to render no dot (leaves). */
  accent?: string
  /** Settle-in entrance for rows revealed on expand. */
  settleOnMount?: boolean
  /** A leading mark slot (an area's glyph, the Life root's waves — #91) —
   *  replaces the dot. */
  leading?: ReactNode
  /** KAN-122: a non-shared row note (`new`, for a nested page not yet
   *  opened) — mono, ink .68, `flex:none`. Rides alongside `row-tools`, never
   *  replaces it. Absent once the page has been opened. KAN-75's shared row
   *  notes reuse this same slot. */
  rowNote?: string

  onSelect: (id: string) => void
  onToggle: (id: string) => void
  /** New-page menu (6s f1): the row owns its own Base UI `Menu.Root`/`Trigger`
   *  so the visible ＋ IS the menu's real trigger — a trigger rendered
   *  elsewhere (controlled purely by `open`) raced Base UI's own outside-press
   *  detection and intermittently swallowed the opening click. */
  newPageMenuOpen?: boolean
  onNewPageMenuOpenChange?: (id: string, open: boolean) => void
  onNewPageMenuSelect?: (id: string, action: NewPageMenuAction) => void
  onDelete?: (id: string) => void
  /** Absent for rows that cannot be renamed from the rail (the pond root, databases). */
  onRenameStart?: (id: string) => void
  /** This row's label is the rename field (`PondRail` `renaming`). */
  isRenaming?: boolean
  onRenameKeep?: (id: string, value: string, refocus: boolean) => void
  onRenameCancel?: (id: string) => void
  onFocus: (id: string) => void
  onKeyDown: (id: string, e: KeyboardEvent<HTMLDivElement>) => void

  // ── Drag-to-reparent/reorder (F25) ────────────────────────────────────────
  draggable?: boolean
  /** This row is the one being dragged — the source quiets to .35 while the
   *  rail's floating ghost chip follows the pointer (`PondRail` `dragging`). */
  isDragging?: boolean
  dropZone?: DropZone | null
  isDropRejected?: boolean
  onDragStart?: (id: string, e: DragEvent<HTMLDivElement>) => void
  onDragOver?: (id: string, e: DragEvent<HTMLDivElement>) => void
  onDragLeave?: (id: string, e: DragEvent<HTMLDivElement>) => void
  onDrop?: (id: string, e: DragEvent<HTMLDivElement>) => void
  onDragEnd?: (id: string, e: DragEvent<HTMLDivElement>) => void
}

const RailRow = forwardRef<HTMLDivElement, RailRowProps>(function RailRow(
  {
    id,
    title,
    depth,
    isFolder,
    isExpanded,
    isSelected,
    isFocused,
    isBusy,
    isRoot = false,
    isArea = false,
    isDbRoot = false,
    posInSet,
    setSize,
    accent,
    settleOnMount = false,
    leading,
    rowNote,
    onSelect,
    onToggle,
    newPageMenuOpen = false,
    onNewPageMenuOpenChange,
    onNewPageMenuSelect,
    onDelete,
    onRenameStart,
    isRenaming = false,
    onRenameKeep,
    onRenameCancel,
    onFocus,
    onKeyDown,
    draggable = false,
    isDragging = false,
    dropZone = null,
    isDropRejected = false,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  },
  ref
) {
  // Hover is host state: the wash is the host's, and a keyboard user reaches the
  // CRUD through group-focus-within regardless.
  const [hovered, setHovered] = useState(false)
  // The entrance animation fills `both`, which pins opacity at 1 for good and
  // would swallow the dragging dim — so the class is dropped once it has played
  // (or the row is picked up), and never re-added.
  const [settled, setSettled] = useState(false)
  // The new-page menu's own anchor — local to this row now that the row's ＋
  // is the menu's real trigger, rather than a map the host read by id.
  const addChildRef = useRef<HTMLButtonElement>(null)
  // KAN-388: hovering or focusing an unopened row warms its page's cache so
  // the click that follows never blanks the canvas. No-ops where there's no
  // `QueryClientProvider` above (Storybook, several `rail-*` unit tests).
  const getSupabase = useLazySupabase()
  const pagePrefetch = usePagePrefetchHandlers(id, getSupabase)
  const label = title || 'Untitled'
  const padLeft = INDENT_BASE + depth * INDENT_STEP
  /** The board's own split (`PondRail.dc.html`: `areaRow = d <= 1`): the root and
   *  an area row carry 13.5 type, everything deeper 13. Read off the node, not the
   *  depth, because the databases tree is flattened from its own root. */
  const isAreaRow = isRoot || isArea
  // Ink tiers on the label: root, area rows, the selected row and the hovered row
  // are full ink; every other page row is the .68 tier. The databases root has no
  // colour of its own in the board, so it is full at rest.
  const isFullInk = isSelected || hovered || isAreaRow || isDbRoot
  // `PondRail.dc.html`: the selected row draws ＋ alone, a hovered one ＋ and ×.
  const showPlus = isSelected || hovered
  // The tools sit out of flow (absolutely, over the row's own right padding —
  // KAN-314), so they take no flow width at rest and the label needs no extra
  // clearance. Only while a control is actually drawn does the label give up
  // the width it would overlap: the row's own 7px gap plus ＋ alone (7+12=19),
  // or plus ＋ · gap 8 · × together (7+12+8+12=39). `group-focus-within` covers
  // the keyboard case, where both draw regardless of `hovered`/`showPlus`.
  const toolsPad = hovered ? 'pr-[39px]' : showPlus ? 'pr-[19px]' : ''

  return (
    <div
      ref={ref}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-expanded={isFolder ? isExpanded : undefined}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      tabIndex={isFocused ? 0 : -1}
      data-tree-row={id}
      draggable={draggable && !isRenaming}
      onAnimationEnd={() => setSettled(true)}
      onDragStart={
        onDragStart
          ? (e) => {
              setSettled(true)
              onDragStart(id, e)
            }
          : undefined
      }
      onDragOver={onDragOver ? (e) => onDragOver(id, e) : undefined}
      onDragLeave={onDragLeave ? (e) => onDragLeave(id, e) : undefined}
      onDrop={onDrop ? (e) => onDrop(id, e) : undefined}
      onDragEnd={onDragEnd ? (e) => onDragEnd(id, e) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerEnter={pagePrefetch.onPointerEnter}
      onPointerLeave={pagePrefetch.onPointerLeave}
      // The whole row opens the page (the caret and ＋/× stop propagation) —
      // strictly navigation; expansion belongs to the caret alone.
      onClick={() => onSelect(id)}
      onDoubleClick={onRenameStart ? () => onRenameStart(id) : undefined}
      onFocus={(e) => {
        // Only the row itself — focusing an inner control (＋/×) must not yank
        // the roving focus back to the row.
        if (e.target === e.currentTarget) {
          onFocus(id)
          pagePrefetch.onFocus()
        }
      }}
      onBlur={(e) => {
        // Same guard as onFocus — losing focus to an inner control must not
        // cancel a hold the row itself still owns.
        if (e.target === e.currentTarget) pagePrefetch.onBlur()
      }}
      onKeyDown={(e) => {
        // Only keys pressed on the row itself — Enter on an inner ＋/× button
        // already clicks it; it must not also bubble into an "open" command.
        if (e.target === e.currentTarget) onKeyDown(id, e)
      }}
      className={`group relative flex items-center rounded-mn-row outline-none
        ${isDbRoot ? 'gap-[9px] px-2 py-[6px]' : 'gap-[7px] py-[5px] pr-2'}
        focus-visible:ring-2 focus-visible:ring-mn-text/50 focus-visible:ring-offset-0
        ${isArea && !isDbRoot ? 'mt-1' : ''}
        ${isSelected ? 'bg-mn-hover-fill' : hovered ? 'bg-mn-rail-hover' : ''}
        ${isDropRejected ? 'cursor-not-allowed' : 'cursor-pointer'}
        ${isDragging ? 'opacity-[.35]' : ''}
        ${dropZone === 'into' ? 'ring-2 ring-inset ring-mn-text/50 ' : ''}${settleOnMount && !settled ? 'motion-settle-in ' : ''}`}
      style={isDbRoot ? undefined : { paddingLeft: padLeft }}
    >
      {/* Drop-line for a before/after reorder — a calm rule at the row's
          top/bottom edge; pointer-events-none so it never eats a drag event.
          The board draws it 58px from the card's left and 16px from its right;
          the row sits 8px inside the card, so the line is inset 50 and 8 from it. It
          is out of flow on purpose: an in-flow line would move the row under the pointer and
          flicker the zone. The into-highlight is the ring on the row itself. */}
      {(dropZone === 'before' || dropZone === 'after') && (
        <span
          aria-hidden
          data-part="drop-line"
          className={`pointer-events-none absolute right-2 left-[50px] h-0.5 rounded-mn-hair bg-mn-text ${
            dropZone === 'before' ? '-top-px' : '-bottom-px'
          }`}
        />
      )}

      {/* Indentation guides — one hairline per ancestor level. */}
      {Array.from({ length: depth }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute top-0 bottom-0 w-px bg-mn-text/[0.09]"
          style={{ left: INDENT_BASE + i * INDENT_STEP + GUIDE_OFFSET }}
        />
      ))}

      {/* caret — toggles the folder without navigating and without taking
          focus (the row keeps the roving tab stop); leaf gets a spacer */}
      {isFolder ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="grid w-[9px] flex-shrink-0 place-items-center text-mn-text-secondary"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(id)
          }}
        >
          {/* KAN-486: the databases root's rows render above it, never below —
              so its caret points UP when open rather than down. */}
          <Caret className={isExpanded ? (isDbRoot ? '-rotate-90' : 'rotate-90') : undefined} />
        </button>
      ) : (
        <span className="w-[9px] flex-shrink-0" aria-hidden />
      )}

      <PondMolecule
        kind="list-row"
        // `selected` is what turns the dot to full ink; the wash it would also paint on
        // the label body is cleared, because the host paints it across the whole row.
        state={isSelected ? 'selected' : 'rest'}
        title={label}
        meta=""
        handle={false}
        // `leading` (markButton, below) always carries the row's mark now, dot or
        // glyph, and re-implements the selected-row ink rule itself — the molecule's
        // own kind dot would just double it.
        dot={false}
        accent={accent}
        emphasis={isAreaRow || isSelected}
        leading={leading}
        titleField={
          isRenaming && onRenameKeep && onRenameCancel ? (
            <RailRenameField
              title={label}
              onKeep={(value, refocus) => onRenameKeep(id, value, refocus)}
              onCancel={() => onRenameCancel(id)}
            />
          ) : undefined
        }
        trailing={
          isRenaming ? null : (
            <>
              {/* A non-shared row note (KAN-122: `new`, for a nested page not yet
                  opened) — sits in flow, right after the label, alongside the
                  out-of-flow row-tools rather than replacing it. */}
              {rowNote && (
                <span
                  data-part="row-note"
                  className="flex-none font-mono text-[10px] lowercase text-mn-text-secondary max-md:text-[11px]"
                >
                  {rowNote}
                </span>
              )}
              {/* The row is the tree's roving tab stop; ＋ and × ride along on it rather
                than adding stops of their own (tabIndex -1), reached instead by + and
                Delete. The mark button is the one exception — it follows the row's own
                roving tabIndex (markButton, below) so Tab from the focused row reaches
                it without adding a stop per row. The selected row shows ＋ alone; a
                hovered or focused row shows ＋ and ×. The slot sits out of flow —
                absolutely, over the row's own right padding (KAN-314) — so it takes
                no width when nothing is shown, and × always lands at the same point
                (the row's right edge) whether the row is at rest or hovered: pointing
                there is pointing at the row itself (the row owns the hover state), so
                × is reachable with one click and no row click first. ＋ is the one
                thing that moves — alone at that same edge when selected-and-unhovered,
                one slot left of × (gap 8) once × also draws. The home root takes ＋
                and × (KAN-491). ＋'s margin-right move is NOT animated (KAN-320) — a pointer
                aimed at ×'s point during the slide must never catch ＋ mid-move — and
                × stacks above ＋ (z-[1]) so ×'s point always resolves to × even if the
                two ever overlap. */}
              {(onNewPageMenuOpenChange || onDelete) && (
                <span
                  data-part="row-tools"
                  className="absolute inset-y-0 right-2 flex items-center"
                >
                  {onNewPageMenuOpenChange && (
                    <span
                      className={`flex flex-none items-center transition-opacity motion-reduce:transition-none group-focus-within:mr-5 group-focus-within:opacity-100 group-focus-within:pointer-events-auto ${
                        showPlus
                          ? 'opacity-100 pointer-events-auto'
                          : 'opacity-0 pointer-events-none'
                      } ${hovered ? 'mr-5' : ''}`}
                    >
                      <NewPageMenu
                        parentTitle={label}
                        open={newPageMenuOpen}
                        onOpenChange={(open) => onNewPageMenuOpenChange(id, open)}
                        onSelect={(action) => onNewPageMenuSelect?.(id, action)}
                        placement={{ anchor: addChildRef, align: 'start', top: 4, alignOffset: -6 }}
                        trigger={
                          <button
                            ref={addChildRef}
                            type="button"
                            tabIndex={-1}
                            className="-m-0.5 flex flex-none p-0.5 text-mn-text-meta outline-none transition-colors hover:text-mn-text focus-visible:ring-[1.4px] focus-visible:ring-inset focus-visible:ring-mn-text/50 disabled:opacity-30"
                            title="Add sub-page"
                            aria-label={`Add sub-page to ${label}`}
                            disabled={isBusy}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                              <path
                                d="M6 2.4v7.2M2.4 6h7.2"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        }
                      />
                    </span>
                  )}
                  {onDelete && (
                    <span
                      className={`absolute inset-y-0 right-0 z-[1] flex items-center transition-opacity group-focus-within:opacity-100 group-focus-within:pointer-events-auto ${
                        hovered
                          ? 'opacity-100 pointer-events-auto'
                          : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        className="-m-0.5 flex flex-none p-0.5 text-mn-text-meta outline-none transition-colors hover:text-mn-text focus-visible:ring-[1.4px] focus-visible:ring-inset focus-visible:ring-mn-text/50 disabled:opacity-30"
                        title="Delete page"
                        aria-label={`Delete ${label}`}
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(id)
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path
                            d="M3 3l6 6M9 3l-6 6"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </span>
                  )}
                </span>
              )}
            </>
          )
        }
        // `leading-[normal]` comes LAST on purpose. tailwind-merge counts
        // font-size as conflicting with leading (a `text-*` step can carry its
        // own), so a size appended after it silently drops it — #252's bug
        // class — and the row springs back to preflight's 1.5.
        // `pr-*`/`group-focus-within:pr-[39px]` give the label (the one flex-1
        // child left once the tools are absolute) clearance only while ＋/×
        // actually draw over it — at rest they add nothing, so the label runs
        // to the row's own 8px right padding, per the board.
        className={`min-h-0 w-full min-w-0 flex-1 bg-transparent ${isDbRoot ? 'gap-[9px]' : 'gap-[7px]'} p-0${
          toolsPad ? ` ${toolsPad}` : ''
        } group-focus-within:pr-[39px]${isAreaRow ? '' : ' text-[13px]'}${
          isFullInk ? '' : ' text-mn-text-secondary'
        } leading-[normal]`}
      />
    </div>
  )
})

// ── Presentational rail ──────────────────────────────────────────────────────

export interface RailViewProps {
  tree: RailNode[]
  /**
   * The pond's name — the rail header's label (AUDIT C3). The switcher chevron
   * appears once the pond list is non-empty. Resolved by `usePondName`.
   */
  pondName: string
  /**
   * KAN-490: the first root row (the synthetic Life row) is labelled with the
   * HOME ROW's own title, not the pond's name — the data model point that the
   * home row IS the first root. Omitted, or while `useHomePage` is still
   * loading, the row falls back to `pondName`.
   */
  rootTitle?: string | null
  /**
   * KAN-491: false once the home root has been deleted (or was never there
   * after a trash). The row hides and the empty hint stays. Defaults to shown
   * so Storybook and older call sites keep the root.
   */
  showHomeRoot?: boolean
  /** The pond's own glyph — the root row's mark, the same one the head draws.
   *  Omit in Storybook and the root falls back to `LIFE_GLYPH`. */
  pondGlyph?: string
  /** The pond's recent glyphs, newest first — the picker's `recent` section
   *  (KAN-27's `ponds.recent_glyphs`). Omit in Storybook and it draws empty. */
  recentGlyphs?: readonly string[]
  /**
   * The pond's pages, for resolving each row's mark (#134). Omit in Storybook
   * and every row falls back to its derived mark, which is what the rail did
   * before a mark could be chosen.
   */
  marks?: ReadonlyMap<string, MarkSource>
  selectedId: string | null
  expanded: Set<string>
  /** Whether the Life root is expanded (reveals the whole tree). */
  lifeExpanded: boolean
  busyId: string | null
  isLoading: boolean
  isEmpty: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onAddChild: (id: string, action?: NewPageMenuAction) => void
  onDelete: (id: string) => void
  /** Commit a kept rename: a trimmed, non-empty title that differs from the old one. */
  onRename: (id: string, title: string) => void
  /** A glyph picker pick — `null` for `automatic`. Applies at once (KAN-248 6/8). */
  onPickGlyph: (id: string, glyph: string | null) => void
  /** An area's colour row pick — `null` for ink. Applies at once, picker stays open (KAN-249).
   *  Optional so the existing `RailView` call sites (stories, unit tests predating this ticket)
   *  keep compiling untouched; omit it and a colour pick no-ops. */
  onPickColour?: (id: string, role: AreaRole | null) => void
  /** Hides the rail. Omit it and the head draws no minimize button (stories). */
  onMinimize?: () => void
  onLife: () => void
  onToggleLife: () => void
  /** Open the databases root, creating it first when the pond has none yet. */
  onOpenDatabases: () => void
  /** The ＋ "new root folder" row (KAN-490). Creates a new root and hands back
   *  its id so the rail can open inline rename on it — a real `<button>`'s own
   *  Enter/Space already reach it as a click, no extra key handling needed. */
  onAddRoot?: () => void
  /** The id of a root just created by `onAddRoot`, so the rail opens inline
   *  rename on it with its name selected — once per id (KAN-490: the row is
   *  never navigated into, unlike an ordinary child add). */
  autoRenameId?: string | null
  /** Would a drop offer a landing? (valid, non-cyclic target — F25.) A false
   *  return paints the not-allowed affordance instead of a drop-line. */
  canDrop: (draggedId: string, targetId: string, zone: DropZone) => boolean
  /** Commit a drag→drop move (reparent/reorder). No-ops are absorbed downstream. */
  onMove: (draggedId: string, targetId: string, zone: DropZone) => void
}

/**
 * The databases root's mark: a hand-drawn cylinder in `currentColor` — a functional
 * mark, not an area glyph, since the root is the pond's SECOND root (3c), not one of
 * Life's areas. 13px, stroke 1.4, round caps and joins.
 */
const DATABASES_MARK = (
  <span className="inline-flex flex-none items-center" aria-hidden>
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="7" cy="3.4" rx="4.6" ry="1.6" />
      <path d="M2.4 3.4v7.2c0 .9 2 1.6 4.6 1.6s4.6-.7 4.6-1.6V3.4M2.4 7c0 .9 2 1.6 4.6 1.6s4.6-.7 4.6-1.6" />
    </svg>
  </span>
)

const TRANSPARENT_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
let blankDragImage: HTMLImageElement | null = null

/** One shared transparent image. `setDragImage` ignores an image that has not
 *  finished loading, so it is created at mount, ahead of the first drag. */
function getBlankDragImage(): HTMLImageElement {
  if (blankDragImage === null) {
    blankDragImage = new Image()
    blankDragImage.src = TRANSPARENT_GIF
  }
  return blankDragImage
}

/** Replace the browser's drag image with an empty one — the rail draws its own ghost. */
function hideNativeDragImage(dataTransfer: DataTransfer) {
  if (typeof dataTransfer.setDragImage !== 'function') return
  dataTransfer.setDragImage(getBlankDragImage(), 0, 0)
}

/** PondRail's loading skeleton: eight bars, widths in %, indented in a repeating 0 / 14 / 28px staircase. */
const SKELETON_WIDTHS = [40, 62, 54, 70, 48, 66, 58, 44]

/**
 * A row's mark, resolved through `resolveMark` so the rail agrees with the
 * breadcrumb, the palette and the cards about every page. `marks` comes from the
 * shared `['pages']` cache, so the rail needs no read of its own. The node itself
 * is the fallback: a rail rendered without a pond (Storybook, a unit test) still
 * shows every area's automatic glyph.
 */
const rowMark = (node: RailNode, marks: ReadonlyMap<string, MarkSource>): PageMark =>
  resolveMark(node.id, marks, {
    id: node.id,
    parentId: node.parentId,
    type: node.type,
    title: node.title,
  })

/** The mark button's accessible name — a page and an area read the same (6y frame 1). */
const changeIconLabel = (title: string) => `change icon for ${title || 'Untitled'}`

/** The glyph or dot a row's mark draws, shared by the interactive button and the
 *  reserved rows' static (non-interactive) leading mark. */
const markGlyph = (mark: PageMark, accent: string | undefined, isSelected: boolean): ReactNode =>
  mark.glyph ? (
    <AreaMark glyph={mark.glyph} color={accent} />
  ) : (
    <KindDot
      accent={accent}
      className={!accent ? (isSelected ? 'bg-mn-text' : 'bg-mn-text/50') : undefined}
    />
  )

/**
 * A row's mark, as a real control (KAN-248 2/4, wired to the glyph picker in
 * 5/8). Draws the glyph in its area's colour when the page has one, else the
 * KindDot `accent` still carries (the row no longer draws its own: `leading`
 * is never `undefined` for a page row). An area always has a glyph (its
 * automatic one is derived from its title); a plain page has one only when
 * the person picked it.
 *
 * `onToggle` opens or closes the picker for this row, handed the button's own
 * element to anchor the glass off (read from the click event, never from a
 * ref during render). `stopPropagation` only keeps the row's own click
 * handler (navigation) from also firing; `onToggle` selects the row itself
 * (6y frame 1: opening its picker leaves the row selected).
 *
 * The row carries the tree's one roving tab stop; the mark button follows it
 * rather than adding a stop of its own (`tabIndex={isFocused ? 0 : -1}`, same
 * rule as ＋/×'s row above) — Tab from the focused row reaches its mark, but
 * Tab no longer stops on every row's mark on the way through the tree.
 */
const markButton = (
  mark: PageMark,
  title: string,
  accent: string | undefined,
  isSelected: boolean,
  isOpen: boolean,
  isFocused: boolean,
  onToggle: (el: HTMLButtonElement) => void
): ReactNode => (
  <button
    type="button"
    tabIndex={isFocused ? 0 : -1}
    aria-expanded={isOpen}
    aria-label={changeIconLabel(title)}
    className="inline-flex flex-none items-center rounded-mn-hair outline-none focus-visible:ring-[1.4px] focus-visible:ring-inset focus-visible:ring-mn-text/50"
    onClick={(e) => {
      e.stopPropagation()
      onToggle(e.currentTarget)
    }}
  >
    {markGlyph(mark, accent, isSelected)}
  </button>
)

/** The mark button whose picker is currently open, and what the picker needs. */
interface OpenGlyphPicker {
  id: string
  title: string
  isArea: boolean
  current: string | null
  /** The area a non-area target's colour comes from — the picker's inherit footer names it. */
  inheritsFrom: string
  /** The button that opened it — the glass's anchor, and where Esc/outside-close returns focus. */
  anchor: HTMLButtonElement
  /** Chosen at open time from the anchor's own room, so a mark low in the rail still fits on screen. */
  side: PickerSide
}

export function RailView({
  tree,
  pondName,
  rootTitle,
  showHomeRoot = true,
  pondGlyph = LIFE_GLYPH,
  recentGlyphs = [],
  marks,
  selectedId,
  expanded,
  lifeExpanded,
  busyId,
  isLoading,
  isEmpty,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
  onRename,
  onPickGlyph,
  onPickColour = () => {},
  onMinimize,
  onLife,
  onToggleLife,
  onOpenDatabases,
  onAddRoot,
  autoRenameId = null,
  canDrop,
  onMove,
}: RailViewProps) {
  // KAN-490: the home row's own title, falling back to the pond's name only
  // while `useHomePage` is still loading (or for callers, like Storybook, that
  // never pass one at all).
  const rootLabel = rootTitle ?? pondName

  // Empty when the caller supplies none (Storybook): every row then resolves to
  // its derived mark, which is what the rail showed before marks were choosable.
  const markMap = useMemo(() => marks ?? new Map<string, MarkSource>(), [marks])
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const setRowRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) rowRefs.current.set(id, el)
      else rowRefs.current.delete(id)
    },
    []
  )

  // The new-page menu (6s f1): which row's own menu (each row owns its own
  // Base UI Menu.Root, its ＋ the real trigger) is open, if any — `id` is read
  // by the row it belongs to (`newPageMenuOpen={newPageMenu?.id === id}`).
  const [newPageMenu, setNewPageMenu] = useState<{ id: string; title: string } | null>(null)

  // The glyph picker (KAN-248 5/8): at most one open, anchored on the button
  // that opened it — captured off the click event itself (never read from a
  // ref during render).
  const [picker, setPicker] = useState<OpenGlyphPicker | null>(null)
  // Below the phone breakpoint the picker opens as a bottom sheet instead of
  // the anchored glass (KAN-250 4/4, 6y frame 6) — same handlers either way.
  const belowMd = useBelowMd()
  const closePicker = useCallback(() => {
    picker?.anchor.focus()
    setPicker(null)
  }, [picker])
  const toggleMarkPicker = useCallback(
    (id: string, node: RailNode, mark: PageMark, anchor: HTMLButtonElement) => {
      // The mark button is never shown for the databases root (it draws
      // `DATABASES_MARK` instead), so the row-only special case in
      // `handleSelect` never applies here — `onSelect` direct is equivalent.
      onSelect(id)
      setPicker((cur) => {
        if (cur?.id === id) return null
        const target = { isArea: mark.isArea, title: node.title }
        const height = glyphPickerHeight(target, 'desktop', recentGlyphs, window.innerHeight)
        return {
          id,
          title: node.title,
          isArea: mark.isArea,
          current: mark.glyph,
          inheritsFrom: areaOf(Array.from(markMap.values()), id) ?? '',
          anchor,
          side: sideTowardFreeSpace(anchor.getBoundingClientRect(), window.innerHeight, height),
        }
      })
    },
    [markMap, onSelect, recentGlyphs]
  )

  // 3c: the databases root is the pond's SECOND root — "life for reading,
  // databases for data". PondRail draws it after the Life tree, at the foot, so
  // it is lifted out of Life's areas here and flattened on its own (its row at
  // depth 0, its databases at depth 1). The board always draws the row: until
  // the pond has a root it is a placeholder that creates the root when opened.
  const databasesRoot = useMemo(() => tree.find(isDatabasesRoot) ?? null, [tree])
  const lifeTree = useMemo(
    () => (databasesRoot ? tree.filter((n) => n !== databasesRoot) : tree),
    [tree, databasesRoot]
  )

  // KAN-490/491: extra roots (`props.root === true`) are lifted out of Life's
  // own children and flattened each on their own, the same trick as
  // `databasesFlat` below — depth 0, their own caret/expansion, never gated by
  // Life's collapse. Unlike the databases root, an extra root's `isFolder`
  // reflects its real children (no synthetic rows to force it true).
  const { children: lifeChildren, extraRoots } = useMemo(() => splitExtraRoots(lifeTree), [lifeTree])
  const extraRootsFlat = useMemo(
    () =>
      extraRoots.flatMap((root) =>
        flattenVisible([root], expanded, true)
          .slice(1) // drop the synthetic leading Life row flattenVisible always leads with
          .map((f) => ({ ...f, depth: f.depth - 1 }))
      ),
    [extraRoots, expanded]
  )

  const databasesFlat = useMemo(() => {
    if (!databasesRoot) return [DATABASES_PLACEHOLDER_ROW]
    const [rawRoot, ...rest] = flattenVisible([databasesRoot], expanded, true)
      .slice(1) // drop the synthetic Life row flattenVisible always leads with
      .map((f) => ({ ...f, depth: f.depth - 1 }))
    // KAN-486: change log is always the root's first child once it exists, so
    // the root always carries a caret even with zero database pages.
    const root = { ...rawRoot, isFolder: true }
    // KAN-94: the change log is the root's first child — shown only once the
    // root itself is expanded, like any other child.
    //
    // KAN-486: the heading renders LAST, after its own rows, not first — the
    // foot is bottom-anchored, so a heading drawn first would be pushed up
    // by every row that expands below it. Rendering it last keeps it outside
    // the scroller entirely, so it never moves. `rest` is always empty while
    // collapsed (its children are gated by `expanded` inside `flattenVisible`),
    // so collapsed stays `[root]` alone.
    const rows = expanded.has(databasesRoot.id)
      ? [changeLogRow(databasesRoot.id), ...rest, root]
      : [root]
    return rows.filter((f) => !isStaged(f.id)) // KAN-300: a refetch mid-undo-toast can't resurrect a staged row
  }, [databasesRoot, expanded])
  const databasesIds = useMemo(() => new Set(databasesFlat.map((f) => f.id)), [databasesFlat])
  // KAN-486: the heading is found by id, not by array position — a staged
  // delete (the mount-time leftover sweep) can filter the root itself out of
  // `databasesFlat` while its children briefly survive, and the last
  // surviving row must not be mistaken for the heading when that happens.
  const databasesHeadingId = databasesRoot?.id ?? DATABASES_PLACEHOLDER_ID
  const databasesHeadingRow = databasesFlat.find((f) => f.id === databasesHeadingId)
  const databasesScrollRows = databasesFlat.filter((f) => f.id !== databasesHeadingId)

  // The ONE flattened list — Life, then databases, then trash last — driving
  // render, ARIA coordinates, and keyboard order alike (they can't drift; see
  // lib/rail/tree.ts). Rendered as three trees below but ONE keyboard order, so
  // ↑/↓ walk from the last Life row into databases, then into trash.
  const flat = useMemo(
    () =>
      [
        // KAN-490: the root row is the home row, named for ITS title — the
        // pond's name is only the fallback while that title is loading.
        ...(showHomeRoot
          ? flattenVisible(lifeChildren, expanded, lifeExpanded, rootLabel)
          : []),
        // KAN-490/491: extra roots render after Life's own rows, before the
        // databases foot, regardless of whether Life itself is expanded.
        ...extraRootsFlat,
        ...databasesFlat,
        TRASH_ROW,
      ].filter((f) => !isStaged(f.id)), // KAN-300: a refetch mid-undo-toast can't resurrect a staged row
    [lifeChildren, expanded, lifeExpanded, extraRootsFlat, databasesFlat, rootLabel, showHomeRoot]
  )
  const visibleIds = useMemo(() => new Set(flat.map((f) => f.id)), [flat])

  const openAddChildMenu = useCallback(
    (id: string) => {
      const title = id === LIFE_ID ? rootLabel : (flat.find((f) => f.id === id)?.node.title ?? '')
      setNewPageMenu({ id, title })
    },
    [flat, rootLabel]
  )
  const closeAddChildMenu = useCallback(() => {
    const id = newPageMenu?.id
    setNewPageMenu(null)
    if (id) rowRefs.current.get(id)?.focus()
  }, [newPageMenu])
  const handleNewPageMenuOpenChange = useCallback(
    (id: string, open: boolean) => {
      if (open) openAddChildMenu(id)
      else closeAddChildMenu()
    },
    [openAddChildMenu, closeAddChildMenu]
  )
  const handleNewPageMenuSelect = useCallback(
    (id: string, action: NewPageMenuAction) => {
      closeAddChildMenu()
      onAddChild(id, action)
    },
    [closeAddChildMenu, onAddChild]
  )

  // ── Roving focus (view-owned: focus is a view concern) ─────────────────────
  const [focusedId, setFocusedId] = useState<string | null>(null)

  // The effective roving tab stop: the focused row if it's still visible, else
  // the selection, else the Life root — always exactly one tabbable row.
  const rovingId =
    focusedId && visibleIds.has(focusedId)
      ? focusedId
      : selectedId && visibleIds.has(selectedId)
        ? selectedId
        : LIFE_ID

  // When the focused row vanishes (deleted, or hidden by an ancestor collapse),
  // keep focus in the tree like VS Code: fall to the nearest surviving neighbor
  // in the previous order (else the nearest before it, else Life). Only re-grab
  // DOM focus if the removal actually dropped it to <body> — never steal focus
  // the user has moved elsewhere (e.g. into the editor).
  const prevOrderRef = useRef<string[]>([])
  useEffect(() => {
    const prev = prevOrderRef.current
    prevOrderRef.current = flat.map((f) => f.id)
    if (!focusedId || visibleIds.has(focusedId)) return
    const fallback = focusFallback(prev, focusedId, visibleIds)
    setFocusedId(fallback)
    if (document.activeElement === document.body) rowRefs.current.get(fallback)?.focus()
  }, [flat, focusedId, visibleIds])

  const handleSelect = (id: string) => {
    if (id === DATABASES_PLACEHOLDER_ID) onOpenDatabases()
    else onSelect(id)
  }

  // ── Inline rename (F2 / double-click) ───────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null)

  // KAN-490: a root just made by the ＋ row opens rename itself — unlike an
  // ordinary child add, which navigates into the new page instead. Guarded by
  // a ref (not a bare id comparison) so a second root made with the SAME
  // literal id would still open — defensive, since real ids never repeat.
  const autoRenamedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoRenameId || autoRenamedRef.current === autoRenameId) return
    autoRenamedRef.current = autoRenameId
    setRenamingId(autoRenameId)
  }, [autoRenameId])

  const capabilitiesOf = (id: string): RowCapabilities => {
    const node = flat.find((f) => f.id === id)?.node
    return node ? rowCapabilities(id, node) : NO_CAPABILITIES
  }

  const handleRenameStart = (id: string) => {
    if (capabilitiesOf(id).renameable) setRenamingId(id)
  }

  /** Closing the field, and — for ↵ / esc — handing focus back to the row. The
   *  row is the same element before and after, so it is focused while the field
   *  still exists; the field has settled by then, so the blur this raises is inert. */
  const endRename = (id: string, refocus: boolean) => {
    if (refocus) rowRefs.current.get(id)?.focus()
    setRenamingId(null)
  }

  const handleRenameKeep = (id: string, value: string, refocus: boolean) => {
    // Empty or unchanged keeps the old title: nothing to write.
    const next = value.trim()
    // The home root's visible label is `rootLabel`, not `LIFE_NODE.title`
    // ('life'). Comparing against the node would write a no-op confirm.
    const current = id === LIFE_ID ? rootLabel : flat.find((f) => f.id === id)?.node.title
    endRename(id, refocus)
    if (next !== '' && next !== current) onRename(id, next)
  }

  const handleRenameCancel = (id: string) => endRename(id, true)

  // ── Keyboard machine (pure rules; commands dispatched to the callbacks) ────
  function handleKeyDown(id: string, e: KeyboardEvent<HTMLDivElement>) {
    const cmd = treeKeyCommand(e.key, id, flat, { expanded, lifeExpanded })
    if (!cmd || !allowsCommand(capabilitiesOf(id), cmd.kind)) return
    e.preventDefault()
    switch (cmd.kind) {
      case 'focus':
        setFocusedId(cmd.id)
        rowRefs.current.get(cmd.id)?.focus()
        break
      case 'expand':
      case 'collapse':
        if (cmd.id === LIFE_ID) onToggleLife()
        else onToggle(cmd.id)
        break
      case 'open':
        if (cmd.id === LIFE_ID) onLife()
        else handleSelect(cmd.id)
        break
      case 'addChild':
        openAddChildMenu(cmd.id)
        break
      case 'rename':
        handleRenameStart(cmd.id)
        break
    }
  }

  // ── Drag-to-reparent / reorder (F25; view-owned like focus) ─────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // The ghost chip's pointer-follow Y, relative to the scroll body's wrapper.
  const [ghostY, setGhostY] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const trackGhost = (clientY: number) => {
    const top = bodyRef.current?.getBoundingClientRect().top ?? 0
    setGhostY(clientY - top)
  }
  useEffect(() => {
    getBlankDragImage()
  }, [])
  // Rows bubble their dragover here, so the ghost also follows the pointer over
  // the gaps between rows.
  const handleBodyDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (draggingId) trackGhost(e.clientY)
  }
  const [dropTarget, setDropTarget] = useState<{
    id: string
    zone: DropZone
    rejected: boolean
  } | null>(null)

  /** Three-zone hit-test from the pointer's Y within the row: top ¼ before,
   *  bottom ¼ after, middle into. The Life root is an into-only target. */
  function zoneFor(id: string, e: DragEvent<HTMLDivElement>): DropZone {
    if (id === LIFE_ID) return 'into'
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientY - rect.top) / rect.height
    if (frac < 0.25) return 'before'
    if (frac > 0.75) return 'after'
    return 'into'
  }

  function handleDragStart(id: string, e: DragEvent<HTMLDivElement>) {
    setDraggingId(id)
    trackGhost(e.clientY)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox requires data to be set for a drag to initiate.
    e.dataTransfer.setData('text/plain', id)
    hideNativeDragImage(e.dataTransfer)
  }

  function handleDragOver(id: string, e: DragEvent<HTMLDivElement>) {
    if (!draggingId || draggingId === id) return // no indicator over the dragged row itself
    const zone = zoneFor(id, e)
    if (canDrop(draggingId, id, zone)) {
      // A valid landing: allow the drop (preventDefault) and paint the indicator.
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget({ id, zone, rejected: false })
    } else {
      // A cycle / invalid target: no drop (leave preventDefault off so onDrop
      // can't fire) and show the not-allowed affordance, no drop-line.
      e.dataTransfer.dropEffect = 'none'
      setDropTarget({ id, zone, rejected: true })
    }
  }

  function handleDragLeave(id: string, e: DragEvent<HTMLDivElement>) {
    // Only clear when the pointer actually leaves this row (not on entering a
    // child element); dragover on the next row re-sets the target immediately.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDropTarget((prev) => (prev?.id === id ? null : prev))
  }

  function handleDrop(id: string, e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const dragged = draggingId
    const zone = dropTarget?.id === id ? dropTarget.zone : zoneFor(id, e)
    setDraggingId(null)
    setDropTarget(null)
    if (dragged) onMove(dragged, id, zone) // computeMove absorbs self/cycle/no-op
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDropTarget(null)
  }

  const draggedTitle = draggingId
    ? flat.find((f) => f.id === draggingId)?.node.title || 'Untitled'
    : ''

  const dropZoneFor = (id: string): DropZone | null =>
    dropTarget && dropTarget.id === id && !dropTarget.rejected ? dropTarget.zone : null
  const isDropRejected = (id: string) => dropTarget?.id === id && dropTarget.rejected

  const renderRow = ({ id, node, depth, isFolder, posInSet, setSize }: FlatRow) => {
    // Resolved ONCE per row: both the glyph and the dot's colour come off it, and
    // two calls would walk the ancestor chain twice for the same answer. Not for
    // the synthetic Life row, which is no `pages` row and carries `LIFE_MARK`.
    const mark = id === LIFE_ID ? null : rowMark(node, markMap)
    const cap = rowCapabilities(id, node)
    return id === LIFE_ID || mark === null ? (
      <RailRow
        ref={setRowRef(id)}
        key={id}
        id={id}
        // KAN-490: the root row is the home page, so its label is the home
        // row's OWN title, not the word "life" or the pond's name — the data
        // model point that the home row IS the first root. This was a
        // hard-coded literal, which is why a new pond's root row read `life`
        // while its header read the pond's real name — and why overriding
        // `LIFE_NODE.title` alone changed nothing.
        title={rootLabel}
        depth={0}
        isFolder={isFolder}
        isExpanded={lifeExpanded}
        // `PondRail` `empty`: the lone root is not selected, so it draws no resting ＋;
        // hovered, it shows its tools like any row (`hasTools: hov`).
        isSelected={selectedId === null && !isEmpty}
        isFocused={rovingId === id}
        isBusy={false}
        isRoot
        posInSet={posInSet}
        setSize={setSize}
        leading={<PondMark glyph={pondGlyph} />}
        onSelect={onLife}
        onToggle={onToggleLife}
        newPageMenuOpen={newPageMenu?.id === id}
        onNewPageMenuOpenChange={cap.addable ? handleNewPageMenuOpenChange : undefined}
        onNewPageMenuSelect={cap.addable ? handleNewPageMenuSelect : undefined}
        onFocus={setFocusedId}
        onKeyDown={handleKeyDown}
        dropZone={dropZoneFor(id)}
        isDropRejected={isDropRejected(id)}
        onDragOver={cap.droppable ? handleDragOver : undefined}
        onDragLeave={cap.droppable ? handleDragLeave : undefined}
        onDrop={cap.droppable ? handleDrop : undefined}
        onDelete={cap.deletable ? onDelete : undefined}
        onRenameStart={cap.renameable ? handleRenameStart : undefined}
        isRenaming={renamingId === id}
        onRenameKeep={handleRenameKeep}
        onRenameCancel={handleRenameCancel}
      />
    ) : (
      <RailRow
        ref={setRowRef(id)}
        key={id}
        id={id}
        title={node.title}
        depth={depth}
        isFolder={isFolder}
        isExpanded={expanded.has(id)}
        isSelected={id === selectedId}
        isFocused={rovingId === id}
        isBusy={id === busyId}
        // KAN-504: trash's own node carries `parentId: null` for the keyboard
        // tree/ArrowLeft only — it never reads as an area's bigger label and
        // full ink the way a real top-level page does.
        isArea={isAreaRow(node) && id !== TRASH_NODE_ID}
        isDbRoot={isDatabasesRoot(node)}
        posInSet={posInSet}
        setSize={setSize}
        // The databases root carries its own functional mark, no area colour.
        // Everywhere else the dot is ink until the person colours its area.
        accent={isDatabasesRoot(node) ? undefined : markAccent(mark.role)}
        leading={
          isDatabasesRoot(node) ? (
            DATABASES_MARK
          ) : id === CHANGE_LOG_NODE_ID || id === TRASH_NODE_ID ? (
            // Reserved virtual row: no page behind it to write a mark to, so the
            // glyph picker never opens here (KAN-94/KAN-451). KAN-504: trash's
            // `parentId: null` would otherwise read as an area to `resolveMark`
            // and derive a hashed glyph for it — forced back to its plain dot.
            <span className="inline-flex flex-none items-center" aria-hidden>
              {markGlyph({ ...mark, glyph: null }, markAccent(mark.role), id === selectedId)}
            </span>
          ) : (
            markButton(
              mark,
              node.title,
              markAccent(mark.role),
              id === selectedId,
              picker?.id === id,
              rovingId === id,
              (el) => toggleMarkPicker(id, node, mark, el)
            )
          )
        }
        // A row revealed on expand (any non-top-level row) settles in rather than
        // popping. Keyed by id, so only newly-mounted rows animate.
        rowNote={isNewNestedPage(node.props) ? 'new' : undefined}
        settleOnMount={depth > 0}
        onSelect={handleSelect}
        onToggle={onToggle}
        newPageMenuOpen={newPageMenu?.id === id}
        onNewPageMenuOpenChange={cap.addable ? handleNewPageMenuOpenChange : undefined}
        onNewPageMenuSelect={cap.addable ? handleNewPageMenuSelect : undefined}
        onDelete={cap.deletable ? onDelete : undefined}
        onRenameStart={cap.renameable ? handleRenameStart : undefined}
        isRenaming={renamingId === id}
        onRenameKeep={handleRenameKeep}
        onRenameCancel={handleRenameCancel}
        onFocus={setFocusedId}
        onKeyDown={handleKeyDown}
        draggable={cap.draggable}
        isDragging={draggingId === id}
        dropZone={dropZoneFor(id)}
        isDropRejected={isDropRejected(id)}
        onDragStart={cap.draggable ? handleDragStart : undefined}
        onDragOver={cap.droppable ? handleDragOver : undefined}
        onDragLeave={cap.droppable ? handleDragLeave : undefined}
        onDrop={cap.droppable ? handleDrop : undefined}
        onDragEnd={cap.draggable ? handleDragEnd : undefined}
      />
    )
  }

  // The open picker's colour role, read off `markMap` on every render rather
  // than frozen into `picker` at open time: a colour pick lands in `markMap`
  // the instant the optimistic apply runs, so the open glass's own cells and
  // ring redraw without closing it.
  const pickerRole = picker ? resolveMark(picker.id, markMap).role : null

  // #96 — the rail is a floating PAPER CARD over the canvas (`Pond 05 Shell` /
  // `PondRail`, measured: 206 wide, inset 20px from the top, left and bottom,
  // padding 18px 0 14px, radius 20, the card paper + the card shadow, no
  // backdrop blur — the glass recipe is the breadcrumb's and the composer's,
  // not the rail's), never a column docked to the window's edge. Light: one
  // paper, so the card is the ground's own colour and reads by shadow alone;
  // dark: the card steps up to #30312A. Both come from the --mn-card /
  // --mn-shadow-card roles. Three bands: the head (the pond's name), the
  // scrolling tree, and the foot.
  return (
    <>
      <aside
        className="bg-mn-card shadow-mn-card rounded-mn-card relative my-5 ml-5 flex flex-shrink-0 flex-col self-stretch overflow-hidden pt-[18px] pb-[14px] font-sans has-[[data-part=pond-switcher][aria-expanded=true]]:overflow-visible"
        style={{ width: RAIL_WIDTH_PX }}
      >
        {/* The switcher chevron appears only once there is a pond to list: before
          migration 0018 `listPonds()` returns [] and the head is the plain name,
          rather than an affordance that opens an empty menu. */}
        <PondSwitcher
          fallbackName={pondName}
          trailing={
            onMinimize ? <RailToggle minimized={false} onClick={onMinimize} /> : undefined
          }
        />

        <div
          ref={bodyRef}
          onDragOver={handleBodyDragOver}
          className="relative flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            <div role="tree" aria-label="Workspace" aria-multiselectable={false}>
              {!isLoading &&
                flat
                  .filter((f) => !databasesIds.has(f.id) && f.id !== TRASH_NODE_ID)
                  .map(renderRow)}
            </div>

            {/* KAN-490: a real `<button>`, not a treeitem — `role="tree"` only
              allows treeitem children (WAI-ARIA), and this row is reached by
              Tab, not the tree's roving arrow-key focus. Always at rest (no
              hover/focus gating, unlike every other row's tools): the board
              draws the foot's analogous rest-state row (`newRow`/`settings`,
              `PondRail.dc.html`) at the .68 ink tier, full ink only on
              hover/focus — reused here. Bare ＋, no label (the deviations
              note: Notion's "+ Add new" text isn't drawn; the ticket's row is
              bare). Sits directly after the last root, above the databases
              foot — still inside the scroller, so it scrolls with the tree. */}
            {!isLoading && (
              <button
                type="button"
                data-part="new-root-row"
                aria-label="new root folder"
                onClick={onAddRoot}
                className="group relative flex w-full flex-shrink-0 items-center gap-[7px] rounded-mn-row py-[5px] pr-2 text-left text-mn-text-secondary outline-none transition-colors hover:text-mn-text focus-visible:ring-2 focus-visible:ring-mn-text/50 focus-visible:ring-offset-0"
                style={{ paddingLeft: INDENT_BASE }}
              >
                <span className="w-[9px] flex-shrink-0" aria-hidden />
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M6 2.4v7.2M2.4 6h7.2"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}

            {/* Status lives OUTSIDE the tree — role="tree" only allows treeitem
              children (WAI-ARIA); a <p> inside it would be an illegal child.
              Loading = PondRail's skeleton bars (7f / G6); empty = its hint. */}
            {isLoading && (
              <div className="px-3 py-2" role="status">
                <span className="sr-only">Loading pages…</span>
                <div data-part="rail-skeleton" aria-hidden className="flex flex-col gap-3.5">
                  {SKELETON_WIDTHS.map((w, i) => (
                    <span
                      key={i}
                      className="block h-[9px] rounded-[5px] bg-mn-text/[0.08]"
                      style={{ width: `${w}%`, marginLeft: (i % 3) * 14 }}
                    />
                  ))}
                </div>
              </div>
            )}
            {!isLoading && isEmpty && (
              <p
                className="mt-2 mr-2 ml-[26px] text-[12.5px] leading-[1.5] text-pretty text-mn-text-secondary"
                role="status"
              >
                no pages yet. ＋ new page, or ask pond to start one.
              </p>
            )}
          </div>

          {/* `PondRail` `dragging`: a chip that follows the pointer's Y at the
            board's `left: 58` — the native drag image is blanked in dragstart. */}
          {draggingId && (
            <div
              data-part="drag-ghost"
              aria-hidden
              className="pointer-events-none absolute left-[58px] z-10 flex max-w-[calc(100%-66px)] items-center gap-[7px] rounded-mn-row bg-mn-drag-ghost px-2.5 py-1.5 text-[13px] leading-[normal] text-mn-text shadow-mn-drag-ghost [transform:translateY(-50%)_rotate(-1.5deg)]"
              style={{ top: ghostY }}
            >
              <span className="size-[7px] flex-none rounded-mn-hair bg-mn-text" />
              <span className="min-w-0 truncate">{draggedTitle}</span>
            </div>
          )}
        </div>

        {/* The foot: a full-width hairline, then the databases root (3c: the
          pond's SECOND root, its own ARIA tree so the structure says what the rail
          says), trash (KAN-504: its own top-level row, its own tree, always
          visible — not a databases child) and `settings`. KAN-486: the heading
          is the LAST row, after its own rows, and sits outside the scroller —
          the scroller is capped at 40vh so an expanded root scrolls inside the
          foot instead of swallowing the rail or pushing the heading out from
          under the pointer. The scroller clips at its padding box, so it
          carries 2px of padding (cancelled by a -2px margin) to keep the rows'
          2px focus ring visible. */}
        <div
          data-part="rail-foot"
          className="flex flex-col gap-0.5 border-t border-mn-text/[0.09] px-2 pt-2.5"
        >
          <div role="tree" aria-label="Databases" aria-multiselectable={false}>
            <div
              role="group"
              data-part="databases-scroller"
              className="-m-0.5 max-h-[40vh] overflow-y-auto p-0.5"
            >
              {databasesScrollRows.map(renderRow)}
            </div>
            {databasesHeadingRow && renderRow(databasesHeadingRow)}
          </div>
          <div role="tree" aria-label="Trash" aria-multiselectable={false}>
            {renderRow(TRASH_ROW)}
          </div>
          {/* Not interactive until a settings surface exists: a dead button is worse
            than none. */}
          <div
            data-part="settings"
            className="px-2 py-[6px] text-[12.5px] leading-[normal] text-mn-text-secondary"
          >
            <span className="inline-flex items-center gap-2">
              <svg
                width="12"
                height="12"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                aria-hidden
                className="flex-none"
              >
                <circle cx="7" cy="7" r="2.2" />
                <path d="M7 1.4v1.8M7 10.8v1.8M1.4 7h1.8M10.8 7h1.8M3 3l1.3 1.3M9.7 9.7 11 11M3 11l1.3-1.3M9.7 4.3 11 3" />
              </svg>
              settings
            </span>
          </div>
        </div>
      </aside>
      {picker &&
        (() => {
          const sharedPickerProps = {
            target: { isArea: picker.isArea, title: picker.title },
            current: picker.current,
            // Live off `markMap`, not frozen at open time: a colour pick redraws
            // the open glass's own cells and ring without closing it.
            accent: markAccent(pickerRole),
            role: pickerRole,
            recentGlyphs,
            inheritsFrom: picker.inheritsFrom,
            onPick: (glyph: string | null) => {
              onPickGlyph(picker.id, glyph)
              closePicker()
            },
            onPickColour: (role: AreaRole | null) => onPickColour(picker.id, role),
            onClose: closePicker,
          }
          return belowMd ? (
            <GlyphPickerSheet open {...sharedPickerProps} />
          ) : (
            <GlyphPicker anchor={picker.anchor} side={picker.side} {...sharedPickerProps} />
          )
        })()}
    </>
  )
}

/** The node for `id` within `roots`, by id — the leftover sweep's own way to
 *  find a stale id's LIVE subtree (KAN-448) before trashing it, since it has
 *  no `RailNode` for that id handed to it the way `handleDelete` does. */
function findRailNode(roots: RailNode[], id: string): RailNode | undefined {
  for (const node of roots) {
    if (node.id === id) return node
    const found = findRailNode(node.children, id)
    if (found) return found
  }
  return undefined
}

// ── Container ────────────────────────────────────────────────────────────────

export function Rail() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const pondId = usePondId()
  const pondName = usePondName()
  const pondGlyph = usePondGlyph()
  const { pond, loading: pondLoading } = usePond()
  // KAN-490: the root row reads the home row's OWN title (the data model point
  // that the home row IS the first root), not the pond's name — `rootLabel`
  // (in RailView) falls back to `pondName` only while this is still loading.
  const { data: home } = useHomePage(pondId, pondName, !pondLoading)
  // KAN-491: set while the home root is in the undo window, before trash
  // stamps `deleted_at`. A refetch in that window still finds the live row;
  // hiding by id keeps the empty rail until undo or a failed commit.
  const [hiddenHomeId, setHiddenHomeId] = useState<string | null>(null)
  const homeHidden = hiddenHomeId != null && home?.id === hiddenHomeId
  // Once trash has stamped the row, the query itself is null and the id
  // guard is no longer what hides the root. Clearing it lets a later restore
  // of that same page show the row again.
  useEffect(() => {
    if (!hiddenHomeId || home !== null) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setHiddenHomeId(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [hiddenHomeId, home])
  // The pond's own recent list, overridden optimistically the instant a pick
  // lands (KAN-248 7/8) — mirrors `applyGlyphOptimistic`'s "redraw before the
  // write settles", but as a session-only overlay rather than mirrored local
  // state: `pushedGlyphs` is only ever appended from the pick handler itself
  // (never synced from `pond` in an effect, which `react-hooks/set-state-in-effect`
  // already rules out elsewhere in this file), and replaying it over `pond`'s
  // own list is idempotent — `pushRecentGlyph` dedupes — so it never drifts
  // once a refetch catches up.
  const [pushedGlyphs, setPushedGlyphs] = useState<readonly string[]>([])
  const recentGlyphs = useMemo(
    () => pushedGlyphs.reduce(pushRecentGlyph, pond?.recentGlyphs ?? []),
    [pond, pushedGlyphs]
  )
  // Area folders persist their open/collapsed state per pond across reloads
  // (see the persistence effect below); Life starts expanded so the tree is
  // visible on load (collapsing Life is the "collapse everything").
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lifeExpanded, setLifeExpanded] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // The subtree-delete confirm (blast-radius modal); null when closed.
  const [confirmTarget, setConfirmTarget] = useState<RailNode | null>(null)
  const { stageDeletion, stageUndo, notify } = useDeletionUndo()

  const {
    data: pages = [],
    isLoading,
    isSuccess,
  } = useQuery({
    queryKey: pagesKey(pondId),
    queryFn: () => fetchPages(pondId),
  })

  const tree = useMemo(() => buildTree(pages), [pages])
  // #134: the same rows the tree is built from, indexed for mark resolution — so
  // the rail agrees with the breadcrumb and the kicker about every page.
  const marks = useMemo(() => markIndex(pages), [pages])
  const nodeById = useMemo(() => {
    const map = new Map<string, RailNode>()
    const walk = (nodes: RailNode[]) =>
      nodes.forEach((n) => {
        map.set(n.id, n)
        walk(n.children)
      })
    walk(tree)
    return map
  }, [tree])
  const databasesRootId = useMemo(() => tree.find(isDatabasesRoot)?.id ?? null, [tree])
  const selectedNodeId = searchParams.get('nodeId')

  // ── Rail remembers what was open (KAN-393) ──────────────────────────────────
  // A pond switch must drop the previous pond's rows before the merge effect
  // below runs, or a toggle on the new pond writes the old pond's lingering
  // ids into its store too — `writeExpandedIds` persists the whole set, not a
  // diff, and `expanded` is one Set shared across ponds since `Rail` itself
  // never remounts on a switch. Declared ahead of the merge effect so it runs
  // first on the same pondId change (React runs passive effects in source
  // order); the merge effect then repopulates from the new pond's store.
  //
  // Only a REAL pond→pond switch clears — `prevPondIdRef.current` starting
  // `null` (usePondId() before PondProvider's listPonds resolves, on a cold
  // reload) and then landing on the first real id is not a switch, it's the
  // same pond arriving late. Treating it as one wiped the ticket-25 reveal
  // below, which had already run against the `pagesKey(null)` fallback fetch
  // (resolves to the same pond's pages, #312): with `revealedForRef` already
  // set, the reveal effect's once-per-selection guard then refused to run
  // again, leaving a cold-reload deep link's ancestors collapsed for good. A
  // real switch also drops `revealedForRef` so the new pond's open page
  // re-reveals instead of being read as already-revealed.
  const prevPondIdRef = useRef(pondId)
  const revealedForRef = useRef<string | null>(null)
  // Declared here, ahead of the reset effect below, so that effect's own
  // real-switch branch can clear it (react-hooks/immutability wants a ref
  // mutated before it's read by an earlier-registered effect). Also read by
  // the write effect and set by the restore effect further down — gated by
  // this ref so it fires exactly once per pond.
  const loadedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevPondIdRef.current === pondId) return
    const isPondSwitch = prevPondIdRef.current !== null
    prevPondIdRef.current = pondId
    if (!isPondSwitch) return
    setExpanded(new Set())
    revealedForRef.current = null
    // On a real switch, A's `loadedForRef` pin must not survive onto B and
    // then back onto A — otherwise switching back to A before B ever loads
    // reads as "A already loaded", skipping the restore-on-mount re-read and
    // letting the write effect persist this clear's empty `expanded` over
    // A's real store.
    loadedForRef.current = null
  }, [pondId])

  // Read this pond's stored expansion once per `pondId`, prune it against the
  // loaded `pages` (a stored id may have been deleted elsewhere), and merge
  // the result into `expanded` via a union — never a replace — so this can't
  // fight the ancestor-reveal or KAN-122 child-reveal effects below regardless
  // of effect order. Gated on `isSuccess`, not `!isLoading`: a failed fetch
  // also leaves `isLoading` false with `pages` still `[]`, and pruning
  // against that would mark the pond loaded and wipe the real stored ids
  // before a retry ever lands them.

  // Write `expanded` to the current pond's store whenever it (or the pond)
  // changes — the only place this runs, now that `setExpanded` itself is
  // pure, so it always writes under the `pondId` of the render it's in, not
  // whatever pond a stale async closure remembers. Gated on `loadedForRef`
  // (set by the restore effect below, once per pond) rather than "did pondId
  // just change": the switch's own clear-to-`new Set()` is itself a render of
  // `expanded`, and a guard that only tracks "did pondId change" still treats
  // that render as the pond's second pass and writes `[]` before the restore
  // effect has read the new pond's store — reproduces on every switch to an
  // uncached pond, and under `React.StrictMode` even on a plain mount (effects
  // run twice, and the second pass wrote `[]` before the first pass's restore
  // landed). Gating on the same ref the restore effect sets means the write
  // can never land before that pond's store has actually been read.
  useEffect(() => {
    if (!pondId || loadedForRef.current !== pondId) return
    writeExpandedIds(pondId, Array.from(expanded))
  }, [pondId, expanded])

  useEffect(() => {
    if (!pondId) return
    if (!isSuccess) return
    if (loadedForRef.current === pondId) return
    loadedForRef.current = pondId
    const validIds = new Set(pages.map((r) => r.id))
    const stored = pruneExpandedIds(readExpandedIds(pondId), validIds)
    if (stored.length === 0) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of stored) next.add(id)
      return next
    })
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pondId, isSuccess, pages, setExpanded])

  // ── Rail follows you (ticket-25) ────────────────────────────────────────────
  // When the selection changes — via a rail click, a children-grid card, the
  // breadcrumb, or a page created through chat / ＋ — auto-expand every folder on
  // the path to the current node (and Life itself) so it's revealed and its
  // ancestors highlight. We reveal a given selection exactly once (tracked by
  // ref) so a manual re-collapse afterward isn't fought. `revealedForRef`
  // itself is declared above, alongside the pond-switch clear (KAN-393) that
  // also resets it on a real pond switch.
  useEffect(() => {
    if (!selectedNodeId) {
      revealedForRef.current = null
      return
    }
    if (selectedNodeId === revealedForRef.current) return
    // Wait until the node itself is present so its ancestor chain is resolvable.
    if (!pages.some((r) => r.id === selectedNodeId)) return
    // The databases root is excluded: it is a disclosure the person toggles
    // themselves (KAN-486), not a folder navigation should force open.
    const ancestors = ancestorPath(pages, selectedNodeId)
      .map((c) => c.id)
      .filter((id) => id !== databasesRootId)
    revealedForRef.current = selectedNodeId
    // The two reveals below respond to an external navigation (URL ?nodeId, incl.
    // chat/＋ creation) — open Life and every ancestor folder so the current node
    // shows. Guarded to fire once per selection; not a derived-state computation.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLifeExpanded(true)
    if (ancestors.length === 0) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of ancestors) next.add(id)
      return next
    })
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedNodeId, pages, databasesRootId])

  // ── Rail reveals a new child without leaving the parent (KAN-122) ──────────
  // The `/ nested page` swap stays on the parent, so selection never changes
  // and the reveal effect above never fires. Expand the selected row itself
  // the moment its child set gains an id it didn't have last render, so the
  // freshly made child is visible without navigating anywhere.
  //
  // `pages` defaults to `[]` while the query is loading, so a baseline taken
  // before data arrives would record an empty child set and read every
  // already-existing child as "gained" once the real rows land. Wait for the
  // same ready condition the ancestor-reveal effect above uses (not loading,
  // selected node present) before recording a baseline, and drop any stale
  // baseline when the pond changes underneath the same `nodeId`.
  const childIdsRef = useRef<Map<string, Set<string>>>(new Map())
  useEffect(() => {
    childIdsRef.current = new Map()
  }, [pondId])
  useEffect(() => {
    if (!selectedNodeId) return
    if (isLoading) return
    if (!pages.some((r) => r.id === selectedNodeId)) return
    const prevChildren = childIdsRef.current.get(selectedNodeId)
    const nextChildren = new Set(
      pages.filter((r) => (r.parent_id ?? null) === selectedNodeId).map((r) => r.id)
    )
    childIdsRef.current.set(selectedNodeId, nextChildren)
    if (!prevChildren) return
    const gainedChild = [...nextChildren].some((id) => !prevChildren.has(id))
    if (!gainedChild) return
    setExpanded((prev) => {
      if (prev.has(selectedNodeId)) return prev
      const next = new Set(prev)
      next.add(selectedNodeId)
      return next
    })
  }, [selectedNodeId, pages, isLoading])

  // Deferred commits fire up to ~6s after staging — read the selection fresh at
  // commit time via this ref, not the render-time closure value.
  const selectedNodeIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  // REMOVED (#312/#320): the auto-seed that fired whenever the tree came back
  // empty, calling `seed_default_pages` to insert five top-level pages.
  //
  // A new pond IS an empty tree, so this fired on every pond a person made and
  // filled it with `personal` / `professional` / `health` / `financial` /
  // `creativity` — the phantom content #320 explicitly rules out ("a pond is born
  // with one row, its root; anything structure-shaped is made by the person").
  // It also failed loudly in the attempt: those titles already exist in `life`, so
  // the RPC hit the sibling-title unique index and answered 409.
  //
  // Onboarding is where a first pond's areas come from — #171 seeds the root and
  // the areas the person PICKED — and `Pond 06.13` `s6m3` is where a new pond's
  // areas come from. Neither is a tree-is-empty side effect. The RPCs themselves
  // (`seed_default_pages`, `seed_sandbox_pages`) are now unreferenced by the app
  // and should be dropped with `workspace`.

  function navigateTo(
    node: { id: string; type: string; title: string },
    opts?: { openTemplates?: boolean }
  ) {
    const url = workspaceUrl(node)
    openWorkspaceUrl(opts?.openTemplates ? withTemplatesParam(url) : url, router)
  }

  /** Run a mutation with a fresh client + user, refresh the tree, return its result. */
  async function withUser<T>(
    fn: (sb: ReturnType<typeof createClient>, userId: string) => Promise<T>,
    reason?: CommitReason,
    onWriteSettled?: () => void
  ): Promise<T | undefined> {
    // withUser is also how a staged delete's OWN grace-timer commit runs
    // (commitDelete -> withUser). flushStagedDeletes forces every pending
    // deletion, not just the caller's own — so flushing here was re-entrant:
    // delete A's commit force-committed delete B too, closing B's undo
    // window early. The commit-first-on-other-writes behavior moves to the
    // tree-write functions themselves (KAN-273), never to deletePage's own
    // commit path.
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return undefined
    const result = await fn(supabase, user.id)
    // Signal the write itself has landed (KAN-310 gap 3) before the
    // invalidate below — a staged delete's `trackCommit`'d promise settles
    // here, not after this invalidate, so another write's
    // `flushStagedDeletes` doesn't also wait on (and race) this one's.
    onWriteSettled?.()
    // A flush-driven commit (another write's commit-first flushStagedDeletes,
    // KAN-273) runs nested inside THAT write's own withUser call. Its own
    // invalidate would refetch before the outer write's insert/update lands,
    // reverting the outer write's optimistic cache change. Skip it here; the
    // outer write's own invalidate (this same function, one stack frame up)
    // still runs once the flush has unwound. `reason` is threaded explicitly
    // from the commit that triggered this call (KAN-310) — a plain
    // timer/dismiss-driven commit passes nothing and invalidates as before.
    if (reason !== 'flush-driven') {
      await queryClient.invalidateQueries({ queryKey: pagesKey() })
    }
    return result
  }

  // The reload backstop (KAN-300): a reload can cancel the in-flight request
  // `pagehide`'s flush started, leaving a commit unfinished. Only ids left
  // over from BEFORE this script ran (`priorLifeIds`) are swept — an id
  // staged during this very script execution still has a live toast/undo
  // path somewhere, and an unrelated Rail remount must not hard-delete it out
  // from under that. `withUser` is deliberately not reused here: its `T` is
  // `void` for `trashPage`, so a successful trash and "no signed-in user"
  // are both indistinguishable `undefined` returns, and it has no per-call
  // try/catch — both would silently mis-clear the backstop id.
  useEffect(() => {
    const leftover = priorLifeIds()
    if (leftover.length === 0) return
    void (async () => {
      for (const id of leftover) {
        try {
          const supabase = createClient()
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (!user) continue // no signed-in user — leave staged, retry on a later mount
          // `trash_page` trashes this id's whole LIVE subtree, not just
          // itself — read it fresh off the cache rather than reuse a stale
          // render's `nodeById` (this effect's own deps are `[]`), so a
          // leftover id with a since-cached child unlinks that child's
          // parents too, not only the root's own. This effect runs on mount,
          // ahead of the rail's own `pages` query settling on a cold reload,
          // so a bare cache read sees nothing yet — `fetchQuery` (same
          // key/fn as that query) waits for the real rows instead of
          // falling back to the leftover id alone.
          const cachedRows = await queryClient.fetchQuery<PageRow[]>({
            queryKey: pagesKey(pondId),
            queryFn: () => fetchPages(pondId),
          })
          const node = findRailNode(buildTree(cachedRows), id)
          await trashPageUnlinked(supabase, queryClient, {
            pondId,
            rootPageId: id,
            subtreeIds: node ? subtreeIds(node) : new Set([id]),
          })
          unstageId(id)
          queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (rows) => removeRow(rows ?? [], id))
          queryClient.invalidateQueries({ queryKey: pagesKey() })
          // Same reason as `commitDelete`'s own invalidate (KAN-451): the
          // trash page/change log read the `delete` record this sweep's
          // `trashPageUnlinked` just wrote, nested under `changeLogKey()`.
          queryClient.invalidateQueries({ queryKey: changeLogKey() })
        } catch (err) {
          // 'not-found' also covers an already-trashed page (trash_page's own
          // refusal) — a pagehide flush that landed before this sweep ran, or a
          // page already trashed again since. Either way this id's trash is
          // done; unstaging it stops a later restore from being re-trashed by
          // a stale sweep retry.
          if (err instanceof TrashRefusedError && err.reason === 'not-found') {
            unstageId(id)
            continue
          }
          // leave this id staged; a later mount retries it
        }
      }
    })()
    // Runs once per mount against the snapshot captured at this script's
    // first load; priorLifeIds() never grows, so a later remount with
    // nothing left over is a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openingDatabases = useRef(false)

  /** The databases row with no root behind it: create the root through the one
   *  existing path (`getOrCreateDatabasesRoot`, also what creating a database
   *  uses), then open it. */
  const handleOpenDatabases = async () => {
    if (openingDatabases.current) return
    openingDatabases.current = true
    try {
      const root = await withUser((sb, uid) => getOrCreateDatabasesRoot(sb, uid, pondId))
      if (root) {
        setExpanded((prev) => new Set(prev).add(root.id))
        navigateTo({ id: root.id, type: 'page', title: DATABASES_ROOT_TITLE })
      }
    } catch {
      notify("Couldn't open databases")
    } finally {
      openingDatabases.current = false
    }
  }

  async function handleAddChild(id: string, action: NewPageMenuAction = 'page') {
    // The root's ＋ adds a top-level page: the synthetic root is nobody's id.
    const parentId = id === LIFE_ID ? null : id
    setBusyId(id)
    try {
      const created = await withUser((sb, uid) =>
        createPage(sb, uid, {
          parentId,
          type: 'page',
          title: '',
          blocks: instantiateTemplate(PREMADE_TEMPLATES.page).blocks,
          pondId,
        })
      )
      // ensure the parent folder is open so the new child is visible
      if (parentId === null) setLifeExpanded(true)
      else setExpanded((prev) => new Set(prev).add(parentId))
      if (created) {
        // F26: seed the cache with the new row so the reveal nests it immediately,
        // rather than depending on the refetch having landed before we navigate.
        insertPageOptimistic(
          queryClient,
          {
            id: created.id,
            parentId,
            type: 'page',
            title: created.title,
          },
          pondId
        )
        navigateTo(
          { id: created.id, type: 'page', title: created.title },
          { openTemplates: action === 'template' }
        )
        // KAN-415: a failed link append is not a failed page creation — the
        // page above has already landed and been navigated to.
        void appendChildLinkUnder(
          createClient(),
          queryClient,
          parentId,
          created.id,
          pondId,
          pondName
        )
      }
    } finally {
      setBusyId(null)
    }
  }

  const addingRootRef = useRef(false)
  // KAN-490: the id the ＋-root row just made, so `RailView` opens inline
  // rename on it. Sticky on purpose — once consumed it never needs clearing,
  // since a fresh create always hands back a new, different id.
  const [pendingRootRenameId, setPendingRootRenameId] = useState<string | null>(null)

  /**
   * The ＋ "new root folder" row: a top-level page with `props.root`, not a
   * child of the home row — `appendChildLinkUnder` is for the home page's own
   * children and must not run here, or a link block would land on the home
   * page for a page that isn't one of its children. Opens inline rename on
   * the new row instead of navigating into it, unlike `handleAddChild`.
   */
  async function handleAddRoot() {
    if (addingRootRef.current) return
    addingRootRef.current = true
    try {
      // Top-level siblings: every `parent_id: null` page already in the tree
      // (`fetchPages` strips the home row on purpose, so its title is added
      // separately) plus the home row's own title.
      const topLevelTitles = pages.filter((p) => p.parent_id === null).map((p) => p.title)
      if (home?.title) topLevelTitles.push(home.title)
      const title = nextAvailableTitle('Untitled', topLevelTitles)

      const created = await withUser((sb, uid) =>
        createPage(sb, uid, {
          parentId: null,
          title,
          props: { root: true },
          pondId,
        })
      )
      if (created) {
        insertPageOptimistic(
          queryClient,
          {
            id: created.id,
            parentId: null,
            type: created.type,
            title: created.title,
            props: created.props,
          },
          pondId
        )
        setPendingRootRenameId(created.id)
      }
    } finally {
      addingRootRef.current = false
    }
  }

  /** Put a single optimistically-removed row back (surgical) and reconcile. */
  function restoreDeletedRow(row: PageRow | undefined) {
    if (row) {
      queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (rows) =>
        rows ? restoreRow(rows, row) : rows
      )
    }
    queryClient.invalidateQueries({ queryKey: pagesKey() })
  }

  /**
   * The real hard-delete + open-page bookkeeping, shared by both delete paths.
   * Runs up to ~6s after staging (deferred commit), so the selection is read
   * fresh from the ref. On failure the removed row is restored and the failure
   * surfaced — never a silently ghosted cache.
   */
  async function commitDelete(
    node: RailNode,
    removedRow?: PageRow,
    reason?: CommitReason,
    onWriteSettled?: () => void
  ) {
    try {
      await withUser(
        (sb) =>
          trashPageUnlinked(sb, queryClient, {
            pondId,
            rootPageId: node.id,
            subtreeIds: subtreeIds(node),
          }),
        reason,
        onWriteSettled
      )
      // A trashed page's chip (relation cell, KAN-311) must flip without a
      // reload — unscoped prefixes so every ['rows', id] and ['page', id]
      // query is caught, same reach as pagesKey() just above. Skipped on a
      // flush-driven commit for the same reason pagesKey() is (KAN-273): it
      // runs nested inside another write and would refetch before that
      // write's own optimistic change lands.
      if (reason !== 'flush-driven') {
        queryClient.invalidateQueries({ queryKey: ['rows'] })
        queryClient.invalidateQueries({ queryKey: ['page'] })
      }
      // The trash page/change log (KAN-451) read the `delete` record
      // `trashPageUnlinked` just wrote, via `trashKey`/`changeLogDeletedKey`,
      // both nested under `changeLogKey()` — never `pagesKey()`. Unlike the
      // `rows`/`page` invalidates above, this is NOT skipped on a
      // flush-driven commit: that skip exists because an outer write races
      // its OWN optimistic update to the SAME key (`pagesKey`); no outer
      // write here ever touches `changeLogKey()` optimistically, so there is
      // nothing to race and nothing else ever invalidates it on this path.
      await queryClient.invalidateQueries({ queryKey: changeLogKey() })
      // if the open page was in the deleted subtree, clear the workspace
      const selected = selectedNodeIdRef.current
      if (selected && subtreeIds(node).has(selected)) {
        openWorkspaceUrl(workspaceUrl(null), router)
      }
    } catch {
      restoreDeletedRow(removedRow)
      notify(`Couldn't delete "${node.title || 'Untitled'}"`)
    }
  }

  /** The home root as a tree node. Pages drawn inside it are parent-less rows
   *  that are not extra roots — not SQL children of the home id — so a delete
   *  has to trash each of them as well as the home row. */
  function homeAsNode(): RailNode | null {
    if (!home) return null
    const { children } = splitExtraRoots(tree.filter((n) => !isDatabasesRoot(n)))
    return {
      id: home.id,
      parentId: null,
      type: 'home',
      title: home.title,
      order: 0,
      children,
    }
  }

  async function commitHomeDelete(
    node: RailNode,
    reason?: CommitReason,
    onWriteSettled?: () => void
  ) {
    const targets = [...node.children, node]
    try {
      await withUser(
        async (sb) => {
          for (const target of targets) {
            await trashPageUnlinked(sb, queryClient, {
              pondId,
              rootPageId: target.id,
              subtreeIds: subtreeIds(target),
            })
          }
        },
        reason,
        onWriteSettled
      )
      if (reason !== 'flush-driven') {
        queryClient.invalidateQueries({ queryKey: ['rows'] })
        queryClient.invalidateQueries({ queryKey: ['page'] })
        await queryClient.invalidateQueries({ queryKey: homeQueryKey(pondId) })
        await queryClient.invalidateQueries({ queryKey: changeLogKey() })
      }
    } catch {
      setHiddenHomeId(null)
      queryClient.invalidateQueries({ queryKey: pagesKey() })
      notify(`Couldn't delete "${node.title || 'Untitled'}"`)
    }
  }

  function deleteHomeRoot() {
    const node = homeAsNode()
    if (!node) return
    // KAN-491: every root delete confirms first ("deletes N pages inside"),
    // including the last root, whose count is 0. Undo comes after confirm.
    setConfirmTarget(node)
  }

  /** Confirm, then the same optimistic remove + undo toast a leaf delete uses.
   *  The commit stays deferred so Undo puts the root back before trash runs. */
  function stageRootDelete(node: RailNode) {
    const key = pagesKey(pondId)
    const snapshot = queryClient.getQueryData<PageRow[]>(key)
    if (node.type === 'home') setHiddenHomeId(node.id)
    queryClient.setQueryData<PageRow[]>(key, (rows) => {
      let next = rows ?? []
      for (const id of subtreeIds(node)) {
        if (node.type === 'home' && id === node.id) continue
        next = removeRow(next, id)
      }
      return next
    })
    const selected = selectedNodeId
    if (selected && (selected === LIFE_ID || subtreeIds(node).has(selected))) {
      openWorkspaceUrl(workspaceUrl(null), router)
    }
    const removedRow = snapshot?.find((row) => row.id === node.id)
    stageDeletion({
      message: `Deleted "${node.title || 'Untitled'}"`,
      scope: 'rail',
      id: node.id,
      commit: (reason, onWriteSettled) =>
        node.type === 'home'
          ? commitHomeDelete(node, reason, onWriteSettled)
          : commitDelete(node, removedRow, reason, onWriteSettled),
      undo: () => {
        if (node.type === 'home') setHiddenHomeId(null)
        if (snapshot) queryClient.setQueryData(key, snapshot)
      },
    })
  }

  function handleDelete(id: string) {
    if (id === LIFE_ID) {
      deleteHomeRoot()
      return
    }
    const node = nodeById.get(id)
    if (!node) return
    if (isExtraRootNode(node)) {
      setConfirmTarget(node)
      return
    }
    // A subtree delete is irreversible and heavy — gate it behind the styled
    // blast-radius confirm. A leaf goes straight to an optimistic-remove + undo
    // toast (deferred commit), no modal.
    if (needsConfirm(countDescendants(node))) {
      setConfirmTarget(node)
      return
    }

    const removedRow = pages.find((r) => r.id === node.id)
    queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (rows) => removeRow(rows ?? [], node.id))
    if (selectedNodeId === node.id) openWorkspaceUrl(workspaceUrl(null), router)

    stageDeletion({
      message: `Deleted "${node.title || 'Untitled'}"`,
      scope: 'rail',
      id: node.id,
      commit: (reason, onWriteSettled) => commitDelete(node, removedRow, reason, onWriteSettled),
      undo: () => restoreDeletedRow(removedRow),
    })
  }

  async function handleConfirmDelete() {
    const node = confirmTarget
    setConfirmTarget(null)
    if (!node) return
    setBusyId(node.id)
    try {
      if (node.type === 'home' || isExtraRootNode(node)) {
        stageRootDelete(node)
        return
      }
      await commitDelete(node)
    } finally {
      setBusyId(null)
    }
  }

  /**
   * A kept rename: the title shows in the rail at once, then `updateTitle` — the
   * call the page's own title editor persists through — may refuse it (a sibling
   * already has the title). On failure only THIS row's title goes back, so a move
   * or add that landed in between is untouched, and the clash is surfaced.
   */
  const handleRename = async (id: string, title: string) => {
    // The home root is not in the pages cache. Its label is the home query.
    if (id === LIFE_ID) {
      if (!home) return
      const previous = home.title
      const key = homeQueryKey(pondId)
      queryClient.setQueryData(key, { ...home, title })
      try {
        await withUser((sb) => updateTitle(sb, home.id, title))
      } catch (error) {
        queryClient.setQueryData(key, { ...home, title: previous })
        notify(
          error instanceof DuplicateTitleError
            ? `"${title}" already exists here`
            : `Couldn't rename "${previous || 'Untitled'}"`
        )
      }
      void queryClient.invalidateQueries({ queryKey: ['page', home.id] })
      void queryClient.invalidateQueries({ queryKey: key })
      return
    }
    const previous = nodeById.get(id)?.title ?? ''
    applyRenameOptimistic(queryClient, { id, title }, pondId)
    try {
      await withUser((sb) => updateTitle(sb, id, title))
    } catch (error) {
      applyRenameOptimistic(queryClient, { id, title: previous }, pondId)
      notify(
        error instanceof DuplicateTitleError
          ? `"${title}" already exists here`
          : `Couldn't rename "${previous || 'Untitled'}"`
      )
      void queryClient.invalidateQueries({ queryKey: pagesKey() })
    }
    void queryClient.invalidateQueries({ queryKey: ['page', id] })
  }

  /**
   * A pick commits at once: the mark redraws through `resolveMark` before
   * `setPageGlyph`'s write lands (`marks` is rebuilt from the same cache
   * `applyGlyphOptimistic` writes). A failed write rolls back to the row's
   * previous glyph and notifies, matching `handleRename`'s pattern.
   *
   * It also pushes onto the pond's recent list (KAN-27): `recentGlyphs`
   * redraws from the same pure `pushRecentGlyph` merge `pushRecentGlyphToPond`
   * persists, so the picker's `recent` section never waits on that write
   * either — and a pick of `null` (automatic) has no glyph to push. A failed
   * push rolls its own entry out of `pushedGlyphs` (not the page glyph write
   * above, which already succeeded or failed on its own).
   *
   * One change, one undoable record (the 10 oct ruling): once `setPageGlyph`
   * lands, the pick is logged as the person's own `edit_glyph` record —
   * picking `automatic` (glyph `null`) is a change too, so it is logged the
   * same way. The ⌘Z chord that replays it is KAN-93's; this ticket only owes
   * the record. Logging is a side-record of a write that already landed
   * (`own-edit.ts`'s own rule), so a failed append is console-logged, never
   * rolled back into the real write's success/failure handling.
   */
  const handlePickGlyph = async (id: string, glyph: string | null) => {
    const previous = marks.get(id)?.glyph ?? null
    applyGlyphOptimistic(queryClient, { id, glyph }, pondId)
    if (glyph && pondId) {
      setPushedGlyphs((prev) => [...prev, glyph])
      pushRecentGlyphToPond(pondId, recentGlyphs, glyph).catch((error) => {
        console.error('[recent-glyphs] push not persisted', glyph, error)
        setPushedGlyphs((prev) => {
          const index = prev.lastIndexOf(glyph)
          return index === -1 ? prev : [...prev.slice(0, index), ...prev.slice(index + 1)]
        })
      })
    }
    try {
      await withUser(async (sb, uid) => {
        await setPageGlyph(sb, id, glyph)
        if (jsonEqual(previous, glyph)) return
        try {
          const record = await appendOwnEdit(sb, {
            userId: uid,
            pondId,
            action: 'edit_glyph',
            targetPageId: id,
            before: previous,
            after: glyph,
          })
          if (pondId) sessionUndo.remember({ pondId, recordIds: [record.id] })
          await queryClient.invalidateQueries({ queryKey: changeLogKey() })
        } catch (err) {
          console.error('[change-log] glyph pick not logged', id, err)
        }
      })
    } catch {
      applyGlyphOptimistic(queryClient, { id, glyph: previous }, pondId)
      notify(`Couldn't change the icon for "${nodeById.get(id)?.title || 'Untitled'}"`)
      void queryClient.invalidateQueries({ queryKey: pagesKey() })
    }
  }

  /**
   * A colour pick commits at once, same shape as `handlePickGlyph`: optimistic
   * apply, `setAreaRole`'s write, a rollback + notify on failure. The picker
   * itself stays open (frame 3/4) — closing it is never this function's job.
   *
   * Logged as the person's own `edit_area_role` record, skipped on a no-op
   * pick, for the same reason `handlePickGlyph` skips its own: KAN-93's
   * unlanded ⌘Z replays it, this ticket only owes the record.
   */
  const handlePickColour = async (id: string, role: AreaRole | null) => {
    const stored = marks.get(id)?.areaRole
    const previous = isAreaRole(stored) ? stored : null
    applyAreaRoleOptimistic(queryClient, { id, role }, pondId)
    try {
      await withUser(async (sb, uid) => {
        await setAreaRole(sb, id, role)
        if (jsonEqual(previous, role)) return
        try {
          const record = await appendOwnEdit(sb, {
            userId: uid,
            pondId,
            action: 'edit_area_role',
            targetPageId: id,
            before: previous,
            after: role,
          })
          if (pondId) sessionUndo.remember({ pondId, recordIds: [record.id] })
          await queryClient.invalidateQueries({ queryKey: changeLogKey() })
        } catch (err) {
          console.error('[change-log] colour pick not logged', id, err)
        }
      })
    } catch {
      applyAreaRoleOptimistic(queryClient, { id, role: previous }, pondId)
      notify(`Couldn't change the colour for "${nodeById.get(id)?.title || 'Untitled'}"`)
      void queryClient.invalidateQueries({ queryKey: pagesKey() })
    }
  }

  function handleToggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Life's caret: collapse-all. Collapsing also clears open folders, so
   *  re-opening returns to the resting top level (not the previous open set). */
  function handleToggleLife() {
    setLifeExpanded((prev) => {
      if (prev) setExpanded(new Set())
      return !prev
    })
  }

  /** Open a page — navigation, except for the databases root: it is a
   *  disclosure, not a page, so clicking it toggles expansion instead
   *  (KAN-486 — it no longer has a destination page reachable from here;
   *  ⌘K / the breadcrumb still reach it). */
  function handleSelect(id: string) {
    // The change log and trash are reserved virtual pages — no `pages` row,
    // so their own URLs are built by hand rather than through
    // `nodeById`/`navigateTo`.
    if (id === CHANGE_LOG_NODE_ID) {
      openWorkspaceUrl(
        workspaceUrl({ id: CHANGE_LOG_NODE_ID, type: 'page', title: 'change log' }),
        router
      )
      return
    }
    if (id === TRASH_NODE_ID) {
      openWorkspaceUrl(workspaceUrl({ id: TRASH_NODE_ID, type: 'page', title: 'trash' }), router)
      return
    }
    const node = nodeById.get(id)
    if (!node) return
    if (isDatabasesRoot(node)) {
      handleToggle(id)
      return
    }
    navigateTo(node)
  }

  // ── Drag-to-reparent / reorder (F25) ────────────────────────────────────────

  /** The dragover affordance gate — valid, non-cyclic target (no-ops allowed). */
  function canDrop(draggedId: string, targetId: string, zone: DropZone) {
    return canMove(pages, draggedId, targetId, zone)
  }

  /**
   * Commit a move: resolve it (computeMove absorbs self / cycle / no-op → null),
   * apply it optimistically so the rail restructures instantly, auto-expand the
   * target on an *into* so the moved child is visible, then persist. On failure,
   * restore the pre-move snapshot, surface the miss, and reconcile.
   */
  async function handleMove(draggedId: string, targetId: string, zone: DropZone) {
    const move = computeMove(pages, draggedId, targetId, zone)
    if (!move) return

    const draggedRow = pages.find((r) => r.id === draggedId)
    const title = draggedRow?.title || 'Untitled'

    const snapshot = applyMoveOptimistic(
      queryClient,
      {
        movedId: draggedId,
        newParentId: move.newParentId,
        siblingOrder: move.siblingOrder,
      },
      pondId
    )

    // Expand-on-drop: an into-drop reveals the moved child under its new parent.
    if (zone === 'into') {
      if (targetId === LIFE_ID) setLifeExpanded(true)
      else setExpanded((prev) => new Set(prev).add(targetId))
    }

    // KAN-477: a reparent writes no link block of its own — the new parent's
    // child links are derived at read time, so the move stays one undo step.

    try {
      const record = await withUser((sb) =>
        movePage(sb, {
          id: draggedId,
          newParentId: move.newParentId,
          siblingOrder: move.siblingOrder,
        })
      )
      const after = record ? readMoveSnapshot(record.after) : null
      if (pondId && record && draggedRow && after) {
        const handle = sessionUndo.rememberPending({
          pondId,
          recordIds: Promise.resolve([record.id]),
        })
        queryClient.invalidateQueries({ queryKey: changeLogKey() })
        stageUndo({
          message: `moved ${title} to ${moveParentLabel(after.parentTitle, home?.title ?? pondName)} ·`,
          undoLabel: 'undo',
          undo: () =>
            sessionUndo
              .undoHandle(pondId, handle)
              .then((outcome) => applyUndoOutcome('undo', outcome, queryClient)),
          action: () => navigateTo(draggedRow),
          actionLabel: 'open',
        })
      }
    } catch {
      if (snapshot) queryClient.setQueryData<PageRow[]>(pagesKey(pondId), snapshot)
      notify(`Couldn't move "${nodeById.get(draggedId)?.title || 'Untitled'}"`)
      queryClient.invalidateQueries({ queryKey: pagesKey() })
    }
  }

  const confirmCount = confirmTarget ? countDescendants(confirmTarget) : 0

  return (
    <>
      <RailView
        tree={tree}
        pondName={pondName}
        rootTitle={home?.title ?? null}
        showHomeRoot={home !== null && !homeHidden}
        pondGlyph={pondGlyph}
        recentGlyphs={recentGlyphs}
        marks={marks}
        selectedId={selectedNodeId}
        expanded={expanded}
        lifeExpanded={lifeExpanded}
        busyId={busyId}
        isLoading={isLoading}
        isEmpty={!isLoading && tree.every(isDatabasesRoot)}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onAddChild={handleAddChild}
        onDelete={handleDelete}
        onRename={handleRename}
        onPickGlyph={handlePickGlyph}
        onPickColour={handlePickColour}
        onMinimize={() => setRailMinimized(true)}
        onLife={() => openWorkspaceUrl(workspaceUrl(null), router)}
        onToggleLife={handleToggleLife}
        onOpenDatabases={handleOpenDatabases}
        onAddRoot={handleAddRoot}
        autoRenameId={pendingRootRenameId}
        canDrop={canDrop}
        onMove={handleMove}
      />
      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null)
        }}
        title={`Delete "${confirmTarget?.title || 'Untitled'}"?`}
        blastRadius={blastRadiusLabel(confirmCount)}
        consequence="It stays in the trash for 30 days. Restore it from the change log."
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
