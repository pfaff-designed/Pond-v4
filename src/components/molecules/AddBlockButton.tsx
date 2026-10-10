'use client'

/**
 * The always-visible foot affordance (ticket-44 §3). Text-default (UI-audit
 * Slice 2a): a click drops an empty text block ready to type — no palette on this
 * button. The user types `/` in the new block to swap to any other block type.
 * Present at rest (not hover-only) at the end of every editable page, so adding a
 * first block on an empty page is always one click away. Mid-page, a block is
 * added by Return after a block, then `/` — nothing is drawn between blocks.
 */
export function AddBlockButton({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-4">
      <button
        className="font-mono lowercase text-xs text-mn-text-secondary hover:text-mn-text-meta transition-colors"
        aria-label="Add a block"
        onClick={onAdd}
      >
        + add a block
      </button>
    </div>
  )
}
