/**
 * KAN-95 — the selection bar's own selection watching: `selectionchange`,
 * the container-containment check, `data-block-id` resolution into `SelectionContext`, and the
 * `document.body` portal. Positioning and `pointerdown`-outside dismissal
 * are exercised through behaviour here, not through a stubbed rect —
 * jsdom has no selection geometry (`jest.setup.ts`).
 */

import { useEffect, useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { EditorContent, useEditor } from '@tiptap/react'
import { SelectionBar, type SelectionContext } from '@/components/molecules/SelectionBar'
import { registerTextEditor } from '@/lib/modules/text/active-editor'
import { proseExtensions } from '@/lib/modules/text/extensions'
import { clearSelection, selectText } from './helpers/selection'

/** "inside the block" is a registered, editable editor; "outside the block" stays plain text — a real non-editor negative case under the new rule. */
function Host({
  onAsk,
  disabled,
}: {
  onAsk: (ctx: SelectionContext) => void
  disabled?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editor = useEditor({
    extensions: proseExtensions,
    content: '<p>inside the block</p>',
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    return registerTextEditor(editor)
  }, [editor])

  return (
    <div>
      <div ref={containerRef} data-block-id="block-1">
        {editor && <EditorContent editor={editor} />}
      </div>
      <p>outside the block</p>
      <SelectionBar onAsk={onAsk} disabled={disabled} containerRef={containerRef} />
    </div>
  )
}

const getBar = () => document.body.querySelector('[data-part="selection-bar"]')

describe('SelectionBar selection watching', () => {
  afterEach(() => clearSelection())

  it('appears with the selected text and its block id, then disappears when the selection collapses', () => {
    const onAsk = jest.fn()
    render(<Host onAsk={onAsk} />)

    selectText(screen.getByText('inside the block'))
    expect(getBar()).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'ask pond' }))
    expect(onAsk).toHaveBeenCalledWith({ text: 'inside the block', blockId: 'block-1', from: 1, to: 17 })

    selectText(screen.getByText('inside the block'))
    expect(getBar()).not.toBeNull()
    clearSelection()
    expect(getBar()).toBeNull()
  })

  it('stays hidden for a selection outside its container', () => {
    render(<Host onAsk={jest.fn()} />)
    selectText(screen.getByText('outside the block'))
    expect(getBar()).toBeNull()
  })

  it('disappears once disabled, with no new selectionchange needed', () => {
    const { rerender } = render(<Host onAsk={jest.fn()} />)
    selectText(screen.getByText('inside the block'))
    expect(getBar()).not.toBeNull()

    rerender(<Host onAsk={jest.fn()} disabled />)
    expect(getBar()).toBeNull()
  })

  it('stays absent after disabled ends when the selection collapsed meanwhile', () => {
    const { rerender } = render(<Host onAsk={jest.fn()} />)
    selectText(screen.getByText('inside the block'))
    expect(getBar()).not.toBeNull()

    rerender(<Host onAsk={jest.fn()} disabled />)
    clearSelection()
    rerender(<Host onAsk={jest.fn()} />)
    expect(getBar()).toBeNull()
  })

  it('dismisses on a pointerdown outside the bar, keeping the selection', () => {
    render(<Host onAsk={jest.fn()} />)
    selectText(screen.getByText('inside the block'))
    expect(getBar()).not.toBeNull()

    fireEvent.pointerDown(screen.getByText('outside the block'))
    expect(getBar()).toBeNull()
    expect(window.getSelection()?.toString()).toBe('inside the block')
  })
})
