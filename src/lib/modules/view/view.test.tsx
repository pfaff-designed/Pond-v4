/**
 * KAN-292 — the path test: the calendar's, list's and timeline's `add a date field`
 * remedy, wired from the real `ViewView`/`CollectionView` host (not
 * `CollectionCalendar`, `CollectionList` or `CollectionGantt` alone). `ViewView`
 * builds the handler over `useCollectionRows().updateSchema` +
 * `useDeletionUndo`'s `stageUndo`, gated on `editable`, and threads the SAME
 * handler into all three.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { ViewView } from './view'
import { ActiveViewSelectionContext } from './active-view-context'
import type { ViewBlock } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'
import { addDays, type CollectionRow } from './apply'
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

function renderView(data: ViewBlock, editable = true, onChange: (next: ViewBlock) => void = jest.fn()) {
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

beforeEach(() => {
  updateSchema.mockClear()
  renameRow.mockClear()
  updateRows.mockClear()
  addRow.mockClear()
  setValue.mockClear()
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

  it('keeps the board\'s own example visible, struck through, once the row is gone from the data', () => {
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
    return container.querySelector<HTMLElement>(`[data-part="calendar-day-cell"][data-iso="${iso}"]`)!
  }

  const twentiethIso = `${localDateIso(new Date()).slice(0, 8)}20`

  it('clicking the 20th’s blank cell, typing and ↵ shows dentist on the 20th; another day then Esc writes nothing', async () => {
    const user = userEvent.setup()
    const { container } = renderView(calendar)

    await user.click(cellFor(container, twentiethIso))
    await user.type(screen.getByRole('textbox', { name: /Add an item on 20/ }), 'dentist')
    await user.keyboard('{Enter}')

    expect(within(cellFor(container, twentiethIso)).getByText('dentist')).toBeInTheDocument()
    expect(addRow).toHaveBeenCalledTimes(1)
    expect(renameRow).toHaveBeenCalledTimes(1)

    const anotherIso = addDays(twentiethIso, 1)
    await user.click(cellFor(container, anotherIso))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(cellFor(container, anotherIso)).queryByText('dentist')).not.toBeInTheDocument()
    // No second record anywhere in the grid: the mocks' call counts stayed at
    // the one `dentist` add from above.
    expect(addRow).toHaveBeenCalledTimes(1)
    expect(renameRow).toHaveBeenCalledTimes(1)
  })

  it('a non-editable render shows no input on any click', async () => {
    const user = userEvent.setup()
    const { container } = renderView(calendar, false)

    await user.click(cellFor(container, twentiethIso))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
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

    const dateInput = screen.getByLabelText('Date value')
    // Clicking the date cell blurs the title input, committing it.
    await user.click(dateInput)
    expect(renameRow).toHaveBeenCalledTimes(1)
    const rowId = renameRow.mock.calls[0]![0] as string
    expect(renameRow).toHaveBeenCalledWith(rowId, 'kan299 dated record')

    // jsdom's <input type="date"> has no segmented UI for user-event to drive
    // key by key — fireEvent.change reproduces the native per-keystroke
    // partial-year intermediates from the bug report directly (as cells.test.tsx
    // does for the cell in isolation).
    fireEvent.change(dateInput, { target: { value: '0002-10-20' } })
    fireEvent.change(dateInput, { target: { value: '0020-10-20' } })
    fireEvent.change(dateInput, { target: { value: '2026-10-20' } })
    expect(setValue).not.toHaveBeenCalled()

    await user.tab()
    expect(setValue).toHaveBeenCalledTimes(1)
    expect(setValue).toHaveBeenCalledWith(rowId, 'p-date', '2026-10-20')
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

  it('never leaks the OTHER saved view\'s groupBy into the active (gantt) render', () => {
    renderView(multiView)

    // The board's lane head ("Todo", its row count) only ever draws inside a board —
    // its absence here is exactly what "no leak" means for a groupBy a gantt never reads.
    expect(screen.queryByText('Todo')).not.toBeInTheDocument()
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
    const { container } = renderView(
      { id: 'v-gantt-only', type: 'view', mode: 'gantt' },
      false
    )

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

  it('a legacy (no views) block shows the name and record count, with no bar', () => {
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

describe('CollectionView — the ＋ view picker carries each kind\'s remedy line (KAN-243)', () => {
  const onePickerView: ViewBlock = {
    id: 'v-picker',
    type: 'view',
    mode: 'table',
    views: [{ id: 'view-table', label: 'table', kind: 'table', config: {} }],
    activeViewId: 'view-table',
  }

  beforeEach(() => {
    initialSchema = dateless
    initialRows = []
  })

  it('offers calendar, board and timeline with their remedy hint against a dateless, status-less schema', async () => {
    const user = userEvent.setup()
    renderView(onePickerView)

    await user.click(screen.getByRole('button', { name: 'add a view' }))

    expect(screen.getByRole('option', { name: /calendar/ })).toHaveTextContent(
      'add a date field to use calendar'
    )
    expect(screen.getByRole('option', { name: /board/ })).toHaveTextContent(
      'add a status field to use board'
    )
    expect(screen.getByRole('option', { name: /timeline/ })).toHaveTextContent(
      'add a date field to use timeline'
    )
    expect(screen.getByRole('option', { name: /^table/ })).not.toHaveTextContent('add a')
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
    expect(patched.views?.[1]).toMatchObject({ id: 'view-chart', config: { chart: { kind: 'line' } } })
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
