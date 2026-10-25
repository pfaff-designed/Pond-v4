'use client'

import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { consumeTitleFocus } from '@/lib/pages/title-focus'
import { TEXT_BLOCK_INSET_PX } from '@/lib/layout/surface-column'
import { ZEN_TITLE_CLASS, type Zen } from '@/lib/layout/zen'

/**
 * The title row (`Pond 06.21` 6u.1): the page's name at left, one eyebrow at
 * right. Shared by the real page and the KAN-388 pending shell, so the frame
 * cannot drift between them — only `readOnly`/`onChange` and the computed
 * placeholder/eyebrow text tell the two apart.
 *
 * A `textarea rows={1}` autosized to its content, not an `<input>` — long
 * titles wrap onto further lines instead of clipping (KAN-464). A typed or
 * pasted newline collapses to a space: the title stays one paragraph.
 */
export function PageTitleRow({
  pageId,
  zen,
  value,
  placeholder,
  eyebrow,
  readOnly,
  onChange,
  onLeaveDown,
}: {
  // Omitted by the readOnly pending shell, which never has a request to
  // claim — only the real, editable row (one `pageId` at a time) consumes.
  pageId?: string
  zen: Zen | null
  value: string
  placeholder: string
  eyebrow: string
  readOnly?: boolean
  onChange?: (value: string) => void
  /**
   * KAN-369: Return, or ↓ at the title's own end, leaves for the body — the
   * host wires this to `BlockCanvas`'s `enterFromTitle` via `titleExitRef`.
   * Omitted by the readOnly pending shell, which has nowhere to leave to.
   */
  onLeaveDown?: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    measure()

    // Width-only, not every box change: `measure()` itself resizes the
    // element's height, and observing that would loop. Zen toggling (a type
    // scale swap), a column-width drag/resize, or a rail toggle all change
    // the textarea's own width without `value` changing, and need the same
    // re-measure `value` triggers above.
    let lastWidth = el.getBoundingClientRect().width
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width === undefined || width === lastWidth) return
      lastWidth = width
      measure()
    })
    observer.observe(el)

    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [value])

  useEffect(() => {
    if (!pageId) return
    if (!consumeTitleFocus(pageId)) return
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [pageId])

  return (
    <div
      className={`${zen ? 'mb-[var(--zen-gap)]' : 'mt-2 mb-4'} flex items-end justify-between gap-3`}
      style={{ paddingInline: TEXT_BLOCK_INSET_PX }}
    >
      <textarea
        ref={ref}
        rows={1}
        className={`min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-foreground outline-none placeholder:text-mn-text-secondary ${zen ? ZEN_TITLE_CLASS : 'font-sans text-[38px] leading-[1.15] font-bold tracking-[-0.01em] uppercase'}`}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value.replace(/\r?\n/g, ' ')) : undefined}
        onKeyDown={(e) => {
          // An IME's own Enter or ↓ (composing, or the 229 keyCode some
          // browsers still report instead of `isComposing`) advances a
          // candidate — it must not also leave the title.
          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
          if (e.key === 'Enter') {
            // ⌘↵ / Alt+↵ keep native behaviour; Shift+↵ still leaves, same as
            // a bare Enter (KAN-369's spec choice).
            if (e.metaKey || e.altKey || e.ctrlKey) return
            e.preventDefault()
            onLeaveDown?.()
            return
          }
          if (
            e.key === 'ArrowDown' &&
            !e.shiftKey &&
            !e.metaKey &&
            !e.altKey &&
            !e.ctrlKey &&
            e.currentTarget.selectionStart === e.currentTarget.value.length
          ) {
            onLeaveDown?.()
          }
        }}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label="Page title"
        data-pond-page-title
      />
      <span
        data-part="title-eyebrow"
        className="flex-none text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase"
        hidden={zen !== null}
        aria-live="polite"
      >
        {eyebrow}
      </span>
    </div>
  )
}
