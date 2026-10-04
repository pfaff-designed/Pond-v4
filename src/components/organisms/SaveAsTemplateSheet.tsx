'use client'

/**
 * The name-and-keep sheet — `Pond 06.09` (`6i`) frame 4, "name it, choose what
 * it keeps".
 *
 * Reached from the ⌘K palette, never the `/` menu. The board is explicit about
 * why: "Saving is a page action, so it lives in the command palette, not the /
 * menu" (frame 3).
 *
 * Every value below is read inline from the board's markup, not eyeballed:
 *
 *   name row   padding 10/12/12 · border-bottom 1px ink .09 · 13.5
 *              caret 1.5×14 · #1B1D14 · translateY(2px) · margin-left 2px
 *   keep label padding 10/12/4 · 10.5 · tracking .04em · ink .68
 *   check row  padding 8/12 · gap 10 · 12.5
 *   box        12×12 · radius 3 · on `#1B1D14` · off inset 1.4px ink .68
 *   foot       gap 7 · padding 10/12/6
 *   primary    padding 7/13 · radius 999 · 500 · 11 · `#1B1D14` on paper
 *   secondary  the same metrics · ink .07 ground · ink .8
 *
 * The box's off state (12 / 3 / inset 1.4px ink .68) is exactly `PondControl
 * kind="checkbox"`, so the rows wrap the control rather than hand-rolling a
 * square — the shadcn/base-ui primitive underneath carries the ARIA state
 * machine and the keyboard handling.
 *
 * ## Three boxes, one of them live
 *
 * The board draws THREE: `structure and labels`, `placeholder text` (both on)
 * and `this page's content` (off). That is the frame's own caption rendered as
 * controls — "by default a saved template is the stack, the labels and the
 * placeholders."
 *
 * Only the third has a specified meaning. What *unticking* `structure and
 * labels` or `placeholder text` should produce is not captioned anywhere, and a
 * template with no structure is not a thing the board describes. So those two
 * render in `PondControl`'s own `disabled` state — one of the eight states
 * `PondControl.dc.html` specifies — exactly the precedent #316 set for the
 * new-pond sheet: nothing is missing from the board, and nothing pretends to be
 * live. Their semantics are an open question on KAN-10.
 */

import { useRef, useState } from 'react'
import { PondControl } from '@/components/atoms/PondControl'

/**
 * Mounted only while open, so its state initialises from the page once and a
 * cancelled save leaves no typing behind. Resetting in an effect instead would
 * be a `set-state-in-effect` — and would briefly render last time's values.
 */
export interface SaveAsTemplateSheetProps {
  /** The page being saved — its title seeds the name field. */
  pageTitle: string
  /** Saving. The sheet stays open and shows the message on a rejection. */
  onSave: (input: { name: string; keepContent: boolean }) => Promise<void>
  onClose: () => void
}

export function SaveAsTemplateSheet({ pageTitle, onSave, onClose }: SaveAsTemplateSheetProps) {
  const [name, setName] = useState(pageTitle)
  const [keepContent, setKeepContent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)

  const trimmed = name.trim()

  async function save() {
    if (trimmed === '' || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: trimmed, keepContent })
      onClose()
    } catch (err) {
      // A same-pond name collision is the person's to resolve — `createTemplate`
      // raises `DuplicateTemplateNameError` and deliberately does NOT auto-suffix
      // the way `createPage` does. So the sheet stays open with the message.
      setError(err instanceof Error ? err.message : 'Could not save the template')
      setSaving(false)
    }
  }

  return (
    <div
      data-part="scrim"
      className="fixed inset-0 z-50 flex items-start justify-center bg-mn-paper/[0.62]"
      onClick={onClose}
    >
      <div
        data-part="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Save page as template"
        className="mn-glass mt-[120px] w-[320px] overflow-hidden rounded-[16px] text-mn-text"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        {/* name — the board's one live field, its caret drawn beside the value */}
        <div
          data-part="name"
          className="flex items-center gap-[10px] border-b border-mn-text/[0.09] px-[12px] pt-[10px] pb-[12px] text-[13.5px]"
        >
          <input
            ref={nameRef}
            autoFocus
            aria-label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
            className="min-w-0 flex-1 truncate bg-transparent text-inherit caret-mn-text outline-none placeholder:text-mn-text-secondary"
            placeholder="name this template"
          />
        </div>

        <div
          data-part="keep-label"
          className="px-[12px] pt-[10px] pb-[4px] text-[10.5px] tracking-[.04em] text-mn-text-secondary"
        >
          keep
        </div>

        {/* The two the board draws on and does not specify unticking for. */}
        <KeepRow label="structure and labels" on disabled />
        <KeepRow label="placeholder text" on disabled />
        {/* The one live choice (KAN-10): off by default, per the frame's caption. */}
        <KeepRow label="this page’s content" on={keepContent} onCheckedChange={setKeepContent} />

        {error && (
          <div
            data-part="error"
            role="alert"
            className="px-[12px] pt-[8px] pb-[4px] text-[11px] tracking-[.02em] text-mn-text-secondary"
          >
            {error}
          </div>
        )}

        <div data-part="foot" className="flex gap-[7px] px-[12px] pt-[10px] pb-[6px]">
          <PondControl
            kind="button"
            variant="primary"
            label={saving ? 'saving…' : 'save template'}
            disabled={trimmed === '' || saving}
            onClick={() => void save()}
          />
          <PondControl kind="button" variant="secondary" label="cancel" onClick={onClose} />
        </div>
      </div>
    </div>
  )
}

/** One `keep` row: the board's 8/12 row with a 12px box at gap 10. */
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
