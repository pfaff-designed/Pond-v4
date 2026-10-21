import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TagValueEditor } from './TagValueEditor'

const OPTIONS = [
  { id: 'o1', label: 'event' },
  { id: 'o2', label: 'task' },
]

describe('TagValueEditor', () => {
  it('opens the option menu on click and picks a row, writing its id', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(
      <TagValueEditor
        options={OPTIONS}
        value={null}
        empty
        aria-label="Type value"
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    expect(screen.getByRole('listbox', { name: 'options' })).toBeInTheDocument()
    // Nothing is set — no clear row.
    expect(screen.queryByRole('option', { name: 'clear' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: 'task' }))
    expect(onChange).toHaveBeenCalledWith('o2')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows a clear row first when a value is set, and clears to null', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(
      <TagValueEditor
        options={OPTIONS}
        value="o1"
        label="event"
        empty={false}
        aria-label="Type value"
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveTextContent('clear')

    await user.click(screen.getByRole('option', { name: 'clear' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('a value set, opened with no query: Enter leaves it unchanged (the current option is active, not "clear")', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(
      <TagValueEditor
        options={OPTIONS}
        value="o2"
        label="task"
        empty={false}
        aria-label="Type value"
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('o2')
  })

  it('a value set, typing a new label then Enter creates and sets the new tag, not "clear"', async () => {
    const user = userEvent.setup()
    const onAddOption = jest.fn()
    const onChange = jest.fn()
    render(
      <TagValueEditor
        options={OPTIONS}
        value="o1"
        label="event"
        empty={false}
        aria-label="Type value"
        onChange={onChange}
        onAddOption={onAddOption}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'appointment')
    expect(screen.queryByRole('option', { name: 'clear' })).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(onAddOption).toHaveBeenCalledWith('appointment')
    expect(onChange).not.toHaveBeenCalledWith(null)
  })

  it('filters options by the typed query', async () => {
    const user = userEvent.setup()
    render(
      <TagValueEditor
        options={OPTIONS}
        value={null}
        empty
        aria-label="Type value"
        onChange={jest.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'tas')

    const rows = screen.getAllByRole('option')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('task')
  })

  it('moves the active row with arrow keys and picks it on Enter', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(
      <TagValueEditor
        options={OPTIONS}
        value={null}
        empty
        aria-label="Type value"
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('o2')
  })

  it('Esc closes the menu with no change', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(
      <TagValueEditor
        options={OPTIONS}
        value="o1"
        label="event"
        empty={false}
        aria-label="Type value"
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.keyboard('{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Type value' })).toBeInTheDocument()
  })

  it('without onAddOption, an unmatched query shows no "+ new tag" row', async () => {
    const user = userEvent.setup()
    render(
      <TagValueEditor
        options={OPTIONS}
        value={null}
        empty
        aria-label="Type value"
        onChange={jest.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'urgent')
    expect(screen.queryByRole('option', { name: /new tag/ })).not.toBeInTheDocument()
    expect(screen.getByText('no options')).toBeInTheDocument()
  })

  it('with onAddOption, an unmatched query shows "+ new tag" as the last row; picking it raises onAddOption', async () => {
    const user = userEvent.setup()
    const onAddOption = jest.fn()
    const onChange = jest.fn()
    render(
      <TagValueEditor
        options={OPTIONS}
        value={null}
        empty
        aria-label="Type value"
        onChange={onChange}
        onAddOption={onAddOption}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'urgent')
    const rows = screen.getAllByRole('option')
    expect(rows[rows.length - 1]).toHaveTextContent('＋ new tag "urgent"')

    await user.click(screen.getByRole('option', { name: /new tag/ }))
    expect(onAddOption).toHaveBeenCalledWith('urgent')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('"+ new tag" disappears once the query exactly matches an existing label', async () => {
    const user = userEvent.setup()
    render(
      <TagValueEditor
        options={OPTIONS}
        value={null}
        empty
        aria-label="Type value"
        onChange={jest.fn()}
        onAddOption={jest.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'task')
    expect(screen.queryByRole('option', { name: /new tag/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^task/ })).toBeInTheDocument()
  })

  it('picks "+ new tag" on Enter when it is the active row', async () => {
    const user = userEvent.setup()
    const onAddOption = jest.fn()
    render(
      <TagValueEditor
        options={OPTIONS}
        value={null}
        empty
        aria-label="Type value"
        onChange={jest.fn()}
        onAddOption={onAddOption}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'zzz')
    // No options match "zzz" — the sole row is "+ new tag", already active.
    await user.keyboard('{Enter}')
    expect(onAddOption).toHaveBeenCalledWith('zzz')
  })

  it('returns focus to the trigger after picking an option, so Tab reaches the next value', async () => {
    const user = userEvent.setup()
    render(
      <>
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="First value"
          onChange={jest.fn()}
        />
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="Second value"
          onChange={jest.fn()}
        />
      </>
    )

    await user.click(screen.getByRole('button', { name: 'First value' }))
    await user.click(screen.getByRole('option', { name: 'task' }))
    await user.tab()

    expect(screen.getByRole('button', { name: 'Second value' })).toHaveFocus()
  })

  it('returns focus to the trigger on Esc, so the next Tab reaches the next value', async () => {
    const user = userEvent.setup()
    render(
      <>
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="First value"
          onChange={jest.fn()}
        />
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="Second value"
          onChange={jest.fn()}
        />
      </>
    )

    screen.getByRole('button', { name: 'First value' }).focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')
    await user.tab()

    expect(screen.getByRole('button', { name: 'Second value' })).toHaveFocus()
  })

  it('does not steal focus back when a press on another value dismisses the popover', async () => {
    const user = userEvent.setup()
    render(
      <>
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="First value"
          onChange={jest.fn()}
        />
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="Second value"
          onChange={jest.fn()}
        />
      </>
    )

    await user.click(screen.getByRole('button', { name: 'First value' }))
    await user.click(screen.getByRole('button', { name: 'Second value' }))

    // The first popover closed (dismissed, not stolen back); the second's own
    // click opened its own popover — exactly one listbox, not two or zero —
    // and focus landed in it, not forced back onto the first trigger.
    expect(screen.getAllByRole('listbox')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'First value' })).not.toHaveFocus()
  })

  it('closes on Tab-away instead of leaving a stale listener: Enter after focus has moved on does not clear the value', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(
      <TagValueEditor
        options={OPTIONS}
        value="o1"
        label="event"
        empty={false}
        aria-label="First value"
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole('button', { name: 'First value' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    // Tab moves focus off the filter input without picking anything — a plain
    // focus move, not Esc/Enter/a row click.
    await user.tab()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'filter options' })).not.toBeInTheDocument()

    // The old document-level keydown listener would still be alive here and
    // would read this Enter as "pick row 0" (clear), wiping the value.
    await user.keyboard('{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Tab from the open popover closes it and reaches the next value, not the listbox', async () => {
    const user = userEvent.setup()
    render(
      <>
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="First value"
          onChange={jest.fn()}
        />
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="Second value"
          onChange={jest.fn()}
        />
      </>
    )

    await user.click(screen.getByRole('button', { name: 'First value' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.tab()

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Second value' })).toHaveFocus()
  })

  it('Shift+Tab from the open popover closes it and reaches the previous value', async () => {
    const user = userEvent.setup()
    render(
      <>
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="First value"
          onChange={jest.fn()}
        />
        <TagValueEditor
          options={OPTIONS}
          value={null}
          empty
          aria-label="Second value"
          onChange={jest.fn()}
        />
      </>
    )

    await user.click(screen.getByRole('button', { name: 'Second value' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.tab({ shift: true })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'First value' })).toHaveFocus()
  })

  it('clicking an open chip\'s own trigger closes it, rather than keeping/reopening it', async () => {
    const user = userEvent.setup()
    render(
      <TagValueEditor
        options={OPTIONS}
        value="o1"
        label="event"
        empty={false}
        aria-label="Type value"
        onChange={jest.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: 'Type value' })
    await user.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('a later Enter still opens it after a click opened then closed it', async () => {
    const user = userEvent.setup()
    render(
      <TagValueEditor
        options={OPTIONS}
        value="o1"
        label="event"
        empty={false}
        aria-label="Type value"
        onChange={jest.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: 'Type value' })
    await user.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('a disabled editor renders no click target', () => {
    render(
      <TagValueEditor
        options={OPTIONS}
        value="o1"
        label="event"
        empty={false}
        editable={false}
        aria-label="Type value"
        onChange={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Type value' })).toBeDisabled()
  })

  // Mirrors the real listeners this bug silenced: `PageChangesPanel.tsx`'s
  // ⌥⌘H chord and `use-record-selection.ts`/`zen.tsx`'s plain Esc are both
  // `document.addEventListener('keydown', …)` — a chip merely focused (not
  // open) must not swallow either.
  it('lets Esc and ⌥⌘H reach a document listener while focused, but still steals a plain Enter', async () => {
    const user = userEvent.setup()
    const documentHandler = jest.fn()
    document.addEventListener('keydown', documentHandler)
    try {
      render(
        <TagValueEditor options={OPTIONS} value={null} empty aria-label="Type value" onChange={jest.fn()} />
      )
      screen.getByRole('button', { name: 'Type value' }).focus()

      await user.keyboard('{Escape}')
      expect(documentHandler).toHaveBeenCalledTimes(1)

      documentHandler.mockClear()
      await user.keyboard('{Alt>}{Meta>}h{/Meta}{/Alt}')
      const codes = documentHandler.mock.calls.map(([e]) => (e as KeyboardEvent).code)
      expect(codes).toContain('KeyH')

      // Plain Enter is the key that opens this popover — it must still do
      // that, not bubble.
      documentHandler.mockClear()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('listbox', { name: 'options' })).toBeInTheDocument()
      expect(documentHandler).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', documentHandler)
    }
  })
})
