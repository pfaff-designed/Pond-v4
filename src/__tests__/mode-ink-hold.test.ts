/**
 * The ink hold (`lib/theme/mode`): `zen, on ink` sets the ground on ink without
 * touching the person's mode. Each hold releases only itself, so a stale release
 * never drops a newer hold; the person's choice applies when the last one lifts.
 */

import { act, renderHook } from '@testing-library/react'

import { holdInkGround, useMode } from '@/lib/theme/mode'

const html = document.documentElement
const ink = () => html.classList.contains('dark')

afterEach(() => {
  html.classList.remove('dark')
  window.localStorage.clear()
})

describe('holdInkGround', () => {
  it('a stale release leaves a newer hold on ink; the last release gives the ground back', () => {
    const releaseA = holdInkGround()
    const releaseB = holdInkGround()
    expect(ink()).toBe(true)

    releaseA()
    expect(ink()).toBe(true)

    releaseB()
    expect(ink()).toBe(false)
  })

  it('a release called twice releases once', () => {
    const releaseA = holdInkGround()
    releaseA()
    const releaseB = holdInkGround()
    releaseA()
    expect(ink()).toBe(true)
    releaseB()
    expect(ink()).toBe(false)
  })

  it('the person’s mode reads and switches beneath the holds, and applies when they lift', () => {
    const { result } = renderHook(() => useMode())
    let releaseA = () => {}
    let releaseB = () => {}
    act(() => {
      releaseA = holdInkGround()
      releaseB = holdInkGround()
    })
    expect(result.current.mode).toBe('light')

    act(() => result.current.toggleMode())
    expect(result.current.mode).toBe('dark')
    expect(window.localStorage.getItem('pond:mode')).toBe('dark')

    act(() => releaseA())
    act(() => result.current.toggleMode())
    expect(result.current.mode).toBe('light')
    expect(ink()).toBe(true)

    act(() => releaseB())
    expect(ink()).toBe(false)
    expect(result.current.mode).toBe('light')
  })
})

describe('transition suppression', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('suppresses transitions for one frame around a flip, then lifts it', async () => {
    const { result } = renderHook(() => useMode())

    await act(async () => result.current.toggleMode())
    expect(html.hasAttribute('data-theme-switching')).toBe(true)

    act(() => jest.runOnlyPendingTimers())
    expect(html.hasAttribute('data-theme-switching')).toBe(true)

    act(() => jest.runOnlyPendingTimers())
    expect(html.hasAttribute('data-theme-switching')).toBe(false)
  })

  it('cancels a stale flip’s pending frames so an overlapping second flip does not fade early', async () => {
    const { result } = renderHook(() => useMode())

    await act(async () => result.current.toggleMode())
    act(() => jest.runOnlyPendingTimers())

    await act(async () => result.current.toggleMode())
    act(() => jest.runOnlyPendingTimers())
    expect(html.hasAttribute('data-theme-switching')).toBe(true)

    act(() => jest.runOnlyPendingTimers())
    expect(html.hasAttribute('data-theme-switching')).toBe(false)
  })

  it('suppresses transitions around an ink hold and its release too', () => {
    let release = () => {}
    act(() => {
      release = holdInkGround()
    })
    expect(html.hasAttribute('data-theme-switching')).toBe(true)
    act(() => jest.runAllTimers())
    expect(html.hasAttribute('data-theme-switching')).toBe(false)

    act(() => release())
    expect(html.hasAttribute('data-theme-switching')).toBe(true)
    act(() => jest.runAllTimers())
    expect(html.hasAttribute('data-theme-switching')).toBe(false)
  })
})
