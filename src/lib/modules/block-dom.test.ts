import { focusPageTitle } from './block-dom'

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
