/**
 * A table row's own space (not a cell's input) selects it and opens the board's
 * `RecordPeek` beside the table; a click inside a cell's input still edits in
 * place and selects nothing (KAN-378).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionView } from '@/lib/modules/view/view'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [{ id: 'f', name: 'note', type: 'text' }]
const config: ViewBlock = { id: 'b', mode: 'table' }
const rows = [
  { id: 'a', title: 'First', values: { f: 'one' } },
  { id: 'b', title: 'Second', values: { f: 'two' } },
]

const renderTable = (onEdit = jest.fn(), onOpenRow = jest.fn()) =>
  render(
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
})
