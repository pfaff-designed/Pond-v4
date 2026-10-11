import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { activeMarks, toggleBold, toggleBulletList, toggleItalic } from './format'
import { proseExtensions } from './extensions'
import { serializeMarkdown } from './markdown'

/** A real Tiptap editor, mounted into a detached element so `view.dom` exists. */
const mountEditor = (content: string): Editor => {
  const element = document.createElement('div')
  return new Editor({ element, extensions: proseExtensions, content })
}

/** Selects the word's own range (ProseMirror positions are 1-based past the doc's open tag). */
const selectWord = (editor: Editor, word: string): void => {
  const from = editor.state.doc.textContent.indexOf(word) + 1
  const selection = TextSelection.create(editor.state.doc, from, from + word.length)
  editor.view.dispatch(editor.state.tr.setSelection(selection))
}

describe('toggleBold', () => {
  it('bolds a selected range and reports it active, then reverts it off', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    selectWord(editor, 'overnight')

    toggleBold(editor)

    expect(serializeMarkdown(editor.state.doc)).toBe('soak **overnight**')
    expect(activeMarks(editor).bold).toBe(true)

    toggleBold(editor)

    expect(serializeMarkdown(editor.state.doc)).toBe('soak overnight')
    expect(activeMarks(editor).bold).toBe(false)

    editor.destroy()
  })
})

describe('toggleItalic', () => {
  it('italicizes a selected range and reports it active, then reverts it off', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    selectWord(editor, 'overnight')

    toggleItalic(editor)

    // The serializer's italic delimiter (markdown.ts) is `*`, not `_`.
    expect(serializeMarkdown(editor.state.doc)).toBe('soak *overnight*')
    expect(activeMarks(editor).italic).toBe(true)

    toggleItalic(editor)

    expect(serializeMarkdown(editor.state.doc)).toBe('soak overnight')
    expect(activeMarks(editor).italic).toBe(false)

    editor.destroy()
  })
})

describe('toggleBulletList', () => {
  it('turns a line into a bullet list, then reverts it to a plain paragraph', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    selectWord(editor, 'soak')

    toggleBulletList(editor)

    expect(serializeMarkdown(editor.state.doc)).toBe('- soak overnight')
    expect(editor.isActive('bulletList')).toBe(true)

    toggleBulletList(editor)

    expect(serializeMarkdown(editor.state.doc)).toBe('soak overnight')
    expect(editor.isActive('bulletList')).toBe(false)

    editor.destroy()
  })
})
