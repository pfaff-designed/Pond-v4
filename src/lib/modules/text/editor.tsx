'use client'

import { useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Extension } from '@tiptap/core'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import { redo, undo } from '@tiptap/pm/history'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { COMPOSER_TOP_CLEARANCE, composerClearanceMarginPx } from '@/lib/layout/composer-clearance'
import { isRedoChord, isUndoChord } from '@/lib/shell-commands'
import type { ModuleViewProps } from '../types'
import { useBlockRow, type BlockRowValue } from '../block-row-context'
import { registerTextEditor } from './active-editor'
import { proseExtensions } from './extensions'
import { parseMarkdown, serializeMarkdown } from './markdown'
import { TEXT_MARKUP } from './markup'
import { enterSplit, leavesUpToTitle } from './next-block'
import { TEXT_PROSE_CLASS, textPlaceholderFor } from './prose'
import { markdownHandlePaste } from './paste'
import { ReferenceHighlight } from './reference-highlight'
import type { TextBlock } from './schema'
import { opensSlashLine, SlashLineContext, slashLineAt, type SlashLineAt } from './slash-line'

/** Where a person pressed on the block before its editor existed. */
export interface Press {
  left: number
  top: number
}

const TEXT_MARKUP_VALUES: Set<string> = new Set(Object.values(TEXT_MARKUP))

/**
 * Has nothing been written here yet? Blank, or only markdown scaffolding the row
 * that minted the block typed for you — a heading's `#` run, or one of
 * `TEXT_MARKUP`'s exact strings. All open with the caret in them.
 */
const isUnwritten = (content: string): boolean =>
  TEXT_MARKUP_VALUES.has(content) || content.replace(/^#{1,6}\s*/, '').trim() === ''

/**
 * The divider row's markdown parses to a bare `horizontalRule` — CommonMark has no
 * empty-paragraph syntax, so there is no node after it for the caret to open on.
 * An empty paragraph is appended to the opening document only (never written back:
 * the stored markdown stays `TEXT_MARKUP.divider`), so `autofocus: 'end'` below has
 * somewhere real to land.
 */
const openingDocFor = (content: string): ReturnType<typeof parseMarkdown> => {
  const doc = parseMarkdown(content)
  if (content !== TEXT_MARKUP.divider) return doc
  const { schema } = doc.type
  return schema.nodes.doc.create(null, [...doc.content.content, schema.nodes.paragraph.create()])
}

// A fresh array literal in `useEditor`'s options changes identity every render,
// which (per the comment on `opening` below) makes `useEditor` re-apply it over
// keystrokes not yet read — this must stay a stable, module-level reference.
const ENABLED_PASTE_RULES = ['link']

/** What the split-on-Enter and leave-up-to-title plugins read at the moment a key is actually pressed. */
interface LatestForSplit {
  data: TextBlock
  stepOut?: BlockRowValue['stepOut']
  leaveUp?: BlockRowValue['leaveUp']
  select?: BlockRowValue['select']
}

/**
 * Plain Enter splits the block in two through the row's `stepOut`, ahead of
 * StarterKit's own Enter (a new paragraph INSIDE this block) — priority above
 * StarterKit's default (100) puts this plugin's `handleKeyDown` first, so a
 * split never also runs ProseMirror's default handling for the same key.
 */
const createSplitOnEnter = (latest: RefObject<LatestForSplit>) =>
  Extension.create({
    name: 'splitOnEnter',
    priority: 1000,
    addProseMirrorPlugins: () => [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.altKey ||
              event.metaKey ||
              event.ctrlKey ||
              event.isComposing ||
              view.composing
            )
              return false
            const split = enterSplit(view.state)
            if (split === 'own') return false
            if (split === 'stay') return true
            if (split === 'lift') {
              // The whole doc is this one empty quote/list item: replacing it
              // with a plain paragraph in place is the lift — no sibling block
              // is created, and the ordinary `onUpdate` below writes the now-
              // empty content back, same as any other edit.
              const paragraph = view.state.schema.nodes.paragraph.create()
              const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, paragraph)
              view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1)))
              return true
            }
            const { data, stepOut } = latest.current
            // Nothing before the caret: the empty block goes ABOVE this one
            // (Enter at the start of a non-empty block; an empty FIRST list
            // item, which also loses that item from `split.after`). `where`
            // is explicit — never inferred downstream from `patch`/`content`'s
            // shapes, which mis-fired for a side-by-side row's own 'above'
            // case (KAN-506 fix).
            if (split.before === '') {
              const changed = split.after !== data.content
              stepOut?.(changed ? { ...data, content: split.after } : undefined, '', 'above')
              return true
            }
            stepOut?.({ ...data, content: split.before }, split.after, 'below')
            return true
          },
        },
      }),
    ],
  })

/**
 * Bare ArrowUp at block 0's first visual line hands focus to the page title
 * (KAN-464) instead of running ProseMirror's own ArrowUp — which, at the very
 * top of the doc, would otherwise just leave the caret where it is. Only
 * block 0's row ever has a `leaveUp` (wired in `BlockCanvas`), so every other
 * block falls through to ProseMirror's default here.
 */
const createLeaveUpToTitle = (latest: RefObject<LatestForSplit>) =>
  Extension.create({
    name: 'leaveUpToTitle',
    priority: 1000,
    addProseMirrorPlugins: () => [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            const { leaveUp } = latest.current
            if (!leaveUp) return false
            if (
              event.key !== 'ArrowUp' ||
              event.shiftKey ||
              event.altKey ||
              event.metaKey ||
              event.ctrlKey ||
              event.isComposing ||
              view.composing
            )
              return false
            if (!leavesUpToTitle(view)) return false
            leaveUp()
            return true
          },
        },
      }),
    ],
  })

/**
 * Esc selects this block's row (KAN-367) instead of blurring to the page
 * body — read via `latest`, the same idiom as `leaveUp`. A plugin, not the
 * shared `handleKeyDown` below: that object is one reference used by every
 * text block's editor, with no per-block `latest` to read `select` off. With
 * no row to select (a standalone `TextEditor` outside a `BlockCanvas` host),
 * falls back to the editor's own blur — unchanged from today. The selection
 * bar claims an Esc pressed while it is up (`defaultPrevented`, the editor
 * keeps focus).
 */
const createEscapeSelectsRow = (latest: RefObject<LatestForSplit>) =>
  Extension.create({
    name: 'escapeSelectsRow',
    priority: 1000,
    addProseMirrorPlugins: () => [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== 'Escape' || event.isComposing || view.composing) return false
            if (!event.defaultPrevented) {
              const { select } = latest.current
              if (select) select()
              else view.dom.blur()
            }
            return true
          },
        },
      }),
    ],
  })

/** The block's own placeholder and id, fixed at mount — neither is ever typed over. */
const buildExtensions = (
  placeholder: string | undefined,
  blockId: string,
  latest: RefObject<LatestForSplit>
) => [
  ...proseExtensions,
  Placeholder.configure({
    placeholder: ({ node }) => textPlaceholderFor(node.type.name, placeholder),
  }),
  ReferenceHighlight.configure({ blockId }),
  createSplitOnEnter(latest),
  createLeaveUpToTitle(latest),
  createEscapeSelectsRow(latest),
]

/** A bare Tab over a selection — Shift-Tab and chorded Tab keep their meaning. */
const isTabIntoSelectionBar = (view: EditorView, event: KeyboardEvent): boolean =>
  event.key === 'Tab' &&
  !event.shiftKey &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !view.state.selection.empty

/**
 * Moves focus into the selection bar's first enabled item. With no bar up the key
 * is left alone: in a paragraph that is the browser's own focus move, in a list
 * item the list's Tab (indent). Handled here, ahead of the extensions' keymaps,
 * so while the bar is up a selected list item's Tab reaches the bar instead.
 */
const focusSelectionBar = (): boolean => {
  const first = document.querySelector<HTMLButtonElement>(
    '[data-part="selection-bar"] button:not(:disabled)'
  )
  if (!first) return false
  first.focus()
  return true
}

/**
 * ProseMirror's own `Mod-z`/`Mod-Shift-z` keymap command no-ops (returns `false`,
 * never calling `preventDefault`) when its history has nothing to undo/redo —
 * always true for a freshly mounted editor. Left unhandled, the keydown then
 * reaches the browser's native contenteditable undo, which wipes a field it
 * never saw typed. Intercepting here and always returning `true` keeps that
 * native undo from ever seeing the key, whether or not there was anything to do
 * — also true of `@tiptap/extensions`' own `Mod-y`/`Mod-я`/`Shift-Mod-я` undo
 * keymap bindings, which this predicate matches too (KAN-268).
 *
 * Escape is NOT handled here: this object is shared, by reference, across
 * every text block's editor (`editorProps` below), so it has no per-block
 * `latest` to read a row's `select` off. `createEscapeSelectsRow` (above)
 * owns Escape instead, as a plugin built per-instance alongside
 * `createLeaveUpToTitle`.
 */
const handleKeyDown = (view: EditorView, event: KeyboardEvent): boolean => {
  if (isTabIntoSelectionBar(view, event)) return focusSelectionBar()
  if (isUndoChord(event)) {
    undo(view.state, (tr) => view.dispatch(tr))
    return true
  }
  if (isRedoChord(event)) {
    redo(view.state, (tr) => view.dispatch(tr))
    return true
  }
  return false
}

/**
 * A browser doesn't follow a link inside an editable field, so the editor opens
 * it. A link the editor refused has its `href` blanked, and opens nothing.
 */
const handleClick = (view: EditorView, _pos: number, event: MouseEvent): boolean => {
  if (event.button !== 0 || !(event.target instanceof Element)) return false
  const link = event.target.closest('a')
  const href = link?.getAttribute('href')
  if (!link || !href || !view.dom.contains(link)) return false
  window.open(href, '_blank', 'noopener,noreferrer')
  return true
}

const slashLineUnder = (editor: Editor): SlashLineAt | null => {
  const { doc, selection } = editor.state
  const line = slashLineAt(doc, selection.from)
  if (!line) return null
  const element = editor.view.nodeDOM(selection.$from.before(1))
  return { line, element: element instanceof Element ? element : null }
}

/** The clearance ProseMirror's own scroll-follow reads live, shared by `scrollMargin` and `scrollThreshold`. */
const COMPOSER_CLEARANCE_SIDES = {
  get top() {
    return COMPOSER_TOP_CLEARANCE
  },
  get bottom() {
    return composerClearanceMarginPx()
  },
  left: 0,
  right: 0,
}

const editorProps = {
  attributes: {
    class: TEXT_PROSE_CLASS,
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': 'text block',
  },
  handleKeyDown,
  handleClick,
  // The one markdown-paste path, text/plain-only or html-wrapper-only; see its
  // own comment for why `clipboardTextParser` can't own this instead.
  handlePaste: markdownHandlePaste,
  // The spread of `editorProps` into the `EditorView` copies only the
  // *reference* to this object, so its getters stay live across every later
  // `tr.scrollIntoView()`. `scrollThreshold` must match `scrollMargin`
  // exactly: `<main>` runs the full column height under the floating card,
  // so the rect ProseMirror won't scroll past is the same composer footprint
  // the margin scrolls up to (KAN-400).
  scrollMargin: COMPOSER_CLEARANCE_SIDES,
  scrollThreshold: COMPOSER_CLEARANCE_SIDES,
}

/**
 * The text block, edited in place: its markdown `content` as a typeset document.
 * Until the editor exists it draws `standIn`, the static render of the same
 * document, so the swap is invisible; a press on it (`pressRef`) is where the
 * caret lands when the editor arrives.
 *
 * Edits are written back as markdown on every change and the page's debounced save
 * commits them; until it does, ⌘Z is the editor's own history. Content that
 * arrives from outside (an accepted diff, the `/` menu clearing its query, a `/`
 * pick splitting the block) replaces the document without writing back and
 * without entering that history.
 *
 * Under a `SlashLineContext` it reports the `/` line the caret is on, so the page
 * can open the `/` menu there and split the block on a pick.
 */
const TextEditor = ({
  data,
  onChange,
  standIn,
  pressRef,
  autofocus = true,
}: Pick<ModuleViewProps<TextBlock>, 'data' | 'onChange' | 'autofocus'> & {
  standIn: ReactNode
  pressRef: RefObject<Press | null>
}) => {
  const onSlashLine = useContext(SlashLineContext)
  const { stepOut, leaveUp, select } = useBlockRow()
  const latest = useRef({ data, onChange, onSlashLine, stepOut, leaveUp, select })
  useEffect(() => {
    latest.current = { data, onChange, onSlashLine, stepOut, leaveUp, select }
  })

  // Options must be the same values on every render: any change makes `useEditor`
  // re-apply them, which redraws the document over keystrokes not yet read.
  // `buildExtensions` only stores `latest`, read later from `handleKeyDown` —
  // never during render.
  // eslint-disable-next-line react-hooks/refs -- latest-ref idiom, see comment above
  const [opening] = useState(() => ({
    content: openingDocFor(data.content).toJSON(),
    autofocus: autofocus && isUnwritten(data.content) ? ('end' as const) : false,
    extensions: buildExtensions(data.placeholder, data.id, latest),
  }))
  const written = useRef(data.content)
  // What this editor wrote that the page hasn't rendered back yet. The page can
  // render an earlier write after a later one is typed; that value is an echo,
  // not a change from outside, and must not rewind the document.
  const unechoed = useRef<string[]>([])

  const editor = useEditor({
    extensions: opening.extensions,
    content: opening.content,
    immediatelyRender: false,
    autofocus: opening.autofocus,
    // `handlePaste` (`paste.ts`) is the one path for markdown-on-paste, dispatched
    // untagged so Link's paste rule never reruns over it; the marks' own built-in
    // paste rules (bold/italic/etc.) would otherwise still convert `**x**` on a
    // literal, shift-held paste, which must stay literal. Link's own paste rule
    // stays on for everything `handlePaste` falls through on: it only autolinks a
    // bare URL run, which a markdown paste never reaches this rule to double-handle.
    enablePasteRules: ENABLED_PASTE_RULES,
    editorProps,
    onSelectionUpdate: ({ editor: updated, transaction }) => {
      if (transaction.docChanged) return
      latest.current.onSlashLine?.(slashLineUnder(updated), false)
    },
    onUpdate: ({ editor: updated, transaction }) => {
      const { data: current, onChange: send, onSlashLine: report } = latest.current
      if (!send) return
      const { doc, selection } = updated.state
      if (report) {
        const at = slashLineUnder(updated)
        report(at, at !== null && opensSlashLine(transaction.before, doc, selection.from))
      }
      const content = serializeMarkdown(doc)
      if (content === written.current) return
      written.current = content
      unechoed.current.push(content)
      send({ ...current, content })
    },
  })

  useEffect(() => {
    // Echoes arrive in the order written, so the earliest match is the one. An
    // outside value equal to a write still awaiting its echo is taken for that
    // echo — possible only when it lands in the same render as later typing.
    const echo = unechoed.current.indexOf(data.content)
    if (echo >= 0) unechoed.current.splice(0, echo + 1)
    if (!editor || echo >= 0 || data.content === written.current) return
    unechoed.current = []
    written.current = data.content
    editor
      .chain()
      .setMeta('addToHistory', false)
      .setContent(openingDocFor(data.content).toJSON(), { emitUpdate: false })
      .run()
  }, [editor, data.content])

  useEffect(() => {
    if (!editor) return
    return registerTextEditor(editor, data.id)
  }, [editor, data.id])

  useEffect(() => {
    const at = pressRef.current
    if (!editor || !at) return
    pressRef.current = null
    const found = editor.view.posAtCoords(at)
    if (found) editor.commands.focus(found.pos)
  }, [editor, pressRef])

  if (!editor) return standIn
  return <EditorContent editor={editor} className="w-full" />
}

export default TextEditor
