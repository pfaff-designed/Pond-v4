'use client'

/**
 * The two block-insertion affordances shared by every editable surface — the
 * Life home page, area pages, and document pages (ticket-37, ticket-44). Both
 * open the SAME registry-derived `/` menu (SlashMenu + slashRows, #278) and hand
 * the picked row back to the caller, which inserts the block that row mints.
 *
 *   • <InsertBetween> — a quiet hairline BETWEEN blocks; hover reveals a `+` that
 *     inserts THERE (mid-page insertion). Unchanged from ticket-37.
 *   • <AddBlockButton> — a quiet but ALWAYS-VISIBLE "+ Add a block" at the foot of
 *     the page (ticket-44 §3). Text-default (UI-audit Slice 2a): a click drops an
 *     empty text block ready to type; typing `/` in it summons the palette to swap
 *     to any other block. No palette on this button itself — the clean
 *     add→slash→pick flow. `InsertBetween` stays palette-first.
 *
 * One component, one palette, so authoring reads identically everywhere.
 */

import { useState } from 'react'
import {
  SlashMenu,
  type SlashRow,
  type TemplatePick,
  type YourTemplate,
} from '@/components/molecules/SlashMenu'
import type { PickerSize } from '@/components/molecules/picker-chrome'
import { slashRows } from '@/lib/modules/palette'

/**
 * A quiet separator between blocks: hover reveals a `+` that opens the block
 * palette and inserts THERE (insert-between, not append). The hairline gives the
 * hover target an honest footprint without adding visual weight at rest.
 */
export function InsertBetween({
  onInsert,
  onPickTemplate,
  yourTemplates,
  onOpenChange,
  size,
}: {
  onInsert: (row: SlashRow) => void
  onPickTemplate?: (pick: TemplatePick) => void
  yourTemplates?: readonly YourTemplate[]
  /** The host reads this to fetch what the menu lists only while it is open. */
  onOpenChange?: (open: boolean) => void
  size?: PickerSize
}) {
  const [open, setOpenState] = useState(false)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  const [btnEl, setBtnEl] = useState<HTMLButtonElement | null>(null)
  return (
    <div className="group relative h-4 flex items-center" role="separator">
      <button
        ref={setBtnEl}
        className="absolute left-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-mn-text-secondary hover:text-mn-text text-sm w-4 h-4 flex items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-mn-text"
        aria-label="Insert block"
        onClick={() => setOpen(true)}
      >
        +
      </button>
      <span
        aria-hidden
        className="w-full h-px bg-mn-hair opacity-0 group-hover:opacity-50 transition-opacity"
      />
      {open && (
        <SlashMenu
          rows={slashRows}
          query=""
          anchor={btnEl}
          onSelect={(row) => {
            onInsert(row)
            setOpen(false)
          }}
          yourTemplates={yourTemplates}
          size={size}
          onPickTemplate={
            onPickTemplate &&
            ((pick) => {
              onPickTemplate(pick)
              setOpen(false)
            })
          }
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * The always-visible foot affordance (ticket-44 §3). Text-default (UI-audit
 * Slice 2a): a click drops an empty text block ready to type — no palette on this
 * button. The user types `/` in the new block to swap to any other block type.
 * Present at rest (not hover-only) at the end of every editable page, so adding a
 * first block on an empty page is always one click away.
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
