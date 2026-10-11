import { composerTopEdge, placeBarVertically } from '@/components/molecules/selection-bar-position'

const BAR = 40
const VIEWPORT = 800

describe('placeBarVertically', () => {
  it('sits above the selection when there is room', () => {
    expect(
      placeBarVertically({
        rect: { top: 300, bottom: 320 },
        barHeight: BAR,
        viewportHeight: VIEWPORT,
        composerTop: 700,
      })
    ).toEqual({ placement: 'above', top: 256 })
  })

  it('flips below when above would leave the top margin', () => {
    expect(
      placeBarVertically({
        rect: { top: 30, bottom: 50 },
        barHeight: BAR,
        viewportHeight: VIEWPORT,
        composerTop: 700,
      })
    ).toEqual({ placement: 'below', top: 54 })
  })

  it('stays above, held to the top margin, when below would sit under the composer', () => {
    expect(
      placeBarVertically({
        rect: { top: 30, bottom: 660 },
        barHeight: BAR,
        viewportHeight: VIEWPORT,
        composerTop: 700,
      })
    ).toEqual({ placement: 'clamped', top: 12 })
  })

  it('ignores the composer when it is hidden, flipping below into the space it left', () => {
    expect(
      placeBarVertically({
        rect: { top: 30, bottom: 660 },
        barHeight: BAR,
        viewportHeight: VIEWPORT,
        composerTop: null,
      })
    ).toEqual({ placement: 'below', top: 664 })
  })

  it('clamps when no composer is drawn and below would leave the viewport', () => {
    expect(
      placeBarVertically({
        rect: { top: 30, bottom: 780 },
        barHeight: BAR,
        viewportHeight: VIEWPORT,
        composerTop: null,
      })
    ).toEqual({ placement: 'clamped', top: 12 })
  })
})

describe('composerTopEdge', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('is null with no composer in the document', () => {
    expect(composerTopEdge()).toBeNull()
  })

  it('is null for a composer with no box, as zen leaves it', () => {
    document.body.innerHTML = '<section data-part="composer-card"></section>'
    expect(composerTopEdge()).toBeNull()
  })
})
