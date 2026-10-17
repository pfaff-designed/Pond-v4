/**
 * A table row's own space (not a cell's input) selects it and opens the board's
 * `RecordPeek` beside the table; a click inside a cell's input still edits in
 * place and selects nothing (KAN-378).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionView } from '@/lib/modules/view/view'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [{ id: 'f', name: 'note', type: 'text' }]
const config: ViewBlock = { id: 'b', mode: 'table' }
const rows: CollectionRow[] = [
  { id: 'a', title: 'First', values: { f: 'one' } },
  { id: 'b', title: 'Second', values: { f: 'two' } },
]

const renderTable = (
  onEdit = jest.fn(),
  onOpenRow = jest.fn(),
  overrides: Partial<{ schema: PropertySchema; rows: CollectionRow[] }> = {}
) =>
  render(
    <CollectionView
      config={config}
      schema={overrides.schema ?? schema}
      rows={overrides.rows ?? rows}
      collectionName="tasks"
      editable
      onEdit={onEdit}
      onOpenRow={onOpenRow}
    />
  )

const peek = () => document.querySelector('[data-part="record-peek"]')
const cellOf = (title: string) => screen.getByText(title).closest('td') as HTMLTableCellElement
const rowOf = (title: string) => screen.getByText(title).closest('tr') as HTMLTableRowElement

describe('table — a row opens its record in the peek', () => {
  it('clicking a row’s cell padding selects it and opens its peek', async () => {
    renderTable()
    expect(peek()).toBeNull()

    await userEvent.click(cellOf('First'))
    expect(peek()).not.toBeNull()
    expect(screen.getByLabelText('Record: First')).toBeInTheDocument()
  })

  it('clicking a different row’s padding swaps the peek', async () => {
    renderTable()
    await userEvent.click(cellOf('First'))
    expect(screen.getByLabelText('Record: First')).toBeInTheDocument()

    await userEvent.click(cellOf('Second'))
    expect(screen.queryByLabelText('Record: First')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Record: Second')).toBeInTheDocument()
  })

  it('clicking a cell’s input edits in place and opens no peek', async () => {
    const onEdit = jest.fn()
    renderTable(onEdit)

    const [input] = screen.getAllByRole('textbox', { name: 'note value' })
    await userEvent.click(input)
    expect(peek()).toBeNull()

    await userEvent.clear(input)
    await userEvent.type(input, 'changed{Enter}')
    expect(onEdit).toHaveBeenCalledWith('a', 'f', 'changed')
    expect(peek()).toBeNull()
  })

  it('↵ on a focused row selects it; ↵ again opens its page', async () => {
    const onOpenRow = jest.fn()
    renderTable(jest.fn(), onOpenRow)

    rowOf('First').focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByLabelText('Record: First')).toBeInTheDocument()
    expect(onOpenRow).not.toHaveBeenCalled()

    await userEvent.keyboard('{Enter}')
    expect(onOpenRow).toHaveBeenCalledWith('a')
  })

  it('a click-selected row opens its page on the next ↵, with no second select', async () => {
    const onOpenRow = jest.fn()
    renderTable(jest.fn(), onOpenRow)

    await userEvent.click(cellOf('First'))
    expect(screen.getByLabelText('Record: First')).toBeInTheDocument()

    await userEvent.keyboard('{Enter}')
    expect(onOpenRow).toHaveBeenCalledTimes(1)
    expect(onOpenRow).toHaveBeenCalledWith('a')
  })

  it('↵ inside the last cell’s input still steps out, not opens the row', async () => {
    const onOpenRow = jest.fn()
    renderTable(jest.fn(), onOpenRow)

    const [, lastInput] = screen.getAllByRole('textbox', { name: 'note value' })
    await userEvent.click(lastInput)
    await userEvent.keyboard('{Enter}')
    expect(onOpenRow).not.toHaveBeenCalled()
    expect(peek()).toBeNull()
  })

  it('Esc clears the selection and closes the peek, focus returns to the row', async () => {
    renderTable()

    await userEvent.click(cellOf('First'))
    expect(peek()).not.toBeNull()

    await userEvent.keyboard('{Escape}')
    expect(peek()).toBeNull()
    expect(rowOf('First')).toHaveFocus()
  })

  it('a double-click selects once — no second peek, no navigation', async () => {
    const onOpenRow = jest.fn()
    renderTable(jest.fn(), onOpenRow)

    await userEvent.dblClick(cellOf('First'))
    expect(document.querySelectorAll('[data-part="record-peek"]')).toHaveLength(1)
    expect(onOpenRow).not.toHaveBeenCalled()
  })

  it('a record that leaves rows closes its own peek', async () => {
    const onEdit = jest.fn()
    const onOpenRow = jest.fn()
    const { rerender } = render(
      <CollectionView
        config={config}
        schema={schema}
        rows={rows}
        collectionName="tasks"
        editable
        onEdit={onEdit}
        onOpenRow={onOpenRow}
      />
    )

    await userEvent.click(cellOf('First'))
    expect(peek()).not.toBeNull()

    rerender(
      <CollectionView
        config={config}
        schema={schema}
        rows={rows.filter((r) => r.id !== 'a')}
        collectionName="tasks"
        editable
        onEdit={onEdit}
        onOpenRow={onOpenRow}
      />
    )
    expect(peek()).toBeNull()
  })

  it('a one-column (Name only) table still has clickable row space outside the title input', async () => {
    const oneColumnRows = [{ id: 'a', title: 'First', values: {} }]
    renderTable(jest.fn(), jest.fn(), { schema: [], rows: oneColumnRows })

    await userEvent.click(cellOf('First'))
    expect(screen.getByLabelText('Record: First')).toBeInTheDocument()
  })
})
