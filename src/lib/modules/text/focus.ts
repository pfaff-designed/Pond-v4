import type { TiptapEditorHTMLElement } from '@tiptap/core'

/**
 * Puts the caret at the `start` or `end` of the text block drawn inside `root`.
 * False when there is no editor there yet: it may still be drawing its stand-in.
 */
export const focusTextBlock = (root: Element | null, at: 'start' | 'end'): boolean => {
  const field = root?.querySelector<TiptapEditorHTMLElement>('[role="textbox"][contenteditable]')
  if (!field?.editor) return false
  field.editor.commands.focus(at)
  return true
}

/**
 * Whether the text block drawn inside `root` has any text between the start
 * of the document and the caret — read-only, moves nothing. Decides the
 * ⌘⌫ collision (AUDIT K1–K4): with text before the caret, the browser's own
 * contenteditable delete-to-line-start wins over deleting the block.
 */
export const hasTextBeforeCaret = (root: Element | null): boolean => {
  const field = root?.querySelector<TiptapEditorHTMLElement>('[role="textbox"][contenteditable]')
  if (!field?.editor) return false
  const { selection } = field.editor.state
  // A non-empty selection (e.g. select-all) has its own content to delete —
  // tiptap's Mod-Backspace deletes it, so the block must not also go.
  if (!selection.empty) return true
  return field.editor.state.doc.textBetween(0, selection.from).length > 0
}
