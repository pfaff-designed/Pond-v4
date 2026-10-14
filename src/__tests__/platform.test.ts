/**
 * `src/lib/platform.ts`.
 */

import { isApplePlatform } from '@/lib/platform'

describe('isApplePlatform', () => {
  const platform = (value: string) =>
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(value)

  afterEach(() => jest.restoreAllMocks())

  it('is true on a Mac', () => {
    platform('MacIntel')
    expect(isApplePlatform()).toBe(true)
  })

  it('is false on Windows and Linux', () => {
    platform('Win32')
    expect(isApplePlatform()).toBe(false)
  })
})
