/**
 * KAN-95 — Tab reaches the selection bar from the text block's editor, only while
 * a selection is up; with none, Tab is left to the browser.
 */

import { createRef, type RefObject } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
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

describe('Tab into the selection bar', () => {
  afterEach(() => clearSelection())

  it('moves focus to the bar’s first enabled item while a selection is up', async () => {
    const textbox = await renderEditor()
    selectWord(screen.getByText('soak overnight'), 'overnight')
    const toolbar = screen.getByRole('toolbar', { name: 'selection' })

    let notPrevented = true
    act(() => {
      notPrevented = fireEvent.keyDown(textbox, { key: 'Tab' })
    })

    const first = toolbar.querySelector<HTMLButtonElement>('button:not(:disabled)')
    expect(document.activeElement).toBe(first)
    expect(first).toHaveTextContent('text')
    expect(notPrevented).toBe(false)
  })

  it('leaves Tab alone when nothing is selected', async () => {
    const textbox = await renderEditor()
    clearSelection()

    let notPrevented = false
    act(() => {
      notPrevented = fireEvent.keyDown(textbox, { key: 'Tab' })
    })

    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(notPrevented).toBe(true)
  })

  it('leaves Shift-Tab alone while a selection is up', async () => {
    const textbox = await renderEditor()
    selectWord(screen.getByText('soak overnight'), 'overnight')

    let notPrevented = false
    act(() => {
      notPrevented = fireEvent.keyDown(textbox, { key: 'Tab', shiftKey: true })
    })

    expect(notPrevented).toBe(true)
    expect(screen.getByRole('toolbar', { name: 'selection' }).contains(document.activeElement)).toBe(
      false
    )
  })
})
