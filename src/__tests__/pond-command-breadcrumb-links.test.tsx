/**
 * KAN-472: each ancestor breadcrumb crumb with a page target is its own
 * tabbable link that navigates on a plain click, leaves a modified click's
 * native new-tab/new-window behaviour unprevented, and never also opens the
 * palette. A `home` target (life's reserved-home root) links to the pond's
 * root (`workspaceUrl(null)`). A crumb with `to: null` (a virtual trail) stays
 * plain text, same as before this ticket.
 */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { PondCommand, type PondCommandProps } from '@/components/organisms/PondCommand'
import { workspaceUrl } from '@/lib/pages/nav'
import { PALETTE_ITEMS } from './helpers/palette-fixture'

const HOUSE = { id: 'house-1', type: 'page', title: 'house' }

const PATH = {
  glyph: 'ramp',
  trail: [
    { title: 'life', to: { kind: 'home' as const } },
    { title: 'house', to: { kind: 'page' as const, node: HOUSE } },
    { title: 'change log', to: null },
  ],
  current: 'gutters',
  role: null,
}

function renderCommand(props: Partial<PondCommandProps> = {}) {
  const onSelect = jest.fn()
  const onOpenChange = jest.fn()
  const onNavigate = jest.fn()
  const utils = render(
    <PondCommand
      path={PATH}
      open={false}
      items={PALETTE_ITEMS}
      onSelect={onSelect}
      onOpenChange={onOpenChange}
      onNavigate={onNavigate}
      {...props}
    />
  )
  return { ...utils, onSelect, onOpenChange, onNavigate }
}

describe('breadcrumb ancestors with a navigable target are links; `to: null` crumbs stay text', () => {
  it('a linkable ancestor is a tabbable link to its workspace URL', () => {
    renderCommand()
    const link = screen.getByRole('link', { name: 'house' })
    expect(link).toHaveAttribute('href', workspaceUrl(HOUSE))
    expect(screen.queryByRole('link', { name: 'change log' })).toBeNull()
    expect(screen.getByText('change log').tagName).toBe('SPAN')
  })

  it('a home-target crumb (life’s reserved-home root) links to the pond’s root', () => {
    renderCommand()
    const link = screen.getByRole('link', { name: 'life' })
    expect(link).toHaveAttribute('href', workspaceUrl(null))
  })

  it('a plain click navigates and does not open the palette', () => {
    const { onNavigate, onOpenChange } = renderCommand()
    const link = screen.getByRole('link', { name: 'house' })
    const notPrevented = fireEvent.click(link)
    expect(notPrevented).toBe(false) // preventDefault() was called
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'page', node: HOUSE })
    expect(onOpenChange).not.toHaveBeenCalledWith(true)
  })

  it('a metaKey click leaves the native new-tab behaviour unprevented, does not navigate, and never opens the palette', () => {
    const { onNavigate, onOpenChange } = renderCommand()
    const link = screen.getByRole('link', { name: 'house' })
    const notPrevented = fireEvent.click(link, { metaKey: true })
    expect(notPrevented).toBe(true) // preventDefault() was NOT called — the browser opens its own tab
    expect(onNavigate).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(true)
  })

  it('an altKey click leaves the native download behaviour unprevented, does not navigate, and never opens the palette', () => {
    const { onNavigate, onOpenChange } = renderCommand()
    const link = screen.getByRole('link', { name: 'house' })
    const notPrevented = fireEvent.click(link, { altKey: true })
    expect(notPrevented).toBe(true) // preventDefault() was NOT called — the browser downloads
    expect(onNavigate).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(true)
  })
})

describe('the opener button keeps an accessible name now the path moved out of it', () => {
  it('is labelled by the current crumb', () => {
    renderCommand()
    expect(screen.getByRole('button', { name: 'gutters' })).toHaveAttribute('data-part', 'opener')
  })
})
