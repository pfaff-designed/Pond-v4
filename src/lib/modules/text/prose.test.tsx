import { render, screen } from '@testing-library/react'
import { TrailingBlockGap } from '@/components/molecules/TrailingBlockGap'
import { TEXT_BLOCK_INSET_PX, TEXT_BLOCK_TOP_INSET_PX } from '@/lib/layout/surface-column'
import { BLOCK_ROW_GAP_PX } from '@/lib/modules/layout-rows'
import { ZEN_PROSE_CLASS } from '@/lib/layout/zen'
import {
  HOVER_GHOST_CLASS,
  MACHINE_HINT_FRAGMENT,
  TEXT_PROSE_CLASS,
  UNTOUCHED_HINT_CLASS,
} from './prose'

describe('MACHINE_HINT_FRAGMENT — one home for the machine-register placeholder type', () => {
  // The `max-md:` variant prefixes the whole selector, not the `before:` utility,
  // so it can't be checked by the same `:before:${utility}` substring as the
  // rest of the fragment's values. The fragment's own line-height utility carries
  // a `--prose-line` fallback (a bare element, with nothing above it to set the
  // custom property, needs one); the three restating `::before` rules sit inside
  // an element that already has it, so they read the bare `var(--prose-line)`
  // instead — covered on its own below.
  const utilities = MACHINE_HINT_FRAGMENT.split(' ').filter(
    (utility) => !utility.startsWith('max-md:') && !utility.startsWith('leading-[')
  )

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

describe('the hint reads the line\'s own --prose-line, not a line box restated as a px literal (KAN-345/KAN-535)', () => {
  it('the fragment reads the custom property, falling back to the plain prose line\'s own computed box', () => {
    expect(MACHINE_HINT_FRAGMENT).toContain('leading-[var(--prose-line,calc(17.5px*1.6))]')
    expect(MACHINE_HINT_FRAGMENT).toContain('max-md:leading-[var(--prose-line,calc(17px*1.6))]')
    expect(MACHINE_HINT_FRAGMENT).not.toContain('leading-[1.6]')
  })

  it('every restating ::before rule reads the same custom property as the fragment, not its own px literal', () => {
    for (const rule of [TEXT_PROSE_CLASS, UNTOUCHED_HINT_CLASS, HOVER_GHOST_CLASS]) {
      expect(rule).toContain(':before:leading-[var(--prose-line)]')
      expect(rule).not.toContain(':before:leading-[28px]')
      expect(rule).not.toContain(':before:leading-[1.6]')
    }
  })

  it("the rendered ghost span's line-height comes from the fragment alone, matching the prose line's box", () => {
    render(<TrailingBlockGap onClick={() => {}} />)
    const line = screen.getByTestId('trailing-block-gap').querySelector('span')!
    expect(line.className).toContain('leading-[var(--prose-line,calc(17.5px*1.6))]')
    expect(line.className).not.toContain('leading-[1.6]')
  })

  it("the ghost row's top offset reads the text wrapper's own top inset, not a restated 2", () => {
    render(<TrailingBlockGap onClick={() => {}} />)
    const gap = screen.getByTestId('trailing-block-gap')
    expect(gap.style.paddingTop).toBe(`${BLOCK_ROW_GAP_PX + TEXT_BLOCK_TOP_INSET_PX}px`)
  })

  it('--prose-line is set on the prose root (17.5×1.6, 17×1.6 under max-md) and on the blockquote (19×1.6, 18×1.6)', () => {
    expect(TEXT_PROSE_CLASS).toContain('[--prose-line:calc(17.5px*1.6)]')
    expect(TEXT_PROSE_CLASS).toContain('max-md:[--prose-line:calc(17px*1.6)]')
    expect(TEXT_PROSE_CLASS).toContain('[&_blockquote]:[--prose-line:calc(19px*1.6)]')
    expect(TEXT_PROSE_CLASS).toContain('max-md:[&_blockquote]:[--prose-line:calc(18px*1.6)]')
  })

  it('zen sets --prose-line from its own scaled prose size, not the plain prose root\'s', () => {
    expect(ZEN_PROSE_CLASS).toContain('[--prose-line:calc(var(--zen-prose)*1.7)]')
  })
})
