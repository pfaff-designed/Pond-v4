'use client'

/**
 * The trash page (KAN-451; `TRASH_NODE_ID`): a reserved virtual node like the
 * change log, rendered in `DocumentPanel` in place of the `getPage`/rows path.
 * Stub for now — the rows, lead line and restore wiring land in later items.
 */

export function TrashPage() {
  return (
    <p data-testid="trash-empty" className="font-mono text-[12.5px] text-mn-text-secondary">
      trash is empty
    </p>
  )
}
