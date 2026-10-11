/**
 * KAN-95 — the selection bar's bold/italic items, wired to a real Tiptap
 * editor: resolve the editor under `window.getSelection()`, run
 * `toggleBold`/`toggleItalic`, and read `activeMarks` back into `aria-pressed`.
 */

import { useEffect } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { SelectionBar, type SelectionContext } from '@/components/molecules/SelectionBar'
import { registerTextEditor } from '@/lib/modules/text/active-editor'
import { proseExtensions } from '@/lib/modules/text/extensions'
import { serializeMarkdown } from '@/lib/modules/text/markdown'
import { clearSelection, selectWord } from './helpers/selection'

function Host({
  onAsk,
  onEditor,
  content = '<p>soak overnight</p>',
}: {
  onAsk: (ctx: SelectionContext) => void
  onEditor: (editor: Editor) => void
  content?: string
}) {
  const editor = useEditor({
    extensions: proseExtensions,
    content,
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
      <SelectionBar onAsk={onAsk} />
    </div>
  )
}

describe('SelectionBar bold/italic', () => {
  afterEach(() => clearSelection())

  it('bolds the selected word and reads the button as pressed', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'bold' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak **overnight**')
    expect(screen.getByRole('button', { name: 'bold' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws the active fill as a resting class only while a toggle is pressed', () => {
    render(<Host onAsk={jest.fn()} onEditor={jest.fn()} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    expect(screen.getByRole('button', { name: 'bold' })).not.toHaveClass('bg-mn-text/[0.07]')

    fireEvent.click(screen.getByRole('button', { name: 'bold' }))
    expect(screen.getByRole('button', { name: 'bold' })).toHaveClass('bg-mn-text/[0.07]')
    expect(screen.getByRole('button', { name: 'italic' })).not.toHaveClass('bg-mn-text/[0.07]')

    fireEvent.click(screen.getByRole('button', { name: 'bold' }))
    expect(screen.getByRole('button', { name: 'bold' })).not.toHaveClass('bg-mn-text/[0.07]')
  })

  it('italicizes the selected word and reads the button as pressed', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'italic' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak *overnight*')
    expect(screen.getByRole('button', { name: 'italic' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SelectionBar list', () => {
  afterEach(() => clearSelection())

  it('turns the selected line into a bullet list, then back into a plain paragraph', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'soak')
    fireEvent.click(screen.getByRole('button', { name: 'list' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('- soak overnight')
    expect(screen.getByRole('button', { name: 'list' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'list' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak overnight')
    expect(screen.getByRole('button', { name: 'list' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('SelectionBar text style', () => {
  afterEach(() => clearSelection())

  it('opens the style menu, sets h2, then reverts to a paragraph', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'text' }))

    let menu = screen.getByRole('menu', { name: 'text style' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'h2' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('## soak overnight')
    expect(screen.getByRole('button', { name: 'h2' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'h2' }))
    menu = screen.getByRole('menu', { name: 'text style' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'text' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak overnight')
    expect(screen.getByRole('button', { name: 'text' })).toBeInTheDocument()
  })

  it('hangs the menu 4px under the style button once it opens', () => {
    const original = Element.prototype.getBoundingClientRect
    const spy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      if (this.getAttribute('aria-haspopup') !== 'menu') return original.call(this)
      return {
        top: 300,
        bottom: 332,
        left: 200,
        right: 260,
        width: 60,
        height: 32,
        x: 200,
        y: 300,
        toJSON: () => ({}),
      }
    })
    render(<Host onAsk={jest.fn()} onEditor={jest.fn()} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'text' }))

    const menu = screen.getByRole('menu', { name: 'text style' })
    expect(menu.style.top).toBe('336px')
    expect(menu.style.left).toBe('200px')
    spy.mockRestore()
  })

  describe('from the keyboard', () => {
    const openMenu = (key: string, label = 'text') => {
      selectWord(screen.getByText('soak overnight'), 'overnight')
      const button = screen.getByRole('button', { name: label })
      act(() => button.focus())
      fireEvent.keyDown(button, { key })
      // A native button turns Enter/Space into a click; jsdom does not.
      fireEvent.click(button)
      return button
    }

    it.each(['Enter', ' '])('opens on %j with focus on the current style row', (key) => {
      render(<Host onAsk={jest.fn()} onEditor={jest.fn()} />)
      openMenu(key)

      const menu = screen.getByRole('menu', { name: 'text style' })
      expect(within(menu).getByRole('menuitem', { name: 'text' })).toHaveFocus()
    })

    it('moves with arrows (wrapping) and Home/End, then Enter chooses and closes', () => {
      let editor: Editor | null = null
      render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)
      const button = openMenu('Enter')
      const menu = screen.getByRole('menu', { name: 'text style' })
      const row = (name: string) => within(menu).getByRole('menuitem', { name })

      fireEvent.keyDown(row('text'), { key: 'ArrowDown' })
      expect(row('h1')).toHaveFocus()
      fireEvent.keyDown(row('h1'), { key: 'ArrowDown' })
      expect(row('h2')).toHaveFocus()
      fireEvent.keyDown(row('h2'), { key: 'End' })
      expect(row('h6')).toHaveFocus()
      fireEvent.keyDown(row('h6'), { key: 'ArrowDown' })
      expect(row('text')).toHaveFocus()
      fireEvent.keyDown(row('text'), { key: 'ArrowUp' })
      expect(row('h6')).toHaveFocus()
      fireEvent.keyDown(row('h6'), { key: 'Home' })
      expect(row('text')).toHaveFocus()
      fireEvent.keyDown(row('text'), { key: 'ArrowDown' })
      fireEvent.keyDown(row('h1'), { key: 'ArrowDown' })

      fireEvent.keyDown(row('h2'), { key: 'Enter' })

      expect(serializeMarkdown(editor!.state.doc)).toBe('## soak overnight')
      expect(screen.queryByRole('menu', { name: 'text style' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'h2' })).toHaveFocus()
      expect(button).toBeInTheDocument()
    })

    it('opens on the current style when it is not the first row', () => {
      render(<Host onAsk={jest.fn()} onEditor={jest.fn()} content="<h3>soak overnight</h3>" />)
      openMenu('Enter', 'h3')

      const menu = screen.getByRole('menu', { name: 'text style' })
      expect(within(menu).getByRole('menuitem', { name: 'h3' })).toHaveFocus()
    })

    it('closes on Esc, returns focus to the button, and leaves the bar up', () => {
      render(<Host onAsk={jest.fn()} onEditor={jest.fn()} />)
      openMenu('Enter')
      const menu = screen.getByRole('menu', { name: 'text style' })

      // `fireEvent` returns false when the event was default-prevented.
      const notPrevented = fireEvent.keyDown(within(menu).getByRole('menuitem', { name: 'text' }), {
        key: 'Escape',
      })

      expect(notPrevented).toBe(false)
      expect(screen.queryByRole('menu', { name: 'text style' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'text' })).toHaveFocus()
      expect(screen.getByRole('toolbar', { name: 'selection' })).toBeInTheDocument()
    })
  })
})

describe('SelectionBar link', () => {
  afterEach(() => clearSelection())

  const typeUrl = (url: string) => {
    const field = screen.getByRole('textbox', { name: 'link address' })
    fireEvent.change(field, { target: { value: url } })
    return field
  }

  it('opens a one-field input, and ↵ links the selected word', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'link' }))
    fireEvent.keyDown(typeUrl('https://example.com'), { key: 'Enter' })

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak [overnight](https://example.com)')
    expect(screen.queryByRole('textbox', { name: 'link address' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'unlink' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('cancels back to the bar on Esc, leaving the text unlinked', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'link' }))
    fireEvent.keyDown(typeUrl('https://example.com'), { key: 'Escape' })

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak overnight')
    expect(screen.queryByRole('textbox', { name: 'link address' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'link' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('offers unlink when a link is already active, and removes it', () => {
    let editor: Editor | null = null
    render(
      <Host
        onAsk={jest.fn()}
        onEditor={(e) => (editor = e)}
        content='<p>soak <a href="https://example.com">overnight</a></p>'
      />
    )

    selectWord(screen.getByText('overnight'), 'overnight')
    const unlink = screen.getByRole('button', { name: 'unlink' })
    expect(unlink).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(unlink)

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak overnight')
    expect(screen.getByRole('button', { name: 'link' })).toHaveAttribute('aria-pressed', 'false')
  })
})
