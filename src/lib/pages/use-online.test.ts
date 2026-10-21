import { renderHook, act } from '@testing-library/react'
import { useOnline } from './use-online'

describe('useOnline', () => {
  it('defaults to true', () => {
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)
  })

  it('flips to false on an offline event and back to true on online', () => {
    const { result } = renderHook(() => useOnline())

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })
})
