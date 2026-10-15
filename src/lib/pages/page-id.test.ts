import { isPageId } from './page-id'

describe('isPageId', () => {
  it('passes a real page id shape', () => {
    expect(isPageId('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true)
  })

  it('rejects a page title', () => {
    expect(isPageId('kitchen renovation')).toBe(false)
  })

  it('rejects a non-page source string', () => {
    expect(isPageId('email · j. hart')).toBe(false)
  })
})
