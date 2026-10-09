import { act, screen } from '@testing-library/react'
import type { Editor, TiptapEditorHTMLElement } from '@tiptap/core'

const FIELD = { name: 'text block' } as const

/** A text block's field: the typeset document a person writes into. */
export const findTextBlock = (): Promise<HTMLElement> => screen.findByRole('textbox', FIELD)

export const findAllTextBlocks = (): Promise<HTMLElement[]> =>
  screen.findAllByRole('textbox', FIELD)

export const queryAllTextBlocks = (): HTMLElement[] => screen.queryAllByRole('textbox', FIELD)

export const textEditorOf = (field: HTMLElement): Editor => {
  const { editor } = field as TiptapEditorHTMLElement
  if (!editor) throw new Error('not a text block field')
  return editor
}

/** Replaces what is written in a text block with `text`, as typing it would. */
export const writeInTextBlock = (field: HTMLElement, text: string): void => {
  const editor = textEditorOf(field)
  act(() => {
    editor.commands.setContent(
      text === ''
        ? ''
        : { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
    )
  })
}
