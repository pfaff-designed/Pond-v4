/**
 * KAN-95 — the selection bar is one toolbar: a roving tab stop over its
 * enabled items, arrows/Home/End to move, and Esc to dismiss it while keeping
 * the selection and giving the editor focus back.
 */

import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { registerTextEditor } from '@/lib/modules/text/active-editor'
import { proseExtensions } from '@/lib/modules/text/extensions'
import { escLeavesZen } from '@/lib/layout/zen'
import { clearSelection, selectText, selectWord } from './helpers/selection'

const ENABLED = ['text', 'bold', 'italic', 'link', 'list', 'ask pond', 'copy']

const renderBar = () => {
  render(
    <>
      <SelectionBar onAsk={jest.fn()} />
      <p>select me</p>
    </>
  )
  selectText(screen.getByText('select me'))
  return screen.getByRole('toolbar', { name: 'selection' })
}

const enabledButtons = (toolbar: HTMLElement) =>
  Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))

const focusButton = (button: HTMLElement) => act(() => button.focus())

const nameOf = (button: Element | null) =>
  button?.getAttribute('aria-label') ?? button?.textContent

describe('SelectionBar toolbar', () => {
  afterEach(() => clearSelection())

  it('is a horizontal toolbar labelled selection', () => {
    const toolbar = renderBar()
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('puts only the first enabled item in the tab order', () => {
    const toolbar = renderBar()
    const stops = enabledButtons(toolbar).filter((button) => button.tabIndex === 0)
    expect(stops.map(nameOf)).toEqual(['text'])
  })

  it('moves focus with ArrowRight/ArrowLeft over enabled items, skipping disabled ones', () => {
    const toolbar = renderBar()
    const buttons = enabledButtons(toolbar)
    focusButton(buttons[0])

    const visited: Array<string | null | undefined> = []
    for (let step = 0; step < ENABLED.length - 1; step += 1) {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
      visited.push(nameOf(document.activeElement))
    }
    expect(visited).toEqual(ENABLED.slice(1))

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(nameOf(document.activeElement)).toBe('ask pond')
  })

  it('makes the focused item the one tab stop', () => {
    const toolbar = renderBar()
    focusButton(enabledButtons(toolbar)[0])
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })

    const stops = enabledButtons(toolbar).filter((button) => button.tabIndex === 0)
    expect(stops.map(nameOf)).toEqual(['bold'])
  })

  it('jumps to the ends with Home and End', () => {
    const toolbar = renderBar()
    focusButton(enabledButtons(toolbar)[2])

    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(nameOf(document.activeElement)).toBe('copy')

    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(nameOf(document.activeElement)).toBe('text')
  })
})

function Host({ onEditor }: { onEditor: (editor: Editor) => void }) {
  const editor = useEditor({
    extensions: proseExtensions,
    content: '<p>soak overnight</p>',
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    onEditor(editor)
    return registerTextEditor(editor)
  }, [editor, onEditor])

  if (!editor) return null
  return (
    <div>
      <EditorContent editor={editor} />
      <SelectionBar onAsk={jest.fn()} />
    </div>
  )
}

describe('SelectionBar Esc', () => {
  afterEach(() => clearSelection())

  it('dismisses the bar, keeps the selection and returns focus to the editor', async () => {
    let editor: Editor | null = null
    render(<Host onEditor={(e) => (editor = e)} />)
    selectWord(screen.getByText('soak overnight'), 'overnight')

    const focusView = jest.spyOn(editor!.view.dom, 'focus')
    const toolbar = screen.getByRole('toolbar', { name: 'selection' })
    focusButton(enabledButtons(toolbar)[0])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    expect(screen.queryByRole('toolbar')).toBeNull()
    // The editor's own selection is what it re-draws on focus; jsdom does not
    // lay the DOM selection back out, so the live verifier confirms that half.
    const { from, to } = editor!.state.selection
    expect(editor!.state.doc.textBetween(from, to)).toBe('overnight')
    // Tiptap defers `focus()` to the next animation frame; jsdom cannot hold
    // real focus on a contenteditable, so the editor element's own focus call is the proof.
    await waitFor(() => expect(focusView).toHaveBeenCalled())
  })

  it('stays down while the same selection stands, and returns for a new one', () => {
    render(<Host onEditor={() => undefined} />)
    const line = screen.getByText('soak overnight')
    selectWord(line, 'overnight')
    fireEvent.keyDown(enabledButtons(screen.getByRole('toolbar'))[0], { key: 'Escape' })

    selectWord(line, 'overnight')
    expect(screen.queryByRole('toolbar')).toBeNull()

    selectWord(line, 'soak')
    expect(screen.getByRole('toolbar', { name: 'selection' })).toBeInTheDocument()
  })

  it('is preventDefaulted, so it does not also leave zen', () => {
    const toolbar = renderBar()
    const seen: boolean[] = []
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      seen.push(escLeavesZen(e))
    }
    window.addEventListener('keydown', handleWindowKeyDown)

    const notPrevented = fireEvent.keyDown(enabledButtons(toolbar)[0], { key: 'Escape' })
    window.removeEventListener('keydown', handleWindowKeyDown)

    expect(notPrevented).toBe(false)
    expect(seen).toEqual([false])
  })
})
