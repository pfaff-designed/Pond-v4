import { blockDomId, focusPageTitle, scrollToBlock } from './block-dom'

describe('focusPageTitle', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function mountTitle(value: string) {
    const el = document.createElement('textarea')
    el.setAttribute('data-pond-page-title', '')
    el.value = value
    document.body.appendChild(el)
    return el
  }

  it('defaults to the end of the value', () => {
    const el = mountTitle('kitchen renovation')
    focusPageTitle()
    expect(document.activeElement).toBe(el)
    expect(el.selectionStart).toBe(el.value.length)
    expect(el.selectionEnd).toBe(el.value.length)
  })

  it("places the caret at 'end' when asked explicitly", () => {
    const el = mountTitle('kitchen renovation')
    focusPageTitle('end')
    expect(el.selectionStart).toBe(el.value.length)
    expect(el.selectionEnd).toBe(el.value.length)
  })

  it("places the caret at 'start' when asked", () => {
    const el = mountTitle('kitchen renovation')
    focusPageTitle('start')
    expect(document.activeElement).toBe(el)
    expect(el.selectionStart).toBe(0)
    expect(el.selectionEnd).toBe(0)
  })

  it('no-ops when no title element is mounted', () => {
    expect(() => focusPageTitle()).not.toThrow()
  })
})

describe('scrollToBlock', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    jest.useRealTimers()
  })

  function mountBlock(id: string) {
    const el = document.createElement('div')
    el.id = blockDomId(id)
    el.scrollIntoView = jest.fn()
    document.body.appendChild(el)
    return el
  }

  it('defaults to centered and highlighted', () => {
    jest.useFakeTimers()
    const el = mountBlock('b1')
    scrollToBlock('b1')
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(el.classList.contains('ring-2')).toBe(true)
    jest.advanceTimersByTime(1200)
    expect(el.classList.contains('ring-2')).toBe(false)
  })

  it("scrolls to 'start' with no highlight when asked (the TOC's entries)", () => {
    const el = mountBlock('b2')
    scrollToBlock('b2', { block: 'start', highlight: false })
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(el.classList.contains('ring-2')).toBe(false)
  })

  it('no-ops when the block is not mounted', () => {
    expect(() => scrollToBlock('missing')).not.toThrow()
  })
})
