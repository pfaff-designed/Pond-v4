/**
 * KAN-474: ⌘↵ (Ctrl+↵ off Apple) on the active **page** row passes
 * `onSelect` a second argument, `{ newTab: true }`, so the host can open the
 * row in a new tab instead of navigating in-app. Plain ⏎ is unchanged — one
 * argument, exactly as KAN-449's existing contract already proves
 * (`command-palette.test.tsx`'s "↓↓↵ opens the third row"). Every row that
 * isn't a page ignores the modifier, same as plain ⏎.
 */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { PondCommand, type PondCommandProps } from '@/components/organisms/PondCommand'
import { PALETTE_ITEMS, paletteItemsFor } from './helpers/palette-fixture'

const PATH = {
  glyph: 'ramp',
  trail: [{ title: 'life', to: { kind: 'home' as const } }],
  current: 'standups',
  role: null,
}

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

describe('⌘K: ⌘↵/Ctrl+↵ on a page row asks the host to open it in a new tab', () => {
  it('metaKey+Enter on the active page row calls onSelect with { newTab: true }', () => {
    const { onSelect } = renderPalette()
    fireEvent.keyDown(input(), { key: 'Enter', metaKey: true })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'kitchen' }), {
      newTab: true,
    })
  })

  it('ctrlKey+Enter (Windows/Linux) does the same', () => {
    const { onSelect } = renderPalette()
    fireEvent.keyDown(input(), { key: 'Enter', ctrlKey: true })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'kitchen' }), {
      newTab: true,
    })
  })

  it('a plain Enter still calls onSelect with one argument — the newTab contract never touches it', () => {
    const { onSelect } = renderPalette()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'kitchen' }))
    expect(onSelect.mock.calls[0]).toHaveLength(1)
  })

  it('metaKey+Enter on an in-pages block row also calls onSelect with { newTab: true } (KAN-474)', () => {
    const { onSelect } = renderPalette({ items: paletteItemsFor('second fix') })
    fireEvent.change(input(), { target: { value: 'second fix' } })
    fireEvent.keyDown(input(), { key: 'Enter', metaKey: true })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'block' }), {
      newTab: true,
    })
  })

  it('metaKey+Enter on an action row is ignored, same as plain Enter', () => {
    const { onSelect } = renderPalette()
    fireEvent.change(input(), { target: { value: '> log' } })
    fireEvent.keyDown(input(), { key: 'Enter', metaKey: true })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'action' }))
    expect(onSelect.mock.calls[0]).toHaveLength(1)
  })
})
