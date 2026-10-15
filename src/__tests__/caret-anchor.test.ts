import { caretRect, roomTowardSide, sideTowardFreeSpace } from '@/lib/layout/caret-anchor'

describe('sideTowardFreeSpace', () => {
  const caret = (top: number) => ({ top, bottom: top + 20 })

  it('stays below when the glass fits there', () => {
    expect(sideTowardFreeSpace(caret(100), 900, 500)).toBe('bottom')
  })

  it('flips above when it does not fit below and there is more room above', () => {
    expect(sideTowardFreeSpace(caret(700), 900, 500)).toBe('top')
  })

  it('stays below when neither side fits but below has more room', () => {
    expect(sideTowardFreeSpace(caret(200), 600, 500)).toBe('bottom')
  })

  it('flips above when the bound is inside the composer band, though the full viewport has room below', () => {
    // 900 tall viewport, but the composer's bound sits at 750 — caret.bottom (620) leaves only
    // 126px to the bound, not enough for a 500px glass, and less than the 580px above.
    expect(sideTowardFreeSpace(caret(600), 750, 500)).toBe('top')
  })

  it('stays below near the top of the viewport even with a composer band', () => {
    expect(sideTowardFreeSpace(caret(40), 750, 500)).toBe('bottom')
  })

  it('reproduces the existing cases when the bound is the unpublished full viewport', () => {
    expect(sideTowardFreeSpace(caret(100), 900, 500)).toBe('bottom')
    expect(sideTowardFreeSpace(caret(700), 900, 500)).toBe('top')
    expect(sideTowardFreeSpace(caret(200), 600, 500)).toBe('bottom')
  })
})

describe('roomTowardSide', () => {
  const caret = (top: number) => ({ top, bottom: top + 20 })

  it('caps the bottom side to the bound, not the full viewport', () => {
    // bound 775, caret.bottom 320 → 775 − 320 − 4 = 451.
    expect(roomTowardSide(caret(300), 775, 'bottom')).toBe(451)
  })

  it('caps the top side to the caret, regardless of the bound', () => {
    expect(roomTowardSide(caret(300), 775, 'top')).toBe(296)
  })
})

describe('caretRect', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reads a focused textarea off a mirror and leaves no mirror behind', () => {
    const root = document.createElement('div')
    const field = document.createElement('textarea')
    field.value = '/ta'
    root.append(field)
    document.body.append(root)
    field.focus()
    field.setSelectionRange(3, 3)
    const before = document.body.children.length
    const rect = caretRect(root)
    expect(rect.width).toBe(0)
    expect(rect.bottom).toBe(rect.top + rect.height)
    expect(document.body.children).toHaveLength(before)
  })

  it('falls back to the root’s own box with no caret inside it', () => {
    const root = document.createElement('div')
    document.body.append(root)
    expect(caretRect(root)).toMatchObject({ left: 0, top: 0 })
  })
})
