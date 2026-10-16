import { checkFeedbackRateLimit } from './rate-limit'

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('checkFeedbackRateLimit', () => {
  it('allows 10 reports, blocks the 11th, then allows again once the oldest ages out of the hour', () => {
    const userId = 'user-1'

    for (let i = 0; i < 10; i++) {
      expect(checkFeedbackRateLimit(userId)).toBe(true)
    }

    expect(checkFeedbackRateLimit(userId)).toBe(false)

    jest.advanceTimersByTime(60 * 60 * 1000 + 1)

    expect(checkFeedbackRateLimit(userId)).toBe(true)
  })
})
