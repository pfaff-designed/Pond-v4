/**
 * The breadcrumb chip and the opener's `aria-keyshortcuts` read the platform at
 * render time, like every other key hint (KAN-396).
 */

import React from 'react'
import { render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

import { PondCommand } from '@/components/organisms/PondCommand'

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

afterEach(() => jest.restoreAllMocks())

function renderCommand() {
  return render(
    <PondCommand
      path={{ glyph: 'ramp', trail: ['life'], current: 'health', role: null }}
      open={false}
      items={[]}
      onSelect={jest.fn()}
      onOpenChange={jest.fn()}
    />
  )
}

describe('PondCommand — the server render agrees with the first client render, then corrects on mount', () => {
  it('SSRs ⌘K / Meta+K under Win32, and the mounted client corrects to Ctrl K / Control+K', () => {
    onPlatform('Win32')
    const html = renderToString(
      <PondCommand
        path={{ glyph: 'ramp', trail: ['life'], current: 'health', role: null }}
        open={false}
        items={[]}
        onSelect={jest.fn()}
        onOpenChange={jest.fn()}
      />
    )

    const ssr = document.createElement('div')
    ssr.innerHTML = html
    const ssrChip = ssr.querySelector<HTMLElement>('[data-part="chip"]')!
    const ssrOpener = ssr.querySelector<HTMLElement>('[data-part="opener"]')!
    expect(ssrChip.textContent).toBe('⌘K')
    expect(ssrOpener.getAttribute('aria-keyshortcuts')).toBe('Meta+K')

    renderCommand()
    const chip = document.querySelector<HTMLElement>('[data-part="chip"]')!
    const opener = document.querySelector<HTMLElement>('[data-part="opener"]')!
    expect(chip.textContent).toBe('Ctrl K')
    expect(opener.getAttribute('aria-keyshortcuts')).toBe('Control+K')
  })
})

describe('PondCommand — the chip and the opener read the platform', () => {
  it('shows Ctrl K off a Mac', () => {
    onPlatform('Win32')
    renderCommand()
    const chip = document.querySelector<HTMLElement>('[data-part="chip"]')!
    const opener = document.querySelector<HTMLElement>('[data-part="opener"]')!
    expect(chip.textContent).toBe('Ctrl K')
    expect(opener.getAttribute('aria-keyshortcuts')).toBe('Control+K')
  })

  it('shows ⌘K on a Mac', () => {
    onPlatform('MacIntel')
    renderCommand()
    const chip = document.querySelector<HTMLElement>('[data-part="chip"]')!
    const opener = document.querySelector<HTMLElement>('[data-part="opener"]')!
    expect(chip.textContent).toBe('⌘K')
    expect(opener.getAttribute('aria-keyshortcuts')).toBe('Meta+K')
  })
})
