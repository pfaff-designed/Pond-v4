import { activeMentionQuery } from './mention-query'

describe('activeMentionQuery', () => {
  it('is active with an empty query for a bare @ at the caret', () => {
    expect(activeMentionQuery('@', 1)).toEqual({ start: 0, query: '' })
  })

  it('narrows the query as the token is typed', () => {
    expect(activeMentionQuery('@kitch', 6)).toEqual({ start: 0, query: 'kitch' })
  })

  it('goes inactive once the caret has moved past a trailing space', () => {
    expect(activeMentionQuery('@kitch ', 7)).toBeNull()
  })

  it('is not triggered by a@b, which has no leading boundary', () => {
    expect(activeMentionQuery('a@b', 3)).toBeNull()
  })

  it('goes inactive once the caret sits before the @ itself', () => {
    expect(activeMentionQuery(' @kitch', 0)).toBeNull()
  })
})
