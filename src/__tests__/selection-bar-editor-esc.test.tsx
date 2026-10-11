/**
 * KAN-95 — Esc pressed in the text block's editor dismisses the selection bar
 * while it is up (the mouse path: drag-select, then Esc without touching the bar);
 * with no bar up it keeps blurring the editor.
 */

import { createRef, type RefObject } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { editorForSelection } from '@/lib/modules/text/active-editor'
import TextEditor, { type Press } from '@/lib/modules/text/editor'
import { textSchema } from '@/lib/modules/text/schema'
import { clearSelection, selectWord } from './helpers/selection'

const renderEditor = async () => {
  render(
    <>
      <TextEditor
        data={textSchema.parse({ id: 'b1', type: 'text', content: 'soak overnight' })}
        onChange={jest.fn()}
        standIn={null}
        pressRef={createRef<Press | null>() as RefObject<Press | null>}
      />
      <SelectionBar onAsk={jest.fn()} />
    </>
  )
  return screen.findByRole('textbox', { name: 'text block' })
}

const pressEscape = (textbox: HTMLElement): boolean => {
  let notPrevented = true
  act(() => {
    notPrevented = fireEvent.keyDown(textbox, { key: 'Escape' })
  })
  return notPrevented
}

describe('Esc in the editor with the selection bar up', () => {
  afterEach(() => clearSelection())

  it('dismisses the bar, keeps the selection and the editor focused, and is preventDefaulted', async () => {
    const textbox = await renderEditor()
    const line = screen.getByText('soak overnight')
    selectWord(line, 'overnight')
    expect(screen.getByRole('toolbar', { name: 'selection' })).toBeInTheDocument()
    const editor = editorForSelection(window.getSelection()!)!
    const blur = jest.spyOn(textbox, 'blur')

    const notPrevented = pressEscape(textbox)

    expect(screen.queryByRole('toolbar')).toBeNull()
    const { from, to } = editor.state.selection
    expect(editor.state.doc.textBetween(from, to)).toBe('overnight')
    expect(window.getSelection()!.isCollapsed).toBe(false)
    expect(blur).not.toHaveBeenCalled()
    expect(notPrevented).toBe(false)
  })

  it('stays down while the same selection stands', async () => {
    const textbox = await renderEditor()
    const line = screen.getByText('soak overnight')
    selectWord(line, 'overnight')
    pressEscape(textbox)

    selectWord(line, 'overnight')

    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('still blurs the editor when no bar is up', async () => {
    const textbox = await renderEditor()
    clearSelection()
    const blur = jest.spyOn(textbox, 'blur')

    pressEscape(textbox)

    expect(blur).toHaveBeenCalled()
  })
})
