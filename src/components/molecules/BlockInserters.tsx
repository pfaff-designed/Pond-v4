'use client'

/**
 * The two block-insertion affordances shared by every editable surface — the
 * Life home page, area pages, and document pages (ticket-37, ticket-44). Both
 * open the SAME registry-derived palette (SlashMenu + paletteItems) and hand the
 * picked item back to the caller, which inserts that module's empty state.
 *
 *   • <InsertBetween> — a quiet hairline BETWEEN blocks; hover reveals a `+` that
 *     inserts THERE (mid-page insertion). Unchanged from ticket-37.
 *   • <AddBlockButton> — a quiet but ALWAYS-VISIBLE "+ Add a block" at the foot of
 *     the page (ticket-44 §3), replacing the old text-only "+ Add text". Palette-
 *     first: it opens the picker directly rather than dropping a text block.
 *
 * One component, one palette, so authoring reads identically everywhere.
 */

import { useState } from 'react'
import { SlashMenu, type SlashMenuItem } from '@/components/molecules/SlashMenu'
import { paletteItems } from '@/lib/modules/palette'

/**
 * A quiet separator between blocks: hover reveals a `+` that opens the block
 * palette and inserts THERE (insert-between, not append). The hairline gives the
 * hover target an honest footprint without adding visual weight at rest.
 */
export function InsertBetween({ onInsert }: { onInsert: (item: SlashMenuItem) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative h-4 flex items-center" role="separator">
      <button
        className="absolute left-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-press-muted hover:text-press-accent text-sm w-4 h-4 flex items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-press-accent"
        aria-label="Insert block"
        onClick={() => setOpen(true)}
      >
        +
      </button>
      <span
        aria-hidden
        className="w-full h-px bg-press-hair opacity-0 group-hover:opacity-50 transition-opacity"
      />
      {open && (
        <SlashMenu
          items={paletteItems}
          onSelect={(item) => {
            onInsert(item)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
          className="absolute left-0 top-full z-10 mt-1 w-72"
        />
      )}
    </div>
  )
}

/**
 * The always-visible foot affordance (ticket-44 §3). Palette-first: it opens the
 * block picker directly and hands the pick to `onAdd`, which appends that module's
 * empty state. Present at rest (not hover-only) at the end of every editable page,
 * so adding a first block on an empty page is always one click away.
 */
export function AddBlockButton({ onAdd }: { onAdd: (item: SlashMenuItem) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative mt-4">
      <button
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Add a block"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        + Add a block
      </button>
      {open && (
        <SlashMenu
          items={paletteItems}
          onSelect={(item) => {
            onAdd(item)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
          className="absolute left-0 top-full z-10 mt-1 w-72"
        />
      )}
    </div>
  )
}
