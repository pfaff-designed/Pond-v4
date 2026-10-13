/**
 * The list view (`Pond 06.21` 6v): a checklist grouped by due, in one card. Row click
 * and keyboard share the board's selection and record peek; the checkbox is the
 * person's own edit.
 */

import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CollectionView } from '@/lib/modules/view/view'
import { CollectionList } from '@/lib/modules/view/list'
import { CALENDAR_EMPTY_LINE } from '@/lib/modules/view/kinds'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  {
    id: 's',
    name: 'status',
    type: 'status',
    options: [
      { id: 'todo', label: 'to do' },
      { id: 'done', label: 'done' },
    ],
  },
  { id: 'd', name: 'due', type: 'date' },
  { id: 'r', name: 'repeats', type: 'text' },
]

const WED = new Date(2026, 9, 21)

const rows: CollectionRow[] = [
  { id: 'a', title: 'Cabinet quote', values: { s: 'todo', d: '2026-10-21' } },
  { id: 'b', title: 'Chase the quote', values: { s: 'todo', d: '2026-10-23', r: 'every 4 days' } },
  { id: 'c', title: 'Dehumidifier', values: { s: 'done', d: '2026-10-19' } },
]

const config: ViewBlock = { id: 'v', type: 'view', mode: 'list' }

const titleButton = (title: string) => screen.getByRole('button', { name: title })
const row = (title: string) => titleButton(title).closest('li')!
const peek = () => document.querySelector<HTMLElement>('[data-part="record-peek"]')

const renderList = (props: Partial<React.ComponentProps<typeof CollectionList>> = {}) =>
  render(<CollectionList viewKey="v" schema={schema} rows={rows} today={WED} {...props} />)

describe('list — what is drawn', () => {
  it('groups the rows by due, in 6v’s order, in a single card', () => {
    renderList()
    expect(document.querySelectorAll('[data-part="list-card"]')).toHaveLength(1)
    const labels = [...document.querySelectorAll('[data-part="list-group-label"]')].map(
      (el) => el.textContent
    )
    expect(labels).toEqual(['today', 'this week', 'done'])
  })

  it('draws no eyebrow or heading inside the card', () => {
    renderList()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('a row carries its repeat tag and its due word', () => {
    renderList()
    expect(row('Chase the quote')).toHaveTextContent('every 4 days')
    expect(row('Chase the quote')).toHaveTextContent('fri 23')
    expect(row('Dehumidifier')).toHaveTextContent('mon 19')
  })

  it('a done row is marked and its box is checked', () => {
    renderList()
    expect(row('Dehumidifier')).toHaveAttribute('data-done')
    expect(screen.getByRole('checkbox', { name: 'Dehumidifier done' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Chase the quote done' })).not.toBeChecked()
  })

  it('names the missing property rather than drawing an empty card', () => {
    render(
      <CollectionList viewKey="v" schema={schema.filter((d) => d.type !== 'date')} rows={rows} />
    )
    expect(
      screen.getByText('nothing in this view has a date. records show here once they have one.')
    ).toBeInTheDocument()
  })

  it('says so when there are no records', () => {
    renderList({ rows: [] })
    expect(screen.getByText('no records yet')).toBeInTheDocument()
  })

  it('with no date property and onAddDateField wired, offers the `add a date field` remedy and fires it (KAN-292)', async () => {
    const user = userEvent.setup()
    const onAddDateField = jest.fn()
    render(
      <CollectionList
        viewKey="v"
        schema={schema.filter((d) => d.type !== 'date')}
        rows={rows}
        onAddDateField={onAddDateField}
      />
    )
    const button = screen.getByRole('button', { name: 'add a date field' })
    await user.click(button)
    expect(onAddDateField).toHaveBeenCalledTimes(1)
  })

  it('with no date property and no onAddDateField wired, draws the bare line, no box', () => {
    const { container } = render(
      <CollectionList viewKey="v" schema={schema.filter((d) => d.type !== 'date')} rows={rows} />
    )
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="empty"]')).toBeNull()
    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
  })
})

describe('list — one orange today', () => {
  const dated: CollectionRow[] = [
    { id: 'x', title: 'Finished', values: { s: 'done', d: '2026-10-21' } },
    { id: 'y', title: 'First open', values: { s: 'todo', d: '2026-10-21' } },
    { id: 'z', title: 'Second open', values: { s: 'todo', d: '2026-10-21' } },
  ]

  it('only the first open record due today wears the pill', () => {
    renderList({ rows: dated })
    expect(document.querySelectorAll('[data-part="due-today"]')).toHaveLength(1)
    expect(row('First open').querySelector('[data-part="due-today"]')).not.toBeNull()
  })

  it('the rest — a finished one included — read `today` as a plain word', () => {
    renderList({ rows: dated })
    for (const t of ['Second open', 'Finished']) {
      expect(row(t).querySelector('[data-part="due-today"]')).toBeNull()
      expect(row(t).querySelector('[data-part="list-due"]')).toHaveTextContent('today')
    }
  })
})

describe('list — the tick', () => {
  it('ticking writes the done option through onEdit', async () => {
    const onEdit = jest.fn()
    renderList({ editable: true, onEdit })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chase the quote done' }))
    expect(onEdit).toHaveBeenCalledWith('b', 's', 'done')
  })

  it('unticking returns the record to the first open option', async () => {
    const onEdit = jest.fn()
    renderList({ editable: true, onEdit })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dehumidifier done' }))
    expect(onEdit).toHaveBeenCalledWith('c', 's', 'todo')
  })

  it('does not also select the row', async () => {
    renderList({ editable: true, onEdit: jest.fn() })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chase the quote done' }))
    expect(peek()).toBeNull()
  })

  it('a read-only list draws inert boxes', async () => {
    const onEdit = jest.fn()
    renderList({ onEdit })
    const box = screen.getByRole('checkbox', { name: 'Chase the quote done' })
    expect(box).toBeDisabled()
    await userEvent.click(box)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('with no done option in the schema there is nothing to write, so the boxes are inert', () => {
    const noDone: PropertySchema = [
      {
        id: 's',
        name: 'status',
        type: 'status',
        options: [
          { id: 'open', label: 'open' },
          { id: 'closed', label: 'closed' },
        ],
      },
      schema[1],
    ]
    render(
      <CollectionList
        viewKey="v"
        schema={noDone}
        rows={[{ id: 'a', title: 'A', values: { s: 'open', d: '2026-10-21' } }]}
        today={WED}
        editable
        onEdit={jest.fn()}
      />
    )
    expect(screen.getByRole('checkbox', { name: 'A done' })).toBeDisabled()
  })
})

describe('list — selection and the record peek', () => {
  it('the title button is the tab stop, named by the title — the row is not focusable', () => {
    renderList()
    expect(titleButton('Cabinet quote')).not.toHaveAttribute('tabindex', '-1')
    expect(row('Cabinet quote')).not.toHaveAttribute('tabindex')
    expect(row('Cabinet quote')).not.toHaveAttribute('role')
    expect(row('Cabinet quote').querySelectorAll('[tabindex]')).toHaveLength(0)
  })

  it('a click selects the row and opens its record', () => {
    renderList()
    fireEvent.click(titleButton('Cabinet quote'))
    expect(titleButton('Cabinet quote')).toHaveAttribute('aria-current', 'true')
    expect(within(peek()!).getByText('Cabinet quote')).toBeInTheDocument()
  })

  it('a click on the row beside the title selects it too', () => {
    renderList()
    fireEvent.click(row('Cabinet quote'))
    expect(row('Cabinet quote').querySelector('[aria-current="true"]')).not.toBeNull()
  })

  it('another row swaps the record', () => {
    renderList()
    fireEvent.click(titleButton('Cabinet quote'))
    fireEvent.click(titleButton('Chase the quote'))
    expect(document.querySelectorAll('[data-part="record-peek"]')).toHaveLength(1)
    expect(titleButton('Cabinet quote')).not.toHaveAttribute('aria-current')
  })

  it.each([['{Enter}'], [' ']])(
    '%j on the row selects it and moves focus into the peek',
    async (key) => {
      const user = userEvent.setup()
      renderList()
      titleButton('Cabinet quote').focus()
      await user.keyboard(key)
      expect(peek()!.contains(document.activeElement)).toBe(true)
    }
  )

  it('Esc closes the peek and returns focus to the row', async () => {
    const user = userEvent.setup()
    renderList()
    titleButton('Cabinet quote').focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')
    expect(peek()).toBeNull()
    expect(document.activeElement).toBe(titleButton('Cabinet quote'))
  })

  it('empty paper closes it; a row or the peek does not', () => {
    renderList()
    fireEvent.click(titleButton('Cabinet quote'))
    fireEvent.pointerDown(row('Chase the quote'))
    fireEvent.pointerDown(peek()!)
    expect(peek()).not.toBeNull()
    fireEvent.pointerDown(document.body)
    expect(peek()).toBeNull()
  })

  it('the peek marks a done record done', () => {
    renderList()
    fireEvent.click(titleButton('Dehumidifier'))
    expect(peek()!.querySelector('[data-part="peek-head"] [data-done]')).not.toBeNull()
  })

  it('the peek head ticks the record through onEdit', async () => {
    const onEdit = jest.fn()
    renderList({ editable: true, onEdit })
    fireEvent.click(titleButton('Chase the quote'))
    await userEvent.click(within(peek()!).getByRole('checkbox', { name: 'Chase the quote done' }))
    expect(onEdit).toHaveBeenCalledWith('b', 's', 'done')
  })

  it('`open ›` navigates through onOpenRow', () => {
    const onOpenRow = jest.fn()
    renderList({ onOpenRow })
    fireEvent.click(titleButton('Cabinet quote'))
    fireEvent.click(screen.getByRole('button', { name: 'open ›' }))
    expect(onOpenRow).toHaveBeenCalledWith('a')
  })
})

describe('list — in the view', () => {
  it('the head reads `grouped by due` and offers no switch to another kind (KAN-44)', () => {
    render(
      <CollectionView
        config={config}
        schema={schema}
        rows={rows}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
      />
    )
    expect(screen.getByText('tasks')).toBeInTheDocument()
    expect(screen.getByText('grouped by due')).toBeInTheDocument()
    for (const kind of ['board', 'timeline', 'table', 'calendar']) {
      expect(screen.queryByRole('button', { name: kind })).toBeNull()
    }
  })

  it.each(['board', 'list'] as const)(
    'a %s grouped by a date property draws its lanes and groups',
    (mode) => {
      render(
        <CollectionView
          config={{ ...config, mode, groupBy: 'd' }}
          schema={schema}
          rows={rows}
          collectionName="tasks"
          editable
          onConfigChange={jest.fn()}
        />
      )
      const part = mode === 'board' ? 'lane' : 'list-group'
      expect(document.querySelectorAll(`[data-part="${part}"]`).length).toBeGreaterThan(0)
    }
  )

  it('draws no add-property control', () => {
    render(
      <CollectionView
        config={config}
        schema={schema}
        rows={rows}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /add property|add field/i })).toBeNull()
  })
})
