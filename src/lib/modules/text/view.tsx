'use client'

import { useEffect, useRef, useState } from 'react'
import { Markdown, READING_PROSE_CLASS } from '@/components/atoms/Markdown'
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
        className={`w-full resize-none bg-transparent outline-none ${READING_PROSE_CLASS}`}
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

  // Rendered reading view, click-to-edit. A div with role="button" (not a real
  // <button>: rendered markdown contains <a> links, and interactive content inside
  // a button is invalid HTML) — keyboard- and programmatically-focusable, so the
  // accepted-AI-edit path can .click() it (see AITerminal.editChange). Clicks that
  // land on a link navigate (new tab, per the atom's anchor mapping) instead of
  // entering edit. An empty block keeps a visible placeholder + min-height so mouse
  // users can re-enter after blurring out of a blank textarea.
  const isEmpty = data.content.trim() === ''
  const isLink = (target: EventTarget) => target instanceof Element && target.closest('a') !== null
  return (
    <div
      role="button"
      tabIndex={0}
      data-text-edit-trigger
      className="block w-full min-h-7 cursor-text text-left"
      aria-label="Edit text block"
      onClick={(e) => {
        if (!isLink(e.target)) setEditing(true)
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isLink(e.target)) {
          e.preventDefault()
          setEditing(true)
        }
      }}
    >
      {isEmpty ? (
        <span className={`${READING_PROSE_CLASS} text-mn-text-faint`}>Write something…</span>
      ) : (
        <Markdown variant="reading">{data.content}</Markdown>
      )}
    </div>
  )
}
