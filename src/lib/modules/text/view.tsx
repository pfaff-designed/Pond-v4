'use client'

import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import type { EditorView } from '@tiptap/pm/view'
import type { ModuleViewProps } from '../types'
import { proseExtensions } from './extensions'
import { parseMarkdown, serializeMarkdown } from './markdown'
import { TEXT_PROSE_CLASS } from './prose'
import type { TextBlock } from './schema'

/**
 * Has nothing been written here yet? Blank, or only markdown scaffolding the row
 * that minted the block typed for you — today a heading's `#` run. Both open with
 * the caret in them.
 */
export const isUnwritten = (content: string): boolean =>
  content.replace(/^#{1,6}\s*/, '').trim() === ''

const editableExtensions = [
  ...proseExtensions,
  Placeholder.configure({ placeholder: 'write something' }),
]

const handleKeyDown = (view: EditorView, event: KeyboardEvent): boolean => {
  if (event.key !== 'Escape') return false
  view.dom.blur()
  return true
}

/**
 * A browser doesn't follow a link inside an editable field, so the editor opens
 * it. Read-only prose is not editable and its anchors navigate on their own.
 */
const handleClick = (view: EditorView, _pos: number, event: MouseEvent): boolean => {
  if (event.button !== 0 || !view.editable || !(event.target instanceof Element)) return false
  const link = event.target.closest('a')
  if (!link?.href || !view.dom.contains(link)) return false
  window.open(link.href, '_blank', 'noopener,noreferrer')
  return true
}

/**
 * The text block: its markdown `content` as a typeset document, edited in place.
 * Read-only renders the same document, not editable, so the two always share type.
 *
 * Edits are written back as markdown on every change and the page's debounced save
 * commits them; until it does, ⌘Z is the editor's own history. Content that
 * arrives from outside (an accepted diff, the `/` menu clearing its query) replaces
 * the document without writing back and without entering that history.
 */
export const TextView = ({ data, editable = false, onChange }: ModuleViewProps<TextBlock>) => {
  const written = useRef(data.content)
  const latest = useRef({ data, onChange })
  useEffect(() => {
    latest.current = { data, onChange }
  })

  const editor = useEditor(
    {
      extensions: editable ? editableExtensions : proseExtensions,
      content: parseMarkdown(data.content).toJSON(),
      editable,
      immediatelyRender: false,
      autofocus: editable && isUnwritten(data.content) ? 'end' : false,
      editorProps: {
        attributes: editable
          ? {
              class: TEXT_PROSE_CLASS,
              role: 'textbox',
              'aria-multiline': 'true',
              'aria-label': 'text block',
            }
          : { class: TEXT_PROSE_CLASS, role: 'none' },
        handleKeyDown,
        handleClick,
      },
      onUpdate: ({ editor: updated }) => {
        const content = serializeMarkdown(updated.state.doc)
        if (content === written.current) return
        written.current = content
        latest.current.onChange?.({ ...latest.current.data, content })
      },
    },
    [editable]
  )

  useEffect(() => {
    if (!editor || data.content === written.current) return
    written.current = data.content
    editor
      .chain()
      .setMeta('addToHistory', false)
      .setContent(parseMarkdown(data.content).toJSON(), { emitUpdate: false })
      .run()
  }, [editor, data.content])

  return <EditorContent editor={editor} className="w-full" />
}
