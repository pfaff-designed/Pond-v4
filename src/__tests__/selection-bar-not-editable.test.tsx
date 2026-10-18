/**
 * KAN-489 — the selection bar stays down for any selection that is not
 * owned, both ends, by one registered, editable text-block editor.
 */

import { useEffect } from 'react'
import { act, render, screen } from '@testing-library/react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { registerTextEditor } from '@/lib/modules/text/active-editor'
import { proseExtensions } from '@/lib/modules/text/extensions'
import { clearSelection, selectText } from './helpers/selection'

function Host({
  content = '<p>soak overnight</p>',
  onEditor,
}: {
  content?: string
  onEditor?: (editor: Editor) => void
}) {
  const editor = useEditor({
    extensions: proseExtensions,
    content,
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    onEditor?.(editor)
    return registerTextEditor(editor)
  }, [editor, onEditor])

  if (!editor) return null
  return <EditorContent editor={editor} />
}

/** Selects from `start`'s own text node to `end`'s, spanning two elements, then fires `selectionchange`. */
function selectAcross(start: HTMLElement, end: HTMLElement): void {
  const range = document.createRange()
  const startText = start.firstChild as Text
  const endText = end.firstChild as Text
  range.setStart(startText, 0)
  range.setEnd(endText, endText.length)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

describe('SelectionBar outside an editable editor', () => {
  afterEach(() => clearSelection())

  it('stays down for a selection entirely outside any registered editor', () => {
    render(
      <>
        <SelectionBar onAsk={jest.fn()} />
        <p>plain answer</p>
      </>
    )

    selectText(screen.getByText('plain answer'))

    expect(screen.queryByRole('toolbar', { name: 'selection' })).not.toBeInTheDocument()
  })

  it('stays down for a selection inside a registered editor that is not editable', () => {
    let editor: Editor | null = null
    render(
      <>
        <Host onEditor={(e) => (editor = e)} />
        <SelectionBar onAsk={jest.fn()} />
      </>
    )
    act(() => editor!.setEditable(false))

    selectText(screen.getByText('soak overnight'))

    expect(screen.queryByRole('toolbar', { name: 'selection' })).not.toBeInTheDocument()
  })

  it('stays down when the anchor is inside one registered editor but the focus lands outside it', () => {
    render(
      <>
        <Host content="<p>soak overnight</p>" />
        <p>plain answer</p>
        <SelectionBar onAsk={jest.fn()} />
      </>
    )

    selectAcross(screen.getByText('soak overnight'), screen.getByText('plain answer'))

    expect(screen.queryByRole('toolbar', { name: 'selection' })).not.toBeInTheDocument()
  })

  it('stays down when the anchor and focus sit in two different registered editors', () => {
    render(
      <>
        <Host content="<p>soak overnight</p>" />
        <Host content="<p>simmer and stir</p>" />
        <SelectionBar onAsk={jest.fn()} />
      </>
    )

    selectAcross(screen.getByText('soak overnight'), screen.getByText('simmer and stir'))

    expect(screen.queryByRole('toolbar', { name: 'selection' })).not.toBeInTheDocument()
  })
})
