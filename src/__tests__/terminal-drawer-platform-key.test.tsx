/**
 * The composer tab's ⌘J hint and the opener's `aria-keyshortcuts` read the
 * platform at render time, like every other key hint (KAN-396).
 */

import React from 'react'
import { render } from '@testing-library/react'

import { TerminalDrawer } from '@/components/molecules/TerminalDrawer'

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

afterEach(() => jest.restoreAllMocks())

function renderCollapsedTab() {
  return render(
    <TerminalDrawer collapsed onExpand={jest.fn()} footer={null}>
      {null}
    </TerminalDrawer>
  )
}

describe('TerminalDrawer — the collapsed tab reads the platform', () => {
  it('shows Ctrl J off a Mac', () => {
    onPlatform('Win32')
    renderCollapsedTab()
    const hint = document.querySelector<HTMLElement>('[data-part="tab-key"]')!
    const opener = document.querySelector<HTMLButtonElement>('button')!
    expect(hint.textContent).toBe('Ctrl J')
    expect(opener.getAttribute('aria-keyshortcuts')).toBe('Control+J')
  })

  it('shows ⌘J on a Mac', () => {
    onPlatform('MacIntel')
    renderCollapsedTab()
    const hint = document.querySelector<HTMLElement>('[data-part="tab-key"]')!
    const opener = document.querySelector<HTMLButtonElement>('button')!
    expect(hint.textContent).toBe('⌘J')
    expect(opener.getAttribute('aria-keyshortcuts')).toBe('Meta+J')
  })
})
