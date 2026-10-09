'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import type { EditorView } from '@tiptap/pm/view'
import type { ModuleViewProps } from '../types'
import { proseExtensions } from './extensions'
import { parseMarkdown, serializeMarkdown } from './markdown'
import { TEXT_PROSE_CLASS, textPlaceholderFor } from './prose'
import type { TextBlock } from './schema'

/** Where a person pressed on the block before its editor existed. */
export interface Press {
  left: number
  top: number
}

/**
 * Has nothing been written here yet? Blank, or only markdown scaffolding the row
 * that minted the block typed for you — today a heading's `#` run. Both open with
 * the caret in them.
 */
const isUnwritten = (content: string): boolean => content.replace(/^#{1,6}\s*/, '').trim() === ''

const extensions = [
  ...proseExtensions,
  Placeholder.configure({ placeholder: ({ node }) => textPlaceholderFor(node.type.name) }),
]

const handleKeyDown = (view: EditorView, event: KeyboardEvent): boolean => {
  if (event.key !== 'Escape') return false
  view.dom.blur()
  return true
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

const editorProps = {
  attributes: {
    class: TEXT_PROSE_CLASS,
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': 'text block',
  },
  handleKeyDown,
  handleClick,
}

/**
 * The text block, edited in place: its markdown `content` as a typeset document.
 * Until the editor exists it draws `standIn`, the static render of the same
 * document, so the swap is invisible; a press on it (`pressRef`) is where the
 * caret lands when the editor arrives.
 *
 * Edits are written back as markdown on every change and the page's debounced save
 * commits them; until it does, ⌘Z is the editor's own history. Content that
 * arrives from outside (an accepted diff, the `/` menu clearing its query) replaces
 * the document without writing back and without entering that history.
 */
const TextEditor = ({
  data,
  onChange,
  standIn,
  pressRef,
}: Pick<ModuleViewProps<TextBlock>, 'data' | 'onChange'> & {
  standIn: ReactNode
  pressRef: RefObject<Press | null>
}) => {
  // Options must be the same values on every render: any change makes `useEditor`
  // re-apply them, which redraws the document over keystrokes not yet read.
  const [opening] = useState(() => ({
    content: parseMarkdown(data.content).toJSON(),
    autofocus: isUnwritten(data.content) ? ('end' as const) : false,
  }))
  const written = useRef(data.content)
  // What this editor wrote that the page hasn't rendered back yet. The page can
  // render an earlier write after a later one is typed; that value is an echo,
  // not a change from outside, and must not rewind the document.
  const unechoed = useRef<string[]>([])
  const latest = useRef({ data, onChange })
  useEffect(() => {
    latest.current = { data, onChange }
  })

  const editor = useEditor({
    extensions,
    content: opening.content,
    immediatelyRender: false,
    autofocus: opening.autofocus,
    editorProps,
    onUpdate: ({ editor: updated }) => {
      const { data: current, onChange: send } = latest.current
      if (!send) return
      const content = serializeMarkdown(updated.state.doc)
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
      .setContent(parseMarkdown(data.content).toJSON(), { emitUpdate: false })
      .run()
  }, [editor, data.content])

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
