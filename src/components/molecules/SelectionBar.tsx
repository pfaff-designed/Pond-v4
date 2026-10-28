'use client'

/**
 * The one selection bar (`Pond 02 Component library.dc.html` frame `2t`,
 * item order AUDIT C6): text style, bold, italic, link, list, highlight,
 * comment, ask pond, new page from this, copy. `highlight`, `comment` and
 * `new page from this` are drawn disabled until their own tickets wire them.
 */

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import type { Level } from '@tiptap/extension-heading'
import { isActive } from '@tiptap/core'
import { AllSelection, TextSelection, type Selection as PMSelection } from '@tiptap/pm/state'
import { editableEditorForSelection } from '@/lib/modules/text/active-editor'
import {
  activeMarks,
  currentTextStyle,
  setTextStyle,
  toggleBold,
  toggleBulletList,
  toggleCode,
  toggleItalic,
  toggleStrike,
  setLink,
  unsetLink,
  type ActiveMarks,
  type FormatReader,
  type TextStyle,
} from '@/lib/modules/text/format'

import { GLASS, SLASH_SIZES } from './picker-chrome'
import { ICON } from './slash-entries'
import { useSelectionBarBox, type SelectionBox } from './selection-bar-position'
import { useAnchoredBox } from './use-anchored-box'

/** The text-style menu's own rows, `7g` frame 9's own list — a plain paragraph or one of the six headings. */
const STYLE_ROWS: ReadonlyArray<{ style: TextStyle; level: Level | null }> = [
  { style: 'text', level: null },
  { style: 'h1', level: 1 },
  { style: 'h2', level: 2 },
  { style: 'h3', level: 3 },
  { style: 'h4', level: 4 },
  { style: 'h5', level: 5 },
  { style: 'h6', level: 6 },
]

/** The style menu's own width — small, mono rows (`picker-chrome.ts`), beside/under the bar. */
const STYLE_MENU_WIDTH = 120

export interface SelectionContext {
  /** The selected text. */
  text: string
  /** The id of the block the selection is within, if determinable. */
  blockId?: string
  /** The selection's range in the owning editor's own positions, if determinable. */
  from?: number
  to?: number
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
type SelectionRect = SelectionBox

export type SelectionBarItemId =
  | 'text-style'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
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

/**
 * The board's ten items, in its own order, plus `strike` and `code` — two
 * marks the board draws no row for (same standing as KAN-462's `/code`),
 * grouped with the other inline-mark toggles right after `italic`.
 */
export const SELECTION_BAR_ITEMS: readonly SelectionBarItem[] = [
  { id: 'text-style', label: 'text', enabled: true, dividerAfter: true },
  { id: 'bold', label: 'bold', enabled: true },
  { id: 'italic', label: 'italic', enabled: true },
  { id: 'strike', label: 'strike', enabled: true },
  { id: 'code', label: 'code', enabled: true },
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
const Mark = ({ item, textStyle }: { item: SelectionBarItem; textStyle: TextStyle }) => {
  switch (item.id) {
    case 'text-style':
      return (
        <>
          <SansLabel>{textStyle}</SansLabel>
          <svg
            width="9"
            height="9"
            viewBox="0 0 9 9"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="rotate-90"
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
    case 'strike':
      return <span className="text-[14px] line-through">S</span>
    case 'code':
      return (
        <svg {...ICON_14} aria-hidden>
          <path d={ICON.code.d} />
        </svg>
      )
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

const NO_MARKS: ActiveMarks = { bold: false, italic: false, strike: false, code: false }

/** The first enabled item — the toolbar's tab stop until focus moves within it. */
const FIRST_ITEM_ID: SelectionBarItemId = 'text-style'

/**
 * Identifies `sel` by its range in `editor`'s own positions. `editor` is the
 * one `editableEditorForSelection` already resolved for this exact
 * selection, which only happens once both `anchorNode` and `focusNode` are set.
 */
const selectionKey = (editor: Editor, sel: Selection): string => {
  const anchor = editor.view.posAtDOM(sel.anchorNode!, sel.anchorOffset)
  const head = editor.view.posAtDOM(sel.focusNode!, sel.focusOffset)
  return `${anchor}-${head}`
}

/**
 * The editor selection that `sel` lays out, in the editor's own positions. A
 * select-all DOM range has both endpoints on the editor root (`view.dom`),
 * which `posAtDOM` maps to `0` and `doc.content.size` — `TextSelection.create`
 * on those raw positions builds an invalid selection ProseMirror then
 * collapses, so that exact pair becomes an `AllSelection` instead, and every
 * other pair is snapped to the nearest inline position with `between`.
 */
const selectionInEditor = (editor: Editor, sel: Selection): PMSelection | null => {
  if (!sel.anchorNode || !sel.focusNode) return null
  const { doc } = editor.state
  const anchor = editor.view.posAtDOM(sel.anchorNode, sel.anchorOffset)
  const head = editor.view.posAtDOM(sel.focusNode, sel.focusOffset)
  if ((anchor === 0 && head === doc.content.size) || (anchor === doc.content.size && head === 0)) {
    return new AllSelection(doc)
  }
  return TextSelection.between(doc.resolve(anchor), doc.resolve(head))
}

/**
 * The bar watches `window.getSelection()`, not any editor's own ProseMirror
 * state — so immediately before a bar command runs on an editor resolved for
 * that selection, its range is applied as that editor's own selection too.
 * Never on a plain `selectionchange`: ProseMirror's own DOM rewrite (lifting a
 * list item) emits transient ones, and writing those back collapses the selection.
 */
const syncEditorSelection = (editor: Editor, sel: Selection): boolean => {
  const selection = selectionInEditor(editor, sel)
  if (!selection) return false
  editor.view.dispatch(editor.state.tr.setSelection(selection))
  return true
}

/** Reads formatting at `sel` without moving the editor's own selection. */
const formatReaderAt = (editor: Editor, sel: Selection): FormatReader => {
  const selection = selectionInEditor(editor, sel)
  const state = selection
    ? editor.state.apply(editor.state.tr.setSelection(selection))
    : editor.state
  return { isActive: (name, attributes) => isActive(state, name, attributes) }
}

/**
 * The one selection bar: watches the document selection, resolves the block
 * it is within, and portals its glass above the selection — centred and
 * clamped inside the viewport, flipping or clamping vertically
 * (`selection-bar-position.ts`). A zero-size range rect does not hide it:
 * jsdom's `Range` rect is always zero (`jest.setup.ts`), so a real selection
 * is proven by `sel.isCollapsed` and the trimmed text alone.
 */
export function SelectionBar({ containerRef, onAsk, disabled }: SelectionBarProps) {
  const [ctx, setCtx] = useState<SelectionContext | null>(null)
  const [rect, setRect] = useState<SelectionRect | null>(null)
  const [marks, setMarks] = useState<ActiveMarks>(NO_MARKS)
  // `activeMarks` only reads bold/italic (per format.ts) — list is its own
  // read, `editor.isActive('bulletList')`, kept alongside it.
  const [listActive, setListActive] = useState(false)
  const [styleLabel, setStyleLabel] = useState<TextStyle>('text')
  const [styleMenuOpen, setStyleMenuOpen] = useState(false)
  const [linkActive, setLinkActive] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [linkHref, setLinkHref] = useState('')
  // Focusing the field moves the browser's selection out of the editor, so the
  // range the link applies to is captured when the field opens.
  const linkTargetRef = useRef<{ editor: Editor; from: number; to: number } | null>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const styleButtonRef = useRef<HTMLButtonElement | null>(null)
  // The element too, in state: `useAnchoredBox` measures in a layout effect keyed on its
  // anchor, and a ref object is stable, so it would only run before the button exists.
  const [styleButtonEl, setStyleButtonEl] = useState<HTMLButtonElement | null>(null)
  const styleMenuRef = useRef<HTMLDivElement>(null)
  const [barWidth, setBarWidth] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  // The selection's range, re-measured on scroll — the stored `rect` goes stale under one.
  const rangeRef = useRef<Range | null>(null)
  // Roving tab stop: the one item in the tab order, the rest are reached by arrows.
  const [rovingId, setRovingId] = useState<SelectionBarItemId>(FIRST_ITEM_ID)
  // Set by Esc: the bar stays down while the selection it was dismissed from stands.
  const dismissedKeyRef = useRef<string | null>(null)
  // The selection the bar was last drawn for, and the editor that owns it.
  const shownSelectionRef = useRef<{ key: string; editor: Editor | null } | null>(null)

  const hide = useCallback(() => {
    setCtx(null)
    setRect(null)
    setStyleMenuOpen(false)
    setLinkMode(false)
    setRovingId(FIRST_ITEM_ID)
  }, [])

  useEffect(() => {
    function onSelectionChange() {
      // The link field owns focus (and so the browser's selection) while open.
      if (linkMode) return
      // The style menu owns focus (and so the browser's selection) while open.
      if (styleMenuOpen) return
      // Disabled (streaming) shows nothing, and drops its state on every change
      // so the bar cannot return at a selection that no longer exists.
      if (disabled) {
        dismissedKeyRef.current = null
        hide()
        return
      }

      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        dismissedKeyRef.current = null
        hide()
        return
      }

      const text = sel.toString().trim()
      if (!text) {
        dismissedKeyRef.current = null
        hide()
        return
      }

      const editor = editableEditorForSelection(sel)
      if (!editor) {
        dismissedKeyRef.current = null
        hide()
        return
      }

      const key = selectionKey(editor, sel)
      if (dismissedKeyRef.current !== null) {
        if (dismissedKeyRef.current === key) return
        dismissedKeyRef.current = null
      }

      const range = sel.getRangeAt(0)
      if (containerRef?.current && !containerRef.current.contains(range.commonAncestorContainer)) {
        hide()
        return
      }

      const anchor = sel.anchorNode
      const blockEl =
        anchor instanceof Element
          ? anchor.closest('[data-block-id]')
          : anchor?.parentElement?.closest('[data-block-id]')
      const blockId = blockEl?.getAttribute('data-block-id') ?? undefined

      const r = range.getBoundingClientRect()
      rangeRef.current = range.cloneRange()

      const editorSelection = selectionInEditor(editor, sel)
      setCtx({ text, blockId, from: editorSelection?.from, to: editorSelection?.to })
      setRect({ top: r.top, bottom: r.bottom, left: r.left, width: r.width })

      shownSelectionRef.current = { key, editor }
      const reader = formatReaderAt(editor, sel)
      setMarks(activeMarks(reader))
      setListActive(reader.isActive('bulletList'))
      setLinkActive(reader.isActive('link'))
      setStyleLabel(currentTextStyle(reader))
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [containerRef, disabled, hide, linkMode, styleMenuOpen])

  useEffect(() => {
    if (linkMode) linkInputRef.current?.focus()
  }, [linkMode])

  // The style menu portals as the bar's sibling, not its child, so it needs its
  // own containment check: a press on the bar outside the menu only closes the
  // menu, and a press outside both dismisses the bar. The style button itself is
  // excluded: pointerdown fires before its own click, so closing here would just
  // have that click's toggle reopen it — the button owns its own open/close.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      const onStyleButton = Boolean(styleButtonRef.current?.contains(target))
      if (styleMenuRef.current && !styleMenuRef.current.contains(target) && !onStyleButton) {
        setStyleMenuOpen(false)
      }
      if (barRef.current && barRef.current.contains(target)) return
      if (styleMenuRef.current && styleMenuRef.current.contains(target)) return
      hide()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [hide])

  // Esc pressed outside the bar (in the editor, after a drag-select) dismisses it. Capture
  // phase, so it runs before the editor's own Esc, which then sees `defaultPrevented` and
  // leaves focus where it is. Keys inside the bar or its menu are handled there.
  useEffect(() => {
    if (!ctx || disabled) return
    function onEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const target = e.target
      if (
        target instanceof Node &&
        (barRef.current?.contains(target) || styleMenuRef.current?.contains(target))
      ) {
        return
      }
      e.preventDefault()
      dismissedKeyRef.current = shownSelectionRef.current?.key ?? null
      hide()
    }
    document.addEventListener('keydown', onEscape, true)
    return () => document.removeEventListener('keydown', onEscape, true)
  }, [ctx, disabled, hide])

  // Measured after the items render, so centring uses the bar's real width.
  useLayoutEffect(() => {
    if (!barRef.current) return
    setBarWidth(barRef.current.offsetWidth)
    setBarHeight(barRef.current.offsetHeight)
  }, [ctx, rect, linkMode])

  // Re-keyed on `rect` so a new selection re-measures; between selections the
  // live range is read, the stored rect only a fallback for a detached one.
  const readRect = useMemo<(() => SelectionRect) | null>(() => {
    if (!rect) return null
    return () => {
      const live = rangeRef.current?.getBoundingClientRect()
      if (!live) return rect
      return { top: live.top, bottom: live.bottom, left: live.left, width: live.width }
    }
  }, [rect])
  const style = useSelectionBarBox(readRect, barWidth, barHeight)
  // The style menu hangs off its own button, not the selection rect.
  const menuStyle = useAnchoredBox(styleMenuOpen ? styleButtonEl : null, 'bottom', STYLE_MENU_WIDTH)
  const handleStyleButtonRef = useCallback((el: HTMLButtonElement | null) => {
    styleButtonRef.current = el
    setStyleButtonEl(el)
  }, [])

  const handleAsk = () => {
    if (!ctx) return
    onAsk(ctx)
    hide()
    // Clear the browser selection so the quote chip in the composer is the only remnant.
    window.getSelection()?.removeAllRanges()
  }

  const handleCopy = () => {
    if (!ctx) return
    navigator.clipboard
      .writeText(window.getSelection()?.toString() || ctx.text)
      // A denied clipboard permission has no surface to report on and changes nothing.
      .catch(() => {})
  }

  const applyMark = (toggle: (editor: Editor) => void) => () => {
    const sel = window.getSelection()
    const editor = sel && editableEditorForSelection(sel)
    if (!editor) return
    syncEditorSelection(editor, sel)
    toggle(editor)
    setMarks(activeMarks(editor))
    setListActive(editor.isActive('bulletList'))
    setLinkActive(editor.isActive('link'))
  }

  const handleLinkClick = () => {
    if (linkActive) {
      applyMark(unsetLink)()
      return
    }
    const sel = window.getSelection()
    const editor = sel && editableEditorForSelection(sel)
    if (!editor) return
    syncEditorSelection(editor, sel)
    const { from, to } = editor.state.selection
    linkTargetRef.current = { editor, from, to }
    setLinkHref('')
    setLinkMode(true)
  }

  // Returns the caret to the text the link was opened on.
  const closeLinkField = (apply: boolean) => {
    const target = linkTargetRef.current
    linkTargetRef.current = null
    setLinkMode(false)
    if (!target) return
    target.editor.commands.setTextSelection({ from: target.from, to: target.to })
    const href = linkHref.trim()
    if (apply && href) {
      setLink(target.editor, href)
      setLinkActive(target.editor.isActive('link'))
      return
    }
    target.editor.commands.focus()
  }

  const handleLinkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      closeLinkField(true)
      return
    }
    if (e.key === 'Escape') {
      // Consumed here, so it must not also leave zen or blur the editor.
      e.preventDefault()
      e.stopPropagation()
      closeLinkField(false)
    }
  }

  // While the menu is open it owns focus and selectionchange is ignored, so the
  // pick acts on the editor the bar was drawn for.
  const chooseStyle = (level: Level | null) => () => {
    const sel = window.getSelection()
    const selectedEditor = sel && editableEditorForSelection(sel)
    if (sel && selectedEditor) syncEditorSelection(selectedEditor, sel)
    const editor = selectedEditor ?? shownSelectionRef.current?.editor
    if (editor) {
      setTextStyle(editor, level)
      setStyleLabel(currentTextStyle(editor))
    }
    setStyleMenuOpen(false)
  }

  const closeStyleMenuToButton = () => {
    setStyleMenuOpen(false)
    styleButtonRef.current?.focus()
  }

  const handleStyleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      // Closes the menu only: the bar stays, and `escLeavesZen` must not also fire.
      e.preventDefault()
      closeStyleMenuToButton()
      return
    }

    const rows = Array.from(
      styleMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    )
    const current = rows.findIndex((row) => row === e.target)
    if (current === -1) return

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      chooseStyle(STYLE_ROWS[current].level)()
      styleButtonRef.current?.focus()
      return
    }

    const lastIndex = rows.length - 1
    const nextIndex =
      e.key === 'ArrowDown'
        ? (current + 1) % rows.length
        : e.key === 'ArrowUp'
          ? (current + lastIndex) % rows.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? lastIndex
              : -1
    if (nextIndex === -1) return

    e.preventDefault()
    rows[nextIndex].focus()
  }

  useEffect(() => {
    if (!styleMenuOpen) return
    const rows = styleMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    const target = styleMenuRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')
    ;(target ?? rows?.[0])?.focus()
  }, [styleMenuOpen])

  const handleToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      // Consumed here, so `escLeavesZen` (`lib/layout/zen.tsx`) leaves zen alone.
      e.preventDefault()
      // From the last selectionchange, not `getSelection()` now: focus inside the bar may have moved it.
      const shown = shownSelectionRef.current
      dismissedKeyRef.current = shown?.key ?? null
      hide()
      shown?.editor?.commands.focus()
      return
    }

    const buttons = Array.from(
      barRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
    )
    const current = buttons.findIndex((button) => button === e.target)
    if (current === -1) return

    const lastIndex = buttons.length - 1
    const nextIndex =
      e.key === 'ArrowRight'
        ? (current + 1) % buttons.length
        : e.key === 'ArrowLeft'
          ? (current + lastIndex) % buttons.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? lastIndex
              : -1
    if (nextIndex === -1) return

    e.preventDefault()
    buttons[nextIndex].focus()
  }

  // Gated on `disabled` directly (not an effect that calls `hide`), so the
  // bar disappears the instant `disabled` turns true, with no selectionchange
  // needed — `AITerminal`'s `disabled={isStreaming}` flips mid-selection.
  if (typeof document === 'undefined' || disabled || !ctx || !rect) return null

  const pressedById: Partial<Record<SelectionBarItemId, boolean>> = {
    bold: marks.bold,
    italic: marks.italic,
    strike: marks.strike,
    code: marks.code,
    list: listActive,
    link: linkActive,
  }

  // The tab stop is the roving item while it is enabled, else the first enabled one.
  const enabledItems = SELECTION_BAR_ITEMS.filter((item) => item.enabled)
  const tabStopId = enabledItems.some((item) => item.id === rovingId)
    ? rovingId
    : enabledItems[0]?.id

  const bar = createPortal(
    <div
      ref={barRef}
      data-part="selection-bar"
      role="toolbar"
      aria-label="selection"
      aria-orientation="horizontal"
      onKeyDown={handleToolbarKeyDown}
      className="mn-glass fixed z-[5] box-border flex items-center gap-[2px] rounded-[14px] p-[4px]"
      style={style}
    >
      {linkMode ? (
        <input
          ref={linkInputRef}
          type="text"
          inputMode="url"
          aria-label="link address"
          placeholder="paste a link"
          value={linkHref}
          onChange={(e) => setLinkHref(e.target.value)}
          onKeyDown={handleLinkKeyDown}
          className="box-border h-[32px] w-[240px] rounded-[10px] bg-transparent px-[9px] font-mono text-[11.5px] lowercase text-mn-text outline-none placeholder:text-mn-text-secondary"
        />
      ) : (
        SELECTION_BAR_ITEMS.map((item) => (
          <Fragment key={item.id}>
            <button
              ref={item.id === 'text-style' ? handleStyleButtonRef : undefined}
              type="button"
              tabIndex={item.id === tabStopId ? 0 : -1}
              onFocus={() => setRovingId(item.id)}
              aria-label={
                item.id === 'link' && linkActive
                  ? 'unlink'
                  : HAS_VISIBLE_LABEL.has(item.id)
                    ? undefined
                    : item.label
              }
              aria-haspopup={item.id === 'text-style' ? 'menu' : undefined}
              aria-expanded={item.id === 'text-style' ? styleMenuOpen : undefined}
              aria-pressed={pressedById[item.id]}
              onClick={
                item.id === 'ask-pond'
                  ? handleAsk
                  : item.id === 'bold'
                    ? applyMark(toggleBold)
                    : item.id === 'italic'
                      ? applyMark(toggleItalic)
                      : item.id === 'strike'
                        ? applyMark(toggleStrike)
                        : item.id === 'code'
                          ? applyMark(toggleCode)
                          : item.id === 'list'
                            ? applyMark(toggleBulletList)
                            : item.id === 'text-style'
                              ? () => setStyleMenuOpen((open) => !open)
                              : item.id === 'link'
                                ? handleLinkClick
                                : item.id === 'copy'
                                  ? handleCopy
                                  : undefined
              }
              // A selection button isn't where the caret belongs — stop the
              // browser from collapsing the selection onto it before `onClick` runs.
              onMouseDown={(e) => e.preventDefault()}
              disabled={!item.enabled}
              aria-disabled={item.enabled ? undefined : true}
              className={`box-border inline-flex h-[32px] min-w-[32px] items-center justify-center gap-[6px] rounded-[10px] px-[9px] ${
                item.enabled
                  ? `hover:bg-mn-text/[0.07] active:bg-mn-text/[0.07] ${pressedById[item.id] ? 'bg-mn-text/[0.07]' : ''}`
                  : 'text-mn-text-secondary'
              }`}
            >
              <Mark item={item} textStyle={styleLabel} />
            </button>
            {item.dividerAfter && <span aria-hidden className="h-[18px] w-px bg-mn-text/[0.12]" />}
          </Fragment>
        ))
      )}
    </div>,
    document.body
  )

  return (
    <>
      {bar}
      {styleMenuOpen &&
        createPortal(
          <div
            ref={styleMenuRef}
            role="menu"
            aria-label="text style"
            aria-orientation="vertical"
            onKeyDown={handleStyleMenuKeyDown}
            className={`${GLASS} w-[120px]`}
            style={menuStyle}
          >
            {STYLE_ROWS.map((row) => (
              <button
                key={row.style}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-current={styleLabel === row.style ? 'true' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={chooseStyle(row.level)}
                className={`${SLASH_SIZES.desktop.row} w-full text-left`}
              >
                {row.style}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
