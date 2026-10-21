import { nextRetryDelayMs } from './save-retry'

describe('nextRetryDelayMs', () => {
  it('backs off 2s, 4s, 8s for the first three retries', () => {
    expect(nextRetryDelayMs(0)).toBe(2000)
    expect(nextRetryDelayMs(1)).toBe(4000)
    expect(nextRetryDelayMs(2)).toBe(8000)
  })

  it('caps at 30s from the fourth retry on', () => {
    expect(nextRetryDelayMs(3)).toBe(30000)
    expect(nextRetryDelayMs(4)).toBe(30000)
    expect(nextRetryDelayMs(100)).toBe(30000)
  })
})
