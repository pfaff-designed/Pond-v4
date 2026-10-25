/**
 * KAN-474: the ⌘K footer's `⌘↵ new tab` hint (Ctrl Enter off Apple) joins `↵ open`
 * only while a page row is actually on screen to open that way — hidden in
 * actions-only `>` mode (no page rows ever list there) and in any state whose
 * `enterHint` already overrides `↵ open` to something else (the move picker's
 * `↵ move`), since ⏎ no longer opens anything there either.
 */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { PondCommand, type PondCommandProps } from '@/components/organisms/PondCommand'
import { PALETTE_ITEMS } from './helpers/palette-fixture'

const PATH = {
  glyph: 'ramp',
  trail: [{ title: 'life', to: { kind: 'home' as const } }],
  current: 'standups',
  role: null,
}

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

afterEach(() => jest.restoreAllMocks())

function renderPalette(props: Partial<PondCommandProps> = {}) {
  const onSelect = jest.fn()
  const onOpenChange = jest.fn()
  const utils = render(
    <PondCommand
      path={PATH}
      open
      items={PALETTE_ITEMS}
      onSelect={onSelect}
      onOpenChange={onOpenChange}
      {...props}
    />
  )
  return { ...utils, onSelect, onOpenChange }
}

const input = () => screen.getByRole('combobox', { name: 'command palette' })
const foot = () => document.querySelector('[data-part="foot"]')!

describe('⌘K footer: the `new tab` hint', () => {
  it('reads ⌘↵ new tab on a Mac, with a page row on screen (the opened frame’s recent pages)', () => {
    onPlatform('MacIntel')
    renderPalette()
    expect(foot().textContent).toContain('⌘↵ new tab')
  })

  it('reads Ctrl Enter new tab off a Mac', () => {
    onPlatform('Win32')
    renderPalette()
    expect(foot().textContent).toContain('Ctrl Enter new tab')
  })

  it('is absent in actions-only `>` mode — no page row ever lists there', () => {
    onPlatform('MacIntel')
    renderPalette()
    fireEvent.change(input(), { target: { value: '> log' } })
    expect(foot().textContent).not.toContain('new tab')
  })

  it('is absent once `enterHint` overrides `↵ open` (the move picker’s `↵ move`), even with a page row on screen', () => {
    onPlatform('MacIntel')
    renderPalette({ enterHint: '↵ move', pickMode: true })
    expect(screen.getAllByRole('option').some((o) => o.textContent?.includes('kitchen'))).toBe(
      true
    )
    expect(foot().textContent).not.toContain('new tab')
    expect(foot().textContent).toContain('↵ move')
  })
})
