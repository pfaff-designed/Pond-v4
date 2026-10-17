/**
 * `useRecordSelection`'s `selectOrOpenOnKey` — the one home for "first ↵/Space
 * selects; ↵ on the already-selected row opens its page" (KAN-396), shared by
 * `CollectionTable`'s row, `CollectionGallery`'s card and the calendar's stack
 * item/focus-list row. Each view's own ↵ test (table-row-select.test.tsx,
 * view-mapped-modes.test.tsx, collection-calendar.test.tsx) proves the wiring;
 * this file proves the rule itself.
 */
import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRecordSelection } from '@/lib/modules/view/use-record-selection'

const rows = [{ id: 'a' }, { id: 'b' }]

const el = {} as Element

function keyEvent(key: string, { innerTarget = false } = {}): ReactKeyboardEvent {
  const target = innerTarget ? ({} as Element) : el
  return {
    key,
    target,
    currentTarget: el,
    preventDefault: jest.fn(),
  } as unknown as ReactKeyboardEvent
}

describe('selectOrOpenOnKey', () => {
  it('Enter on an unselected row selects it, not open', () => {
    const onOpenRow = jest.fn()
    const { result } = renderHook(() => useRecordSelection(rows, 'v'))

    act(() => result.current.selectOrOpenOnKey('a', keyEvent('Enter'), onOpenRow))

    expect(result.current.selectedRow?.id).toBe('a')
    expect(onOpenRow).not.toHaveBeenCalled()
  })

  it('Space on an unselected row selects it', () => {
    const onOpenRow = jest.fn()
    const { result } = renderHook(() => useRecordSelection(rows, 'v'))

    act(() => result.current.selectOrOpenOnKey('a', keyEvent(' '), onOpenRow))

    expect(result.current.selectedRow?.id).toBe('a')
    expect(onOpenRow).not.toHaveBeenCalled()
  })

  it('Enter on the already-selected row opens it, not re-select', () => {
    const onOpenRow = jest.fn()
    const { result } = renderHook(() => useRecordSelection(rows, 'v'))
    act(() => result.current.select({ id: 'a', via: 'keyboard' }))

    act(() => result.current.selectOrOpenOnKey('a', keyEvent('Enter'), onOpenRow))

    expect(onOpenRow).toHaveBeenCalledWith('a')
    expect(onOpenRow).toHaveBeenCalledTimes(1)
  })

  it('a key from an inner control (target !== currentTarget) does nothing', () => {
    const onOpenRow = jest.fn()
    const { result } = renderHook(() => useRecordSelection(rows, 'v'))

    act(() =>
      result.current.selectOrOpenOnKey('a', keyEvent('Enter', { innerTarget: true }), onOpenRow)
    )

    expect(result.current.selectedRow).toBeUndefined()
    expect(onOpenRow).not.toHaveBeenCalled()
  })

  it('any other key does nothing', () => {
    const onOpenRow = jest.fn()
    const { result } = renderHook(() => useRecordSelection(rows, 'v'))

    act(() => result.current.selectOrOpenOnKey('a', keyEvent('a'), onOpenRow))

    expect(result.current.selectedRow).toBeUndefined()
    expect(onOpenRow).not.toHaveBeenCalled()
  })
})
