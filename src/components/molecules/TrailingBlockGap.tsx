'use client'

import { TEXT_BLOCK_INSET_PX, TEXT_BLOCK_TOP_INSET_PX } from '@/lib/layout/surface-column'
import { BLOCK_ROW_GAP_PX } from '@/lib/modules/layout-rows'
import { MACHINE_HINT_FRAGMENT, PROSE_LINE_PLACEHOLDER } from '@/lib/modules/text/prose'

/**
 * Rule 3's trailing hit area (KAN-345): the space below the last block (or
 * the title, on an empty body) down to where the canvas lets off. At rest it
 * draws nothing; a hover fades in a ghost row reading the same copy the
 * focused empty line itself shows, one line below the last block — offset by
 * `BLOCK_ROW_GAP_PX` (the gap an appended block lands below the last one) plus
 * `TEXT_BLOCK_TOP_INSET_PX` (the real line's own wrapper top inset), so a click
 * swaps which element is real without moving anything. The click itself
 * decides nothing here — the caller (`BlockCanvas`, which alone knows whether
 * the last block is already an empty text line) passes the one `onClick` this
 * component fires.
 */
export function TrailingBlockGap({
  onClick,
  hidden,
  showGhostText = true,
  onHoverChange,
}: {
  onClick: () => void
  hidden?: boolean
  /** False when the last block is already an empty text line: that line's own
   *  `::before` paints the same placeholder at its own position instead (fix,
   *  KAN-345 rule 3) — drawing a ghost row here too would show the text twice,
   *  in two different places, for one line. */
  showGhostText?: boolean
  /** Lets the caller paint the last empty line's own placeholder while this
   *  area is hovered, instead of (or as well as) this row's own ghost text. */
  onHoverChange?: (hovered: boolean) => void
}) {
  return (
    <div
      aria-hidden
      hidden={hidden}
      onClick={onClick}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      data-testid="trailing-block-gap"
      className="group/trailing-gap min-h-20 cursor-text"
      style={{ paddingTop: BLOCK_ROW_GAP_PX + TEXT_BLOCK_TOP_INSET_PX, paddingInline: TEXT_BLOCK_INSET_PX }}
    >
      {/* float-left/h-0/pointer-events-none: the exact box model
          `TEXT_PROSE_CLASS`'s own `::before` uses, so the text sits at this
          line's top edge rather than centred in its line box. */}
      {showGhostText && (
        <span
          className={`float-left h-0 pointer-events-none ${MACHINE_HINT_FRAGMENT} opacity-0 transition-opacity duration-[var(--motion-quick)] ease-[var(--ease-mn)] group-hover/trailing-gap:opacity-100 motion-reduce:transition-none`}
        >
          {PROSE_LINE_PLACEHOLDER}
        </span>
      )}
    </div>
  )
}
