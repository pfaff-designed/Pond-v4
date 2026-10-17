import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AtomEditor } from './AtomEditor'
import { formatAtomDate, parseDateInput } from '@/lib/properties/date-input'

const parseText = (text: string): string | null | 'empty' => (text.trim() === '' ? 'empty' : text)
const parseNumber = (text: string): number | null | 'empty' => {
  const trimmed = text.trim()
  if (trimmed === '') return 'empty'
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

// A fixed Wednesday — `parseDateInput`'s "next strictly after today" weekday
// resolution and `tomorrow` need a stable clock, never the real one, to be
// deterministic across test runs.
const TODAY = new Date('2026-10-14T00:00:00Z')
const parseDate = (text: string): string | null | 'empty' => parseDateInput(text, TODAY)
const previewDate = (text: string): string | null => {
  const parsed = parseDateInput(text, TODAY)
  return parsed === null || parsed === 'empty' ? null : formatAtomDate(parsed)
}

describe('AtomEditor — text', () => {
  it('opens editing on click, seeded with the current value, and commits on Enter', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor
        kind="text"
        value="chickpeas"
        aria-label="Notes value"
        parse={parseText}
        onCommit={onCommit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Notes value' }))
    const input = screen.getByLabelText('Notes value') as HTMLInputElement
    expect(input.value).toBe('chickpeas')

    await user.clear(input)
    await user.type(input, 'harissa')
    await user.keyboard('{Enter}')

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('harissa')
    expect(screen.getByRole('button', { name: 'Notes value' })).toBeInTheDocument()
  })

  it('commits on blur too', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(<AtomEditor kind="text" value="a" aria-label="v" parse={parseText} onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'v' }))
    const input = screen.getByLabelText('v')
    await user.clear(input)
    await user.type(input, 'b')
    await user.tab()

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('b')
  })

  it('reverts without committing on Esc mid-edit', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor kind="text" value="kept" aria-label="v" parse={parseText} onCommit={onCommit} />
    )

    await user.click(screen.getByRole('button', { name: 'v' }))
    const input = screen.getByLabelText('v')
    await user.clear(input)
    await user.type(input, 'thrown away')
    await user.keyboard('{Escape}')

    expect(onCommit).not.toHaveBeenCalled()
    // back to the read button, no stray input left mounted
    expect(screen.getByRole('button', { name: 'v' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('commits null for an emptied value', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor kind="text" value="kept" aria-label="v" parse={parseText} onCommit={onCommit} />
    )

    await user.click(screen.getByRole('button', { name: 'v' }))
    const input = screen.getByLabelText('v')
    await user.clear(input)
    await user.keyboard('{Enter}')

    expect(onCommit).toHaveBeenCalledWith(null)
  })

  it('accepts and commits very long text verbatim', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const long = 'x'.repeat(2000)
    render(<AtomEditor kind="text" value="" aria-label="v" parse={parseText} onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'v' }))
    const input = screen.getByLabelText('v')
    await user.type(input, long)
    await user.tab()

    expect(onCommit).toHaveBeenCalledWith(long)
  })

  it('renders with no click target when not editable', () => {
    render(
      <AtomEditor kind="text" value="kept" editable={false} parse={parseText} onCommit={jest.fn()} />
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('kept')).toBeInTheDocument()
  })

  it('returns focus to the trigger on Enter commit, so Tab reaches the next value', async () => {
    const user = userEvent.setup()
    render(
      <>
        <AtomEditor kind="text" value="a" aria-label="First value" parse={parseText} onCommit={jest.fn()} />
        <AtomEditor kind="text" value="b" aria-label="Second value" parse={parseText} onCommit={jest.fn()} />
      </>
    )

    screen.getByRole('button', { name: 'First value' }).focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')
    await user.tab()

    expect(screen.getByRole('button', { name: 'Second value' })).toHaveFocus()
  })

  it('returns focus to the trigger on Esc, so the next Tab reaches the next value', async () => {
    const user = userEvent.setup()
    render(
      <>
        <AtomEditor kind="text" value="a" aria-label="First value" parse={parseText} onCommit={jest.fn()} />
        <AtomEditor kind="text" value="b" aria-label="Second value" parse={parseText} onCommit={jest.fn()} />
      </>
    )

    screen.getByRole('button', { name: 'First value' }).focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')
    await user.tab()

    expect(screen.getByRole('button', { name: 'Second value' })).toHaveFocus()
  })

  it('does not steal focus back on a blur caused by tabbing to the next value', async () => {
    const user = userEvent.setup()
    render(
      <>
        <AtomEditor kind="text" value="a" aria-label="First value" parse={parseText} onCommit={jest.fn()} />
        <AtomEditor kind="text" value="b" aria-label="Second value" parse={parseText} onCommit={jest.fn()} />
      </>
    )

    screen.getByRole('button', { name: 'First value' }).focus()
    await user.keyboard('{Enter}')
    await user.tab()

    expect(screen.getByRole('button', { name: 'Second value' })).toHaveFocus()
  })
})

describe('AtomEditor — number', () => {
  it('shows "not a number" and writes nothing when Enter commits garbage', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor
        kind="number"
        value="1,040"
        aria-label="Count value"
        parse={parseNumber}
        onCommit={onCommit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Count value' }))
    const input = screen.getByLabelText('Count value')
    await user.clear(input)
    await user.type(input, 'five hundred')
    await user.keyboard('{Enter}')

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByText('not a number')).toBeInTheDocument()
    // the draft stays open, editable
    expect(screen.getByLabelText('Count value')).toHaveValue('five hundred')
  })

  it('reverts silently with nothing written when blur settles on garbage', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor
        kind="number"
        value="1,040"
        aria-label="Count value"
        parse={parseNumber}
        onCommit={onCommit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Count value' }))
    const input = screen.getByLabelText('Count value')
    await user.clear(input)
    await user.type(input, 'not a number at all')
    await user.tab()

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Count value' })).toBeInTheDocument()
  })

  it('commits a parsed number on Enter', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor
        kind="number"
        value="1,040"
        editValue="1040"
        aria-label="Count value"
        parse={parseNumber}
        onCommit={onCommit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Count value' }))
    const input = screen.getByLabelText('Count value')
    expect(input).toHaveValue('1040')
    await user.clear(input)
    await user.type(input, '42')
    await user.keyboard('{Enter}')

    expect(onCommit).toHaveBeenCalledWith(42)
  })
})

describe('AtomEditor — date', () => {
  it('shows a mono preview of the resolved day while typing, and commits on Enter', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor
        kind="date"
        value="19 sep"
        aria-label="Due value"
        errorNote="not a date"
        parse={parseDate}
        preview={previewDate}
        onCommit={onCommit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Due value' }))
    const input = screen.getByLabelText('Due value')
    await user.clear(input)
    await user.type(input, 'tomorrow')

    const resolved = parseDateInput('tomorrow', TODAY) as string
    expect(screen.getByText(formatAtomDate(resolved))).toBeInTheDocument()

    await user.keyboard('{Enter}')

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(resolved)
    expect(screen.getByRole('button', { name: 'Due value' })).toBeInTheDocument()
  })

  it('keeps the draft open and shows "not a date" when Enter commits garbage', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor
        kind="date"
        value="19 sep"
        aria-label="Due value"
        errorNote="not a date"
        parse={parseDate}
        preview={previewDate}
        onCommit={onCommit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Due value' }))
    const input = screen.getByLabelText('Due value')
    await user.clear(input)
    await user.type(input, 'not a day')
    await user.keyboard('{Enter}')

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByText('not a date')).toBeInTheDocument()
    expect(screen.getByLabelText('Due value')).toHaveValue('not a day')
  })

  it('reverts to the stored value with nothing written when blur settles on garbage', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor
        kind="date"
        value="19 sep"
        aria-label="Due value"
        errorNote="not a date"
        parse={parseDate}
        preview={previewDate}
        onCommit={onCommit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Due value' }))
    const input = screen.getByLabelText('Due value')
    await user.clear(input)
    await user.type(input, 'not a day')
    await user.tab()

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Due value' })).toBeInTheDocument()
  })

  it('reverts without committing on Esc mid-edit', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(
      <AtomEditor
        kind="date"
        value="19 sep"
        aria-label="Due value"
        parse={parseDate}
        preview={previewDate}
        onCommit={onCommit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Due value' }))
    const input = screen.getByLabelText('Due value')
    await user.clear(input)
    await user.type(input, 'tomorrow')
    await user.keyboard('{Escape}')

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Due value' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('AtomEditor — a very long unbroken value fits its column', () => {
  const longValue = 'a'.repeat(260)

  // jsdom never lays out real pixels (getBoundingClientRect is always 0), so
  // this guards the classes a real browser needs to shrink the trigger below
  // its content width inside a grid track (`min-width: auto` is a button's UA
  // default) — the layout assertion itself lives in a story.
  it('keeps the rest-mode trigger shrinkable (min-w-0 max-w-full)', () => {
    render(
      <AtomEditor kind="text" value={longValue} aria-label="Notes value" parse={parseText} onCommit={jest.fn()} />
    )
    const trigger = screen.getByRole('button', { name: 'Notes value' })
    expect(trigger.className).toContain('min-w-0')
    expect(trigger.className).toContain('max-w-full')
  })

  it('shows the full value, unclipped, while editing', async () => {
    const user = userEvent.setup()
    render(
      <AtomEditor kind="text" value={longValue} aria-label="Notes value" parse={parseText} onCommit={jest.fn()} />
    )

    await user.click(screen.getByRole('button', { name: 'Notes value' }))
    const input = screen.getByLabelText('Notes value') as HTMLInputElement
    expect(input.value).toBe(longValue)
    expect(input.className).toContain('min-w-0')
    expect(input.className).toContain('max-w-full')
  })
})
