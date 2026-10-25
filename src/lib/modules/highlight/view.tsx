'use client'

import { useEffect, useRef, useState } from 'react'
import type { ModuleViewProps } from '../types'
import { HIGHLIGHT_EMPTY_LINE, type HighlightBlock } from './schema'

/**
 * Highlight view (#249) — the kept passage, measured off `PondTemplate.dc.html`'s
 * `renderVals()` (`k === 'highlight'`):
 *
 *   filled  { alignSelf: 'flex-start', padding: '4px 8px', background: '#FFEFAE',
 *             color: '#1B1D14', fontFamily: serif, fontWeight: 200, fontSize: 16,
 *             lineHeight: 1.5 }
 *   empty   { fontFamily: serif, fontWeight: 200, fontSize: 16, color: a(.68) }
 *
 * Wheat appears ONLY when there is a passage — the empty state paints no ground.
 * The ground and its text are the tokens `bg-mn-signal-highlight` /
 * `text-mn-signal-highlight-ink`; `globals.css` redefines BOTH to the same raw
 * values under `.dark`, so the text stays `#1B1D14` on the dark theme with no
 * override here (`PROJECT_RULES.md`: wheat "always carries ink text").
 *
 * `align-self: flex-start` needs a flex column to act on, so the view owns one: the
 * passage is a flex item of this root, not of whatever host renders the view.
 *
 * Editing mirrors `text`'s click-to-edit loop: rendered by default, one click drops
 * into a textarea with the passage intact (same serif register, no wheat — the
 * ground belongs to the KEPT passage, not to its source), blur or Escape returns.
 * An empty editable block starts in edit mode so a freshly-added block is typeable —
 * but only when `autofocus !== false` (KAN-345/499): a line that merely arrived with
 * the page never grabs the caret, only one a person just inserted this session. When
 * it isn't editing, the empty line's hint is hidden at rest (KAN-499: "the page shows
 * nothing until you point at where you can type") and shown on hover or focus-within
 * of the block row's `group` (`BlockCanvas.tsx`); the read-only path stays visible.
 */

/**
 * The board's serif register, shared by the passage, its empty line and the textarea.
 * Composed as plain strings, never through `cn`: tailwind-merge cannot tell the
 * `text-mn-16` SIZE token from the `text-mn-*` COLOUR tokens and silently drops one.
 * That is **#252** — once `cn` is taught the `--text-mn-*` scale via
 * `extendTailwindMerge`, this can go back to `cn` and this note can be deleted.
 */
const REGISTER = 'font-serif font-extralight text-mn-16'

export function HighlightView({
  data,
  editable,
  onChange,
  autofocus,
}: ModuleViewProps<HighlightBlock>) {
  const isEmpty = data.content.trim() === ''
  const [editing, setEditing] = useState(() => editable === true && isEmpty && autofocus !== false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  const passage = isEmpty ? (
    <p
      data-part="passage"
      data-empty=""
      className={`${REGISTER} text-mn-text-secondary${
        editable ? ' opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : ''
      }`}
    >
      {HIGHLIGHT_EMPTY_LINE}
    </p>
  ) : (
    <p
      data-part="passage"
      className={`${REGISTER} self-start whitespace-pre-wrap px-mn-2 py-mn-1 leading-normal bg-mn-signal-highlight text-mn-signal-highlight-ink`}
    >
      {data.content}
    </p>
  )

  if (!editable) {
    return <div className="flex flex-col">{passage}</div>
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        className={`${REGISTER} w-full resize-none bg-transparent leading-normal text-mn-text outline-none placeholder:text-mn-text-secondary`}
        value={data.content}
        rows={Math.max(1, data.content.split('\n').length)}
        placeholder={HIGHLIGHT_EMPTY_LINE}
        onChange={(e) => onChange?.({ ...data, content: e.target.value })}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
    )
  }

  // Rendered passage, click-to-edit. A div with role="button" (as the text view) so
  // it is keyboard- and programmatically-focusable; the empty line keeps a visible
  // target so mouse users can re-enter after blurring out of a blank textarea.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Edit highlight block"
      className="flex min-h-7 w-full cursor-text flex-col text-left"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setEditing(true)
        }
      }}
    >
      {passage}
    </div>
  )
}
