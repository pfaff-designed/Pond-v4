'use client'

/**
 * The name-and-keep sheet's BODY — `Pond 06.09` (`6i`) frame 3, "name it, choose
 * what it keeps".
 *
 * This is a body, not a surface. The board does not open a second thing over the
 * ⌘K palette: the palette **becomes** the sheet, keeping its glass, its position
 * and its head, and the head's input becomes the sheet's one field. So the glass,
 * the wash, the name field and the `esc` affordance all belong to
 * `CommandPalette`'s sheet mode; what lives here is everything below the rule:
 *
 *     ⌘K   weeknight recipe|          ← CommandPalette's head, in sheet mode
 *     ─────────────────────────
 *     keep                            ← from here down is this file
 *      ■ structure and labels
 *      ■ placeholder text
 *      □ this page's content
 *     6 blocks — big number, list, checklist, heading, text, entry log
 *     [save template] [cancel]
 *
 * Reached from the palette, never the `/` menu — frame 2: "Saving is a page
 * action, so it lives in the command palette, not the / menu."
 *
 * Every value is read inline from the board's markup:
 *
 *   keep label  padding 10/12/4 · 10.5 · tracking .04em · ink .68
 *   check row   padding 8/12 · gap 10 · 12.5
 *   box         12×12 · radius 3 · on `#1B1D14` · off inset 1.4px ink .68
 *   summary     padding 8/12/4 · 10.5 · tracking .04em · ink .68
 *   foot        gap 7 · padding 10/12/6
 *
 * ## Three boxes, one of them live
 *
 * The board draws THREE: `structure and labels`, `placeholder text` (both on) and
 * `this page's content` (off) — the frame's own caption rendered as controls:
 * "by default a saved template is the stack, the labels and the placeholders."
 *
 * Only the third has a specified meaning. What *unticking* either of the first
 * two should produce is captioned nowhere, and a template with no structure is
 * not a thing the board describes. So those two render in `PondControl`'s own
 * `disabled` state — the precedent #316 set for the new-pond sheet: nothing is
 * missing from the board, and nothing pretends to be live.
 */

import { PondControl } from '@/components/atoms/PondControl'

export interface SaveAsTemplateBodyProps {
  /** Ticked: keep this page's content instead of placeholders. */
  keepContent: boolean
  onKeepContentChange: (keep: boolean) => void
  /** `6 blocks — big number, list, …` — see `lib/templates/summary.ts`. */
  summary: string
  /** False while the name is empty or a save is in flight. */
  canSave: boolean
  saving: boolean
  /** A rejected save keeps the sheet open carrying this. */
  error: string | null
  onSave: () => void
  onCancel: () => void
}

export function SaveAsTemplateBody({
  keepContent,
  onKeepContentChange,
  summary,
  canSave,
  saving,
  error,
  onSave,
  onCancel,
}: SaveAsTemplateBodyProps) {
  return (
    <div data-part="save-as-template">
      <div
        data-part="keep-label"
        className="px-[12px] pt-[10px] pb-[4px] text-[10.5px] tracking-[.04em] text-mn-text-secondary"
      >
        keep
      </div>

      {/* The two the board draws on and never captions unticking for. */}
      <KeepRow label="structure and labels" on disabled />
      <KeepRow label="placeholder text" on disabled />
      {/* The one live choice: off by default, per the frame's caption. */}
      <KeepRow label="this page’s content" on={keepContent} onCheckedChange={onKeepContentChange} />

      {/* What the template will contain, before you commit to it. */}
      <div
        data-part="summary"
        className="px-[12px] pt-[8px] pb-[4px] text-[10.5px] tracking-[.04em] text-mn-text-secondary"
      >
        {summary}
      </div>

      {error && (
        <div
          data-part="error"
          role="alert"
          className="px-[12px] pt-[4px] pb-[4px] text-[11px] tracking-[.02em] text-mn-text-secondary"
        >
          {error}
        </div>
      )}

      <div data-part="foot" className="flex gap-[7px] px-[12px] pt-[10px] pb-[6px]">
        <PondControl
          kind="button"
          variant="primary"
          label={saving ? 'saving…' : 'save template'}
          disabled={!canSave}
          onClick={onSave}
        />
        <PondControl kind="button" variant="secondary" label="cancel" onClick={onCancel} />
      </div>
    </div>
  )
}

/** One `keep` row: the board's 8/12 row with its box at gap 10. */
function KeepRow({
  label,
  on,
  disabled,
  onCheckedChange,
}: {
  label: string
  on: boolean
  disabled?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <div
      data-part="keep-row"
      data-label={label}
      className="flex items-center gap-[10px] px-[12px] py-[8px] text-[12.5px]"
    >
      <PondControl
        kind="checkbox"
        label={label}
        on={on}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}
