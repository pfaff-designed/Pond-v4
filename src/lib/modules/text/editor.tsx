'use client'

import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import type { EditorView } from '@tiptap/pm/view'
import type { ModuleViewProps } from '../types'
import { proseExtensions } from './extensions'
import { parseMarkdown, serializeMarkdown } from './markdown'
import { TEXT_PLACEHOLDER, TEXT_PROSE_CLASS } from './prose'
import type { TextBlock } from './schema'
import { StaticProse } from './static-prose'

/**
 * Has nothing been written here yet? Blank, or only markdown scaffolding the row
 * that minted the block typed for you — today a heading's `#` run. Both open with
 * the caret in them.
 */
const isUnwritten = (content: string): boolean => content.replace(/^#{1,6}\s*/, '').trim() === ''

const extensions = [...proseExtensions, Placeholder.configure({ placeholder: TEXT_PLACEHOLDER })]

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

/**
 * The text block, edited in place: its markdown `content` as a typeset document.
 * Until the editor exists it draws the static render of the same document, so the
 * swap is invisible.
 *
 * Edits are written back as markdown on every change and the page's debounced save
 * commits them; until it does, ⌘Z is the editor's own history. Content that
 * arrives from outside (an accepted diff, the `/` menu clearing its query) replaces
 * the document without writing back and without entering that history.
 */
const TextEditor = ({ data, onChange }: Pick<ModuleViewProps<TextBlock>, 'data' | 'onChange'>) => {
  const written = useRef(data.content)
  const latest = useRef({ data, onChange })
  useEffect(() => {
    latest.current = { data, onChange }
  })

  const editor = useEditor({
    extensions,
    content: parseMarkdown(data.content).toJSON(),
    immediatelyRender: false,
    autofocus: isUnwritten(data.content) ? 'end' : false,
    editorProps: {
      attributes: {
        class: TEXT_PROSE_CLASS,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'text block',
      },
      handleKeyDown,
      handleClick,
    },
    onUpdate: ({ editor: updated }) => {
      const content = serializeMarkdown(updated.state.doc)
      if (content === written.current) return
      written.current = content
      latest.current.onChange?.({ ...latest.current.data, content })
    },
  })

  useEffect(() => {
    if (!editor || data.content === written.current) return
    written.current = data.content
    editor
      .chain()
      .setMeta('addToHistory', false)
      .setContent(parseMarkdown(data.content).toJSON(), { emitUpdate: false })
      .run()
  }, [editor, data.content])

  if (!editor) return <StaticProse content={data.content} placeholder={TEXT_PLACEHOLDER} />
  return <EditorContent editor={editor} className="w-full" />
}

export default TextEditor
