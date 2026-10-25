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
 * Puts the caret at the column nearest `x` on the first (`'top'`) or last
 * (`'bottom'`) visual line of the text block drawn inside `root` (KAN-367):
 * an arrow key leaving a neighbouring block lands at the same column it left
 * from, not always the block's own start/end. `posAtCoords` reads the exact
 * line box only in a real layout (jsdom has none, same caveat as the press
 * landing in `editor.tsx`); when it can't resolve a position there, this
 * falls back to the block's own start/end, same as a plain arrow-key leave.
 */
export const focusTextBlockAt = (root: Element | null, x: number, at: 'top' | 'bottom'): boolean => {
  const field = root?.querySelector<TiptapEditorHTMLElement>('[role="textbox"][contenteditable]')
  if (!field?.editor) return false
  const rect = field.getBoundingClientRect()
  const y = at === 'top' ? rect.top + 1 : rect.bottom - 1
  const found = field.editor.view.posAtCoords({ left: x, top: y })
  field.editor.commands.focus(found ? found.pos : at === 'top' ? 'start' : 'end')
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
