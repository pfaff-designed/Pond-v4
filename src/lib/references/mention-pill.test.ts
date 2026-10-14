import { mentionPillRuns } from './mention-pill'

describe('mentionPillRuns', () => {
  it('finds the @<title> run for a matching reference title, through trailing punctuation', () => {
    const value = 'what is actually blocking @kitchen renovation?'
    expect(mentionPillRuns(value, ['kitchen renovation'])).toEqual([
      { start: 26, end: value.length - 1 },
    ])
  })

  it('does not paint a pill for an @word with no matching title', () => {
    expect(mentionPillRuns('ping @someone please', ['kitchen renovation'])).toEqual([])
  })

  it('requires a leading boundary, like activeMentionQuery', () => {
    expect(mentionPillRuns('a@kitchen renovation', ['kitchen renovation'])).toEqual([])
  })

  it('does not match a longer word the title is only a prefix of', () => {
    expect(mentionPillRuns('@kitchen renovations', ['kitchen renovation'])).toEqual([])
  })
})
