import { consumeTitleFocus, requestTitleFocus } from './title-focus'

describe('title-focus', () => {
  it('claims a request for the page it names', () => {
    requestTitleFocus('page-1')
    expect(consumeTitleFocus('page-1')).toBe(true)
  })

  it('is false for every id once claimed once', () => {
    requestTitleFocus('page-1')
    consumeTitleFocus('page-1')
    expect(consumeTitleFocus('page-1')).toBe(false)
  })

  it('a new request replaces an older pending one — the old id never steals focus later', () => {
    requestTitleFocus('page-1')
    requestTitleFocus('page-2')
    expect(consumeTitleFocus('page-1')).toBe(false)
    expect(consumeTitleFocus('page-2')).toBe(true)
  })
})
