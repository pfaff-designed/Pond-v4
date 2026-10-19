import { useState } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionList, LIST_EMPTY_LINE } from './list'
import { DUE_BUCKETS } from './due-buckets'
import { CALENDAR_EMPTY_LINE } from './kinds'
import type { CollectionRow } from './apply'
import type { PropertySchema, PropertyValue } from '@/lib/properties/schema'

const schemaWithDate: PropertySchema = [
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-title', name: 'Title', type: 'text' },
]

// Mirrors the real `useCollectionRows` closely enough for the empty→foot
// transition: `addRow`/`renameRow` land in the same `rows` state the list reads.
function StatefulList() {
  const [rows, setRows] = useState<CollectionRow[]>([])
  let nextId = rows.length
  const onAddRow = async () => {
    const id = `r${++nextId}`
    setRows((prev) => [...prev, { id, values: {}, title: '' }])
    return id
  }
  const onRenameRow = (rowId: string, title: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, title } : row)))
  }
  return (
    <CollectionList
      viewKey="v1"
      schema={schemaWithDate}
      rows={rows}
      editable
      onAddRow={onAddRow}
      onRenameRow={onRenameRow}
    />
  )
}

describe('CollectionList — add an item from empty (KAN-352)', () => {
  it('opens the shared input from the empty state and adds a record on Enter', async () => {
    const user = userEvent.setup()
    const onAddRow = jest.fn().mockResolvedValue('r1')
    const onRenameRow = jest.fn()
    render(
      <CollectionList
        viewKey="v1"
        schema={schemaWithDate}
        rows={[]}
        editable
        onAddRow={onAddRow}
        onRenameRow={onRenameRow}
      />
    )

    await user.click(screen.getByRole('button', { name: 'add an item' }))
    const input = screen.getByRole('textbox', { name: 'Add an item' })
    await user.type(input, 'milk')
    await user.keyboard('{Enter}')

    expect(onAddRow).toHaveBeenCalledTimes(1)
    expect(onRenameRow).toHaveBeenCalledWith('r1', 'milk')
  })

  it('writes nothing on an empty Enter', async () => {
    const user = userEvent.setup()
    const onAddRow = jest.fn().mockResolvedValue('r1')
    const onRenameRow = jest.fn()
    render(
      <CollectionList
        viewKey="v1"
        schema={schemaWithDate}
        rows={[]}
        editable
        onAddRow={onAddRow}
        onRenameRow={onRenameRow}
      />
    )

    await user.click(screen.getByRole('button', { name: 'add an item' }))
    await user.keyboard('{Enter}')

    expect(onAddRow).not.toHaveBeenCalled()
    expect(onRenameRow).not.toHaveBeenCalled()
  })

  it('shows no add affordance when not editable', () => {
    render(
      <CollectionList
        viewKey="v1"
        schema={schemaWithDate}
        rows={[]}
        onAddRow={jest.fn()}
        onRenameRow={jest.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'add an item' })).not.toBeInTheDocument()
    expect(screen.getByText(LIST_EMPTY_LINE)).toBeInTheDocument()
  })
})

describe('CollectionList — the foot stays open for more (KAN-352)', () => {
  it('keeps `add an item` at the foot once the list has rows, and a second add stays open', async () => {
    const user = userEvent.setup()
    const onAddRow = jest.fn().mockResolvedValue('r2')
    const onRenameRow = jest.fn()
    render(
      <CollectionList
        viewKey="v1"
        schema={schemaWithDate}
        rows={[{ id: 'r1', values: {}, title: 'milk' }]}
        editable
        onAddRow={onAddRow}
        onRenameRow={onRenameRow}
      />
    )

    const addButton = screen.getByRole('button', { name: 'add an item' })
    await user.click(addButton)
    const input = screen.getByRole('textbox', { name: 'Add an item' })
    await user.type(input, 'eggs')
    await user.keyboard('{Enter}')

    expect(onAddRow).toHaveBeenCalledTimes(1)
    expect(onRenameRow).toHaveBeenCalledWith('r2', 'eggs')
    expect(screen.getByRole('textbox', { name: 'Add an item' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Add an item' })).toHaveFocus()
  })
})

describe('CollectionList — the empty→foot transition stays open (KAN-352)', () => {
  it('adds milk then eggs with no extra click between them', async () => {
    const user = userEvent.setup()
    render(<StatefulList />)

    await user.click(screen.getByRole('button', { name: 'add an item' }))
    await user.type(screen.getByRole('textbox', { name: 'Add an item' }), 'milk')
    await user.keyboard('{Enter}')

    const footInput = await screen.findByRole('textbox', { name: 'Add an item' })
    expect(footInput).toHaveValue('')
    expect(footInput).toHaveFocus()

    await user.type(footInput, 'eggs')
    await user.keyboard('{Enter}')

    expect(screen.getByText('milk')).toBeInTheDocument()
    expect(screen.getByText('eggs')).toBeInTheDocument()
  })
})

describe('CollectionList — the add input never remounts across the empty→foot transition (KAN-352)', () => {
  it('keeps the draft and focus while a slow addRow is still in flight', async () => {
    const user = userEvent.setup()
    let resolveAdd: (id: string) => void = () => {}

    function DeferredList() {
      const [rows, setRows] = useState<CollectionRow[]>([])
      const onAddRow = () =>
        new Promise<string>((resolve) => {
          resolveAdd = (id: string) => {
            setRows((prev) => [...prev, { id, values: {}, title: '' }])
            resolve(id)
          }
        })
      const onRenameRow = (rowId: string, title: string) => {
        setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, title } : row)))
      }
      return (
        <CollectionList
          viewKey="v1"
          schema={schemaWithDate}
          rows={rows}
          editable
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
        />
      )
    }

    render(<DeferredList />)

    await user.click(screen.getByRole('button', { name: 'add an item' }))
    const input = screen.getByRole('textbox', { name: 'Add an item' })
    await user.type(input, 'milk')
    await user.keyboard('{Enter}')
    // addRow is still awaiting (getUser + createPage, in the real hook) — keep typing.
    await user.type(input, 'eg')

    await act(async () => {
      resolveAdd('r1')
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    expect(screen.getByText('milk')).toBeInTheDocument()
    expect(input).toHaveValue('eg')
    expect(input).toHaveFocus()
  })
})

const OPTION_COLOR = '#648F7B'

const statusSchema: PropertySchema = [
  {
    id: 'p-status',
    name: 'status',
    type: 'status',
    options: [
      { id: 'opt-later', label: 'Later', color: OPTION_COLOR },
      { id: 'opt-now', label: 'Now', color: OPTION_COLOR },
    ],
  },
  { id: 'p-title', name: 'Title', type: 'text' },
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-repeat', name: 'repeats', type: 'text' },
]

const statusRows: CollectionRow[] = [
  {
    id: 'r-now',
    title: 'paint the door',
    values: { 'p-status': 'opt-now', 'p-due': '2026-10-21', 'p-repeat': 'every mon' },
  },
  { id: 'r-empty', title: 'loose end', values: {} },
]

const LIST_TODAY = new Date(2026, 9, 19)

const headingLabels = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>('[data-part="list-group"]')].map((group) => {
    const heading = group.querySelector('[data-part="list-group-label"]')
    const label = heading?.querySelector('span')
    return (label ?? heading)?.textContent ?? ''
  })

describe('CollectionList — group by status (KAN-521)', () => {
  it('renders one heading per option in schema order, then No status, with an empty count', () => {
    const { container } = render(
      <CollectionList
        viewKey="v1"
        schema={statusSchema}
        rows={statusRows}
        groupBy="p-status"
        today={LIST_TODAY}
      />
    )

    const groups = [...container.querySelectorAll<HTMLElement>('[data-part="list-group"]')]
    expect(headingLabels(container)).toEqual(['Later', 'Now', 'No status'])
    expect(
      groups.map((group) => group.querySelector('[data-part="list-group-count"]')?.textContent)
    ).toEqual(['0', '1', '1'])

    const later = groups[0]!
    const now = groups[1]!
    const noStatus = groups[2]!
    expect(within(later).queryByRole('listitem')).not.toBeInTheDocument()
    expect(within(now).getByText('paint the door')).toBeInTheDocument()
    expect(within(noStatus).getByText('loose end')).toBeInTheDocument()

    const heading = later.querySelector('[data-part="list-group-label"]')
    expect(heading).toHaveClass(
      'flex',
      'justify-between',
      'text-[10.5px]',
      'font-medium',
      'tracking-[.1em]',
      'text-mn-text-secondary',
      'uppercase'
    )
    expect(heading?.children).toHaveLength(2)
    expect(container.innerHTML).not.toContain(OPTION_COLOR)

    expect(within(now).getByRole('checkbox', { name: 'paint the door done' })).toBeInTheDocument()
    expect(within(now).getByText('every mon')).toBeInTheDocument()
    expect(within(now).getByText('wed 21')).toBeInTheDocument()
  })

  it('a date groupBy still shows a due bucket, and so does no groupBy', () => {
    const dated: CollectionRow[] = [
      { id: 'r1', title: 'milk', values: { 'p-due': '2026-10-19' } },
    ]
    const datedRender = render(
      <CollectionList
        viewKey="v1"
        schema={statusSchema}
        rows={dated}
        groupBy="p-due"
        today={LIST_TODAY}
      />
    )
    expect(datedRender.container.querySelector('[data-group="today"]')).not.toBeNull()
    expect(datedRender.container.querySelector('[data-part="list-group-count"]')).toBeNull()
    datedRender.unmount()

    const open = render(
      <CollectionList viewKey="v1" schema={statusSchema} rows={dated} today={LIST_TODAY} />
    )
    expect(open.container.querySelector('[data-group="today"]')).not.toBeNull()
  })

  it('a status groupBy shows the rows when the schema has no date', () => {
    const schema: PropertySchema = [
      {
        id: 'p-status',
        name: 'status',
        type: 'status',
        options: [{ id: 'opt-now', label: 'Now' }],
      },
      { id: 'p-title', name: 'Title', type: 'text' },
    ]
    render(
      <CollectionList
        viewKey="v1"
        schema={schema}
        rows={[{ id: 'r1', title: 'milk', values: { 'p-status': 'opt-now' } }]}
        groupBy="p-status"
        today={LIST_TODAY}
      />
    )
    expect(screen.getByText('milk')).toBeInTheDocument()
    expect(screen.getByText('Now')).toBeInTheDocument()
    expect(screen.queryByText(CALENDAR_EMPTY_LINE)).not.toBeInTheDocument()
  })
})

const rowTitles = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>('[data-part="list-row"]')].map(
    (row) => row.querySelector('button:not([role="checkbox"])')?.textContent ?? ''
  )

/** Rows a date field would split across due buckets, including `done` and `no date`. */
const flatSchema: PropertySchema = [
  {
    id: 'p-status',
    name: 'status',
    type: 'status',
    options: [
      { id: 'opt-now', label: 'Now' },
      { id: 'opt-done', label: 'Done' },
    ],
  },
  { id: 'p-title', name: 'Title', type: 'text' },
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-repeat', name: 'repeats', type: 'text' },
]

const flatRows: CollectionRow[] = [
  { id: 'r-next', title: 'later task', values: { 'p-due': '2026-10-28', 'p-status': 'opt-now' } },
  {
    id: 'r-today',
    title: 'milk',
    values: { 'p-due': '2026-10-19', 'p-status': 'opt-now', 'p-repeat': 'every mon' },
  },
  { id: 'r-open', title: 'loose end', values: { 'p-status': 'opt-now' } },
  { id: 'r-done', title: 'filed', values: { 'p-due': '2026-10-19', 'p-status': 'opt-done' } },
  { id: 'r-week', title: 'paint the door', values: { 'p-due': '2026-10-21', 'p-status': 'opt-now' } },
]

describe('CollectionList — a flat list (KAN-521)', () => {
  it('listFlat draws one flat run and skips due buckets a date field would have drawn', () => {
    const { container } = render(
      <CollectionList
        viewKey="v1"
        schema={flatSchema}
        rows={flatRows}
        listFlat
        today={LIST_TODAY}
      />
    )

    expect(rowTitles(container)).toEqual([
      'later task',
      'milk',
      'loose end',
      'filed',
      'paint the door',
    ])
    expect(container.querySelector('[data-part="list-group"]')).toBeNull()
    expect(container.querySelector('[data-part="list-group-label"]')).toBeNull()
    expect(container.querySelectorAll('[data-part="list-card"] ul')).toHaveLength(1)
    for (const id of DUE_BUCKETS) {
      expect(container.querySelector(`[data-group="${id}"]`)).toBeNull()
    }
    expect(screen.getByRole('checkbox', { name: 'milk done' })).toBeInTheDocument()
    expect(screen.getByText('every mon')).toBeInTheDocument()
    expect(screen.getByText('wed 21')).toBeInTheDocument()
  })

  it('listFlat false still draws the due buckets', () => {
    const { container } = render(
      <CollectionList
        viewKey="v1"
        schema={flatSchema}
        rows={flatRows}
        listFlat={false}
        today={LIST_TODAY}
      />
    )
    expect(container.querySelector('[data-group="today"]')).not.toBeNull()
    expect(container.querySelector('[data-group="done"]')).not.toBeNull()
    expect(container.querySelector('[data-group="no date"]')).not.toBeNull()
  })

  it('listFlat with no date field draws the rows, not the add-a-date line', () => {
    const schema: PropertySchema = [{ id: 'p-title', name: 'Title', type: 'text' }]
    const { container } = render(
      <CollectionList
        viewKey="v1"
        schema={schema}
        rows={[{ id: 'r1', title: 'milk', values: {} }]}
        listFlat
        today={LIST_TODAY}
        onAddDateField={() => undefined}
      />
    )
    expect(screen.getByText('milk')).toBeInTheDocument()
    expect(screen.queryByText(CALENDAR_EMPTY_LINE)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="list-group"]')).toBeNull()
    expect(container.querySelector('[data-part="list-group-label"]')).toBeNull()
  })

  it('a select or status groupBy still groups when listFlat is also set', () => {
    const { container } = render(
      <CollectionList
        viewKey="v1"
        schema={statusSchema}
        rows={statusRows}
        groupBy="p-status"
        listFlat
        today={LIST_TODAY}
      />
    )
    expect(headingLabels(container)).toEqual(['Later', 'Now', 'No status'])
    expect(screen.getByText('paint the door')).toBeInTheDocument()
    expect(screen.getByText('loose end')).toBeInTheDocument()
    expect(container.querySelector('[data-group="this week"]')).toBeNull()
    expect(container.querySelector('[data-group="no date"]')).toBeNull()
  })
})

describe('CollectionList — ticking while grouped by a select (KAN-521)', () => {
  it('ticks the status that has done and leaves the row under its select', async () => {
    const user = userEvent.setup()
    const onEdit = jest.fn()
    const schema: PropertySchema = [
      {
        id: 'p-stage',
        name: 'stage',
        type: 'select',
        options: [
          { id: 'opt-sketch', label: 'Sketch' },
          { id: 'opt-paint', label: 'Paint' },
        ],
      },
      {
        id: 'p-status',
        name: 'status',
        type: 'status',
        options: [
          { id: 'opt-open', label: 'Open' },
          { id: 'opt-done', label: 'Done' },
        ],
      },
      { id: 'p-title', name: 'Title', type: 'text' },
    ]

    function ListGroupedByStage() {
      const [rows, setRows] = useState<CollectionRow[]>([
        {
          id: 'r-door',
          title: 'the door',
          values: { 'p-stage': 'opt-sketch', 'p-status': 'opt-open' },
        },
      ])
      const handleEdit = (rowId: string, key: string, value: PropertyValue) => {
        onEdit(rowId, key, value)
        setRows((prev) =>
          prev.map((row) =>
            row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row
          )
        )
      }
      return (
        <CollectionList
          viewKey="v-tick"
          schema={schema}
          rows={rows}
          groupBy="p-stage"
          editable
          onEdit={handleEdit}
          today={LIST_TODAY}
        />
      )
    }

    const { container } = render(<ListGroupedByStage />)
    expect(headingLabels(container)).toEqual(['Sketch', 'Paint', 'No stage'])

    const checkbox = screen.getByRole('checkbox', { name: 'the door done' })
    expect(checkbox).toBeEnabled()
    await user.click(checkbox)

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith('r-door', 'p-status', 'opt-done')

    const groups = [...container.querySelectorAll<HTMLElement>('[data-part="list-group"]')]
    expect(within(groups[0]!).getByText('the door')).toBeInTheDocument()
    expect(within(groups[1]!).queryByText('the door')).not.toBeInTheDocument()
    expect(within(groups[2]!).queryByText('the door')).not.toBeInTheDocument()
    expect(within(groups[0]!).getByRole('checkbox', { name: 'the door done' })).toBeChecked()
  })
})
