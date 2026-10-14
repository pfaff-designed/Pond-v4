/**
 * KAN-186 — the zen pill, static v1 (`Pond 02 Component library.dc.html` 2t
 * "zen pill · organism · zen only"). Just the draw and the mount: `ask pond`
 * and `leave` are real buttons; `editor`, `attach`, `type` and `ground` stay
 * `aria-disabled` and unwired until their own tickets.
 */

import { useRef } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}))

import { ZenPill } from '@/components/organisms/ZenPill'
import { useZen, ZenProvider } from '@/lib/layout/zen'
import { notifyComposerOpenChange } from '@/lib/terminal-focus'

const Entered = () => {
  const { enterZen } = useZen()
  return (
    <>
      <button onClick={() => enterZen({ onInk: false })}>enter</button>
      <button onClick={() => enterZen({ onInk: true })}>enter on ink</button>
      <ZenPill />
    </>
  )
}

const Host = () => {
  const root = useRef<HTMLDivElement>(null)
  return (
    <div ref={root}>
      <ZenProvider scrollRoot={root}>
        <Entered />
      </ZenProvider>
    </div>
  )
}

describe('ZenPill — static v1', () => {
  it('zen null: renders nothing', () => {
    render(<Host />)
    expect(document.querySelector('[data-part="zen-pill"]')).toBeNull()
  })

  it('zen active: all 8 items — ask pond, two dividers and the six controls', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))

    const pill = document.querySelector('[data-part="zen-pill"]')!
    expect(pill).not.toBeNull()
    expect(pill.children).toHaveLength(8)

    const buttons = within(pill as HTMLElement).getAllByRole('button')
    expect(buttons).toHaveLength(6)
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'ask pond',
      'editor',
      'attach',
      'type',
      'ground',
      'leave',
    ])
  })

  it('every item is tab-reachable: none carries the `disabled` attribute', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))

    const pill = document.querySelector('[data-part="zen-pill"]')!
    for (const button of within(pill as HTMLElement).getAllByRole('button')) {
      expect(button).not.toBeDisabled()
      expect(button).not.toHaveAttribute('tabindex', '-1')
    }
  })

  it('editor, attach, type and ground announce aria-disabled and do nothing on click or Enter', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))

    for (const name of ['editor', 'attach', 'type', 'ground']) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(button)
      fireEvent.keyDown(button, { key: 'Enter' })
      expect(button).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('ground mark (2t): the rays svg is round-capped', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))

    const ground = screen.getByRole('button', { name: 'ground' })
    expect(ground.querySelector('svg')).toHaveAttribute('stroke-linecap', 'round')
  })

  it('ask pond and leave carry no aria-disabled', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))

    expect(screen.getByRole('button', { name: 'ask pond' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('button', { name: 'leave' })).not.toHaveAttribute('aria-disabled')
  })

  it('clicking the Pond mark dispatches the composer toggle event', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))

    const handler = jest.fn()
    window.addEventListener('pond:toggle-composer', handler)
    fireEvent.click(screen.getByRole('button', { name: 'ask pond' }))
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener('pond:toggle-composer', handler)
  })

  it('the Pond mark reflects composerAsked — clicking toggles it, independent of the composer’s own open/closed state', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))

    const askPond = screen.getByRole('button', { name: 'ask pond' })
    expect(askPond).toHaveAttribute('aria-pressed', 'false')
    expect(askPond.className).not.toContain('bg-mn-text text-raw-paper')

    fireEvent.click(askPond)
    expect(askPond).toHaveAttribute('aria-pressed', 'true')
    expect(askPond.className).toContain('bg-mn-text text-raw-paper')

    // The composer's own open/closed state starts open regardless of zen and
    // can move on its own (an unresolved proposal) — only the mark's own
    // click moves the ask.
    act(() => notifyComposerOpenChange(false))
    expect(askPond).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(askPond)
    expect(askPond).toHaveAttribute('aria-pressed', 'false')
  })

  it('on ink (6q f10): the pill carries the ink-ground dark: overrides', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter on ink' }))

    expect(document.documentElement).toHaveClass('dark')

    const pill = document.querySelector('[data-part="zen-pill"]')!
    expect(pill.className).toContain('dark:border-[rgba(250,249,239,.09)]')
    expect(pill.className).toContain('dark:bg-none')
    expect(pill.className).toContain('dark:bg-[rgba(48,49,42,.9)]')
    expect(pill.className).toContain('dark:shadow-[0_20px_54px_rgba(0,0,0,.45)]')

    const dividers = pill.querySelectorAll(':scope > span')
    expect(dividers).toHaveLength(2)
    for (const divider of dividers) {
      expect(divider.className).toContain('dark:bg-[rgba(250,249,239,.14)]')
    }

    expect(screen.getByText('esc')).toHaveClass('text-mn-text-meta')
  })

  it('clicking leave ends the zen session — same exit as Esc', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    expect(document.querySelector('[data-part="zen-pill"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'leave' }))
    expect(document.querySelector('[data-part="zen-pill"]')).toBeNull()
  })
})
