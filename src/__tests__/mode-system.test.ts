/**
 * `MODE_BOOT_SCRIPT` (`lib/theme/mode-boot`): with nothing stored the boot
 * script follows the OS, not paper-by-default. `useMode` (`lib/theme/mode`)
 * keeps following the OS live while the stored preference is `system`, and
 * `toggleMode`'s explicit write ends that following.
 */

import { act, renderHook } from '@testing-library/react'

import { MODE_BOOT_SCRIPT } from '@/lib/theme/mode-boot'
import { holdInkGround, useMode } from '@/lib/theme/mode'

const html = document.documentElement

const mockMatchMedia = (dark: boolean) => {
  let matches = dark
  const listeners = new Set<(event: { matches: boolean }) => void>()
  window.matchMedia = jest.fn().mockReturnValue({
    get matches() {
      return matches
    },
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      listeners.delete(listener),
  }) as unknown as typeof window.matchMedia
  return {
    fireChange: (next: boolean) => {
      matches = next
      listeners.forEach((listener) => listener({ matches: next }))
    },
  }
}

const runBootScript = () => new Function(MODE_BOOT_SCRIPT)()

afterEach(() => {
  html.classList.remove('dark')
  window.localStorage.clear()
})

describe('MODE_BOOT_SCRIPT', () => {
  it('applies .dark when nothing is stored and the OS prefers dark', () => {
    mockMatchMedia(true)
    runBootScript()
    expect(html.classList.contains('dark')).toBe(true)
  })

  it('leaves .dark off when nothing is stored and the OS prefers light', () => {
    mockMatchMedia(false)
    runBootScript()
    expect(html.classList.contains('dark')).toBe(false)
  })
})

describe('followSystem is shared across subscribers', () => {
  it('flips .dark once for two useMode subscribers on one OS change', () => {
    const { fireChange } = mockMatchMedia(false)
    const toggleSpy = jest.spyOn(DOMTokenList.prototype, 'toggle')
    const first = renderHook(() => useMode())
    const second = renderHook(() => useMode())

    act(() => fireChange(true))

    expect(toggleSpy).toHaveBeenCalledTimes(1)
    expect(first.result.current.mode).toBe('dark')
    expect(second.result.current.mode).toBe('dark')

    toggleSpy.mockRestore()
  })

  it('updates what an ink hold releases to when the OS changes while held in system', () => {
    const { fireChange } = mockMatchMedia(false)
    const { result } = renderHook(() => useMode())
    expect(result.current.mode).toBe('light')

    let release = () => {}
    act(() => {
      release = holdInkGround()
    })
    expect(html.classList.contains('dark')).toBe(true)

    act(() => fireChange(true))

    act(() => release())
    expect(result.current.mode).toBe('dark')
    expect(html.classList.contains('dark')).toBe(true)
  })
})

describe('useMode following the system', () => {
  it('flips .dark live with the OS while un-stored, and stops once toggled', async () => {
    const { fireChange } = mockMatchMedia(false)
    const { result } = renderHook(() => useMode())
    expect(result.current.mode).toBe('light')

    act(() => fireChange(true))
    expect(result.current.mode).toBe('dark')
    expect(html.classList.contains('dark')).toBe(true)

    await act(async () => result.current.toggleMode())
    expect(result.current.mode).toBe('light')
    expect(window.localStorage.getItem('pond:mode')).toBe('light')

    act(() => fireChange(true))
    expect(result.current.mode).toBe('light')
    expect(html.classList.contains('dark')).toBe(false)
  })
})

describe('storage blocked', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('boot still resolves from matchMedia when localStorage.getItem throws', () => {
    mockMatchMedia(true)
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    runBootScript()

    expect(html.classList.contains('dark')).toBe(true)
    expect(getItem).toHaveBeenCalled()
  })

  it('toggleMode still flips the class when localStorage.setItem throws', async () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useMode())
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    await act(async () => result.current.toggleMode())

    expect(result.current.mode).toBe('dark')
    expect(html.classList.contains('dark')).toBe(true)
    expect(setItem).toHaveBeenCalled()
  })

  it('keeps the explicit pick even with storage blocked, so a later OS change does not override it', async () => {
    const { fireChange } = mockMatchMedia(false)
    const { result } = renderHook(() => useMode())
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    await act(async () => result.current.toggleMode())
    expect(result.current.mode).toBe('dark')

    act(() => fireChange(false))
    expect(result.current.mode).toBe('dark')
    expect(html.classList.contains('dark')).toBe(true)
    expect(setItem).toHaveBeenCalled()
  })
})
