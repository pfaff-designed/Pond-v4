'use client'

import { useEffect, useRef, useState } from 'react'
import { Markdown } from '@/components/atoms/Markdown'
import type { ModuleViewProps } from '../types'
import type { TextBlock } from './schema'

/**
 * Text view. Read-only always renders typeset markdown (ticket-20) — no surface
 * shows literal `##`, `**bold**`, or pipe tables anymore.
 *
 * When `editable` (the document panel), it's a **click-to-edit** block: the
 * rendered reading view by default, one click drops into the source textarea with
 * the caret placed and content intact (extends the ticket-10 edit loop). Blur or
 * Escape returns to the rendered view. An empty block starts in edit mode so a
 * freshly-added "+ Add text" block is immediately typeable, and the accepted-AI-edit
 * path can focus straight into the source (see `data-text-edit-trigger`).
 */
export function TextView({ data, editable, onChange }: ModuleViewProps<TextBlock>) {
  const [editing, setEditing] = useState(() => editable === true && data.content.trim() === '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // On entering edit mode, focus the textarea and drop the caret at the end so
  // content is preserved and immediately extendable.
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  if (!editable) {
    return <Markdown variant="reading">{data.content}</Markdown>
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        className="w-full resize-none bg-transparent font-serif text-[1.0625rem] leading-[1.65] text-press-body outline-none"
        value={data.content}
        rows={Math.max(1, data.content.split('\n').length)}
        placeholder="Write something…"
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

  // Rendered reading view, click-to-edit. A button wrapper keeps it keyboard- and
  // programmatically-focusable (the accepted-AI-edit path clicks this to open the
  // source — see AITerminal.editChange). `text-left w-full` so the prose keeps its
  // natural flow inside the button.
  return (
    <button
      type="button"
      data-text-edit-trigger
      className="block w-full cursor-text text-left"
      onClick={() => setEditing(true)}
      aria-label="Edit text block"
    >
      <Markdown variant="reading">{data.content}</Markdown>
    </button>
  )
}
