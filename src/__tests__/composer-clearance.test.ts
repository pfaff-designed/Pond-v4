import { composerBottomBound, COMPOSER_CLEARANCE_VAR } from '@/lib/layout/composer-clearance'
import { roomTowardSide } from '@/lib/layout/caret-anchor'

const shellEndingAt = (bottom: number, footprintPx?: string): HTMLElement => {
  const shell = document.createElement('div')
  shell.setAttribute('data-part', 'shell')
  if (footprintPx) shell.style.setProperty(COMPOSER_CLEARANCE_VAR, footprintPx)
  shell.getBoundingClientRect = () => ({ bottom } as DOMRect)
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
