/**
 * KAN-139 (comment 10064) — closing a text block's own ProseMirror history at
 * the page's commit point, so a ⌘Z pressed after the pause reaches the
 * shell's change-log undo instead of rewinding content the save already made
 * durable; before the commit, ⌘Z still undoes the typed text as today.
 */

import { createRef, type RefObject } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { closeBlockHistory } from '@/lib/modules/text/active-editor'
import TextEditor, { type Press } from '@/lib/modules/text/editor'
import { textSchema } from '@/lib/modules/text/schema'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

const renderEditor = async () => {
  render(
    <TextEditor
      data={textSchema.parse({ id: 'b1', type: 'text', content: 'soak overnight' })}
      onChange={jest.fn()}
      standIn={null}
      pressRef={createRef<Press | null>() as RefObject<Press | null>}
    />
  )
  return findTextBlock()
}

const pressUndo = (textbox: HTMLElement) =>
  act(() => {
    fireEvent.keyDown(textbox, { key: 'z', metaKey: true })
  })

describe('closeBlockHistory', () => {
  // A fresh spy each time (KAN-93's shell-commands-undo-key.test.tsx pattern):
  // restoring one spy object, then re-setting its return value, leaves the
  // getter un-replaced on the live `navigator`.
  beforeEach(() => jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel'))
  afterEach(() => jest.restoreAllMocks())

  it('leaves the field unchanged by a ⌘Z pressed after the commit closes its history', async () => {
    const textbox = await renderEditor()
    writeInTextBlock(textbox, 'soak overnight, then simmer')
    expect(textbox.textContent).toBe('soak overnight, then simmer')

    closeBlockHistory('b1')
    pressUndo(textbox)

    expect(textbox.textContent).toBe('soak overnight, then simmer')
  })

  it('still undoes the typed text before the commit, as today', async () => {
    const textbox = await renderEditor()
    writeInTextBlock(textbox, 'soak overnight, then simmer')

    pressUndo(textbox)

    expect(textbox.textContent).toBe('soak overnight')
  })

  it('is a no-op for a block with no mounted editor', () => {
    expect(() => closeBlockHistory('not-mounted')).not.toThrow()
  })

  it('skips closing when the field has moved on from what was saved (keystrokes typed during the save round trip)', async () => {
    const textbox = await renderEditor()
    writeInTextBlock(textbox, 'soak overnight, then simmer')

    closeBlockHistory('b1', 'soak overnight') // stale: not what the field holds now
    pressUndo(textbox)

    expect(textbox.textContent).toBe('soak overnight')
  })

  it('closes when the field still matches what was saved', async () => {
    const textbox = await renderEditor()
    writeInTextBlock(textbox, 'soak overnight, then simmer')

    closeBlockHistory('b1', 'soak overnight, then simmer')
    pressUndo(textbox)

    expect(textbox.textContent).toBe('soak overnight, then simmer')
  })
})
