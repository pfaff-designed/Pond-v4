import type { Editor } from '@tiptap/core'
import type { Level } from '@tiptap/extension-heading'

/** The selection bar's toggles, read off the editor whose selection they act on. */
export interface ActiveMarks {
  bold: boolean
  italic: boolean
}

/** The selection bar's text-style menu: a plain paragraph or one of the six heading levels. */
export type TextStyle = 'text' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

export const toggleBold = (editor: Editor): void => {
  editor.chain().focus().toggleBold().run()
}

export const toggleItalic = (editor: Editor): void => {
  editor.chain().focus().toggleItalic().run()
}

export const toggleBulletList = (editor: Editor): void => {
  editor.chain().focus().toggleBulletList().run()
}

export const activeMarks = (editor: Editor): ActiveMarks => ({
  bold: editor.isActive('bold'),
  italic: editor.isActive('italic'),
})

export const setTextStyle = (editor: Editor, level: Level | null): void => {
  if (level === null) {
    editor.chain().focus().setParagraph().run()
    return
  }
  editor.chain().focus().setHeading({ level }).run()
}

export const currentTextStyle = (editor: Editor): TextStyle => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive('heading', { level })) return `h${level}` as const
  }
  return 'text'
}

export const setLink = (editor: Editor, href: string): void => {
  editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
}

export const unsetLink = (editor: Editor): void => {
  editor.chain().focus().extendMarkRange('link').unsetLink().run()
}
