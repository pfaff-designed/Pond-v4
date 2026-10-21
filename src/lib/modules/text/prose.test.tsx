import { render, screen } from '@testing-library/react'
import { TrailingBlockGap } from '@/components/molecules/TrailingBlockGap'
import { TEXT_BLOCK_INSET_PX, TEXT_BLOCK_TOP_INSET_PX } from '@/lib/layout/surface-column'
import { BLOCK_ROW_GAP_PX } from '@/lib/modules/layout-rows'
import {
  HOVER_GHOST_CLASS,
  MACHINE_HINT_FRAGMENT,
  TEXT_PROSE_CLASS,
  UNTOUCHED_HINT_CLASS,
} from './prose'

describe('MACHINE_HINT_FRAGMENT — one home for the machine-register placeholder type', () => {
  const utilities = MACHINE_HINT_FRAGMENT.split(' ')

  it('the focused empty prose line carries every one of the fragment values', () => {
    for (const utility of utilities) expect(TEXT_PROSE_CLASS).toContain(`:before:${utility}`)
  })

  it("the untouched-page hint carries the same fragment, not a restated one", () => {
    for (const utility of utilities) expect(UNTOUCHED_HINT_CLASS).toContain(`:before:${utility}`)
  })

  it('the hover-ghost rule (an already-empty last line, hovered) carries the same fragment too', () => {
    for (const utility of utilities) expect(HOVER_GHOST_CLASS).toContain(`:before:${utility}`)
  })

  it('the trailing-gap ghost row imports the fragment verbatim, not a restated string', () => {
    render(<TrailingBlockGap onClick={() => {}} />)
    const line = screen.getByTestId('trailing-block-gap').querySelector('span')!
    expect(line.className).toContain(MACHINE_HINT_FRAGMENT)
  })

  it('the ghost text carries the same box model as the real `::before` (pointer-events-none float-left h-0), not a centred line', () => {
    render(<TrailingBlockGap onClick={() => {}} />)
    const line = screen.getByTestId('trailing-block-gap').querySelector('span')!
    expect(line.className).toContain('pointer-events-none')
    expect(line.className).toContain('float-left')
    expect(line.className).toContain('h-0')
  })

  it('the gap insets the ghost row by the text column\'s real inset, not a restated 4', () => {
    render(<TrailingBlockGap onClick={() => {}} />)
    const gap = screen.getByTestId('trailing-block-gap')
    expect(gap.style.paddingInline).toBe(`${TEXT_BLOCK_INSET_PX}px`)
  })
})

describe('the ghost row sits exactly where the real focused line will (KAN-345 fix: no visible drop on click)', () => {
  it('the fragment carries its own line-height, not a size tied to the prose font', () => {
    expect(MACHINE_HINT_FRAGMENT).toContain('leading-[1.6]')
    expect(MACHINE_HINT_FRAGMENT).not.toContain('leading-[28px]')
  })

  it('every restating ::before rule carries the same leading as the fragment, not its own', () => {
    expect(TEXT_PROSE_CLASS).toContain(':before:leading-[1.6]')
    expect(UNTOUCHED_HINT_CLASS).toContain(':before:leading-[1.6]')
    expect(HOVER_GHOST_CLASS).toContain(':before:leading-[1.6]')
  })

  it("the rendered ghost span's line-height comes from the fragment alone, with no restated 28px", () => {
    render(<TrailingBlockGap onClick={() => {}} />)
    const line = screen.getByTestId('trailing-block-gap').querySelector('span')!
    expect(line.className).toContain('leading-[1.6]')
    expect(line.className).not.toContain('leading-[28px]')
  })

  it("the ghost row's top offset reads the text wrapper's own top inset, not a restated 2", () => {
    render(<TrailingBlockGap onClick={() => {}} />)
    const gap = screen.getByTestId('trailing-block-gap')
    expect(gap.style.paddingTop).toBe(`${BLOCK_ROW_GAP_PX + TEXT_BLOCK_TOP_INSET_PX}px`)
  })
})
