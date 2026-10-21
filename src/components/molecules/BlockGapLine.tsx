'use client'

/**
 * Rule 4's between-row hit area (KAN-345): the 16px gap between two stacked
 * block rows. At rest it draws nothing; a hover fades in a 1px line across
 * the full content width — no "+", no label. `BlockCanvas` decides where
 * this renders (the row-boundary gap) and what the click does
 * (`insertLineAfter`) — this molecule only draws the line and reports the
 * click.
 */
export function BlockGapLine({ onClick }: { onClick: () => void }) {
  return (
    <div
      aria-hidden
      onClick={onClick}
      data-testid="block-gap-line"
      className="group/block-gap-line flex h-4 w-full cursor-text items-center"
    >
      <span className="block h-px w-full bg-mn-line opacity-0 transition-opacity duration-[var(--motion-quick)] ease-[var(--ease-mn)] group-hover/block-gap-line:opacity-100 motion-reduce:transition-none" />
    </div>
  )
}
