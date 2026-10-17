/**
 * KAN-400 fix round 3 — zen hides the card (`ZenComposerChrome`) but the
 * shell keeps publishing the card's last footprint on purpose, so content
 * padding doesn't jump. A scrolling caret must NOT clear that stale
 * footprint instead: nothing is drawn there once zen hides the card, the
 * zen pill is, lower down. `TerminalDrawer` publishes a second var for this.
 */

import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}))

import { TerminalDrawer } from '@/components/molecules/TerminalDrawer'
import { useZen, ZenProvider } from '@/lib/layout/zen'
import {
  COMPOSER_CLEARANCE_GAP,
  COMPOSER_CLEARANCE_VAR,
  COMPOSER_SCROLL_CLEARANCE_VAR,
  ZEN_PILL_FOOTPRINT_PX,
  composerClearanceMarginPx,
} from '@/lib/layout/composer-clearance'

const shell = () => document.querySelector('[data-part="shell"]') as HTMLElement

const Entered = () => {
  const { zen, enterZen, askComposer } = useZen()
  return (
    <>
      <button onClick={() => enterZen({ onInk: false })}>enter zen</button>
      <button onClick={() => askComposer()}>ask composer</button>
      <div data-part="shell">
        <TerminalDrawer collapsed={false} zen={zen !== null} onExpand={() => {}} footer={null}>
          {null}
        </TerminalDrawer>
      </div>
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

describe('TerminalDrawer — the scroll clearance var in zen (KAN-400)', () => {
  it('zen on, the card not asked: the scroll var is the zen pill footprint, not the hidden card’s', () => {
    render(<Host />)
    // jsdom does no layout — give the shell the height a real browser already
    // would have, so `composerClearanceMarginPx`'s clamp has a real band to
    // clamp against instead of `0`. No assertion's expected value changes.
    shell().getBoundingClientRect = () => ({ height: 800 }) as DOMRect
    fireEvent.click(screen.getByRole('button', { name: 'enter zen' }))

    expect(shell().style.getPropertyValue(COMPOSER_SCROLL_CLEARANCE_VAR)).toBe(
      `${ZEN_PILL_FOOTPRINT_PX}px`
    )
    expect(composerClearanceMarginPx()).toBe(ZEN_PILL_FOOTPRINT_PX + COMPOSER_CLEARANCE_GAP)
  })

  it('zen on, the card asked: the scroll var is the card’s own footprint, same as off', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter zen' }))
    fireEvent.click(screen.getByRole('button', { name: 'ask composer' }))

    expect(shell().style.getPropertyValue(COMPOSER_SCROLL_CLEARANCE_VAR)).toBe(
      shell().style.getPropertyValue(COMPOSER_CLEARANCE_VAR)
    )
  })

  it('zen off: the scroll var equals the content-padding footprint var', () => {
    render(<Host />)

    expect(shell().style.getPropertyValue(COMPOSER_SCROLL_CLEARANCE_VAR)).toBe(
      shell().style.getPropertyValue(COMPOSER_CLEARANCE_VAR)
    )
  })
})
