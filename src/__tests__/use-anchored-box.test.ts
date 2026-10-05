import { renderHook } from '@testing-library/react'
import {
  clampLeft,
  useAnchoredBox,
  type PickerAnchorBox,
} from '@/components/molecules/use-anchored-box'

const anchorAt = (left: number): PickerAnchorBox => ({
  getBoundingClientRect: () => ({ top: 100, bottom: 120, left }),
})

const anchors = { 267: anchorAt(267), 500: anchorAt(500), 567: anchorAt(567) }

describe('clampLeft', () => {
  it('leaves a left that fits alone', () => {
    expect(clampLeft(100, 340, 800)).toBe(100)
  })

  it('pulls the right edge 12px inside the viewport', () => {
    // 587 wide, caret at 267: 267 + 340 = 607 would overflow by 20 (+12 margin).
    expect(clampLeft(267, 340, 587)).toBe(587 - 340 - 12)
  })

  it('keeps 12px on the left', () => {
    expect(clampLeft(0, 340, 800)).toBe(12)
    expect(clampLeft(-30, 340, 800)).toBe(12)
  })

  it('keeps the left margin when the viewport is narrower than the glass', () => {
    expect(clampLeft(200, 340, 300)).toBe(12)
  })
})

describe('useAnchoredBox', () => {
  // A stable anchor: the hook re-measures whenever the anchor's identity changes.
  const original = window.innerWidth
  afterEach(() => {
    window.innerWidth = original
  })

  it('clamps left to the viewport when given the glass width', () => {
    window.innerWidth = 587
    const { result } = renderHook(() => useAnchoredBox(anchors[267], 'bottom', 340))
    expect(result.current).toEqual({ top: 124, left: 235 })
  })

  it('clamps above-side glass the same way', () => {
    window.innerWidth = 587
    const { result } = renderHook(() => useAnchoredBox(anchors[500], 'top', 300))
    expect(result.current).toMatchObject({ left: 587 - 300 - 12 })
  })

  it('follows the anchor unclamped when no width is given', () => {
    window.innerWidth = 587
    const { result } = renderHook(() => useAnchoredBox(anchors[567], 'bottom'))
    expect(result.current).toEqual({ top: 124, left: 567 })
  })
})
