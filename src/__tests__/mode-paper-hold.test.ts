/**
 * The paper hold and the non-persisted setter (`lib/theme/mode`): the new-pond
 * sheet's theme pills preview a ground without touching the person's stored
 * mode, and `setMode` applies a pond's own theme the same way — directly, no
 * hold, no `localStorage`.
 */

import { act, renderHook } from '@testing-library/react'

import { holdInkGround, holdPaperGround, setMode, useMode } from '@/lib/theme/mode'

const html = document.documentElement
const ink = () => html.classList.contains('dark')

afterEach(() => {
  html.classList.remove('dark')
  window.localStorage.clear()
})

describe('holdPaperGround', () => {
  it('forces light even when the person’s mode is dark, and restores it on release', () => {
    const { result } = renderHook(() => useMode())
    act(() => result.current.toggleMode())
    expect(ink()).toBe(true)

    let release = () => {}
    act(() => {
      release = holdPaperGround()
    })
    expect(ink()).toBe(false)

    act(() => release())
    expect(ink()).toBe(true)
  })

  it('a stale release leaves a newer, opposite-ground hold in place; the last release gives the ground back', () => {
    const releaseInk = holdInkGround()
    const releasePaper = holdPaperGround()
    expect(ink()).toBe(false)

    releaseInk()
    expect(ink()).toBe(false)

    releasePaper()
    expect(ink()).toBe(false)
  })

  it('stacks in the other order too: the newer ink hold wins over an older paper hold', () => {
    const releasePaper = holdPaperGround()
    const releaseInk = holdInkGround()
    expect(ink()).toBe(true)

    releasePaper()
    expect(ink()).toBe(true)

    releaseInk()
    expect(ink()).toBe(false)
  })

  it('a release called twice releases once', () => {
    const releaseA = holdPaperGround()
    releaseA()
    const releaseB = holdPaperGround()
    releaseA()
    expect(ink()).toBe(false)
    releaseB()
    expect(ink()).toBe(false)
  })
})

describe('setMode', () => {
  it('flips `.dark` without touching localStorage or heldChoice', () => {
    setMode('dark')
    expect(ink()).toBe(true)
    expect(window.localStorage.getItem('pond:mode')).toBeNull()

    setMode('light')
    expect(ink()).toBe(false)
    expect(window.localStorage.getItem('pond:mode')).toBeNull()
  })

  it('does not disturb a hold’s baseline: releasing an ink hold after setMode restores setMode’s ground', () => {
    setMode('dark')
    let release = () => {}
    act(() => {
      release = holdPaperGround()
    })
    expect(ink()).toBe(false)

    act(() => release())
    expect(ink()).toBe(true)
  })
})
