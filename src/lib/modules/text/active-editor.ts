import type { Editor } from '@tiptap/react'

/** Every mounted text block's editor, so a document-level surface can reach the one under a selection. */
const editors = new Set<Editor>()

/** Called by a text block's editor on mount. Call the return to unregister on destroy. */
export const registerTextEditor = (editor: Editor): (() => void) => {
  editors.add(editor)
  return () => editors.delete(editor)
}

/** A `Selection`'s anchor, or a node standing in for one. */
const anchorOf = (at: Selection | Node): Node | null =>
  at instanceof Node ? at : at.anchorNode

/** The registered editor whose `view.dom` contains the selection's anchor, or null. */
export const editorForSelection = (at: Selection | Node): Editor | null => {
  const anchor = anchorOf(at)
  if (!anchor) return null
  for (const editor of editors) {
    if (editor.view.dom.contains(anchor)) return editor
  }
  return null
}
