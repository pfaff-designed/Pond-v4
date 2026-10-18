import { render, screen } from '@testing-library/react'
import { TrailingBlockGap } from '@/components/molecules/TrailingBlockGap'
import { TEXT_BLOCK_INSET_PX } from '@/lib/layout/surface-column'
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

  it("the ghost row's line box matches a real prose line (17.5px × 1.6), so a click moves nothing", () => {
    render(<TrailingBlockGap onClick={() => {}} />)
    const line = screen.getByTestId('trailing-block-gap').querySelector('span')!
    expect(line.className).toContain('leading-[28px]')
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
