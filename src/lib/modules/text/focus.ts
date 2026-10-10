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
