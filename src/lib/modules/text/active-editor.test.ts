import { Editor } from '@tiptap/core'
import { editableEditorForSelection, editorForSelection, registerTextEditor } from './active-editor'
import { proseExtensions } from './extensions'

/** A real Tiptap editor, mounted into a detached element so `view.dom` exists. */
const mountEditor = (content: string): Editor => {
  const element = document.createElement('div')
  return new Editor({ element, extensions: proseExtensions, content })
}

/** A selection-shaped object with just the two endpoints the predicate reads. */
const fakeSelection = (anchorNode: Node | null, focusNode: Node | null): Selection =>
  ({ anchorNode, focusNode }) as Selection

describe('registerTextEditor / editorForSelection', () => {
  it('resolves the registered editor for a node inside its view.dom', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    const unregister = registerTextEditor(editor)
    const node = editor.view.dom.querySelector('p') as Node

    expect(editorForSelection(node)).toBe(editor)

    unregister()
    editor.destroy()
  })

  it('returns null for a node outside any registered editor', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    const unregister = registerTextEditor(editor)
    const outside = document.createElement('p')

    expect(editorForSelection(outside)).toBeNull()

    unregister()
    editor.destroy()
  })

  it('resolves two registered editors each to their own node', () => {
    const first = mountEditor('<p>soak overnight</p>')
    const second = mountEditor('<p>simmer and stir</p>')
    const unregisterFirst = registerTextEditor(first)
    const unregisterSecond = registerTextEditor(second)

    expect(editorForSelection(first.view.dom.querySelector('p') as Node)).toBe(first)
    expect(editorForSelection(second.view.dom.querySelector('p') as Node)).toBe(second)

    unregisterFirst()
    unregisterSecond()
    first.destroy()
    second.destroy()
  })

  it('stops resolving an editor once it unregisters', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    const node = editor.view.dom.querySelector('p') as Node
    const unregister = registerTextEditor(editor)
    unregister()

    expect(editorForSelection(node)).toBeNull()

    editor.destroy()
  })
})

describe('editableEditorForSelection', () => {
  it('resolves the editor when both ends sit inside one editable editor', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    const unregister = registerTextEditor(editor)
    const node = editor.view.dom.querySelector('p') as Node

    expect(editableEditorForSelection(fakeSelection(node, node))).toBe(editor)

    unregister()
    editor.destroy()
  })

  it('returns null when the owning editor is not editable', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    const unregister = registerTextEditor(editor)
    const node = editor.view.dom.querySelector('p') as Node
    editor.setEditable(false)

    expect(editableEditorForSelection(fakeSelection(node, node))).toBeNull()

    unregister()
    editor.destroy()
  })

  it('returns null when the anchor and focus sit in two different registered editors', () => {
    const first = mountEditor('<p>soak overnight</p>')
    const second = mountEditor('<p>simmer and stir</p>')
    const unregisterFirst = registerTextEditor(first)
    const unregisterSecond = registerTextEditor(second)
    const anchor = first.view.dom.querySelector('p') as Node
    const focus = second.view.dom.querySelector('p') as Node

    expect(editableEditorForSelection(fakeSelection(anchor, focus))).toBeNull()

    unregisterFirst()
    unregisterSecond()
    first.destroy()
    second.destroy()
  })

  it('returns null when one end sits outside any registered editor', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    const unregister = registerTextEditor(editor)
    const anchor = editor.view.dom.querySelector('p') as Node
    const outside = document.createElement('p')

    expect(editableEditorForSelection(fakeSelection(anchor, outside))).toBeNull()

    unregister()
    editor.destroy()
  })

  it('returns null when anchorNode or focusNode is missing', () => {
    const editor = mountEditor('<p>soak overnight</p>')
    const unregister = registerTextEditor(editor)
    const node = editor.view.dom.querySelector('p') as Node

    expect(editableEditorForSelection(fakeSelection(null, node))).toBeNull()
    expect(editableEditorForSelection(fakeSelection(node, null))).toBeNull()

    unregister()
    editor.destroy()
  })
})
