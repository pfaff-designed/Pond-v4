/**
 * useInlineAttachment — proves the single-slot API is kind-agnostic: a CSV
 * attachment and an HTML attachment are siblings through one
 * setAttachment/clear API, not two parallel code paths.
 */

import { renderHook, act } from '@testing-library/react'
import { useInlineAttachment } from '@/lib/attachments/use-inline-attachment'

type CsvAttachment = { kind: 'csv'; filename: string; rows: number }
type HtmlAttachment = { kind: 'html'; url: string }
type InlineAttachment = CsvAttachment | HtmlAttachment

describe('useInlineAttachment', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useInlineAttachment<InlineAttachment>())
    expect(result.current.attachment).toBeNull()
  })

  it('holds a csv attachment set through setAttachment', () => {
    const { result } = renderHook(() => useInlineAttachment<InlineAttachment>())

    act(() => {
      result.current.setAttachment({ kind: 'csv', filename: 'board.csv', rows: 3 })
    })

    expect(result.current.attachment).toEqual({ kind: 'csv', filename: 'board.csv', rows: 3 })
  })

  it('holds an html attachment through the same setAttachment API', () => {
    const { result } = renderHook(() => useInlineAttachment<InlineAttachment>())

    act(() => {
      result.current.setAttachment({ kind: 'html', url: 'https://example.com' })
    })

    expect(result.current.attachment).toEqual({ kind: 'html', url: 'https://example.com' })
  })

  it('replacing one kind with another is a single setAttachment call, not a second slot', () => {
    const { result } = renderHook(() => useInlineAttachment<InlineAttachment>())

    act(() => {
      result.current.setAttachment({ kind: 'csv', filename: 'a.csv', rows: 1 })
    })
    expect(result.current.attachment?.kind).toBe('csv')

    act(() => {
      result.current.setAttachment({ kind: 'html', url: 'https://example.com/b' })
    })
    expect(result.current.attachment).toEqual({ kind: 'html', url: 'https://example.com/b' })
  })

  it('clear empties the slot regardless of which kind was held', () => {
    const { result } = renderHook(() => useInlineAttachment<InlineAttachment>())

    act(() => {
      result.current.setAttachment({ kind: 'html', url: 'https://example.com' })
    })
    act(() => result.current.clear())

    expect(result.current.attachment).toBeNull()
  })
})
