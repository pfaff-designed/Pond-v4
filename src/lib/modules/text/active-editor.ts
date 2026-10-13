import type { Editor } from '@tiptap/react'

/** Every mounted text block's editor, keyed by its block id, so a document-level surface can reach the one under a selection or one named by id. */
const editors = new Map<Editor, string>()

/** Called by a text block's editor on mount. Call the return to unregister on destroy. `blockId` is optional for callers (tests) that only need selection lookup. */
export const registerTextEditor = (editor: Editor, blockId = ''): (() => void) => {
  editors.set(editor, blockId)
  return () => editors.delete(editor)
}

/** A `Selection`'s anchor, or a node standing in for one. */
const anchorOf = (at: Selection | Node): Node | null =>
  at instanceof Node ? at : at.anchorNode

/** The registered editor whose `view.dom` contains the selection's anchor, or null. */
export const editorForSelection = (at: Selection | Node): Editor | null => {
  const anchor = anchorOf(at)
  if (!anchor) return null
  for (const editor of editors.keys()) {
    if (editor.view.dom.contains(anchor)) return editor
  }
  return null
}

/** The registered editor for a given block id, or null if that block isn't mounted. */
export const editorForBlock = (blockId: string): Editor | null => {
  for (const [editor, id] of editors) {
    if (id === blockId) return editor
  }
  return null
}
