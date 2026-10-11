import type { Editor } from '@tiptap/core'

/** The selection bar's toggles, read off the editor whose selection they act on. */
export interface ActiveMarks {
  bold: boolean
  italic: boolean
}

export const toggleBold = (editor: Editor): void => {
  editor.chain().focus().toggleBold().run()
}

export const toggleItalic = (editor: Editor): void => {
  editor.chain().focus().toggleItalic().run()
}

export const activeMarks = (editor: Editor): ActiveMarks => ({
  bold: editor.isActive('bold'),
  italic: editor.isActive('italic'),
})
