'use client'

/**
 * One row of the rail's recursive file tree (ticket-28) — a VS Code-grade
 * `treeitem`, elevated to the Press aesthetic.
 *
 * Presentational only: every bit of state (expanded, selected, on-path, busy,
 * focused) and every mutation (toggle, open, add-child, delete) is raised as a
 * prop, so the row renders identically in Storybook and in the live rail.
 *
 * Anatomy, left → right, at a fixed row height so a deep tree reads as an even
 * column:
 *   • indentation guides — one hairline per ancestor level, the calm vertical
 *     rules that carry depth without shouting (Frame/Evernote/Notion trees all
 *     lean on this; we render them as `press-hair` so they whisper).
 *   • caret — an authored SVG chevron (not a glyph), rotating 90° on expand with
 *     a single calm ease; a leaf gets a blank of the same width so labels align.
 *     The caret never takes focus (tabIndex -1 + mousedown preventDefault) —
 *     clicking it toggles without stealing the roving focus from the row.
 *   • dot — the muted sage-family square that color-codes an area by its hue.
 *   • label — opens the page (works for a composite page that is also a folder);
 *     the caret/label split is strict: the label never toggles expansion.
 *   • hover CRUD — ＋ / × resting at opacity-0, revealed on hover / focus-within
 *     so the resting rail stays quiet (ticket-27). The controls are REAL tab
 *     stops (no tabIndex=-1): a keyboard or AT user tabs from a focused row
 *     straight into its ＋ and ×, and the container additionally binds Delete/⌫
 *     and + on the focused row itself.
 *
 * Accessibility follows the WAI-ARIA APG tree pattern: `role="treeitem"` with
 * `aria-expanded` / `aria-selected` / `aria-level` / `aria-posinset` /
 * `aria-setsize`, a single roving tab stop for the rows themselves (`tabIndex`
 * 0 on the focused row, -1 elsewhere) and arrow-key handling owned by the
 * container. Focus / keydown callbacks fire only for the row itself (guarded
 * on event target), so focusing or typing in an inner control never
 * double-drives the tree.
 */

import { forwardRef, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { DropZone } from '@/lib/rail/tree'

/** Px of extra left-pad per depth level — the guides land on these gridlines. */
export const INDENT_STEP = 16
/** Fixed left offset of the whole tree content (past the paper margin). */
export const INDENT_BASE = 6

/** A calm authored chevron — rotates on expand, no glyph substitution. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className={`transition-transform duration-[var(--motion-settle)] ease-[var(--ease-press)] ${
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

/** A muted rounded-square dot — the calm way to color-code an area. */
export function KindDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="w-[7px] h-[7px] rounded-[2px] flex-shrink-0"
      style={{ background: color }}
    />
  )
}

export interface TreeRowProps {
  /** Stable node id — used for keyed callbacks. */
  id: string
  /** Human label; falls back to "Untitled". */
  title: string
  /** Depth in the tree; Life root = 0, its children = 1, … */
  depth: number
  /** A folder (has a disclosure caret). A leaf renders a caret-width spacer. */
  isFolder: boolean
  /** Folder open state (ignored for leaves). */
  isExpanded: boolean
  /** The current selection — the "you are here" row. */
  isSelected: boolean
  /** An ancestor of the selection — the trail reads at a raised tone (t25). */
  isOnPath: boolean
  /** The single roving tab stop lands here; arrow keys move it (APG tree). */
  isFocused: boolean
  /** A mutation is in flight on this row — CRUD controls disable. */
  isBusy: boolean
  /** The root (Life) can't be renamed or deleted and shows no ＋/×. */
  isRoot?: boolean
  /** An area row — bolder label voice than a leaf. */
  isArea?: boolean
  /** 1-based position among visible siblings at this level (aria-posinset). */
  posInSet?: number
  /** Number of visible siblings at this level (aria-setsize). */
  setSize?: number
  /** Muted accent for the area dot; omit to render no dot (leaves). */
  accent?: string
  /** Play the settle-in entrance when this row mounts (ticket-41). Set for rows
   *  that appear on expand (children) so a revealed subtree SETTLES from a hair
   *  up + faded rather than popping into place. React keys rows by id, so only a
   *  genuinely new row runs it; a re-rendered existing row keeps its identity. */
  settleOnMount?: boolean
  /** A leading icon slot (e.g. the Life root's mark) — replaces the dot. */
  leading?: ReactNode
  /** Trailing meta slot (e.g. the root's "all" caption). */
  trailing?: ReactNode

  onSelect: (id: string) => void
  onToggle: (id: string) => void
  /** Omit (with isRoot) to render no ＋ affordance. */
  onAddChild?: (id: string) => void
  /** Omit (with isRoot) to render no × affordance. */
  onDelete?: (id: string) => void
  onFocus: (id: string) => void
  onKeyDown: (id: string, e: KeyboardEvent<HTMLDivElement>) => void

  // ── Drag-to-reparent/reorder (F25) ──────────────────────────────────────────
  /** Row is a drag source (every row except the Life root). */
  draggable?: boolean
  /** This row is the one being dragged — dims to ~50% (ticket precedent). */
  isDragging?: boolean
  /** The live drop zone when this row is the hovered, VALID target — drives the
   *  before/after drop-line or the into-highlight; null when it isn't a target. */
  dropZone?: DropZone | null
  /** This row is the hovered target but the drop is rejected (a cycle) — shows a
   *  not-allowed affordance and no drop-line. */
  isDropRejected?: boolean
  onDragStart?: (id: string, e: DragEvent<HTMLDivElement>) => void
  onDragOver?: (id: string, e: DragEvent<HTMLDivElement>) => void
  onDragLeave?: (id: string, e: DragEvent<HTMLDivElement>) => void
  onDrop?: (id: string, e: DragEvent<HTMLDivElement>) => void
  onDragEnd?: (id: string, e: DragEvent<HTMLDivElement>) => void
}

export const TreeRow = forwardRef<HTMLDivElement, TreeRowProps>(function TreeRow(
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
  const label = title || 'Untitled'
  const padLeft = INDENT_BASE + depth * INDENT_STEP

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
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(id, e) : undefined}
      onDragOver={onDragOver ? (e) => onDragOver(id, e) : undefined}
      onDragLeave={onDragLeave ? (e) => onDragLeave(id, e) : undefined}
      onDrop={onDrop ? (e) => onDrop(id, e) : undefined}
      onDragEnd={onDragEnd ? (e) => onDragEnd(id, e) : undefined}
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
      className={`group relative flex items-center h-[34px] rounded-[10px] pr-1.5 outline-none transition-colors
        focus-visible:ring-2 focus-visible:ring-press-accent focus-visible:ring-offset-0
        ${isDropRejected ? 'cursor-not-allowed' : 'cursor-pointer'}
        ${isDragging ? 'opacity-50' : ''}
        ${dropZone === 'into' ? 'ring-2 ring-inset ring-press-accent ' : ''}${settleOnMount ? 'motion-settle-in ' : ''}${
          isSelected
            ? 'bg-press-accent-soft'
            : isRoot
              ? 'hover:bg-press-accent-soft'
              : 'hover:bg-press-accent-wash'
        }`}
      style={{ paddingLeft: padLeft }}
    >
      {/* Drop-line for a before/after reorder — a calm accent rule at the row's
          top/bottom edge; pointer-events-none so it never eats a drag event. The
          into-highlight is the ring on the row itself (above). */}
      {dropZone === 'before' && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 right-2 -top-px h-0.5 rounded-full bg-press-accent"
        />
      )}
      {dropZone === 'after' && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-press-accent"
        />
      )}

      {/* Indentation guides — one hairline per ancestor level. Positioned so
          each rule sits on the gridline the corresponding caret column would.
          The selected/on-path row brightens its own trail a touch so the eye
          follows depth home. */}
      {Array.from({ length: depth }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={`absolute top-0 bottom-0 w-px ${
            isSelected || isOnPath ? 'bg-press-line' : 'bg-press-hair'
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
          className="w-[20px] h-full flex-shrink-0 grid place-items-center text-press-faint hover:text-foreground transition-colors"
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

      {/* label — opens the page (composite pages are folders that also open);
          strictly never toggles expansion (the caret owns that) */}
      <button
        type="button"
        tabIndex={-1}
        className={`flex-1 min-w-0 flex items-center gap-2 text-left leading-none ${
          isRoot
            ? `text-[14px] ${isSelected ? 'font-bold text-foreground' : 'font-semibold text-press-body group-hover:text-foreground'}`
            : isArea
              ? `text-[13px] font-semibold ${
                  isSelected || isOnPath
                    ? 'text-foreground'
                    : 'text-press-body group-hover:text-foreground'
                }`
              : `text-[12.5px] ${
                  isSelected
                    ? 'font-medium text-foreground'
                    : isOnPath
                      ? 'text-press-body group-hover:text-foreground'
                      : 'text-press-muted group-hover:text-foreground'
                }`
        }`}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(id)
        }}
        title={label}
      >
        {leading ?? (accent !== undefined && <KindDot color={accent} />)}
        <span className="truncate">{label}</span>
      </button>

      {trailing}

      {/* hover CRUD — quiet at rest, revealed on hover / focus-within, and REAL
          tab stops so keyboard/AT users reach them without a pointer (t27). The
          root (Life) is the workspace, not a row: no add/delete. */}
      {!isRoot && (onAddChild || onDelete) && (
        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {onAddChild && (
            <button
              type="button"
              className="grid place-items-center w-[22px] h-[22px] rounded-md text-press-faint hover:text-foreground hover:bg-press-ink/[0.04] outline-none focus-visible:ring-2 focus-visible:ring-press-accent disabled:opacity-30 transition-colors"
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
              className="grid place-items-center w-[22px] h-[22px] rounded-md text-press-faint hover:text-destructive hover:bg-press-rust/[0.06] outline-none focus-visible:ring-2 focus-visible:ring-press-accent disabled:opacity-30 transition-colors"
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
        </div>
      )}
    </div>
  )
})
