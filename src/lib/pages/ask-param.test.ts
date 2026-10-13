import { readAskParam, urlWithoutAsk } from './ask-param'

describe('readAskParam', () => {
  it('returns the carried text', () => {
    expect(readAskParam(new URLSearchParams('ask=plan%20a%20garden'))).toBe('plan a garden')
  })

  it('returns null when there is no ask param', () => {
    expect(readAskParam(new URLSearchParams('pond=life'))).toBeNull()
  })
})

describe('urlWithoutAsk', () => {
  it('strips ask and keeps the pathname bare when nothing else is left', () => {
    expect(urlWithoutAsk('/workspace', new URLSearchParams('ask=hello'))).toBe('/workspace')
  })

  it('keeps every other param, in order', () => {
    expect(urlWithoutAsk('/workspace', new URLSearchParams('nodeId=1&ask=hello&pond=life'))).toBe(
      '/workspace?nodeId=1&pond=life',
    )
  })

  it('is a no-op when there is no ask param', () => {
    expect(urlWithoutAsk('/workspace', new URLSearchParams('pond=life'))).toBe(
      '/workspace?pond=life',
    )
  })
})
