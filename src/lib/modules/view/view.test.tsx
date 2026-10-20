/**
 * KAN-292 — the path test: the calendar's, list's and timeline's `add a date field`
 * remedy, wired from the real `ViewView`/`CollectionView` host (not
 * `CollectionCalendar`, `CollectionList` or `CollectionGantt` alone). `ViewView`
 * builds the handler over `useCollectionRows().updateSchema` +
 * `useDeletionUndo`'s `stageUndo`, gated on `editable`, and threads the SAME
 * handler into all three.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { BlockRowProvider } from '@/lib/modules/block-row-context'
import { ViewView } from './view'
import { BOARD_EMPTY_LINE, CALENDAR_EMPTY_LINE, LAYOUT_MENU_MODES, VIEW_KINDS } from './kinds'
import { ActiveViewSelectionContext } from './active-view-context'
import type { Block } from '@/lib/documents/types'
import type { ViewBlock } from './schema'
import type { PropertySchema, PropertyValue } from '@/lib/properties/schema'
import { addDays, type CollectionRow } from './apply'
import { DUE_BUCKETS } from './due-buckets'
import { localDateIso } from './due'
import { rememberStruckRow } from '@/lib/change-log/undo-strike'
import { clearUndoNotice, requestUndoNotice } from '@/lib/terminal-focus'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const dateless: PropertySchema = [{ id: 'p-title', name: 'Title', type: 'text' }]

// Set by a describe block before `renderView` to seed the mocked hook's rows/schema —
// a fresh `useState` reads it on every render, so tests outside a given describe
// never see it change their own `rows: []`/`dateless` default.
let initialRows: CollectionRow[] = []
let initialSchema: PropertySchema = dateless
// The path describe points `setValue` at this. The file `beforeEach` resets both
// to a no-op: `mockImplementation` survives `mockClear`, so a later test must
// not inherit a row patch.
let applyRowValue: (rowId: string, key: string, value: PropertyValue) => void = () => {}

const updateSchema = jest.fn()
const renameRow = jest.fn()
const updateRows = jest.fn()
const addRow = jest.fn()
const setValue = jest.fn()
jest.mock('./use-collection-rows', () => ({
  useCollectionRows: () => {
    const [schema, setSchema] = useState<PropertySchema>(initialSchema)
    const [rows, setRows] = useState<CollectionRow[]>(initialRows)
    updateSchema.mockImplementation((next: PropertySchema) => setSchema(next))
    updateRows.mockImplementation((next: CollectionRow[]) => setRows(next))
    // Mirrors the real hook's shape enough for the board's "＋ task": mints a row
    // seeded with the dropped values and returns its id, so `handleAddCard` can
    // focus the new card's title input.
    addRow.mockImplementation(async (values?: CollectionRow['values']) => {
      const id = `r-new-${rows.length}`
      setRows((prev) => [...prev, { id, title: '', values: values ?? {} }])
      return id
    })
    // Mirrors the real hook closely enough that a committed add renders its typed
    // text, not just a recorded call (KAN-352's path tests): patches the matching
    // row in the same local `rows` state `addRow` above already updates.
    renameRow.mockImplementation((rowId: string, title: string) => {
      setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, title } : row)))
    })
    applyRowValue = (rowId: string, key: string, value: PropertyValue) => {
      setRows((prev) =>
        prev.map((row) =>
          row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row
        )
      )
    }
    return {
      schema,
      rows,
      collectionName: 'Trips',
      isLoading: false,
      isError: false,
      setValue,
      addRow,
      removeRow: jest.fn(),
      renameRow,
      updateSchema,
    }
  },
}))

const calendar: ViewBlock = { id: 'v-cal', type: 'view', mode: 'calendar' }
const list: ViewBlock = { id: 'v-list', type: 'view', mode: 'list' }
const gantt: ViewBlock = { id: 'v-gantt', type: 'view', mode: 'gantt' }
const table: ViewBlock = { id: 'v-table', type: 'view', mode: 'table' }
const board: ViewBlock = { id: 'v-board', type: 'view', mode: 'board' }

function renderView(
  data: ViewBlock,
  editable = true,
  onChange: (next: ViewBlock) => void = jest.fn()
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
          <ViewView data={data} editable={editable} onChange={onChange} />
        </SiblingBlocksProvider>
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

/** Holds the block the layout write returns, so the same `ViewView` redraws it. */
function StatefulView({
  initial,
  onChange,
  editable = true,
}: {
  initial: ViewBlock
  onChange: (next: ViewBlock) => void
  editable?: boolean
}) {
  const [data, setData] = useState(initial)
  const handleChange = (next: ViewBlock) => {
    onChange(next)
    setData(next)
  }
  return <ViewView data={data} editable={editable} onChange={handleChange} />
}

function renderStatefulView(
  initial: ViewBlock,
  onChange: (next: ViewBlock) => void,
  editable = true
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
          <StatefulView initial={initial} onChange={onChange} editable={editable} />
        </SiblingBlocksProvider>
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  updateSchema.mockClear()
  renameRow.mockClear()
  updateRows.mockClear()
  addRow.mockClear()
  setValue.mockClear()
  setValue.mockImplementation(() => {})
  applyRowValue = () => {}
  initialRows = []
  initialSchema = dateless
})

describe('ViewView — the "add a date field" remedy reaches the page (KAN-292)', () => {
  it.each([
    ['calendar', calendar],
    ['list', list],
    ['gantt', gantt],
  ])(
    '%s: clicking the remedy mints a date field onto the schema, and the button goes on rerender',
    async (_name, data) => {
      const user = userEvent.setup()
      renderView(data)

      const button = screen.getByRole('button', { name: 'add a date field' })
      await user.click(button)

      expect(updateSchema).toHaveBeenCalledWith([
        ...dateless,
        expect.objectContaining({ name: 'date', type: 'date' }),
      ])
      expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
    }
  )

  it('read-only (editable=false) draws no "add a date field" button', () => {
    renderView(calendar, false)
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
  })
})

describe('ViewView — undo removes only the field it added (KAN-292)', () => {
  it('does not clobber a schema edit made elsewhere while the undo toast is open', async () => {
    const user = userEvent.setup()
    renderView(calendar)

    await user.click(screen.getByRole('button', { name: 'add a date field' }))
    const afterAdd = updateSchema.mock.calls.at(-1)![0] as PropertySchema
    const addedField = afterAdd[afterAdd.length - 1]

    // Another schema edit lands while the toast is still open — e.g. a column
    // added through the picker. Undo must not clobber it.
    const otherField = { id: 'p-other', name: 'Notes', type: 'text' as const }
    const withOther = [...afterAdd, otherField]
    act(() => {
      updateSchema(withOther)
    })

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const afterUndo = updateSchema.mock.calls.at(-1)![0] as PropertySchema
    expect(afterUndo).toEqual([...dateless, otherField])
    expect(afterUndo.find((d) => d.id === addedField.id)).toBeUndefined()
  })
})

describe('CollectionTable — the row-title input commits once, not per keystroke (KAN-299)', () => {
  beforeEach(() => {
    initialRows = [{ id: 'r1', title: '', values: {} }]
  })

  it('calls renameRow zero times until blur, then once with the full string', async () => {
    const user = userEvent.setup()
    renderView(table)

    const input = screen.getByRole('textbox', { name: 'Row title' })
    await user.click(input)
    await user.type(input, 'kan299')
    expect(renameRow).not.toHaveBeenCalled()

    await user.tab()
    expect(renameRow).toHaveBeenCalledTimes(1)
    expect(renameRow).toHaveBeenCalledWith('r1', 'kan299')
  })

  it('does not revert what has been typed when a rows update lands mid-typing', async () => {
    const user = userEvent.setup()
    renderView(table)

    const input = screen.getByRole('textbox', { name: 'Row title' })
    await user.click(input)
    await user.type(input, 'kan')

    act(() => {
      updateRows([{ id: 'r1', title: '', values: { other: 'written elsewhere' } }])
    })
    expect(input).toHaveValue('kan')

    await user.type(input, '299')
    await user.tab()
    expect(renameRow).toHaveBeenCalledTimes(1)
    expect(renameRow).toHaveBeenCalledWith('r1', 'kan299')
  })
})

describe('CollectionTable — a row an undo just removed stays struck through (KAN-139, s6o5)', () => {
  // `requestUndoNotice`/`clearUndoNotice` write a module-level snapshot, read
  // whenever a reader mounts — matching how `ShellCommands` (the one real
  // reader) is already mounted before any ⌘Z ever fires — so every
  // request/clear below runs AFTER `renderView`, inside `act`, with the view
  // still mounted.
  const rowSnapshot = (id: string, title: string) => ({ id, title, values: {}, shown: {} })

  it("keeps the board's own example visible, struck through, once the row is gone from the data", () => {
    initialRows = []
    // The undo record's OWN before/after (migration 0021): `before` is the row
    // as it showed right before the step, `after` is null once it's undone —
    // the shape `rememberStruckRow` reads, same as `ShellCommands` passes it.
    rememberStruckRow({
      targetPageId: 'page-1',
      before: rowSnapshot('kan139-r1', 'chickpeas, harissa'),
      after: null,
    } as unknown as ChangeLogRecord)

    renderView(table)
    act(() => {
      requestUndoNotice({
        direction: 'undo',
        pastTense: 'removed chickpeas, harissa',
        previousPageTitle: 'kitchen renovation',
      })
    })

    const row = screen.getByText('chickpeas, harissa').closest('tr')
    expect(row).toHaveClass('line-through')
    expect(row).toHaveClass('decoration-mn-signal-removal')

    act(() => clearUndoNotice())
  })

  it('stops showing the struck row once the notice clears', () => {
    initialRows = []
    rememberStruckRow({
      targetPageId: 'page-1',
      before: rowSnapshot('kan139-r2', 'dal, weeknight'),
      after: null,
    } as unknown as ChangeLogRecord)

    renderView(table)
    act(() => {
      requestUndoNotice({
        direction: 'undo',
        pastTense: 'removed dal, weeknight',
        previousPageTitle: 'kitchen renovation',
      })
    })
    expect(screen.getByText('dal, weeknight')).toBeInTheDocument()

    act(() => clearUndoNotice())
    expect(screen.queryByText('dal, weeknight')).not.toBeInTheDocument()
  })

  it('does not bring back a row struck by an earlier, already-cleared notice', () => {
    initialRows = []
    rememberStruckRow({
      targetPageId: 'page-1',
      before: rowSnapshot('kan139-r3', 'kale, lemon'),
      after: null,
    } as unknown as ChangeLogRecord)
    act(() => {
      requestUndoNotice({
        direction: 'undo',
        pastTense: 'removed kale, lemon',
        previousPageTitle: 'kitchen renovation',
      })
    })
    act(() => clearUndoNotice())

    rememberStruckRow({
      targetPageId: 'page-1',
      before: rowSnapshot('kan139-r4', 'farro, roasted squash'),
      after: null,
    } as unknown as ChangeLogRecord)
    renderView(table)
    act(() => {
      requestUndoNotice({
        direction: 'undo',
        pastTense: 'removed farro, roasted squash',
        previousPageTitle: 'kitchen renovation',
      })
    })

    expect(screen.getByText('farro, roasted squash')).toBeInTheDocument()
    expect(screen.queryByText('kale, lemon')).not.toBeInTheDocument()

    act(() => clearUndoNotice())
  })
})

describe('CollectionBoard — the card-title input commits once, not per keystroke (KAN-299)', () => {
  const boardSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
  ]

  beforeEach(() => {
    initialSchema = boardSchema
    initialRows = [{ id: 'r1', title: '', values: { 'p-status': 'opt-todo' } }]
  })

  it('calls renameRow zero times until blur, then once with the full string', async () => {
    const user = userEvent.setup()
    renderView(board)

    const input = screen.getByRole('textbox', { name: 'Card title' })
    await user.click(input)
    await user.type(input, 'kan299')
    expect(renameRow).not.toHaveBeenCalled()

    await user.tab()
    expect(renameRow).toHaveBeenCalledTimes(1)
    expect(renameRow).toHaveBeenCalledWith('r1', 'kan299')
  })

  it('still opens the record peek on click (selectWithPointer still fires)', async () => {
    const user = userEvent.setup()
    renderView(board)

    expect(screen.queryByRole('textbox', { name: 'Record title' })).not.toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'Card title' })
    await user.click(input)

    expect(screen.getByRole('textbox', { name: 'Record title' })).toBeInTheDocument()
  })

  it('still adds a card into its lane through the unchanged "＋ task" path', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: '＋ task' }))

    expect(addRow).toHaveBeenCalledWith({ 'p-status': 'opt-todo' })
    const inputs = await screen.findAllByRole('textbox', { name: 'Card title' })
    expect(inputs).toHaveLength(2)
  })
})

describe('CollectionBoard — a press on the card-title input still starts a drag (KAN-385)', () => {
  const dragBoardSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'opt-todo', label: 'Todo' },
        { id: 'opt-doing', label: 'Doing' },
      ],
    },
  ]

  beforeEach(() => {
    initialSchema = dragBoardSchema
    initialRows = [{ id: 'r1', title: 'kan385', values: { 'p-status': 'opt-todo' } }]
  })

  afterEach(() => jest.restoreAllMocks())

  it('a pointerdown on the card-title input does not preventDefault — the field keeps native focus/caret', () => {
    renderView(board)
    const input = screen.getByRole('textbox', { name: 'Card title' })

    expect(fireEvent.pointerDown(input, { clientX: 10, clientY: 10 })).toBe(true)
  })

  it('dragging from the card-title input onto another lane moves the card there', () => {
    const { container } = renderView(board)
    const input = screen.getByRole('textbox', { name: 'Card title' })

    // Give the "Doing" lane a real rect so the drop lands there; every other
    // element (including the "Todo" lane under the press) stays zeroed.
    const doingLane = container.querySelector('[data-lane="Doing"]') as HTMLElement
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const [left, top, right, bottom] = this === doingLane ? [200, 0, 300, 100] : [0, 0, 0, 0]
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
        toJSON() {
          return this
        },
      } as DOMRect
    })

    fireEvent.pointerDown(input, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(input, { clientX: 250, clientY: 50 })
    fireEvent.pointerUp(input)

    expect(setValue).toHaveBeenCalledWith('r1', 'p-status', 'opt-doing')
  })
})

describe('CollectionGantt — the "add a task" foot row (KAN-352)', () => {
  const ganttSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-start', name: 'Start', type: 'date' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  beforeEach(() => {
    initialSchema = ganttSchema
    initialRows = [
      { id: 'r1', title: 'existing', values: { 'p-start': '2026-10-10', 'p-due': '2026-10-12' } },
    ]
  })

  it('↵ with text adds a task dated today–tomorrow, renames it, and stays open', async () => {
    const user = userEvent.setup()
    renderView(gantt)

    await user.click(screen.getByRole('button', { name: 'add a task' }))
    const input = screen.getByRole('textbox', { name: 'Add a task' })
    await user.type(input, 'plan')
    await user.keyboard('{Enter}')

    const todayIso = localDateIso(new Date())
    expect(addRow).toHaveBeenCalledWith({
      'p-start': todayIso,
      'p-due': addDays(todayIso, 1),
    })
    expect(renameRow).toHaveBeenCalledWith('r-new-1', 'plan')
    expect(screen.getByRole('textbox', { name: 'Add a task' })).toBeInTheDocument()
  })

  it('read-only (editable=false) draws no "add a task" row', () => {
    renderView(gantt, false)
    expect(screen.queryByRole('button', { name: 'add a task' })).not.toBeInTheDocument()
  })
})

describe('ViewView — the path test: list, through the real host (KAN-352)', () => {
  const listSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  beforeEach(() => {
    initialSchema = listSchema
    initialRows = []
  })

  it('a zero-row editable list adds two items through the empty state and the foot row', async () => {
    const user = userEvent.setup()
    renderView(list)

    await user.click(screen.getByRole('button', { name: 'add an item' }))
    await user.type(screen.getByRole('textbox', { name: 'Add an item' }), 'milk')
    await user.keyboard('{Enter}')

    expect(screen.getByText('milk')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Add an item' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Add an item' }), 'eggs')
    await user.keyboard('{Enter}')

    expect(screen.getByText('milk')).toBeInTheDocument()
    expect(screen.getByText('eggs')).toBeInTheDocument()
  })

  it('a non-editable render shows no "add an item" anywhere', () => {
    renderView(list, false)
    expect(screen.queryByRole('button', { name: 'add an item' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Add an item' })).not.toBeInTheDocument()
  })
})

describe('ViewView — the path test: calendar, through the real host (KAN-352)', () => {
  const calendarSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  beforeEach(() => {
    initialSchema = calendarSchema
    initialRows = []
  })

  function cellFor(container: HTMLElement, iso: string) {
    return container.querySelector<HTMLElement>(
      `[data-part="calendar-day-cell"][data-iso="${iso}"]`
    )!
  }

  const twentiethIso = `${localDateIso(new Date()).slice(0, 8)}20`
  const twentyFirstIso = `${localDateIso(new Date()).slice(0, 8)}21`

  it('clicking the 20th’s plus adds a record dated that day, and a blank click adds nothing', async () => {
    const user = userEvent.setup()
    const { container } = renderView(calendar)
    const cell = cellFor(container, twentiethIso)

    await user.click(within(cell).getByRole('button', { name: /Add on 20/ }))

    expect(addRow).toHaveBeenCalledTimes(1)
    expect(addRow).toHaveBeenCalledWith({ 'p-due': twentiethIso })
    expect(renameRow).not.toHaveBeenCalled()
    expect(cell.querySelector('[data-row-id="r-new-0"]')).not.toBeNull()
    expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()

    const anotherIso = addDays(twentiethIso, 1)
    fireEvent.click(cellFor(container, anotherIso))

    expect(addRow).toHaveBeenCalledTimes(1)
    expect(renameRow).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
  })

  it('calendar: hover the 21st, add, name it, Esc keeps it, a blank click adds nothing (KAN-453)', async () => {
    const user = userEvent.setup()
    const { container } = renderView(calendar)
    const cell = cellFor(container, twentyFirstIso)

    await user.hover(cell)
    await user.click(within(cell).getByRole('button', { name: /Add on 21/ }))

    expect(addRow).toHaveBeenCalledTimes(1)
    expect(addRow).toHaveBeenCalledWith({ 'p-due': twentyFirstIso })
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Record title' }))

    // Enter commits. Esc on a still-dirty title reverts and writes nothing.
    await user.keyboard('dentist{Enter}')

    expect(within(cell).getByText('dentist')).toBeInTheDocument()
    expect(screen.getByLabelText('Record: dentist')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByLabelText('Record: dentist')).not.toBeInTheDocument()
    expect(within(cell).getByText('dentist')).toBeInTheDocument()
    expect(addRow).toHaveBeenCalledTimes(1)

    await user.click(within(cell).getByText('21'))

    expect(addRow).toHaveBeenCalledTimes(1)
    expect(renameRow).toHaveBeenCalledTimes(1)
    expect(renameRow).toHaveBeenCalledWith('r-new-0', 'dentist')
    expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Untitled')).not.toBeInTheDocument()
  })

  it('a non-editable render shows no input on any click', async () => {
    const user = userEvent.setup()
    const { container } = renderView(calendar, false)

    await user.click(cellFor(container, twentiethIso))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('ViewView — a blank day click opens that day (KAN-455)', () => {
  const calendarSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  beforeEach(() => {
    initialSchema = calendarSchema
    initialRows = [{ id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21' } }]
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  function cellFor(container: HTMLElement, iso: string) {
    return container.querySelector<HTMLElement>(
      `[data-part="calendar-day-cell"][data-iso="${iso}"]`
    )
  }

  it('clicking the day number opens that day, steps back one day, and month returns the cell', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onChange = jest.fn()
    const { container } = renderView(calendar, true, onChange)
    const cell = cellFor(container, '2026-10-21')
    if (!cell) throw new Error('month cell 2026-10-21 missing')

    await user.click(within(cell).getByText('21'))

    expect(screen.getByText('wed 21 oct 2026')).toBeInTheDocument()
    expect(screen.queryByText('october 2026')).not.toBeInTheDocument()
    expect(cellFor(container, '2026-10-21')).toBeNull()
    const allDay = container.querySelector('[data-part="calendar-all-day"]')
    expect(allDay).not.toBeNull()
    expect(within(allDay as HTMLElement).getByText('dentist')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ span: 'day' }))

    await user.click(screen.getByRole('button', { name: 'Previous day' }))

    expect(screen.getByText('tue 20 oct 2026')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('radio', { name: 'month' }))

    expect(screen.getByText('october 2026')).toBeInTheDocument()
    expect(screen.queryByText('tue 20 oct 2026')).not.toBeInTheDocument()
    expect(cellFor(container, '2026-10-21')).not.toBeNull()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ span: 'month' }))
  })
})

describe('ViewView — the path test: timeline, through the real host (KAN-352)', () => {
  const ganttSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-start', name: 'Start', type: 'date' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  beforeEach(() => {
    initialSchema = ganttSchema
    initialRows = []
  })

  it('a dated, empty gantt adds a bar through "add a task" that stays draggable, with "add a task" still at the foot', async () => {
    const user = userEvent.setup()
    // The drag math (`pixelsToDays`) needs a real track width; jsdom's own
    // `getBoundingClientRect` is all zeros, which `pixelsToDays` treats as
    // "unmeasured" and zeroes the shift (apply.ts).
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 300 } as DOMRect)
    renderView(gantt)

    await user.click(screen.getByRole('button', { name: 'add a task' }))
    await user.type(screen.getByRole('textbox', { name: 'Add a task' }), 'plan')
    await user.keyboard('{Enter}')

    const todayIso = localDateIso(new Date())
    const tomorrowIso = addDays(todayIso, 1)
    expect(addRow).toHaveBeenCalledWith({ 'p-start': todayIso, 'p-due': tomorrowIso })
    expect(renameRow).toHaveBeenCalledWith('r-new-0', 'plan')

    const bar = screen.getByRole('button', { name: /Reschedule plan:/ })
    expect(screen.getByRole('textbox', { name: 'Add a task' })).toBeInTheDocument()

    // Drag the body (move) right by a full day's worth of pixels — the existing
    // `onBarPointerDown`/`usePointerGanttDrag` wiring, unchanged by this ticket.
    fireEvent.pointerDown(bar, { clientX: 0 })
    fireEvent.pointerMove(bar, { clientX: 150 })
    fireEvent.pointerUp(bar)

    const dayAfterIso = addDays(tomorrowIso, 1)
    expect(setValue).toHaveBeenCalledWith('r-new-0', 'p-start', tomorrowIso)
    expect(setValue).toHaveBeenCalledWith('r-new-0', 'p-due', dayAfterIso)
  })

  it('a non-editable render shows no "add a task" row', () => {
    renderView(gantt, false)
    expect(screen.queryByRole('button', { name: 'add a task' })).not.toBeInTheDocument()
  })
})

describe('CollectionGantt — the add-a-task row never remounts across the void→bars transition (KAN-352)', () => {
  const ganttSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-start', name: 'Start', type: 'date' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  beforeEach(() => {
    initialSchema = ganttSchema
    initialRows = []
  })

  it('keeps the draft and focus while a slow addRow is still in flight', async () => {
    const user = userEvent.setup()
    const todayIso = localDateIso(new Date())
    const tomorrowIso = addDays(todayIso, 1)
    let resolveAdd: (id: string) => void = () => {}
    // Deferred like the real hook's `getUser` + `createPage` round trip: the row only
    // lands in `rows` (flipping the void branch to the bar list) once resolved.
    addRow.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveAdd = (id: string) => {
            updateRows([{ id, title: '', values: { 'p-start': todayIso, 'p-due': tomorrowIso } }])
            resolve(id)
          }
        })
    )

    renderView(gantt)

    await user.click(screen.getByRole('button', { name: 'add a task' }))
    const input = screen.getByRole('textbox', { name: 'Add a task' })
    await user.type(input, 'plan')
    await user.keyboard('{Enter}')
    // addRow is still awaiting — the void branch is still showing. Keep typing.
    await user.type(input, 'de')

    await act(async () => {
      resolveAdd('r-new-0')
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    const liveInput = screen.getByRole('textbox', { name: 'Add a task' })
    expect(liveInput).toHaveValue('de')
    expect(liveInput).toHaveFocus()
    expect(screen.getByRole('button', { name: /Reschedule plan:/ })).toBeInTheDocument()
  })
})

describe('ViewView — the /table path end to end: add a row, type a title and a date (KAN-299)', () => {
  const tableSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-date', name: 'Date', type: 'date' },
  ]

  beforeEach(() => {
    initialSchema = tableSchema
    initialRows = []
  })

  it('saves exactly what was typed into the title and date cells, only after moving focus away', async () => {
    const user = userEvent.setup()
    renderView(table)

    await user.click(screen.getByRole('button', { name: '+ Add row' }))

    const titleInput = await screen.findByRole('textbox', { name: 'Row title' })
    await user.click(titleInput)
    await user.type(titleInput, 'kan299 dated record')
    expect(renameRow).not.toHaveBeenCalled()

    const dateButton = screen.getByRole('button', { name: 'Date value' })
    // Clicking the date cell blurs the title input, committing it, and opens
    // the date editor (KAN-350: the atom's `editing` state, no native
    // `type="date"` input left to drive).
    await user.click(dateButton)
    expect(renameRow).toHaveBeenCalledTimes(1)
    const rowId = renameRow.mock.calls[0]![0] as string
    expect(renameRow).toHaveBeenCalledWith(rowId, 'kan299 dated record')

    const dateInput = screen.getByLabelText('Date value')
    await user.type(dateInput, '2026-10-20')
    expect(setValue).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(setValue).toHaveBeenCalledTimes(1)
    expect(setValue).toHaveBeenCalledWith(rowId, 'p-date', '2026-10-20')
  })
})

describe("CollectionTable — the last cell's date/tag editors keep their own Enter/↓ (KAN-350)", () => {
  // date last, then select last, in two fixtures — the KAN-344 step-out guard
  // only fires on the LAST column, so each atom needs a turn sitting there.
  const dateLastSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'opt-event', label: 'event' },
        { id: 'opt-appt', label: 'appointment' },
      ],
    },
    { id: 'p-date', name: 'Date', type: 'date' },
  ]
  const selectLastSchema: PropertySchema = [dateLastSchema[0], dateLastSchema[2], dateLastSchema[1]]

  function renderTableWithStepOut(stepOut: jest.Mock) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
            <BlockRowProvider value={{ selected: true, stepOut }}>
              <ViewView data={table} editable onChange={jest.fn()} />
            </BlockRowProvider>
          </SiblingBlocksProvider>
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
  }

  it("Enter on the last cell's date trigger opens the editor, not a stepped-out new line", async () => {
    const user = userEvent.setup()
    initialSchema = dateLastSchema
    initialRows = [{ id: 'r1', title: 'only row', values: { 'p-status': 'opt-event' } }]
    const stepOut = jest.fn()
    renderTableWithStepOut(stepOut)

    screen.getByRole('button', { name: 'Date value' }).focus()
    await user.keyboard('{Enter}')

    expect(screen.getByLabelText('Date value').tagName).toBe('INPUT')
    expect(stepOut).not.toHaveBeenCalled()
  })

  it('↵ on a garbage date in the last cell keeps the draft open ("not a date"), without stepping out', async () => {
    const user = userEvent.setup()
    initialSchema = dateLastSchema
    initialRows = [{ id: 'r1', title: 'only row', values: { 'p-status': 'opt-event' } }]
    const stepOut = jest.fn()
    renderTableWithStepOut(stepOut)

    await user.click(screen.getByRole('button', { name: 'Date value' }))
    const input = screen.getByLabelText('Date value')
    await user.clear(input)
    await user.type(input, 'not a day')
    await user.keyboard('{Enter}')

    expect(screen.getByText('not a date')).toBeInTheDocument()
    expect(screen.getByLabelText('Date value')).toHaveValue('not a day')
    expect(stepOut).not.toHaveBeenCalled()
  })

  it("↓ then ↵ inside the last cell's open tag popover picks a row, without stepping out", async () => {
    const user = userEvent.setup()
    initialSchema = selectLastSchema
    initialRows = [{ id: 'r1', title: 'only row', values: { 'p-status': 'opt-event' } }]
    const stepOut = jest.fn()
    renderTableWithStepOut(stepOut)

    await user.click(screen.getByRole('button', { name: 'Status value' }))
    expect(screen.getByRole('listbox', { name: 'options' })).toBeInTheDocument()

    await user.keyboard('{ArrowDown}')
    expect(stepOut).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox', { name: 'options' })).toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(setValue).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(stepOut).not.toHaveBeenCalled()
  })
})

describe('CollectionView — every mode/groupBy/sort/filter/chart/bigNumber read runs off the ACTIVE saved view (KAN-32)', () => {
  const multiViewSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-start', name: 'Start', type: 'date' },
  ]

  // The top-level `mode`/`groupBy` are a STALE back-compat mirror, deliberately left
  // pointed at the board — a buggy read that fell through to them instead of the
  // resolved active view would render the board, grouped by status, instead of the
  // gantt the `activeViewId` actually names.
  const multiView: ViewBlock = {
    id: 'v-multi',
    type: 'view',
    mode: 'board',
    groupBy: 'p-status',
    views: [
      { id: 'view-board', kind: 'board', config: { groupBy: 'p-status' } },
      { id: 'view-gantt', kind: 'gantt', config: {} },
    ],
    activeViewId: 'view-gantt',
  }

  beforeEach(() => {
    initialSchema = multiViewSchema
    initialRows = [
      { id: 'r1', title: 'Task 1', values: { 'p-status': 'opt-todo', 'p-start': '2026-01-01' } },
    ]
  })

  it('renders the gantt the activeViewId names, not the board its stray top-level groupBy points at', () => {
    renderView(multiView)

    expect(screen.getByRole('button', { name: /Reschedule Task 1/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '＋ task' })).not.toBeInTheDocument()
  })

  it("never leaks the OTHER saved view's groupBy into the active (gantt) render", () => {
    renderView(multiView)

    // The board's lane head ("Todo", its row count) only ever draws inside a board —
    // its absence here is exactly what "no leak" means for a groupBy a gantt never reads.
    expect(screen.queryByText('Todo')).not.toBeInTheDocument()
  })
})

const layoutNames = LAYOUT_MENU_MODES.map((mode) => VIEW_KINDS[mode].label)

describe('ViewView — the layout menu sits in the head (KAN-519)', () => {
  it('a legacy table shows a button named table and no saved-view tab; opening it lists the seven layouts, and Esc does not call onChange', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    renderView(table, true, onChange)

    expect(screen.getByRole('button', { name: 'table' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    const menu = await screen.findByRole('menu', { name: 'layout' })
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(layoutNames)

    await waitFor(() =>
      expect(screen.getByRole('menu', { name: 'layout' }).contains(document.activeElement)).toBe(
        true
      )
    )
    await user.keyboard('{Escape}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('editable={false} shows the word table and no layout button', () => {
    renderView(table, false)

    const word = screen.getByText('table')
    expect(word.closest('button')).toBeNull()
    expect(screen.queryByRole('button', { name: 'table' })).not.toBeInTheDocument()
  })
})

describe('ViewView — choosing Board on a legacy table (KAN-519)', () => {
  const statusSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = statusSchema
    initialRows = [{ id: 'r-standup', title: 'Standup', values: { 'p-status': 'opt-todo' } }]
  })

  it('writes mode board on the same block and draws Standup as a card, grouped by status', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = renderStatefulView(legacyTable, onChange)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Standup')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'board' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ViewBlock
    expect(next).toEqual({ ...legacyTable, mode: 'board' })
    expect(next.id).toBe(legacyTable.id)
    expect(next).not.toHaveProperty('views')
    expect(next.filter).toEqual(legacyTable.filter)
    expect(next.sort).toEqual(legacyTable.sort)

    expect(screen.getByRole('article', { name: 'Standup' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Standup')).toBeInTheDocument()
    const head = container.querySelector('[data-part="view-head"]')
    expect(head).toHaveTextContent(/1 record\s*·\s*grouped by status/)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('ViewView — choosing Calendar when the schema has no date field (KAN-519)', () => {
  const statusSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = statusSchema
    initialRows = [{ id: 'r-standup', title: 'Standup', values: { 'p-status': 'opt-todo' } }]
  })

  it('writes mode calendar and shows the date line and add a date field', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    renderStatefulView(legacyTable, onChange)

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'calendar' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ViewBlock
    expect(next).toEqual({ ...legacyTable, mode: 'calendar' })
    expect(next.id).toBe(legacyTable.id)
    expect(next).not.toHaveProperty('views')
    expect(next.filter).toEqual(legacyTable.filter)
    expect(next.sort).toEqual(legacyTable.sort)

    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'add a date field' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('ViewView — choosing List on a dated legacy table (KAN-523)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [
      {
        id: 'r-standup',
        title: 'Standup',
        values: { 'p-status': 'opt-todo', 'p-due': '2026-06-01' },
      },
    ]
  })

  it('writes mode list on the same block and shows Standup as a list row, with no saved view', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = renderStatefulView(legacyTable, onChange)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Standup')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'list' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ViewBlock
    expect(next).toEqual({ ...legacyTable, mode: 'list' })
    expect(next.id).toBe(legacyTable.id)
    expect(next).not.toHaveProperty('views')
    expect(next.filter).toEqual(legacyTable.filter)
    expect(next.sort).toEqual(legacyTable.sort)

    const row = container.querySelector('[data-part="list-row"]')
    expect(row).toHaveTextContent('Standup')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('ViewView — choosing Timeline on a dated legacy table (KAN-523)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [
      {
        id: 'r-standup',
        title: 'Standup',
        values: { 'p-status': 'opt-todo', 'p-due': '2026-06-01' },
      },
    ]
  })

  it('writes mode gantt on the same block and draws Standup on the timeline, with no saved view', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = renderStatefulView(legacyTable, onChange)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Standup')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'timeline' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ViewBlock
    expect(next).toEqual({ ...legacyTable, mode: 'gantt' })
    expect(next.id).toBe(legacyTable.id)
    expect(next).not.toHaveProperty('views')
    expect(next.filter).toEqual(legacyTable.filter)
    expect(next.sort).toEqual(legacyTable.sort)

    const label = container.querySelector('[data-part="gantt-label"]')
    expect(label).toHaveTextContent('Standup')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('ViewView — choosing Gallery on a dated legacy table (KAN-523)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [
      {
        id: 'r-standup',
        title: 'Standup',
        values: { 'p-status': 'opt-todo', 'p-due': '2026-06-01' },
      },
    ]
  })

  it('writes mode gallery on the same block and shows Standup as a gallery card, with no saved view', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = renderStatefulView(legacyTable, onChange)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Standup')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'gallery' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ViewBlock
    expect(next).toEqual({ ...legacyTable, mode: 'gallery' })
    expect(next.id).toBe(legacyTable.id)
    expect(next).not.toHaveProperty('views')
    expect(next.filter).toEqual(legacyTable.filter)
    expect(next.sort).toEqual(legacyTable.sort)

    const gallery = container.querySelector('[data-part="gallery"]')
    expect(gallery).toBeInstanceOf(HTMLElement)
    expect(
      within(gallery as HTMLElement).getByRole('article', { name: 'Standup' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('ViewView — choosing Chart on a dated legacy table (KAN-523)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [
      {
        id: 'r-standup',
        title: 'Standup',
        values: { 'p-status': 'opt-todo', 'p-due': '2026-06-01' },
      },
    ]
  })

  it('writes mode chart on the same block without a chart config and shows the chart card', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = renderStatefulView(legacyTable, onChange)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Standup')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'chart' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ViewBlock
    expect(next).toEqual({ ...legacyTable, mode: 'chart' })
    expect(next.id).toBe(legacyTable.id)
    expect(next).not.toHaveProperty('views')
    expect(next).not.toHaveProperty('chart')
    expect(next.filter).toEqual(legacyTable.filter)
    expect(next.sort).toEqual(legacyTable.sort)

    expect(container.querySelector('[data-part="plot"]')).toBeInstanceOf(HTMLElement)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('ViewView — choosing Board when the schema has no status or select field (KAN-523)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [
      {
        id: 'r-standup',
        title: 'Standup',
        values: { 'p-due': '2026-06-01' },
      },
    ]
  })

  it('writes mode board on the same block and shows the status line and add a status field', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    renderStatefulView(legacyTable, onChange)

    expect(screen.getByRole('table')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'board' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ViewBlock
    expect(next).toEqual({ ...legacyTable, mode: 'board' })
    expect(next.id).toBe(legacyTable.id)
    expect(next).not.toHaveProperty('views')
    expect(next.filter).toEqual(legacyTable.filter)
    expect(next.sort).toEqual(legacyTable.sort)

    expect(screen.getByText(BOARD_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'add a status field' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('ViewView — switching a non-first saved view to Board (KAN-523)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  const rowsView = {
    id: 'view-rows',
    label: 'rows',
    kind: 'table' as const,
  }
  const queueView = {
    id: 'view-queue',
    label: 'queue',
    kind: 'list' as const,
  }

  const savedViews: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    views: [rowsView, queueView],
    activeViewId: 'view-rows',
  }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [
      {
        id: 'r-standup',
        title: 'Standup',
        values: { 'p-status': 'opt-todo', 'p-due': '2026-06-01' },
      },
    ]
  })

  it('writes kind board on the open saved view only, and a remount still shows that view as a board', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { unmount } = renderStatefulView(savedViews, onChange)

    expect(screen.getByRole('button', { name: 'table' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'rows' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'queue' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'list' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'list' }))
    await user.click(await screen.findByRole('menuitem', { name: 'board' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ViewBlock
    expect(next.views).toHaveLength(2)
    expect(next.views?.[1]).toEqual({ ...queueView, kind: 'board' })
    expect(next.views?.[1]?.id).toBe(queueView.id)
    expect(next.views?.[1]?.label).toBe(queueView.label)
    expect(next.views?.[0]).toBe(rowsView)
    expect(next.mode).toBe(savedViews.mode)
    expect(next.activeViewId).toBe(savedViews.activeViewId)

    unmount()
    renderView(next)

    expect(next.views?.[0]?.kind).toBe('table')
    expect(screen.getByRole('button', { name: 'table' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'rows' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'queue' }))

    expect(screen.getByRole('button', { name: 'board' })).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'Standup' })
    expect(card).toHaveAttribute('data-part', 'card')
    expect(within(card).getByDisplayValue('Standup')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('ViewView — a layout write that changes the kind is one structural commit (KAN-519)', () => {
  const statusSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = statusSchema
    initialRows = [{ id: 'r-standup', title: 'Standup', values: { 'p-status': 'opt-todo' } }]
  })

  it('calls commitStep once for table to board, never for board to board, and the captured previous block is the table', async () => {
    const user = userEvent.setup()
    const commitStep = jest.fn()
    const onChange = jest.fn()
    let previous: ViewBlock = legacyTable

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = (block: ViewBlock) => (
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
            <BlockRowProvider
              value={{
                selected: false,
                stepOut: () => {},
                commitStep: (patch) => {
                  previous = block
                  commitStep(patch)
                },
              }}
            >
              <ViewView data={block} editable onChange={onChange} />
            </BlockRowProvider>
          </SiblingBlocksProvider>
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    const { rerender } = render(tree(legacyTable))

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'board' }))

    expect(commitStep).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    const next = commitStep.mock.calls[0][0] as ViewBlock
    expect(next).toEqual({ ...legacyTable, mode: 'board' })

    rerender(tree(next))

    await user.click(screen.getByRole('button', { name: 'board' }))
    await user.click(await screen.findByRole('menuitem', { name: 'board' }))

    expect(commitStep).toHaveBeenCalledTimes(1)

    rerender(tree(previous))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Standup' })).not.toBeInTheDocument()
  })
})

/**
 * The page host's one structural step (KAN-519). `commitStep` keeps the block
 * that was on screen, then draws the next one. Stepping back sets that kept
 * block again. `reload` remounts `ViewView` on that written block: the bar
 * seeds once from `activeViewId`, so only a fresh mount reads the saved view
 * the way a reload does, and the kept block is still there for one step back.
 * No platform chord: CI is Linux, and the shell undo is BlockCanvas.
 */
function LayoutPath({
  initial,
  onReady,
  onCommit,
  onChange,
}: {
  initial: ViewBlock
  onReady: (stepBack: () => void, reload: () => void) => void
  onCommit?: (next: ViewBlock) => void
  onChange?: (next: ViewBlock) => void
}) {
  const [data, setData] = useState(initial)
  const [generation, setGeneration] = useState(0)
  const beforeLastRef = useRef(initial)

  useEffect(() => {
    onReady(
      () => {
        setData(beforeLastRef.current)
      },
      () => {
        setGeneration((current) => current + 1)
      }
    )
  }, [onReady])

  const handleCommit = (next: Block) => {
    beforeLastRef.current = data
    const written = next as ViewBlock
    onCommit?.(written)
    setData(written)
  }
  return (
    <BlockRowProvider
      value={{
        selected: false,
        stepOut: () => {},
        commitStep: handleCommit,
      }}
    >
      <ViewView
        key={generation > 0 ? generation : undefined}
        data={data}
        editable
        onChange={onChange ?? (() => {})}
      />
    </BlockRowProvider>
  )
}

function renderLayoutPath(
  initial: ViewBlock,
  onReady: (stepBack: () => void, reload: () => void) => void,
  options?: {
    onCommit?: (next: ViewBlock) => void
    onChange?: (next: ViewBlock) => void
  }
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
          <LayoutPath
            initial={initial}
            onReady={onReady}
            onCommit={options?.onCommit}
            onChange={options?.onChange}
          />
        </SiblingBlocksProvider>
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

describe('ViewView — the path: layout menu, board, table, calendar, one step back (KAN-519)', () => {
  const statusSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = statusSchema
    initialRows = [{ id: 'r-standup', title: 'Standup', values: { 'p-status': 'opt-todo' } }]
  })

  it('opens the layout menu and walks board, table, calendar, then one step back to the table', async () => {
    const user = userEvent.setup()
    let stepBack = (): void => {}
    const handleReady = (next: () => void) => {
      stepBack = next
    }
    const { container } = renderLayoutPath(legacyTable, handleReady)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Standup')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'board' }))

    expect(screen.getByRole('article', { name: 'Standup' })).toBeInTheDocument()
    const head = container.querySelector('[data-part="view-head"]')
    expect(head).toHaveTextContent(/grouped by status/)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'board' }))
    await user.click(await screen.findByRole('menuitem', { name: 'table' }))

    const table = screen.getByRole('table')
    expect(within(table).getByDisplayValue('Standup')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Standup' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'calendar' }))

    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'add a date field' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    act(() => {
      stepBack()
    })

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByDisplayValue('Standup')).toBeInTheDocument()
    expect(screen.queryByText(CALENDAR_EMPTY_LINE)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
  })
})

describe('ViewView — one layout write steps back to the previous kind (KAN-523)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [
      {
        id: 'r-standup',
        title: 'Standup',
        values: { 'p-status': 'opt-todo', 'p-due': '2026-06-01' },
      },
    ]
  })

  it('chooses timeline as one structural step, and one step back restores the table and the chip', async () => {
    const user = userEvent.setup()
    let stepBack = (): void => {}
    const handleReady = (next: () => void) => {
      stepBack = next
    }
    const { container } = renderLayoutPath(legacyTable, handleReady)

    expect(screen.getByRole('button', { name: 'table' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Standup')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'timeline' }))

    const label = container.querySelector('[data-part="gantt-label"]')
    expect(label).toHaveTextContent('Standup')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    act(() => {
      stepBack()
    })

    const table = screen.getByRole('table')
    expect(within(table).getByDisplayValue('Standup')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'table' })).toBeInTheDocument()
    expect(container.querySelector('[data-part="gantt-label"]')).not.toBeInTheDocument()
  })
})

describe('ViewView — the path: list, timeline, gallery, chart, board, saved view, one step back (KAN-523)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]
  const statuslessSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  const legacyTable: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    filter: { property: 'p-status', op: 'eq', value: 'opt-todo' },
    sort: { key: 'p-title', dir: 'asc' },
  }

  const rowsView = {
    id: 'view-rows',
    label: 'rows',
    kind: 'table' as const,
  }
  const queueView = {
    id: 'view-queue',
    label: 'queue',
    kind: 'list' as const,
  }
  const savedViews: ViewBlock = {
    id: 'v-standup',
    type: 'view',
    mode: 'table',
    views: [rowsView, queueView],
    activeViewId: 'view-rows',
  }

  const datedRow: CollectionRow = {
    id: 'r-standup',
    title: 'Standup',
    values: { 'p-status': 'opt-todo', 'p-due': '2026-06-01' },
  }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [datedRow]
  })

  it('walks list, timeline, gallery, and chart, then a status-less board, then keeps a saved view as a board after remount and one step back', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const first = renderStatefulView(legacyTable, onChange)

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'list' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const listed = onChange.mock.calls[0][0] as ViewBlock
    expect(listed).toEqual({ ...legacyTable, mode: 'list' })
    expect(listed).not.toHaveProperty('views')
    expect(first.container.querySelector('[data-part="list-row"]')).toHaveTextContent('Standup')

    await user.click(screen.getByRole('button', { name: 'list' }))
    await user.click(await screen.findByRole('menuitem', { name: 'timeline' }))

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(first.container.querySelector('[data-part="gantt-label"]')).toHaveTextContent('Standup')

    await user.click(screen.getByRole('button', { name: 'timeline' }))
    await user.click(await screen.findByRole('menuitem', { name: 'gallery' }))

    expect(onChange).toHaveBeenCalledTimes(3)
    const gallery = first.container.querySelector('[data-part="gallery"]')
    expect(gallery).toBeInstanceOf(HTMLElement)
    expect(
      within(gallery as HTMLElement).getByRole('article', { name: 'Standup' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'gallery' }))
    await user.click(await screen.findByRole('menuitem', { name: 'chart' }))

    expect(onChange).toHaveBeenCalledTimes(4)
    const charted = onChange.mock.calls[3][0] as ViewBlock
    expect(charted).toEqual({ ...legacyTable, mode: 'chart' })
    expect(charted).not.toHaveProperty('views')
    expect(charted).not.toHaveProperty('chart')
    expect(first.container.querySelector('[data-part="plot"]')).toBeInstanceOf(HTMLElement)

    first.unmount()

    initialSchema = statuslessSchema
    initialRows = [{ id: 'r-standup', title: 'Standup', values: { 'p-due': '2026-06-01' } }]
    const onBoard = jest.fn()
    const second = renderStatefulView(legacyTable, onBoard)

    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'board' }))

    expect(onBoard).toHaveBeenCalledTimes(1)
    const boarded = onBoard.mock.calls[0][0] as ViewBlock
    expect(boarded).toEqual({ ...legacyTable, mode: 'board' })
    expect(boarded).not.toHaveProperty('views')
    expect(screen.getByText(BOARD_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'add a status field' })).toBeInTheDocument()

    second.unmount()

    initialSchema = datedSchema
    initialRows = [datedRow]
    const onSavedChange = jest.fn()
    const commits: ViewBlock[] = []
    let stepBack = (): void => {}
    let reload = (): void => {}
    const third = renderLayoutPath(
      savedViews,
      (nextStepBack, nextReload) => {
        stepBack = nextStepBack
        reload = nextReload
      },
      {
        onChange: onSavedChange,
        onCommit: (next) => {
          commits.push(next)
        },
      }
    )

    expect(screen.getByRole('button', { name: 'table' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'rows' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'queue' }))

    expect(onSavedChange).not.toHaveBeenCalled()
    expect(commits).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'list' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'list' }))
    await user.click(await screen.findByRole('menuitem', { name: 'board' }))

    expect(onSavedChange).not.toHaveBeenCalled()
    expect(commits).toHaveLength(1)
    const written = commits[0]
    expect(written.views?.[1]).toEqual({ ...queueView, kind: 'board' })
    expect(written.views?.[1]?.id).toBe(queueView.id)
    expect(written.views?.[1]?.label).toBe(queueView.label)
    expect(written.views?.[0]).toBe(rowsView)
    expect(written.mode).toBe(savedViews.mode)
    expect(written.activeViewId).toBe(savedViews.activeViewId)

    act(() => {
      reload()
    })

    expect(written.views?.[0]?.kind).toBe('table')
    expect(screen.getByRole('button', { name: 'table' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'rows' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'queue' }))

    expect(screen.getByRole('button', { name: 'board' })).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'Standup' })
    expect(card).toHaveAttribute('data-part', 'card')
    expect(within(card).getByDisplayValue('Standup')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    act(() => {
      stepBack()
    })

    expect(screen.getByRole('tab', { name: 'queue' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'list' })).toBeInTheDocument()
    expect(third.container.querySelector('[data-part="list-row"]')).toHaveTextContent('Standup')
    expect(screen.queryByRole('article', { name: 'Standup' })).not.toBeInTheDocument()
    expect(written.views?.[0]).toBe(rowsView)
  })
})

describe('CollectionView — the saved-view bar switches views as reading, not editing (KAN-36)', () => {
  const barSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-start', name: 'Start', type: 'date' },
  ]

  const barView: ViewBlock = {
    id: 'v-bar',
    type: 'view',
    mode: 'board',
    groupBy: 'p-status',
    views: [
      { id: 'view-board', label: 'board', kind: 'board', config: { groupBy: 'p-status' } },
      { id: 'view-gantt', label: 'timeline', kind: 'gantt', config: {} },
    ],
    activeViewId: 'view-board',
  }

  beforeEach(() => {
    initialSchema = barSchema
    initialRows = [
      { id: 'r1', title: 'Task 1', values: { 'p-status': 'opt-todo', 'p-start': '2026-01-01' } },
    ]
  })

  it('a non-editable render shows the name, record count and bar, with no "＋ view"', () => {
    const { container } = renderView(barView, false)

    expect(screen.getByText('Trips')).toBeInTheDocument()
    expect(screen.getByText('1 record')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'board' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'timeline' })).toBeInTheDocument()
    expect(screen.queryByText('＋ view')).not.toBeInTheDocument()

    // KAN-242's count + config facts join with ' · ', not two bare spans.
    const head = container.querySelector('[data-part="view-head"]')
    expect(head).toHaveTextContent(/1 record\s*·\s*grouped by status/)
  })

  it('joins no separator when there is no config fact to join (gantt has no groupBy)', () => {
    const { container } = renderView({ id: 'v-gantt-only', type: 'view', mode: 'gantt' }, false)

    const head = container.querySelector('[data-part="view-head"]')
    expect(head).toHaveTextContent('1 record')
    expect(head).not.toHaveTextContent('·')
  })

  it('clicking "timeline" switches the rendered mode to gantt, even without editable', async () => {
    const user = userEvent.setup()
    renderView(barView, false)

    await user.click(screen.getByRole('tab', { name: 'timeline' }))

    expect(screen.getByRole('img', { name: 'Task 1: 2026-01-01' })).toBeInTheDocument()
  })

  it('clicking "board" back renders the board, still grouped by status', async () => {
    const user = userEvent.setup()
    renderView(barView, false)

    await user.click(screen.getByRole('tab', { name: 'timeline' }))
    await user.click(screen.getByRole('tab', { name: 'board' }))

    expect(screen.getByText('Todo')).toBeInTheDocument()
  })

  it('a legacy (no views) block shows the name and record count, with no saved-view tab', () => {
    renderView(board, false)

    expect(screen.getByText('Trips')).toBeInTheDocument()
    expect(screen.getByText('1 record')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('tells a mounted ActiveViewSelectionContext listener which saved view was picked (KAN-321)', async () => {
    const user = userEvent.setup()
    const onSelectActiveView = jest.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
            <ActiveViewSelectionContext.Provider value={onSelectActiveView}>
              <ViewView data={barView} editable={false} onChange={jest.fn()} />
            </ActiveViewSelectionContext.Provider>
          </SiblingBlocksProvider>
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('tab', { name: 'timeline' }))

    expect(onSelectActiveView).toHaveBeenCalledWith('view-gantt')
  })
})

describe('CollectionView — a config edit lands on the LOCALLY active view, not the persisted activeViewId (KAN-32)', () => {
  const chartSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
  ]

  const boardAndChartView: ViewBlock = {
    id: 'v-bc',
    type: 'view',
    mode: 'board',
    views: [
      { id: 'view-board', label: 'board', kind: 'board', config: { groupBy: 'p-status' } },
      { id: 'view-chart', label: 'chart', kind: 'chart', config: {} },
    ],
    // Deliberately still pointed at "board" — a person's bar click never persists
    // `activeViewId` (switching is reading, not editing), so this is what the OLD,
    // buggy `applyConfigPatch(data, patch)` call would have targeted instead of
    // the chart view the bar actually shows.
    activeViewId: 'view-board',
  }

  beforeEach(() => {
    initialSchema = chartSchema
    initialRows = []
  })

  it('a chart setup change after switching tabs patches the chart view, leaving the board view untouched', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    renderView(boardAndChartView, true, onChange)

    await user.click(screen.getByRole('tab', { name: 'chart' }))
    await user.selectOptions(screen.getByLabelText('Chart'), 'line')

    expect(onChange).toHaveBeenCalledTimes(1)
    const patched = onChange.mock.calls[0][0] as ViewBlock
    expect(patched.views?.[1]).toMatchObject({
      id: 'view-chart',
      config: { chart: { kind: 'line' } },
    })
    expect(patched.views?.[0]).toEqual(boardAndChartView.views![0])
  })
})

describe('ViewView — the path test: a premade-shaped tasks block, end to end (KAN-32/KAN-242, PATH_STEPS 3–7)', () => {
  const pathSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
    { id: 'p-start', name: 'Start', type: 'date' },
  ]

  // Mirrors the `project` template's `tasks` block (`premade.ts`): one view
  // block, two saved views — `board` (active, grouped by status) and
  // `timeline` (saved, no groupBy of its own).
  const pathView: ViewBlock = {
    id: 'v-path',
    type: 'view',
    mode: 'board',
    groupBy: 'p-status',
    views: [
      { id: 'view-board', label: 'board', kind: 'board', config: { groupBy: 'p-status' } },
      { id: 'view-timeline', label: 'timeline', kind: 'gantt', config: {} },
    ],
    activeViewId: 'view-board',
  }

  beforeEach(() => {
    initialSchema = pathSchema
    initialRows = [
      { id: 'r1', title: 'Task 1', values: { 'p-status': 'opt-todo', 'p-start': '2026-01-01' } },
    ]
  })

  it('renders "board" and "timeline" segments in order, "board" active', () => {
    renderView(pathView)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['board', 'timeline'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking "timeline" draws the gantt and makes it the active segment', async () => {
    const user = userEvent.setup()
    renderView(pathView)

    await user.click(screen.getByRole('tab', { name: 'timeline' }))

    expect(screen.getByRole('button', { name: /Reschedule Task 1/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'timeline' })).toHaveAttribute('aria-selected', 'true')
  })

  it('clicking "board" back renders the board, its groupBy still intact', async () => {
    const user = userEvent.setup()
    renderView(pathView)

    await user.click(screen.getByRole('tab', { name: 'timeline' }))
    await user.click(screen.getByRole('tab', { name: 'board' }))

    expect(screen.getByText('Todo')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'board' })).toHaveAttribute('aria-selected', 'true')
  })

  it('arrow keys move between segments, the selected one carrying aria-selected', async () => {
    const user = userEvent.setup()
    renderView(pathView)

    await user.click(screen.getByRole('tab', { name: 'board' }))
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'timeline' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'timeline' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'board' })).toHaveAttribute('aria-selected', 'false')
  })

  it('editable={false} keeps the name, count and segments, but shows no "＋ view"', () => {
    renderView(pathView, false)

    expect(screen.getByText('Trips')).toBeInTheDocument()
    expect(screen.getByText('1 record')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'board' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'timeline' })).toBeInTheDocument()
    expect(screen.queryByText('＋ view')).not.toBeInTheDocument()
  })
})

const FACT_CLASS = 'text-[10.5px] font-medium text-mn-text-meta'

describe('ViewView — the list head groups from its fact (KAN-521)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
  ]

  const listBlock: ViewBlock = { id: 'v-list', type: 'view', mode: 'list' }
  const boardBlock: ViewBlock = { id: 'v-board', type: 'view', mode: 'board' }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [
      {
        id: 'r-standup',
        title: 'Standup',
        values: { 'p-status': 'opt-todo', 'p-due': '2026-06-01' },
      },
    ]
  })

  it('an editable list opens status and none from grouped by due, and choosing status writes that patch', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = renderStatefulView(listBlock, onChange)

    const head = container.querySelector('[data-part="view-head"]')
    expect(head).toHaveTextContent(/grouped by due/)

    const fact = screen.getByRole('button', { name: 'grouped by due' })
    expect(fact).toHaveAttribute('data-part', 'db-facts')
    expect(fact.className).toContain(FACT_CLASS)

    await user.click(fact)
    const menu = await screen.findByRole('menu', { name: 'group' })
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(['Status', 'none'])

    await user.click(within(menu).getByRole('menuitem', { name: 'Status' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual({ ...listBlock, groupBy: 'p-status' })
    expect(head).toHaveTextContent(/grouped by status/)
    expect(head).not.toHaveTextContent(/grouped by due/)
    expect(screen.getByRole('button', { name: 'grouped by status' })).toBeInTheDocument()
  })

  it('Enter and Space on the grouped-by fact open the group menu', async () => {
    const user = userEvent.setup()
    renderStatefulView(listBlock, jest.fn())
    const fact = screen.getByRole('button', { name: 'grouped by due' })
    fact.focus()
    fireEvent.keyDown(fact, { key: 'Enter' })
    expect(screen.getByRole('menu', { name: 'group' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: 'group' })).not.toBeInTheDocument()
    )
    fireEvent.keyDown(fact, { key: ' ' })
    expect(screen.getByRole('menu', { name: 'group' })).toBeInTheDocument()
  })

  it('a reader sees the fact and no button', () => {
    const { container } = renderStatefulView(listBlock, jest.fn(), false)
    const fact = container.querySelector('[data-part="db-facts"]')
    expect(fact).toHaveTextContent('grouped by due')
    expect(fact?.tagName).toBe('SPAN')
    expect(fact?.className).toContain(FACT_CLASS)
    expect(fact?.closest('button')).toBeNull()
    expect(screen.queryByRole('button', { name: 'grouped by due' })).not.toBeInTheDocument()
  })

  it('a board head is not a button', () => {
    const { container } = renderStatefulView(boardBlock, jest.fn())
    const fact = container.querySelector('[data-part="db-facts"]')
    expect(fact).toHaveTextContent('grouped by status')
    expect(fact?.tagName).toBe('SPAN')
    expect(fact?.closest('button')).toBeNull()
    expect(screen.queryByRole('button', { name: 'grouped by status' })).not.toBeInTheDocument()
  })
})

describe('ViewView — listFlat stays on the list (KAN-521)', () => {
  const schema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
  ]
  const due = localDateIso(new Date())

  beforeEach(() => {
    initialSchema = schema
    initialRows = [{ id: 'r1', title: 'Standup', values: { 'p-status': 'opt-todo', 'p-due': due } }]
  })

  it('passes listFlat into the list, so a dated list draws one run', () => {
    const { container } = renderStatefulView(
      { id: 'v-list', type: 'view', mode: 'list', listFlat: true },
      jest.fn()
    )
    expect(screen.getByText('Standup')).toBeInTheDocument()
    expect(container.querySelector('[data-part="list-group"]')).toBeNull()
    expect(container.querySelector('[data-part="list-group-label"]')).toBeNull()
  })

  it('a board with listFlat still draws its lanes and grouped by status', () => {
    const { container } = renderStatefulView(
      { id: 'v-board', type: 'view', mode: 'board', listFlat: true },
      jest.fn()
    )
    const head = container.querySelector('[data-part="view-head"]')
    expect(head).toHaveTextContent(/grouped by status/)
    const todo = container.querySelector<HTMLElement>('[data-part="lane"][data-lane="Todo"]')
    expect(container.querySelector('[data-part="lanes"]')).not.toBeNull()
    expect(todo).not.toBeNull()
    expect(within(todo!).getByRole('article', { name: 'Standup' })).toBeInTheDocument()
  })

  it('a calendar with listFlat still places the row on its date', () => {
    const { container } = renderStatefulView(
      { id: 'v-cal', type: 'view', mode: 'calendar', listFlat: true },
      jest.fn()
    )
    const cell = container.querySelector<HTMLElement>(
      `[data-part="calendar-day-cell"][data-iso="${due}"]`
    )
    expect(cell).not.toBeNull()
    expect(within(cell!).getByText('Standup')).toBeInTheDocument()
  })
})

describe('ViewView — group a list from the head (KAN-521)', () => {
  const schema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
    {
      id: 'p-status',
      name: 'status',
      type: 'status',
      options: [
        { id: 'opt-todo', label: 'Todo' },
        { id: 'opt-doing', label: 'Doing' },
      ],
    },
  ]
  const listBlock: ViewBlock = { id: 'v-list', type: 'view', mode: 'list' }

  const headings = (container: HTMLElement): string[] =>
    [...container.querySelectorAll<HTMLElement>('[data-part="list-group"]')].map((group) => {
      const heading = group.querySelector('[data-part="list-group-label"]')
      const label = heading?.querySelector('span')
      return (label ?? heading)?.textContent ?? ''
    })

  const counts = (container: HTMLElement): string[] =>
    [...container.querySelectorAll<HTMLElement>('[data-part="list-group"]')].map(
      (group) => group.querySelector('[data-part="list-group-count"]')?.textContent ?? ''
    )

  const dueLabelsPresent = (container: HTMLElement): boolean =>
    DUE_BUCKETS.some((id) => container.querySelector(`[data-group="${id}"]`) !== null)

  const rowTitles = (container: HTMLElement): string[] =>
    [...container.querySelectorAll<HTMLElement>('[data-part="list-row"]')].map(
      (row) => row.querySelector('button:not([role="checkbox"])')?.textContent ?? ''
    )

  beforeEach(() => {
    initialSchema = schema
    initialRows = [
      {
        id: 'r-todo',
        title: 'Standup',
        values: { 'p-status': 'opt-todo', 'p-due': '2020-01-01' },
      },
      { id: 'r-empty', title: 'Loose', values: { 'p-due': '2020-01-01' } },
    ]
    setValue.mockImplementation((rowId: string, key: string, value: PropertyValue) => {
      applyRowValue(rowId, key, value)
    })
  })

  it('groups by the status field, flattens, then moves an empty row when its status changes', async () => {
    const user = userEvent.setup()
    const { container } = renderStatefulView(listBlock, jest.fn())

    const head = container.querySelector('[data-part="view-head"]')
    expect(head).toHaveTextContent(/grouped by due/)
    expect(dueLabelsPresent(container)).toBe(true)

    await user.click(screen.getByRole('button', { name: 'grouped by due' }))
    const statusMenu = await screen.findByRole('menu', { name: 'group' })
    await user.click(within(statusMenu).getByRole('menuitem', { name: 'status' }))
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: 'group' })).not.toBeInTheDocument()
    )

    expect(headings(container)).toEqual(['Todo', 'Doing', 'No status'])
    expect(counts(container)).toEqual(['1', '0', '1'])
    const noStatus = container.querySelector<HTMLElement>('[data-group="No status"]')
    expect(noStatus).not.toBeNull()
    expect(within(noStatus!).getByText('Loose')).toBeInTheDocument()
    expect(dueLabelsPresent(container)).toBe(false)

    await user.click(screen.getByRole('button', { name: 'grouped by status' }))
    const noneMenu = await screen.findByRole('menu', { name: 'group' })
    await user.click(within(noneMenu).getByRole('menuitem', { name: 'none' }))
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: 'group' })).not.toBeInTheDocument()
    )

    expect(container.querySelector('[data-part="list-group"]')).toBeNull()
    expect(container.querySelector('[data-part="list-group-label"]')).toBeNull()
    expect(rowTitles(container)).toEqual(['Standup', 'Loose'])
    expect(container.querySelectorAll('[data-part="list-card"] ul')).toHaveLength(1)
    expect(dueLabelsPresent(container)).toBe(false)

    await user.click(screen.getByRole('button', { name: 'grouped by none' }))
    const againMenu = await screen.findByRole('menu', { name: 'group' })
    await user.click(within(againMenu).getByRole('menuitem', { name: 'status' }))
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: 'group' })).not.toBeInTheDocument()
    )
    expect(headings(container)).toEqual(['Todo', 'Doing', 'No status'])

    await user.click(screen.getByRole('button', { name: 'Loose' }))
    const peek = screen.getByRole('complementary', { name: 'Record: Loose' })
    await user.click(within(peek).getByRole('button', { name: 'status value' }))
    const options = await screen.findByRole('listbox', { name: 'options' })
    await user.click(within(options).getByRole('option', { name: 'Doing' }))

    await waitFor(() => {
      expect(counts(container)).toEqual(['1', '1', '0'])
    })
    const doing = container.querySelector<HTMLElement>('[data-group="Doing"]')
    const emptied = container.querySelector<HTMLElement>('[data-group="No status"]')
    expect(doing).not.toBeNull()
    expect(emptied).not.toBeNull()
    expect(within(doing!).getByText('Loose')).toBeInTheDocument()
    expect(within(emptied!).queryByText('Loose')).not.toBeInTheDocument()
    expect(
      within(container.querySelector('[data-group="Todo"]')!).getByText('Standup')
    ).toBeInTheDocument()
  })
})

describe('ViewView — a group choice is one structural commit (KAN-521)', () => {
  const datedSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
    {
      id: 'p-status',
      name: 'Status',
      type: 'status',
      options: [{ id: 'opt-todo', label: 'Todo' }],
    },
  ]
  const listBlock: ViewBlock = { id: 'v-list', type: 'view', mode: 'list' }

  beforeEach(() => {
    initialSchema = datedSchema
    initialRows = [
      {
        id: 'r-standup',
        title: 'Standup',
        values: { 'p-status': 'opt-todo', 'p-due': '2026-06-01' },
      },
    ]
  })

  it('calls commitStep for a group choice and calls neither when the current field is chosen again', async () => {
    const user = userEvent.setup()
    const commitStep = jest.fn()
    const onChange = jest.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = (block: ViewBlock) => (
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
            <BlockRowProvider
              value={{
                selected: false,
                stepOut: () => {},
                commitStep,
              }}
            >
              <ViewView data={block} editable onChange={onChange} />
            </BlockRowProvider>
          </SiblingBlocksProvider>
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    const { rerender } = render(tree(listBlock))

    await user.click(screen.getByRole('button', { name: 'grouped by due' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Status' }))

    expect(commitStep).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(commitStep.mock.calls[0][0]).toEqual({ ...listBlock, groupBy: 'p-status' })

    rerender(tree({ ...listBlock, groupBy: 'p-status' }))

    await user.click(screen.getByRole('button', { name: 'grouped by status' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Status' }))

    expect(commitStep).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('KAN-525 strip marks', () => {
  const calendarSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]
  const dayCalendar: ViewBlock = { id: 'v-cal', type: 'view', mode: 'calendar', span: 'day' }
  const stripNames = ['mon 19', 'tue 20', 'wed 21', 'thu 22', 'fri 23', 'sat 24', 'sun 25'] as const

  beforeEach(() => {
    initialSchema = calendarSchema
    initialRows = [{ id: 'r-21', title: 'reading', values: { 'p-due': '2026-10-21' } }]
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  function stripDot(button: HTMLElement) {
    const dot = button.querySelector<HTMLElement>(':scope > span.size-1')
    if (!dot) throw new Error('strip dot missing')
    return dot
  }

  it('draws seven phone days on the day span and none on month or the desktop body', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const { container } = renderView(dayCalendar)

    const strip = container.querySelector<HTMLElement>('[data-part="calendar-week-strip"]')
    if (!strip) throw new Error('week strip missing')
    expect(strip).toHaveClass('grid', 'grid-cols-7', 'gap-0.5', 'md:hidden')

    const buttons = stripNames.map((name) => screen.getByRole('button', { name }))
    expect(buttons).toHaveLength(7)
    expect(buttons[0]).toHaveAttribute('aria-current', 'date')
    for (const button of buttons.slice(1)) {
      expect(button).not.toHaveAttribute('aria-current')
    }

    expect(buttons[0]).toHaveClass(
      'flex',
      'flex-col',
      'items-center',
      'gap-1',
      'rounded-[14px]',
      'py-[6px]',
      'ring-[1.4px]',
      'ring-inset',
      'ring-mn-text'
    )
    expect(buttons[2]).not.toHaveClass('ring-mn-text')

    expect(within(buttons[0]).getByText('m')).toHaveClass(
      'text-[10.5px]',
      'font-medium',
      'uppercase',
      'tracking-[.1em]',
      'text-mn-text-secondary'
    )
    const today = within(buttons[0]).getByText('19')
    expect(today).toHaveAttribute('data-part', 'due-today')
    expect(today).toHaveClass(
      'inline-flex',
      'h-7',
      'min-w-7',
      'items-center',
      'justify-center',
      'rounded-full',
      'px-1',
      'text-[14px]',
      'font-medium',
      'tabular-nums'
    )
    expect(today).not.toHaveClass('text-[13px]')

    expect(within(buttons[2]).getByText('21')).toHaveClass(
      'text-[14px]',
      'font-medium',
      'tabular-nums',
      'text-mn-text'
    )
    expect(stripDot(buttons[2])).toHaveClass('size-1', 'flex-none', 'rounded-full', 'bg-mn-text')
    expect(stripDot(buttons[0])).toHaveClass('bg-transparent')
    expect(stripDot(buttons[0])).not.toHaveClass('bg-mn-text')

    const desktop = container.querySelector('[data-part="calendar-day-body"][data-size="desktop"]')
    expect(desktop).not.toBeNull()
    expect(desktop?.querySelector('[data-part="calendar-week-strip"]')).toBeNull()
    expect(strip.closest('[data-size="desktop"]')).toBeNull()
    const order = [
      ...container.querySelectorAll(
        '[data-part="calendar-week-strip"], [data-part="calendar-day-body"]'
      ),
    ].map((el) => el.getAttribute('data-part'))
    expect(order[0]).toBe('calendar-week-strip')

    await user.click(screen.getByRole('radio', { name: 'month' }))

    expect(container.querySelector('[data-part="calendar-week-strip"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'mon 19' })).not.toBeInTheDocument()
  })
})

describe('KAN-525 strip week', () => {
  const calendarSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]
  const dayCalendar: ViewBlock = { id: 'v-cal', type: 'view', mode: 'calendar', span: 'day' }
  const previousWeek = ['mon 12', 'tue 13', 'wed 14', 'thu 15', 'fri 16', 'sat 17', 'sun 18'] as const

  beforeEach(() => {
    initialSchema = calendarSchema
    initialRows = []
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('Previous day across a Monday retargets the week to the open day', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const { container } = renderView(dayCalendar)

    expect(screen.getByRole('button', { name: 'mon 19' })).toHaveAttribute('aria-current', 'date')

    await user.click(screen.getByRole('button', { name: 'Previous day' }))

    expect(screen.getByText('sun 18 oct 2026')).toBeInTheDocument()
    const strip = container.querySelector<HTMLElement>('[data-part="calendar-week-strip"]')
    if (!strip) throw new Error('week strip missing')
    const buttons = previousWeek.map((name) => within(strip).getByRole('button', { name }))
    expect(buttons).toHaveLength(7)
    expect(buttons[6]).toHaveAttribute('aria-current', 'date')
    for (const button of buttons.slice(0, 6)) {
      expect(button).not.toHaveAttribute('aria-current')
    }
    expect(within(strip).queryByRole('button', { name: 'mon 19' })).not.toBeInTheDocument()
  })
})

describe('KAN-525 strip tap', () => {
  const calendarSchema: PropertySchema = [
    { id: 'p-title', name: 'Title', type: 'text' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]
  const dayCalendar: ViewBlock = { id: 'v-cal', type: 'view', mode: 'calendar', span: 'day' }

  beforeEach(() => {
    initialSchema = calendarSchema
    initialRows = [{ id: 'r-22', title: 'optician', values: { 'p-due': '2026-10-22' } }]
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('sets the open day and leaves the span on day', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onChange = jest.fn()
    const { container } = renderView(dayCalendar, true, onChange)

    expect(screen.getByRole('button', { name: 'mon 19' })).toHaveAttribute('aria-current', 'date')

    await user.click(screen.getByRole('button', { name: 'thu 22' }))

    expect(screen.getByText('thu 22 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'thu 22' })).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('button', { name: 'mon 19' })).not.toHaveAttribute('aria-current')
    const mobile = container.querySelector<HTMLElement>(
      '[data-part="calendar-day-body"][data-size="mobile"]'
    )
    if (!mobile) throw new Error('mobile day body missing')
    expect(within(mobile).getByText('optician')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
  })
})
