/**
 * KAN-95 — the selection bar's own chrome (`Pond 02 Component library.dc.html`
 * frame `2t`): `.mn-glass` stands in for the board's literal gradient/shadow
 * (ADR 0004 Ruling 11), the rest of the box and every item/divider class is
 * the board's own inline value. String assertions only — jsdom cannot
 * observe computed layout.
 */

import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { EditorContent, useEditor } from '@tiptap/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { registerTextEditor } from '@/lib/modules/text/active-editor'
import { proseExtensions } from '@/lib/modules/text/extensions'
import { clearSelection, selectText } from './helpers/selection'

/** A registered, editable text-block editor — the bar only opens when both ends of the selection sit inside one. */
function Host() {
  const editor = useEditor({
    extensions: proseExtensions,
    content: '<p>select me</p>',
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    return registerTextEditor(editor)
  }, [editor])

  if (!editor) return null
  return <EditorContent editor={editor} />
}

/** The bar only portals once a real selection is up — give it one inside the registered editor. */
const renderBarWithSelection = () => {
  const result = render(
    <>
      <SelectionBar onAsk={jest.fn()} />
      <Host />
    </>
  )
  selectText(screen.getByText('select me'))
  return result
}

const getBar = () => {
  const bar = document.body.querySelector('[data-part="selection-bar"]')
  if (!(bar instanceof HTMLElement)) throw new Error('selection bar not found')
  return bar
}

describe('SelectionBar chrome', () => {
  afterEach(() => clearSelection())

  it('the bar is .mn-glass plus the board’s own flex/gap/padding/radius', () => {
    renderBarWithSelection()
    const bar = getBar()
    expect(bar.className).toContain('mn-glass')
    expect(bar.className).toContain('flex')
    expect(bar.className).toContain('gap-[2px]')
    expect(bar.className).toContain('p-[4px]')
    expect(bar.className).toContain('rounded-[14px]')
  })

  it('each item is 32px tall, 32px min-width, 9px horizontal padding, 10px radius, with active/hover fill', () => {
    renderBarWithSelection()
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('h-[32px]')
      expect(button.className).toContain('min-w-[32px]')
      expect(button.className).toContain('px-[9px]')
      expect(button.className).toContain('rounded-[10px]')
      // The three inert items take no fill: a fill on hover would read as live.
      if (button.hasAttribute('disabled')) continue
      expect(button.className).toContain('hover:bg-mn-text/[0.07]')
      expect(button.className).toContain('active:bg-mn-text/[0.07]')
    }
  })

  it('each divider is a 1px × 18px rule at ink/paper .12', () => {
    renderBarWithSelection()
    const bar = getBar()
    const dividers = bar.querySelectorAll('[aria-hidden]:not(svg)')
    expect(dividers.length).toBe(3)
    for (const divider of Array.from(dividers)) {
      expect(divider.className).toContain('w-px')
      expect(divider.className).toContain('h-[18px]')
      expect(divider.className).toContain('bg-mn-text/[0.12]')
    }
  })
})
