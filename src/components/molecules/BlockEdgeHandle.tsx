'use client'

/**
 * A block's edge-resize handle (KAN-441) — an 8px `ew-resize` strip on the
 * block's left or right edge. At true rest nothing is drawn; hovering fades
 * in the grip pill at ink .2 over `--motion-quick` (150ms); dragging holds it
 * at ink 100 and adds the mono readout chip (`½` while snapped, `47%` once
 * broken out). The grip reuses `BlockCanvas.tsx`'s own ⋮⋮ dots (its handle,
 * line 2912) rather than a new glyph.
 *
 * Presentational only — pointer wiring (arming a drag, committing a width)
 * is the next item's job; this component just renders the three states and
 * forwards whatever pointer handlers the caller passes.
 */

import { cn } from '@/lib/utils'

export interface BlockEdgeHandleProps {
  /** Which edge of the block this strip sits on. */
  side: 'left' | 'right'
  /** Chrome off (zen/read-only) or another block mid-drag (KAN-440) — renders nothing. */
  hidden?: boolean
  /** A resize is in progress from this edge: pill goes ink 100, readout shows. */
  dragging?: boolean
  /** The live value while dragging: a key glyph (`½`) when snapped, a free percent (`47%`) otherwise. */
  readout?: string
  /** `aria-valuenow` once the caller knows the live percent (the keyboard child ticket wires ←/→). */
  valueNow?: number
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void
}

export function BlockEdgeHandle({
  side,
  hidden = false,
  dragging = false,
  readout,
  valueNow,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: BlockEdgeHandleProps) {
  if (hidden) return null

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize block ${side === 'left' ? 'left' : 'right'} edge`}
      aria-valuenow={valueNow}
      data-testid="block-edge-handle"
      data-side={side}
      data-dragging={dragging || undefined}
      className={cn(
        'group absolute inset-y-0 z-[1] flex w-2 cursor-ew-resize touch-none items-center justify-center',
        side === 'left' ? 'left-0' : 'right-0'
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* The grip pill: nothing at true rest, ink .2 on hover, ink 100 while
          dragging — a dragging strip stays lit regardless of hover. */}
      <svg
        width="10"
        height="40"
        viewBox="0 0 10 40"
        fill="currentColor"
        aria-hidden
        className={cn(
          'transition-opacity duration-[var(--motion-quick)] ease-[var(--ease-mn)]',
          dragging
            ? 'text-mn-text opacity-100'
            : 'text-mn-text opacity-0 group-hover:opacity-20 group-focus-within:opacity-20'
        )}
      >
        <circle cx="3" cy="15" r="1.1" />
        <circle cx="7" cy="15" r="1.1" />
        <circle cx="3" cy="20" r="1.1" />
        <circle cx="7" cy="20" r="1.1" />
        <circle cx="3" cy="25" r="1.1" />
        <circle cx="7" cy="25" r="1.1" />
      </svg>
      {dragging && readout && (
        <span
          data-testid="block-edge-handle-readout"
          className={cn(
            'absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-mn-pill px-2 py-0.5',
            'bg-mn-text font-mono text-[11px] lowercase leading-none text-raw-paper dark:text-raw-ink'
          )}
        >
          {readout}
        </span>
      )}
    </div>
  )
}
