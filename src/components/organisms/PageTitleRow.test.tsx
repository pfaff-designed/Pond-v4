import React, { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PageTitleRow } from '@/components/organisms/PageTitleRow'

/** Swaps in a fake ResizeObserver and hands back its captured callback (`block-canvas-rows.test.tsx`'s own pattern). */
function mockResizeObserver() {
  const setup = window.ResizeObserver
  let observed: ResizeObserverCallback | null = null
  window.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      observed = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  return {
    fire: (width: number) =>
      act(() => observed?.([{ contentRect: { width } } as ResizeObserverEntry], null as never)),
    restore: () => {
      window.ResizeObserver = setup
    },
  }
}

function ControlledTitle({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <PageTitleRow
      zen={null}
      value={value}
      placeholder="page name"
      eyebrow="saved"
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('PageTitleRow', () => {
  it('renders a single-row textarea', async () => {
    render(
      <PageTitleRow zen={null} value="" placeholder="page name" eyebrow="saved" onChange={() => {}} />
    )
    const title = await screen.findByLabelText('Page title')
    expect(title.tagName).toBe('TEXTAREA')
    expect(title).toHaveAttribute('rows', '1')
  })

  it('collapses a typed newline into one space', async () => {
    const onChange = jest.fn()
    render(<ControlledTitle onChange={onChange} />)
    const title = await screen.findByLabelText('Page title')
    await userEvent.type(title, 'a\nb')
    expect(onChange).toHaveBeenLastCalledWith('a b')
  })

  it('re-measures the height when the textarea itself is resized', async () => {
    const ro = mockResizeObserver()
    try {
      render(
        <PageTitleRow
          zen={null}
          value="a long wrapping title"
          placeholder="page name"
          eyebrow="saved"
          onChange={() => {}}
        />
      )
      const title = (await screen.findByLabelText('Page title')) as HTMLTextAreaElement

      jest.spyOn(title, 'scrollHeight', 'get').mockReturnValue(88)

      // Zen toggling, a column-width drag, or a rail resize all change the
      // textarea's own width without touching `value` — the same re-measure
      // that `value` triggers on mount must fire for a width change too.
      ro.fire(300)

      expect(title.style.height).toBe('88px')
    } finally {
      ro.restore()
    }
  })

  it('prevents the default Enter behaviour', async () => {
    render(
      <PageTitleRow zen={null} value="" placeholder="page name" eyebrow="saved" onChange={() => {}} />
    )
    const title = await screen.findByLabelText('Page title')
    const event = new Event('keydown', { bubbles: true, cancelable: true }) as KeyboardEvent &
      Event
    Object.defineProperty(event, 'key', { value: 'Enter' })
    title.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('↓ at the title’s end leaves, but not while composing or with Shift held', async () => {
    const onLeaveDown = jest.fn()
    render(
      <PageTitleRow
        zen={null}
        value="a title"
        placeholder="page name"
        eyebrow="saved"
        onChange={() => {}}
        onLeaveDown={onLeaveDown}
      />
    )
    const title = (await screen.findByLabelText('Page title')) as HTMLTextAreaElement
    title.setSelectionRange(title.value.length, title.value.length)

    // An IME's own ↓ advances its candidate list, same as Enter's guard.
    fireEvent.keyDown(title, { key: 'ArrowDown', isComposing: true })
    expect(onLeaveDown).not.toHaveBeenCalled()

    // Shift+↓ extends the selection instead of leaving.
    fireEvent.keyDown(title, { key: 'ArrowDown', shiftKey: true })
    expect(onLeaveDown).not.toHaveBeenCalled()

    // A bare ↓ at the end still leaves.
    fireEvent.keyDown(title, { key: 'ArrowDown' })
    expect(onLeaveDown).toHaveBeenCalledTimes(1)
  })
})
