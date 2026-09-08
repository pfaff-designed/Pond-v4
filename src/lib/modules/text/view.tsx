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
/**
 * Map a viewport point to a text offset within `container` by summing the length
 * of every text node up to the caret node the browser reports at (x, y). Returns
 * null when the point isn't over text inside the container (e.g. the synthetic
 * 0,0 click the AI-edit path fires). Accurate for plain prose; for headings /
 * `**bold**` / tables the rendered↔source offset diverges, so callers clamp and
 * treat it as approximate (ticket 1b — never force caret-to-end).
 */
function offsetFromPoint(container: HTMLElement, x: number, y: number): number | null {
  const doc = container.ownerDocument
  let node: Node | null = null
  let nodeOffset = 0
  const withPos = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (typeof withPos.caretPositionFromPoint === 'function') {
    const pos = withPos.caretPositionFromPoint(x, y)
    if (pos) {
      node = pos.offsetNode
      nodeOffset = pos.offset
    }
  } else if (typeof withPos.caretRangeFromPoint === 'function') {
    const range = withPos.caretRangeFromPoint(x, y)
    if (range) {
      node = range.startContainer
      nodeOffset = range.startOffset
    }
  }
  if (!node || !container.contains(node)) return null
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let total = 0
  let cur = walker.nextNode()
  while (cur) {
    if (cur === node) return total + nodeOffset
    total += cur.textContent?.length ?? 0
    cur = walker.nextNode()
  }
  return total
}

export function TextView({ data, editable, onChange }: ModuleViewProps<TextBlock>) {
  const [editing, setEditing] = useState(() => editable === true && data.content.trim() === '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // The source offset mapped from the click that entered edit mode, applied once
  // the textarea mounts. Null for keyboard/programmatic entry (caret stays put).
  const pendingCaretRef = useRef<number | null>(null)

  // On entering edit mode, focus the textarea and place the caret. If a click
  // mapped to an offset, land there (clamped to the source length); otherwise
  // leave the native caret alone — never slam it to the end of a non-empty block.
  useEffect(() => {
    if (!editing || !textareaRef.current) return
    const el = textareaRef.current
    el.focus()
    const pending = pendingCaretRef.current
    pendingCaretRef.current = null
    if (el.value.length === 0) {
      el.setSelectionRange(0, 0)
    } else if (pending != null) {
      const pos = Math.max(0, Math.min(pending, el.value.length))
      el.setSelectionRange(pos, pos)
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
        if (isLink(e.target)) return
        pendingCaretRef.current = offsetFromPoint(e.currentTarget, e.clientX, e.clientY)
        setEditing(true)
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isLink(e.target)) {
          e.preventDefault()
          setEditing(true)
        }
      }}
    >
      {isEmpty ? (
        <span className={`${READING_PROSE_CLASS} text-press-faint`}>Write something…</span>
      ) : (
        <Markdown variant="reading">{data.content}</Markdown>
      )}
    </div>
  )
}
