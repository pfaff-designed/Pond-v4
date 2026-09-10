/**
 * #58 — the ContentWidthHandle molecule: the draggable/keyboard vertical
 * separator on the editor column's right edge. Controlled like TerminalDrawer's
 * handle: the parent owns width state and persistence; the molecule reports
 * clamped live changes (onWidthChange) and gesture-end commits (onWidthCommit).
 *
 * jsdom has no PointerEvent constructor and RTL's fireEvent fallback drops
 * clientX/pointerId, so drags dispatch plain Events with the fields assigned —
 * React's synthetic events read them off the native event just the same.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContentWidthHandle } from '@/components/molecules/ContentWidthHandle'
import {
  CONTENT_MIN_WIDTH,
  CONTENT_MAX_WIDTH,
  CONTENT_WIDTH_STEP,
} from '@/lib/layout/content-width'

function firePointer(el: Element, type: string, init: Record<string, unknown>) {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(ev, init)
  fireEvent(el, ev)
}

const getHandle = () => screen.getByRole('separator', { name: 'Resize page width' })

function renderHandle(width = 672) {
  const onWidthChange = jest.fn()
  const onWidthCommit = jest.fn()
  render(
    <ContentWidthHandle width={width} onWidthChange={onWidthChange} onWidthCommit={onWidthCommit} />
  )
  return { onWidthChange, onWidthCommit }
}

describe('ARIA contract (separator + value semantics)', () => {
  it('is a focusable vertical separator reporting its value and bounds', () => {
    renderHandle(800)
    const handle = getHandle()
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-valuenow', '800')
    expect(handle).toHaveAttribute('aria-valuemin', String(CONTENT_MIN_WIDTH))
    expect(handle).toHaveAttribute('aria-valuemax', String(CONTENT_MAX_WIDTH))
    expect(handle).toHaveAttribute('tabindex', '0')
  })
})

describe('keyboard resize', () => {
  it('ArrowRight grows by one step and commits (each press is a whole gesture)', () => {
    const { onWidthChange, onWidthCommit } = renderHandle(672)
    fireEvent.keyDown(getHandle(), { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenCalledWith(672 + CONTENT_WIDTH_STEP)
    expect(onWidthCommit).toHaveBeenCalledWith(672 + CONTENT_WIDTH_STEP)
  })

  it('ArrowLeft shrinks by one step', () => {
    const { onWidthChange } = renderHandle(672)
    fireEvent.keyDown(getHandle(), { key: 'ArrowLeft' })
    expect(onWidthChange).toHaveBeenCalledWith(672 - CONTENT_WIDTH_STEP)
  })

  it('clamps at the ceiling and the floor', () => {
    const atMax = renderHandle(CONTENT_MAX_WIDTH)
    fireEvent.keyDown(getHandle(), { key: 'ArrowRight' })
    expect(atMax.onWidthChange).toHaveBeenCalledWith(CONTENT_MAX_WIDTH)
  })

  it('Home and End jump to the bounds (standard separator behavior)', () => {
    const { onWidthChange } = renderHandle(800)
    fireEvent.keyDown(getHandle(), { key: 'Home' })
    expect(onWidthChange).toHaveBeenCalledWith(CONTENT_MIN_WIDTH)
    fireEvent.keyDown(getHandle(), { key: 'End' })
    expect(onWidthChange).toHaveBeenCalledWith(CONTENT_MAX_WIDTH)
  })
})

describe('pointer drag', () => {
  it('reports live widths during a drag — 2× the pointer delta, since the centered column grows both ways to keep its right edge under the cursor', () => {
    const { onWidthChange, onWidthCommit } = renderHandle(672)
    const handle = getHandle()
    firePointer(handle, 'pointerdown', { pointerId: 1, clientX: 300 })
    firePointer(handle, 'pointermove', { pointerId: 1, clientX: 340 })
    expect(onWidthChange).toHaveBeenLastCalledWith(672 + 80)
    firePointer(handle, 'pointermove', { pointerId: 1, clientX: 320 })
    expect(onWidthChange).toHaveBeenLastCalledWith(672 + 40)
    expect(onWidthCommit).not.toHaveBeenCalled()
  })

  it('clamps mid-drag and commits the last seen width on pointerup', () => {
    const { onWidthChange, onWidthCommit } = renderHandle(672)
    const handle = getHandle()
    firePointer(handle, 'pointerdown', { pointerId: 1, clientX: 300 })
    firePointer(handle, 'pointermove', { pointerId: 1, clientX: 3000 })
    expect(onWidthChange).toHaveBeenLastCalledWith(CONTENT_MAX_WIDTH)
    firePointer(handle, 'pointerup', { pointerId: 1, clientX: 3000 })
    expect(onWidthCommit).toHaveBeenCalledWith(CONTENT_MAX_WIDTH)
  })

  it('ignores a second pointer mid-drag (no multi-touch jitter)', () => {
    const { onWidthChange } = renderHandle(672)
    const handle = getHandle()
    firePointer(handle, 'pointerdown', { pointerId: 1, clientX: 300 })
    firePointer(handle, 'pointermove', { pointerId: 2, clientX: 900 })
    expect(onWidthChange).not.toHaveBeenCalled()
  })

  it('pointercancel ends the drag and commits the last width the user saw', () => {
    const { onWidthCommit } = renderHandle(672)
    const handle = getHandle()
    firePointer(handle, 'pointerdown', { pointerId: 1, clientX: 300 })
    firePointer(handle, 'pointermove', { pointerId: 1, clientX: 350 })
    firePointer(handle, 'pointercancel', { pointerId: 1 })
    expect(onWidthCommit).toHaveBeenCalledWith(672 + 100)
  })
})
