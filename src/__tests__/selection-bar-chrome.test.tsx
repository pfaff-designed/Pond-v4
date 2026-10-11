/**
 * KAN-95 — the selection bar's own chrome (`Pond 02 Component library.dc.html`
 * frame `2t`): `.mn-glass` stands in for the board's literal gradient/shadow
 * (ADR 0004 Ruling 11), the rest of the box and every item/divider class is
 * the board's own inline value. String assertions only — jsdom cannot
 * observe computed layout.
 */

import { render, screen } from '@testing-library/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'

const getBar = (container: HTMLElement) => {
  const bar = container.querySelector('[data-part="selection-bar"]')
  if (!(bar instanceof HTMLElement)) throw new Error('selection bar not found')
  return bar
}

describe('SelectionBar chrome', () => {
  it('the bar is .mn-glass plus the board’s own flex/gap/padding/radius', () => {
    const { container } = render(<SelectionBar />)
    const bar = getBar(container)
    expect(bar.className).toContain('mn-glass')
    expect(bar.className).toContain('flex')
    expect(bar.className).toContain('gap-[2px]')
    expect(bar.className).toContain('p-[4px]')
    expect(bar.className).toContain('rounded-[14px]')
  })

  it('each item is 32px tall, 32px min-width, 9px horizontal padding, 10px radius, with active/hover fill', () => {
    render(<SelectionBar />)
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('h-[32px]')
      expect(button.className).toContain('min-w-[32px]')
      expect(button.className).toContain('px-[9px]')
      expect(button.className).toContain('rounded-[10px]')
      expect(button.className).toContain('hover:bg-mn-text/[0.07]')
      expect(button.className).toContain('active:bg-mn-text/[0.07]')
    }
  })

  it('each divider is a 1px × 18px rule at ink/paper .12', () => {
    const { container } = render(<SelectionBar />)
    const bar = getBar(container)
    const dividers = bar.querySelectorAll('[aria-hidden]:not(svg)')
    expect(dividers.length).toBe(3)
    for (const divider of Array.from(dividers)) {
      expect(divider.className).toContain('w-px')
      expect(divider.className).toContain('h-[18px]')
      expect(divider.className).toContain('bg-mn-text/[0.12]')
    }
  })
})
