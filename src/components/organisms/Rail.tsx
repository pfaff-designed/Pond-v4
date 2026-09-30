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
 * Life is the workspace root, NOT a row in `pages`: it can't be renamed or
 * deleted, and its caret is a collapse-all (collapsing closes every folder, so
 * re-opening shows the resting top level). The data source is unchanged — the
 * `['pages']` query + parent_id tree (ticket-25's reveal, ticket-27's delete,
 * ticket-26's create all preserved) — this is a view-layer restructure.
 *
 * Split for Storybook: <RailView> is presentational (all data and mutations
 * raised as props) but OWNS the roving focus + keyboard machine, since focus is
 * a view concern; <Rail> is the container that wires Supabase + React Query.
 *
 * Keyboard (WAI-ARIA APG tree — pure rules in `lib/rail/tree.ts`, jest-covered):
 * one roving tab stop; ↑/↓ move, → expands / steps into the first child,
 * ← collapses / steps out to the parent, Enter/Space open, Home/End jump,
 * Delete/⌫ deletes the focused row (through the same confirm/undo path as ×),
 * + adds a child. The row's ＋/× are also real tab stops (ticket-27
 * reachability). When the focused row vanishes (deleted, or hidden by an
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
import { createPage, deletePage, movePage } from '@/lib/pages/client'
import {
  fetchPages,
  insertPageOptimistic,
  applyMoveOptimistic,
  type PageRow,
} from '@/lib/pages/tree'
import { useWorkspace } from '@/lib/workspace/context'
import { workspaceUrl, workspaceBasePath } from '@/lib/pages/nav'
import { pageAccent } from '@/lib/pages/accent'
import { ancestorPath } from '@/lib/pages/overview'
import { LIFE_GLYPH, areaGlyph } from '@/lib/rail/area-glyph'
import {
  LIFE_ID,
  buildTree,
  flattenVisible,
  treeKeyCommand,
  focusFallback,
  canMove,
  computeMove,
  type RailNode,
  type FlatRow,
  type DropZone,
} from '@/lib/rail/tree'
import {
  countDescendants,
  subtreeIds,
  needsConfirm,
  blastRadiusLabel,
} from '@/lib/deletion/blast-radius'
import { removeRow, restoreRow } from '@/lib/deletion/row-cache'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog'
import { PondMolecule, type PondMoleculeState } from '@/components/molecules/PondMolecule'
import { AreaMark } from '@/components/atoms/AreaMark'

// Re-exported so stories and consumers keep one import site for the tree types.
export { LIFE_ID, buildTree, flattenVisible, isFolderNode } from '@/lib/rail/tree'
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
// event target) so inner controls never double-drive the tree (ticket-27/28).

/** Px of extra left-pad per depth level — the guides land on these gridlines. */
const INDENT_STEP = 16
/** Fixed left offset of the whole tree content (past the paper margin). */
const INDENT_BASE = 6

/** A calm authored chevron — rotates on expand, no glyph substitution. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className={`transition-transform duration-[var(--motion-settle)] ease-[var(--ease-mn)] ${
        open ? 'rotate-90' : ''
      }`}
    >
      <path
        d="M3.5 2 L7 5 L3.5 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface RailRowProps {
  id: string
  title: string
  depth: number
  isFolder: boolean
  isExpanded: boolean
  isSelected: boolean
  /** An ancestor of the selection — the trail reads at a raised tone (t25). */
  isOnPath: boolean
  /** The single roving tab stop lands here; arrow keys move it (APG tree). */
  isFocused: boolean
  isBusy: boolean
  /** The root (Life) can't be renamed or deleted and shows no ＋/×. */
  isRoot?: boolean
  /** An area row — the raised label voice + its accent dot. #108: "area" is no
   *  longer a stored type; the caller passes this for a TOP-LEVEL page, which is
   *  where a person's areas live. (Per-page glyph/colour is #91.) */
  isArea?: boolean
  posInSet?: number
  setSize?: number
  /** Muted accent for the area dot; omit to render no dot (leaves). */
  accent?: string
  /** Settle-in entrance for rows revealed on expand (ticket-41). */
  settleOnMount?: boolean
  /** A leading mark slot (an area's glyph, the Life root's ring — #91) —
   *  replaces the dot. */
  leading?: ReactNode
  /** Trailing meta slot (the root's "all" caption). */
  trailing?: ReactNode

  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onAddChild?: (id: string) => void
  onDelete?: (id: string) => void
  onFocus: (id: string) => void
  onKeyDown: (id: string, e: KeyboardEvent<HTMLDivElement>) => void

  // ── Drag-to-reparent/reorder (F25) ────────────────────────────────────────
  draggable?: boolean
  /** This row is the one being dragged — dims to ~50% (the drag image carries
   *  the molecule's lift; the source row just quiets). */
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
    isOnPath,
    isFocused,
    isBusy,
    isRoot = false,
    isArea = false,
    posInSet,
    setSize,
    accent,
    settleOnMount = false,
    leading,
    trailing,
    onSelect,
    onToggle,
    onAddChild,
    onDelete,
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
  // Hover is host state (the molecule is presentational and takes ONE state);
  // CRUD reveal additionally rides group-hover/focus-within CSS so it still
  // opens for a keyboard user tabbing into the row's controls.
  const [hovered, setHovered] = useState(false)
  const label = title || 'Untitled'
  const padLeft = INDENT_BASE + depth * INDENT_STEP
  const state: PondMoleculeState = isSelected ? 'selected' : hovered ? 'hover' : 'rest'
  // The rail's "you are here" trail: three ink tiers on the row label. The
  // list-row molecule renders one tone (mockup default), so the rail docks its
  // own voice onto the title via data-voice → CSS (see globals.css). full =
  // the selected row (ink-100); raised = an area/root row or an ancestor of the
  // selection (ink-80 meta); muted = a plain child row (ink-68).
  const labelVoice: 'full' | 'raised' | 'muted' = isSelected
    ? 'full'
    : isOnPath || isRoot || isArea
      ? 'raised'
      : 'muted'

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
      data-on-path={isOnPath || undefined}
      data-voice={labelVoice}
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(id, e) : undefined}
      onDragOver={onDragOver ? (e) => onDragOver(id, e) : undefined}
      onDragLeave={onDragLeave ? (e) => onDragLeave(id, e) : undefined}
      onDrop={onDrop ? (e) => onDrop(id, e) : undefined}
      onDragEnd={onDragEnd ? (e) => onDragEnd(id, e) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // The whole row opens the page (the caret and ＋/× stop propagation) —
      // strictly navigation; expansion belongs to the caret alone.
      onClick={() => onSelect(id)}
      onFocus={(e) => {
        // Only the row itself — focusing an inner control (＋/×) must not yank
        // the roving focus back to the row.
        if (e.target === e.currentTarget) onFocus(id)
      }}
      onKeyDown={(e) => {
        // Only keys pressed on the row itself — Enter on an inner ＋/× button
        // already clicks it; it must not also bubble into an "open" command.
        if (e.target === e.currentTarget) onKeyDown(id, e)
      }}
      className={`group relative flex items-center rounded-mn-row outline-none
        focus-visible:ring-2 focus-visible:ring-mn-area-b focus-visible:ring-offset-0
        ${isDropRejected ? 'cursor-not-allowed' : 'cursor-pointer'}
        ${isDragging ? 'opacity-50' : ''}
        ${dropZone === 'into' ? 'ring-2 ring-inset ring-mn-area-b ' : ''}${settleOnMount ? 'motion-settle-in ' : ''}`}
      style={{ paddingLeft: padLeft }}
    >
      {/* Drop-line for a before/after reorder — a calm rule at the row's
          top/bottom edge; pointer-events-none so it never eats a drag event.
          The into-highlight is the ring on the row itself (above). */}
      {dropZone === 'before' && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 right-2 -top-px h-0.5 rounded-full bg-mn-text"
        />
      )}
      {dropZone === 'after' && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-mn-text"
        />
      )}

      {/* Indentation guides — one hairline per ancestor level, brightened a
          touch on the selected/on-path trail so the eye follows depth home. */}
      {Array.from({ length: depth }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={`absolute top-0 bottom-0 w-px ${
            isSelected || isOnPath ? 'bg-mn-line' : 'bg-mn-hair'
          }`}
          style={{ left: INDENT_BASE + i * INDENT_STEP + 10 }}
        />
      ))}

      {/* caret — toggles the folder without navigating and without taking
          focus (the row keeps the roving tab stop); leaf gets a spacer */}
      {isFolder ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="grid h-[34px] w-[20px] flex-shrink-0 place-items-center text-mn-text/30 transition-colors hover:text-mn-text"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(id)
          }}
        >
          <Chevron open={isExpanded} />
        </button>
      ) : (
        <span className="w-[20px] flex-shrink-0" aria-hidden />
      )}

      <PondMolecule
        kind="list-row"
        state={state}
        title={label}
        meta=""
        handle={false}
        dot={!isRoot && isArea && accent !== undefined && leading === undefined}
        accent={accent}
        emphasis={isRoot || isArea}
        leading={leading}
        trailing={
          <>
            {trailing}
            {/* hover CRUD — quiet at rest, revealed on hover / focus-within, and
                REAL tab stops so keyboard/AT users reach them without a pointer
                (t27). The root (Life) is the workspace, not a row: no add/delete. */}
            {!isRoot && (onAddChild || onDelete) && (
              <span className="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                {onAddChild && (
                  <button
                    type="button"
                    className="grid h-[22px] w-[22px] place-items-center rounded-mn-chrome text-mn-text/30 outline-none transition-colors hover:bg-mn-text/5 hover:text-mn-text focus-visible:ring-2 focus-visible:ring-mn-area-b disabled:opacity-30"
                    title="Add sub-page"
                    aria-label={`Add sub-page to ${label}`}
                    disabled={isBusy}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAddChild(id)
                    }}
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
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="grid h-[22px] w-[22px] place-items-center rounded-mn-chrome text-mn-text/30 outline-none transition-colors hover:bg-mn-signal-removal/10 hover:text-mn-signal-removal focus-visible:ring-2 focus-visible:ring-mn-area-b disabled:opacity-30"
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
                )}
              </span>
            )}
          </>
        }
        className="h-[34px] min-h-0 w-full flex-1 pl-1 pr-1.5"
      />
    </div>
  )
})

// ── Presentational rail ──────────────────────────────────────────────────────

const NO_PATH: ReadonlySet<string> = new Set()

export interface RailViewProps {
  tree: RailNode[]
  selectedId: string | null
  /** Ancestor ids of the selected node — rendered at a raised tone (ticket-25). */
  pathIds?: ReadonlySet<string>
  expanded: Set<string>
  /** Whether the Life root is expanded (reveals the whole tree). */
  lifeExpanded: boolean
  busyId: string | null
  isLoading: boolean
  isEmpty: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onAddChild: (id: string) => void
  onDelete: (id: string) => void
  onLife: () => void
  onToggleLife: () => void
  /** Would a drop offer a landing? (valid, non-cyclic target — F25.) A false
   *  return paints the not-allowed affordance instead of a drop-line. */
  canDrop: (draggedId: string, targetId: string, zone: DropZone) => boolean
  /** Commit a drag→drop move (reparent/reorder). No-ops are absorbed downstream. */
  onMove: (draggedId: string, targetId: string, zone: DropZone) => void
}

/** The Life root's mark — the ring glyph in sage (#91; the drawn half-disc retired). */
const LIFE_MARK = <AreaMark glyph={LIFE_GLYPH} color="var(--mn-area-a)" />

/**
 * An area row's leading mark: its default glyph in the area hue, when the
 * title maps to one (#91). An unmapped area returns nothing and keeps its
 * KindDot through the molecule's `dot`.
 *
 * #108: there is no `type = 'area'` to test any more, so the mark is offered to
 * TOP-LEVEL pages — where a person's areas live, and the only rows the fixed
 * title→glyph defaults are written for. Per-page glyph/colour is #91's own work.
 */
function areaMark(node: RailNode): ReactNode {
  if (node.parentId !== null) return undefined
  const glyph = areaGlyph(node.title)
  return glyph ? <AreaMark glyph={glyph} color={pageAccent(node.id)} /> : undefined
}

export function RailView({
  tree,
  selectedId,
  pathIds = NO_PATH,
  expanded,
  lifeExpanded,
  busyId,
  isLoading,
  isEmpty,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
  onLife,
  onToggleLife,
  canDrop,
  onMove,
}: RailViewProps) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const setRowRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) rowRefs.current.set(id, el)
      else rowRefs.current.delete(id)
    },
    []
  )

  // The ONE flattened list — Life first — driving render, ARIA coordinates,
  // and keyboard order alike (they can't drift; see lib/rail/tree.ts).
  const flat = useMemo(
    () => flattenVisible(tree, expanded, lifeExpanded),
    [tree, expanded, lifeExpanded]
  )
  const visibleIds = useMemo(() => new Set(flat.map((f) => f.id)), [flat])

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

  // Reflect a keyboard-driven focus change into real DOM focus so arrow keys
  // keep firing on the newly focused row.
  useEffect(() => {
    if (focusedId && visibleIds.has(focusedId)) rowRefs.current.get(focusedId)?.focus()
  }, [focusedId, visibleIds])

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

  // ── Keyboard machine (pure rules; commands dispatched to the callbacks) ────
  function handleKeyDown(id: string, e: KeyboardEvent<HTMLDivElement>) {
    const cmd = treeKeyCommand(e.key, id, flat, { expanded, lifeExpanded })
    if (!cmd) return
    e.preventDefault()
    switch (cmd.kind) {
      case 'focus':
        setFocusedId(cmd.id)
        break
      case 'expand':
      case 'collapse':
        if (cmd.id === LIFE_ID) onToggleLife()
        else onToggle(cmd.id)
        break
      case 'open':
        if (cmd.id === LIFE_ID) onLife()
        else onSelect(cmd.id)
        break
      case 'delete':
        onDelete(cmd.id)
        break
      case 'addChild':
        onAddChild(cmd.id)
        break
    }
  }

  // ── Drag-to-reparent / reorder (F25; view-owned like focus) ─────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null)
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
    e.dataTransfer.effectAllowed = 'move'
    // Firefox requires data to be set for a drag to initiate.
    e.dataTransfer.setData('text/plain', id)
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

  const dropZoneFor = (id: string): DropZone | null =>
    dropTarget && dropTarget.id === id && !dropTarget.rejected ? dropTarget.zone : null
  const isDropRejected = (id: string) => dropTarget?.id === id && dropTarget.rejected

  const renderRow = ({ id, node, depth, isFolder, posInSet, setSize }: FlatRow) =>
    id === LIFE_ID ? (
      <RailRow
        ref={setRowRef(id)}
        key={id}
        id={id}
        title="Life"
        depth={0}
        isFolder
        isExpanded={lifeExpanded}
        isSelected={selectedId === null}
        isOnPath={false}
        isFocused={rovingId === id}
        isBusy={false}
        isRoot
        posInSet={posInSet}
        setSize={setSize}
        leading={LIFE_MARK}
        trailing={
          <span className="font-mono text-[10px] tracking-[0.1em] lowercase text-mn-text/30 pr-1 select-none">
            all
          </span>
        }
        onSelect={onLife}
        onToggle={onToggleLife}
        onFocus={setFocusedId}
        onKeyDown={handleKeyDown}
        dropZone={dropZoneFor(id)}
        isDropRejected={isDropRejected(id)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
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
        isOnPath={id !== selectedId && pathIds.has(id)}
        isFocused={rovingId === id}
        isBusy={id === busyId}
        isArea={node.parentId === null}
        posInSet={posInSet}
        setSize={setSize}
        accent={node.parentId === null ? pageAccent(id) : undefined}
        leading={areaMark(node)}
        // ticket-41: a row revealed on expand (any non-top-level row) settles in
        // rather than popping. Keyed by id, so only newly-mounted rows animate.
        settleOnMount={depth > 0}
        onSelect={onSelect}
        onToggle={onToggle}
        onAddChild={onAddChild}
        onDelete={onDelete}
        onFocus={setFocusedId}
        onKeyDown={handleKeyDown}
        draggable
        isDragging={draggingId === id}
        dropZone={dropZoneFor(id)}
        isDropRejected={isDropRejected(id)}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      />
    )

  return (
    <aside className="w-[252px] flex-shrink-0 h-full overflow-y-auto px-3 pb-[14px] font-sans">
      {/* Pinned to the top-left: the wordmark stays put while the tree scrolls
          beneath it (sticky, with the paper bg so rows pass under cleanly). The
          wordmark is the calm sans title voice (PP Neue Montreal, weight 500,
          13.5px, natural tracking) — the mockup `word` style. The serif display
          face is reserved for reading prose (Make Noise voices), never chrome. */}
      <div className="sticky top-0 z-10 flex items-center gap-2.5 bg-background px-2.5 pt-[18px] pb-3">
        <span className="font-sans font-medium text-[13.5px] text-foreground select-none">
          Pond
        </span>
      </div>

      <div role="tree" aria-label="Workspace" aria-multiselectable={false}>
        {flat.map(renderRow)}
      </div>

      {/* Status text lives OUTSIDE the tree — role="tree" only allows treeitem
          children (WAI-ARIA); a <p> inside it would be an illegal child. */}
      {isLoading && (
        <p
          className="px-2.5 py-2 font-mono text-[10px] tracking-[0.1em] lowercase text-mn-text/30"
          role="status"
        >
          loading…
        </p>
      )}
      {!isLoading && isEmpty && (
        <p
          className="px-2.5 py-2 text-[12.5px] leading-relaxed text-mn-text-secondary"
          role="status"
        >
          No pages yet. ＋ a page, or ask the pond to start one.
        </p>
      )}
    </aside>
  )
}

// ── Container ────────────────────────────────────────────────────────────────

export function Rail() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const workspace = useWorkspace()
  const seededRef = useRef(false)
  // Area folders start collapsed and open per session; Life starts expanded so
  // the tree is visible on load (collapsing Life is the "collapse everything").
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lifeExpanded, setLifeExpanded] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // The subtree-delete confirm (blast-radius modal); null when closed.
  const [confirmTarget, setConfirmTarget] = useState<RailNode | null>(null)
  const { stageDeletion, notify } = useDeletionUndo()

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['pages', workspace],
    queryFn: () => fetchPages(workspace),
  })

  const tree = useMemo(() => buildTree(pages), [pages])
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
  const selectedNodeId = searchParams.get('nodeId')

  // The ancestor ids of the selected node — the rail renders these at a raised
  // tone so the trail to "you are here" reads even in a deep tree (ticket-25).
  const pathIds = useMemo<ReadonlySet<string>>(
    () =>
      selectedNodeId
        ? new Set(ancestorPath(pages, selectedNodeId).map((c) => c.id))
        : new Set<string>(),
    [pages, selectedNodeId]
  )

  // ── Rail follows you (ticket-25) ────────────────────────────────────────────
  // When the selection changes — via a rail click, an overview card, the
  // breadcrumb, or a page created through chat / ＋ — auto-expand every folder on
  // the path to the current node (and Life itself) so it's revealed and its
  // ancestors highlight. We reveal a given selection exactly once (tracked by
  // ref) so a manual re-collapse afterward isn't fought.
  const revealedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedNodeId) {
      revealedForRef.current = null
      return
    }
    if (selectedNodeId === revealedForRef.current) return
    // Wait until the node itself is present so its ancestor chain is resolvable.
    if (!pages.some((r) => r.id === selectedNodeId)) return
    const ancestors = ancestorPath(pages, selectedNodeId).map((c) => c.id)
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
  }, [selectedNodeId, pages])

  // Deferred commits fire up to ~6s after staging — read the selection fresh at
  // commit time via this ref, not the render-time closure value.
  const selectedNodeIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  // Seed default pages on first login — fires once when the tree is empty after load
  useEffect(() => {
    if (isLoading || pages.length > 0 || seededRef.current) return
    seededRef.current = true

    async function seed() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const seedFn = workspace === 'sandbox' ? 'seed_sandbox_pages' : 'seed_default_pages'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)(seedFn, { p_user_id: user.id })
      queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
    }

    seed()
  }, [isLoading, pages.length, queryClient, workspace])

  const basePath = workspaceBasePath(workspace)

  function navigateTo(node: { id: string; type: string; title: string }) {
    router.push(workspaceUrl(node, basePath))
  }

  /** Run a mutation with a fresh client + user, refresh the tree, return its result. */
  async function withUser<T>(
    fn: (sb: ReturnType<typeof createClient>, userId: string) => Promise<T>
  ): Promise<T | undefined> {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return undefined
    const result = await fn(supabase, user.id)
    await queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
    return result
  }

  async function handleAddChild(id: string) {
    setBusyId(id)
    try {
      const created = await withUser((sb, uid) =>
        createPage(sb, uid, { parentId: id, type: 'page', title: 'Untitled', workspace })
      )
      // ensure the parent folder is open so the new child is visible
      setExpanded((prev) => new Set(prev).add(id))
      if (created) {
        // F26: seed the cache with the new row so the reveal nests it immediately,
        // rather than depending on the refetch having landed before we navigate.
        insertPageOptimistic(queryClient, workspace, {
          id: created.id,
          parentId: id,
          type: 'page',
          title: 'Untitled',
        })
        navigateTo({ id: created.id, type: 'page', title: 'Untitled' })
      }
    } finally {
      setBusyId(null)
    }
  }

  /** Put a single optimistically-removed row back (surgical) and reconcile. */
  function restoreDeletedRow(row: PageRow | undefined) {
    if (row) {
      queryClient.setQueryData<PageRow[]>(['pages', workspace], (rows) =>
        rows ? restoreRow(rows, row) : rows
      )
    }
    queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
  }

  /**
   * The real hard-delete + open-page bookkeeping, shared by both delete paths.
   * Runs up to ~6s after staging (deferred commit), so the selection is read
   * fresh from the ref. On failure the removed row is restored and the failure
   * surfaced — never a silently ghosted cache.
   */
  async function commitDelete(node: RailNode, removedRow?: PageRow) {
    try {
      await withUser(async (sb) => {
        await deletePage(sb, node.id)
      })
      // if the open page was in the deleted subtree, clear the workspace
      const selected = selectedNodeIdRef.current
      if (selected && subtreeIds(node).has(selected)) {
        router.push(basePath)
      }
    } catch {
      restoreDeletedRow(removedRow)
      notify(`Couldn't delete "${node.title || 'Untitled'}"`)
    }
  }

  function handleDelete(id: string) {
    const node = nodeById.get(id)
    if (!node) return
    // A subtree delete is irreversible and heavy — gate it behind the styled
    // blast-radius confirm. A leaf goes straight to an optimistic-remove + undo
    // toast (deferred commit), no modal.
    if (needsConfirm(countDescendants(node))) {
      setConfirmTarget(node)
      return
    }

    const removedRow = pages.find((r) => r.id === node.id)
    queryClient.setQueryData<PageRow[]>(['pages', workspace], (rows) =>
      removeRow(rows ?? [], node.id)
    )
    if (selectedNodeId === node.id) router.push(basePath)

    stageDeletion({
      message: `Deleted "${node.title || 'Untitled'}"`,
      scope: 'rail',
      commit: () => commitDelete(node, removedRow),
      undo: () => restoreDeletedRow(removedRow),
    })
  }

  async function handleConfirmDelete() {
    const node = confirmTarget
    setConfirmTarget(null)
    if (!node) return
    setBusyId(node.id)
    try {
      await commitDelete(node)
    } finally {
      setBusyId(null)
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

  /** Open a page — strictly navigation; expansion belongs to the caret alone. */
  function handleSelect(id: string) {
    const node = nodeById.get(id)
    if (node) navigateTo(node)
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

    const snapshot = applyMoveOptimistic(queryClient, workspace, {
      movedId: draggedId,
      newParentId: move.newParentId,
      siblingOrder: move.siblingOrder,
    })

    // Expand-on-drop: an into-drop reveals the moved child under its new parent.
    if (zone === 'into') {
      if (targetId === LIFE_ID) setLifeExpanded(true)
      else setExpanded((prev) => new Set(prev).add(targetId))
    }

    try {
      await withUser((sb) =>
        movePage(sb, {
          id: draggedId,
          newParentId: move.newParentId,
          siblingOrder: move.siblingOrder,
        })
      )
    } catch {
      if (snapshot) queryClient.setQueryData<PageRow[]>(['pages', workspace], snapshot)
      notify(`Couldn't move "${nodeById.get(draggedId)?.title || 'Untitled'}"`)
      queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
    }
  }

  const confirmCount = confirmTarget ? countDescendants(confirmTarget) : 0

  return (
    <>
      <RailView
        tree={tree}
        selectedId={selectedNodeId}
        pathIds={pathIds}
        expanded={expanded}
        lifeExpanded={lifeExpanded}
        busyId={busyId}
        isLoading={isLoading}
        isEmpty={!isLoading && pages.length === 0}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onAddChild={handleAddChild}
        onDelete={handleDelete}
        onLife={() => router.push(basePath)}
        onToggleLife={handleToggleLife}
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
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
