'use client'

/**
 * A block's edge-resize handle (KAN-441) — an 8px `ew-resize` strip straddling
 * the block's left or right edge (4px in, 4px out), so the pill sits on the
 * edge line rather than inside the block. At true rest nothing is drawn;
 * hovering fades in a 2×40px pill at ink .2 over `--motion-quick` (150ms);
 * dragging holds it at ink 100 and adds the mono readout chip (`½` while
 * snapped, `47%` once broken out). The pill is the same grip as
 * `ContentWidthHandle.tsx`'s column handle (`h-10 w-1 rounded-full`), 2px
 * wide here to match this ticket's spec.
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
  /**
   * Starts the strip this many px down instead of the block's own top
   * (KAN-480): a toggle's own fold button sits in that gutter on its left
   * edge, lifted above this strip by z-index for its own 28px-tall row —
   * this keeps the strip out of that row entirely so the two never fight
   * over the same pointer-down, while the rest of the block's true left
   * edge still starts a resize. Every other call site leaves this unset and
   * keeps the strip's full height.
   */
  topInsetPx?: number
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
  topInsetPx,
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
        'group absolute bottom-0 z-[1] flex w-2 cursor-ew-resize touch-none items-center justify-center',
        topInsetPx === undefined ? 'top-0' : undefined,
        side === 'left' ? '-left-1' : '-right-1'
      )}
      style={topInsetPx === undefined ? undefined : { top: topInsetPx }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* The grip pill: nothing at true rest, ink .2 on hover, ink 100 while
          dragging — a dragging strip stays lit regardless of hover. */}
      <span
        aria-hidden
        data-testid="block-edge-handle-pill"
        className={cn(
          'h-10 w-0.5 rounded-full bg-mn-text transition-opacity duration-[var(--motion-quick)] ease-[var(--ease-mn)]',
          dragging
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-20 group-focus-within:opacity-20'
        )}
      />
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
