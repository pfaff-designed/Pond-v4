import { Editor } from '@tiptap/core'
import { proseExtensions } from './extensions'
import { ReferenceHighlight, onReferenceRangeDropped } from './reference-highlight'

/** A real Tiptap editor, mounted into a detached element so decorations actually render. */
const mountEditor = (content: string): Editor =>
  new Editor({
    element: document.createElement('div'),
    extensions: [...proseExtensions, ReferenceHighlight.configure({ blockId: 'block-1' })],
    content,
  })

const highlighted = (editor: Editor): string[] =>
  Array.from(editor.view.dom.querySelectorAll('.mn-reference-highlight')).map((el) => el.textContent ?? '')

describe('ReferenceHighlight', () => {
  it('decorates the given range with the wheat highlight class', () => {
    const editor = mountEditor('<p>a path is a record of the feet</p>')
    editor.commands.setReferenceHighlights([{ key: '0', range: { from: 3, to: 7 } }])

    expect(highlighted(editor)).toEqual(['path'])
    editor.destroy()
  })

  it('re-anchors the range when text is inserted before it', () => {
    const editor = mountEditor('<p>a path is a record of the feet</p>')
    editor.commands.setReferenceHighlights([{ key: '0', range: { from: 3, to: 7 } }])

    editor.commands.insertContentAt(1, 'well, ')

    expect(highlighted(editor)).toEqual(['path'])
    editor.destroy()
  })

  it('re-anchors the range when text is inserted inside it', () => {
    const editor = mountEditor('<p>a path is a record of the feet</p>')
    editor.commands.setReferenceHighlights([{ key: '0', range: { from: 3, to: 7 } }])

    editor.commands.insertContentAt(5, 'XY')

    expect(highlighted(editor)).toEqual(['paXYth'])
    editor.destroy()
  })

  it('drops a reference whose anchored text is deleted, and reports it', () => {
    const editor = mountEditor('<p>a path is a record of the feet</p>')
    editor.commands.setReferenceHighlights([{ key: '0', range: { from: 3, to: 7 } }])

    const dropped: string[][] = []
    const unsubscribe = onReferenceRangeDropped((blockId, keys) => dropped.push([blockId, ...keys]))
    editor.commands.deleteRange({ from: 3, to: 7 })

    expect(highlighted(editor)).toEqual([])
    expect(dropped).toEqual([['block-1', '0']])
    unsubscribe()
    editor.destroy()
  })

  it('leaves an unrelated range untouched by an edit entirely after it', () => {
    const editor = mountEditor('<p>a path is a record of the feet</p>')
    editor.commands.setReferenceHighlights([{ key: '0', range: { from: 3, to: 7 } }])

    editor.commands.insertContentAt(30, 'X')

    expect(highlighted(editor)).toEqual(['path'])
    editor.destroy()
  })
})
