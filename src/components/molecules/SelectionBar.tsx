'use client'

/**
 * The one selection bar (`Pond 02 Component library.dc.html` frame `2t`,
 * item order AUDIT C6): text style, bold, italic, link, list, highlight,
 * comment, ask pond, new page from this, copy. Per-item wiring beyond
 * `ask pond`, bold and italic lands in later KAN-95 items.
 */

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { editorForSelection } from '@/lib/modules/text/active-editor'
import {
  activeMarks,
  toggleBold,
  toggleBulletList,
  toggleItalic,
  type ActiveMarks,
} from '@/lib/modules/text/format'

import { useAnchoredBox, type PickerAnchorBox } from './use-anchored-box'

export interface SelectionContext {
  /** The selected text. */
  text: string
  /** The id of the block the selection is within, if determinable. */
  blockId?: string
}

export interface SelectionBarProps {
  /** The container within which selections are watched. Defaults to document. */
  containerRef?: React.RefObject<HTMLElement | null>
  /** Called when the user clicks "ask pond" with the selected context. */
  onAsk: (ctx: SelectionContext) => void
  /** While true (e.g. during streaming), the bar is suppressed. */
  disabled?: boolean
}

/** A selection's own box, in viewport coordinates — plain fields, not a live `DOMRect`. */
interface SelectionRect {
  top: number
  bottom: number
  left: number
  width: number
}

export type SelectionBarItemId =
  | 'text-style'
  | 'bold'
  | 'italic'
  | 'link'
  | 'list'
  | 'highlight'
  | 'comment'
  | 'ask-pond'
  | 'new-page-from-this'
  | 'copy'

export interface SelectionBarItem {
  id: SelectionBarItemId
  /** The item's accessible name, and its visible label where the board draws one. */
  label: string
  /** False for `highlight`, `comment` and `new page from this` — their own tickets wire them. */
  enabled: boolean
  /** A divider sits after this item, per `2t`'s three groups. */
  dividerAfter?: true
}

/** The ten items, in the board's own order. */
export const SELECTION_BAR_ITEMS: readonly SelectionBarItem[] = [
  { id: 'text-style', label: 'text', enabled: true, dividerAfter: true },
  { id: 'bold', label: 'bold', enabled: true },
  { id: 'italic', label: 'italic', enabled: true },
  { id: 'link', label: 'link', enabled: true },
  { id: 'list', label: 'list', enabled: true, dividerAfter: true },
  { id: 'highlight', label: 'highlight', enabled: false },
  { id: 'comment', label: 'comment', enabled: false, dividerAfter: true },
  { id: 'ask-pond', label: 'ask pond', enabled: true },
  { id: 'new-page-from-this', label: 'new page from this', enabled: false },
  { id: 'copy', label: 'copy', enabled: true },
]

/** Items the board draws with their own visible label — the rest need `aria-label`. */
const HAS_VISIBLE_LABEL: ReadonlySet<SelectionBarItemId> = new Set([
  'text-style',
  'highlight',
  'comment',
  'ask-pond',
  'new-page-from-this',
])

/** The board's shared 14×14 icon recipe (`fill none`, `currentColor`, round caps/joins). */
const ICON_14 = {
  width: 14,
  height: 14,
  viewBox: '0 0 14 14',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** The sans label the two-type-register note (`2t`) draws at 12.5px — `text`, `highlight`, `comment`. */
const SansLabel = ({ children }: { children: string }) => (
  <span className="text-[12.5px]">{children}</span>
)

/** The machine-surface label the same note draws mono 11.5px — `ask pond`, `new page from this`. */
const MonoLabel = ({ children }: { children: string }) => (
  <span className="font-mono text-[11.5px] lowercase">{children}</span>
)

/** Each item's mark, read off the board's own svg path data and type. */
const Mark = ({ item }: { item: SelectionBarItem }) => {
  switch (item.id) {
    case 'text-style':
      return (
        <>
          <SansLabel>text</SansLabel>
          <svg
            width="9"
            height="9"
            viewBox="0 0 9 9"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: 'rotate(90deg)' }}
            aria-hidden
          >
            <path d="M3.5 2 L7 5 L3.5 8" />
          </svg>
        </>
      )
    case 'bold':
      return <span className="text-[14px] font-bold">B</span>
    case 'italic':
      return <span className="font-serif text-[17px] font-extralight italic">I</span>
    case 'link':
      return (
        <svg {...ICON_14} aria-hidden>
          <path d="M6 8a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.6.6M8 6a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 6 11.5l.6-.6" />
        </svg>
      )
    case 'list':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M5.5 3.5h6M5.5 7h6M5.5 10.5h6" />
          <path d="M2.6 3.5h.01M2.6 7h.01M2.6 10.5h.01" strokeWidth={2} />
        </svg>
      )
    case 'highlight':
      return (
        <>
          <svg {...ICON_14} aria-hidden>
            <path d="M8.5 2.5l3 3-5 5H3.5v-3z" />
            <path d="M2.5 12h9" />
          </svg>
          <SansLabel>highlight</SansLabel>
        </>
      )
    case 'comment':
      return (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2.5 3h7v4.6h-3.6L3.8 9.4V7.6H2.5z" />
          </svg>
          <SansLabel>comment</SansLabel>
        </>
      )
    case 'ask-pond':
      return <MonoLabel>ask pond</MonoLabel>
    case 'new-page-from-this':
      return <MonoLabel>new page from this</MonoLabel>
    case 'copy':
      return (
        <svg {...ICON_14} aria-hidden>
          <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" />
          <path d="M9.5 4.5V3.2a.7.7 0 0 0-.7-.7H3.2a.7.7 0 0 0-.7.7v5.6c0 .4.3.7.7.7h1.3" />
        </svg>
      )
  }
}

const NO_MARKS: ActiveMarks = { bold: false, italic: false }

/**
 * The bar watches `window.getSelection()`, not any editor's own ProseMirror
 * state — so before a command runs on an editor resolved for that selection,
 * its range is applied as that editor's own selection too.
 */
const syncEditorSelection = (editor: Editor, sel: Selection): boolean => {
  if (!sel.anchorNode || !sel.focusNode) return false
  const anchor = editor.view.posAtDOM(sel.anchorNode, sel.anchorOffset)
  const head = editor.view.posAtDOM(sel.focusNode, sel.focusOffset)
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, anchor, head)))
  return true
}

/**
 * The one selection bar: watches the document selection, resolves the block
 * it is within, and portals its glass above the selection — centred and
 * clamped inside the viewport (`useAnchoredBox`/`clampLeft`, as `GlyphPicker`
 * anchors off). Ported from `TextSelectionPopover`'s own tracking; its
 * zero-size-rect bail is dropped — jsdom's `Range` rect is always zero
 * (`jest.setup.ts`), and `sel.isCollapsed`/`text` already prove a real one.
 */
export function SelectionBar({ containerRef, onAsk, disabled }: SelectionBarProps) {
  const [ctx, setCtx] = useState<SelectionContext | null>(null)
  const [rect, setRect] = useState<SelectionRect | null>(null)
  const [marks, setMarks] = useState<ActiveMarks>(NO_MARKS)
  // `activeMarks` only reads bold/italic (per format.ts) — list is its own
  // read, `editor.isActive('bulletList')`, kept alongside it.
  const [listActive, setListActive] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const [barWidth, setBarWidth] = useState(0)

  const hide = useCallback(() => {
    setCtx(null)
    setRect(null)
  }, [])

  useEffect(() => {
    function onSelectionChange() {
      if (disabled) return

      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        hide()
        return
      }

      const text = sel.toString().trim()
      if (!text) {
        hide()
        return
      }

      const range = sel.getRangeAt(0)
      if (containerRef?.current && !containerRef.current.contains(range.commonAncestorContainer)) {
        hide()
        return
      }

      // Resolve blockId from the nearest ancestor carrying it.
      const anchor = sel.anchorNode
      const blockEl =
        anchor instanceof Element
          ? anchor.closest('[data-block-id]')
          : anchor?.parentElement?.closest('[data-block-id]')
      const blockId = blockEl?.getAttribute('data-block-id') ?? undefined

      const r = range.getBoundingClientRect()
      setCtx({ text, blockId })
      setRect({ top: r.top, bottom: r.bottom, left: r.left, width: r.width })

      const editor = editorForSelection(sel)
      if (editor) syncEditorSelection(editor, sel)
      setMarks(editor ? activeMarks(editor) : NO_MARKS)
      setListActive(editor ? editor.isActive('bulletList') : false)
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [containerRef, disabled, hide])

  // A press outside the bar dismisses it, same as the popover's own rule.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (barRef.current && barRef.current.contains(e.target as Node)) return
      hide()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [hide])

  // Measured after the items render, so centring uses the bar's real width.
  useLayoutEffect(() => {
    if (barRef.current) setBarWidth(barRef.current.offsetWidth)
  }, [ctx, rect])

  // `useAnchoredBox` anchors on the box's own left edge, so centring is
  // folded into the anchor's own rect; its `clampLeft` then holds it in view.
  const anchor = useMemo<PickerAnchorBox | null>(() => {
    if (!rect) return null
    return {
      getBoundingClientRect: () => ({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left + rect.width / 2 - barWidth / 2,
      }),
    }
  }, [rect, barWidth])
  const style = useAnchoredBox(anchor, 'top', barWidth)

  const handleAsk = () => {
    if (!ctx) return
    onAsk(ctx)
    hide()
    // Clear the browser selection so the quote chip in the composer is the only remnant.
    window.getSelection()?.removeAllRanges()
  }

  // Resolved fresh (not from a stored ref) because the last-synced editor is
  // exactly the one `editorForSelection` already matched this selection to.
  const applyMark = (toggle: (editor: Editor) => void) => () => {
    const sel = window.getSelection()
    const editor = sel && editorForSelection(sel)
    if (!editor) return
    toggle(editor)
    setMarks(activeMarks(editor))
    setListActive(editor.isActive('bulletList'))
  }

  // Gated on `disabled` directly (not an effect that calls `hide`), so the
  // bar disappears the instant `disabled` turns true, with no selectionchange
  // needed — `AITerminal`'s `disabled={isStreaming}` flips mid-selection.
  if (typeof document === 'undefined' || disabled || !ctx || !rect) return null

  return createPortal(
    <div
      ref={barRef}
      data-part="selection-bar"
      className="mn-glass fixed z-[5] box-border flex items-center gap-[2px] rounded-[14px] p-[4px]"
      style={style}
    >
      {SELECTION_BAR_ITEMS.map((item) => (
        <Fragment key={item.id}>
          <button
            type="button"
            aria-label={HAS_VISIBLE_LABEL.has(item.id) ? undefined : item.label}
            aria-pressed={
              item.id === 'bold'
                ? marks.bold
                : item.id === 'italic'
                  ? marks.italic
                  : item.id === 'list'
                    ? listActive
                    : undefined
            }
            onClick={
              item.id === 'ask-pond'
                ? handleAsk
                : item.id === 'bold'
                  ? applyMark(toggleBold)
                  : item.id === 'italic'
                    ? applyMark(toggleItalic)
                    : item.id === 'list'
                      ? applyMark(toggleBulletList)
                      : undefined
            }
            // A selection button isn't where the caret belongs — stop the
            // browser from collapsing the selection onto it before `onClick` runs.
            onMouseDown={(e) => e.preventDefault()}
            className="box-border inline-flex h-[32px] min-w-[32px] items-center justify-center gap-[6px] rounded-[10px] px-[9px] hover:bg-mn-text/[0.07] active:bg-mn-text/[0.07]"
          >
            <Mark item={item} />
          </button>
          {item.dividerAfter && <span aria-hidden className="h-[18px] w-px bg-mn-text/[0.12]" />}
        </Fragment>
      ))}
    </div>,
    document.body
  )
}
