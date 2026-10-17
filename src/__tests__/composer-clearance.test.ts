import {
  composerBottomBound,
  composerClearanceMarginPx,
  composerScrollPadding,
  COMPOSER_CLEARANCE_GAP,
  COMPOSER_CLEARANCE_VAR,
  COMPOSER_MIN_CARET_BAND,
  COMPOSER_REST_HEIGHT,
  COMPOSER_TOP_CLEARANCE,
  composerFootprintPx,
} from '@/lib/layout/composer-clearance'
import { roomTowardSide } from '@/lib/layout/caret-anchor'

const shellEndingAt = (bottom: number, footprintPx?: string, height = 2000): HTMLElement => {
  const shell = document.createElement('div')
  shell.setAttribute('data-part', 'shell')
  if (footprintPx) shell.style.setProperty(COMPOSER_CLEARANCE_VAR, footprintPx)
  shell.getBoundingClientRect = () => ({ bottom, height } as DOMRect)
  document.body.appendChild(shell)
  return shell
}

describe('composerBottomBound', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it("subtracts the published footprint from the shell's own bottom edge", () => {
    shellEndingAt(900, '125px')

    expect(composerBottomBound(900)).toBe(775)
  })

  it('falls back to the full viewport when nothing is published', () => {
    expect(composerBottomBound(900)).toBe(900)
  })

  it('falls back to the full viewport when the shell has no published footprint', () => {
    shellEndingAt(900)

    expect(composerBottomBound(900)).toBe(900)
  })

  it('measures from the shell\'s own bottom, not the raw viewport, when they differ by a pixel', () => {
    shellEndingAt(899, '340px')

    expect(composerBottomBound(900)).toBe(559)
  })

  it('keeps a glass opened below at or above the shell-measured bound', () => {
    shellEndingAt(899, '340px')
    const bound = composerBottomBound(900)
    const caret = { top: 500, bottom: 520 }

    const room = roomTowardSide(caret, bound, 'bottom')

    expect(caret.bottom + room).toBeLessThanOrEqual(559)
  })
})

describe('composerClearanceMarginPx', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns the published footprint plus the clearance gap', () => {
    shellEndingAt(900, '125px')

    expect(composerClearanceMarginPx()).toBe(125 + COMPOSER_CLEARANCE_GAP)
  })

  it('falls back to the card-at-rest footprint plus the gap when nothing has published', () => {
    expect(composerClearanceMarginPx()).toBe(composerFootprintPx(COMPOSER_REST_HEIGHT) + COMPOSER_CLEARANCE_GAP)
  })

  it.each`
    shellHeight | published  | expected
    ${800}      | ${'752px'} | ${700}
    ${800}      | ${'416px'} | ${440}
    ${800}      | ${undefined} | ${149}
    ${100}      | ${'416px'} | ${0}
    ${0}        | ${'416px'} | ${0}
    ${50}       | ${'416px'} | ${0}
  `('clamps to the shell height minus the top clearance and a caret band ($shellHeight, $published)', ({ shellHeight, published, expected }) => {
    shellEndingAt(800, published, shellHeight)

    expect(composerClearanceMarginPx()).toBe(expected)
  })

  it('leaves the margin unclamped against the shell\'s default (unconstrained) height', () => {
    shellEndingAt(800, '416px')

    expect(composerClearanceMarginPx()).toBe(440)
  })
})

describe('composerScrollPadding', () => {
  it('clamps the bottom padding against the scrollport height, built from the same constants', () => {
    const { scrollPaddingBottom } = composerScrollPadding()

    expect(scrollPaddingBottom.startsWith('min(')).toBe(true)
    expect(scrollPaddingBottom).toContain(`100% - ${COMPOSER_TOP_CLEARANCE + COMPOSER_MIN_CARET_BAND}px`)
  })
})
