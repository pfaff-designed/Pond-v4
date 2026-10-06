import { caretRect, sideTowardFreeSpace } from '@/lib/layout/caret-anchor'

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
