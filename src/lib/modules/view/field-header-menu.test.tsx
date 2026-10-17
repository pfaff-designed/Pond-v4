/**
 * `FieldHeaderMenu` (KAN-380) in isolation: the name row's commit/revert/
 * collision paths and the `delete field` row's presence, independent of the
 * table header that will host it.
 */

import { useRef, useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FieldHeaderMenu } from './field-header-menu'
import type { PropertyDef, PropertySchema } from '@/lib/properties/schema'

const field2: PropertyDef = { id: 'p-2', name: 'field 2', type: 'text' }
const schema: PropertySchema = [{ id: 'p-1', name: 'field 1', type: 'text' }, field2]

const Harness = ({
  canDelete = true,
  onRename = jest.fn(),
  onDelete = jest.fn(),
}: {
  canDelete?: boolean
  onRename?: (name: string) => void
  onDelete?: () => void
}) => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={anchorRef}>
      <FieldHeaderMenu
        field={field2}
        schema={schema}
        canDelete={canDelete}
        onRename={onRename}
        onDelete={onDelete}
        open={open}
        onOpenChange={setOpen}
        trigger={<button type="button">field 2</button>}
        placement={{ anchor: anchorRef, align: 'start', top: 32, alignOffset: 0 }}
      />
    </div>
  )
}

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'field 2' }))
  return screen.findByRole('menu', { name: 'field 2 field menu' })
}

describe('FieldHeaderMenu — open/close', () => {
  it('opens on a trigger click, with the name input focused and its text selected', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const menu = await openMenu(user)
    const input = within(menu).getByLabelText('field name') as HTMLInputElement
    expect(input).toHaveFocus()
    expect(input.value).toBe('field 2')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('field 2'.length)
  })

  it('closes on Escape without writing, reverting to the original name', async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(<Harness onRename={onRename} />)
    const menu = await openMenu(user)
    const input = within(menu).getByLabelText('field name')
    await user.clear(input)
    await user.keyboard('due')
    await user.keyboard('{Escape}')

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu', { name: 'field 2 field menu' })).not.toBeInTheDocument()
  })
})

describe('FieldHeaderMenu — commit', () => {
  it('Enter commits the trimmed name and closes', async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(<Harness onRename={onRename} />)
    const menu = await openMenu(user)
    const input = within(menu).getByLabelText('field name')
    await user.clear(input)
    await user.keyboard('  due  {Enter}')

    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('due')
    expect(screen.queryByRole('menu', { name: 'field 2 field menu' })).not.toBeInTheDocument()
  })

  it('an unchanged name on Enter writes nothing but still closes', async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(<Harness onRename={onRename} />)
    const menu = await openMenu(user)
    within(menu).getByLabelText('field name')
    await user.keyboard('{Enter}')

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu', { name: 'field 2 field menu' })).not.toBeInTheDocument()
  })
})

describe('FieldHeaderMenu — invalid commits', () => {
  it('an empty name on Enter reverts and closes, writing nothing', async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(<Harness onRename={onRename} />)
    const menu = await openMenu(user)
    const input = within(menu).getByLabelText('field name')
    await user.clear(input)
    await user.keyboard('{Enter}')

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu', { name: 'field 2 field menu' })).not.toBeInTheDocument()
  })

  it('a name another field already has is refused with a note, stays open, writes nothing', async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(<Harness onRename={onRename} />)
    const menu = await openMenu(user)
    const input = within(menu).getByLabelText('field name')
    await user.clear(input)
    await user.keyboard('field 1{Enter}')

    expect(onRename).not.toHaveBeenCalled()
    expect(await within(menu).findByText('a field is already called field 1')).toBeInTheDocument()
    expect(screen.getByRole('menu', { name: 'field 2 field menu' })).toBeInTheDocument()
  })

  it('a collision is case-insensitive and trims whitespace', async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(<Harness onRename={onRename} />)
    const menu = await openMenu(user)
    const input = within(menu).getByLabelText('field name')
    await user.clear(input)
    await user.keyboard('  FIELD 1  {Enter}')

    expect(onRename).not.toHaveBeenCalled()
    expect(await within(menu).findByText('a field is already called field 1')).toBeInTheDocument()
  })

  it('the reserved title label is refused the same way', async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(<Harness onRename={onRename} />)
    const menu = await openMenu(user)
    const input = within(menu).getByLabelText('field name')
    await user.clear(input)
    await user.keyboard('name{Enter}')

    expect(onRename).not.toHaveBeenCalled()
    expect(await within(menu).findByText('a field is already called Name')).toBeInTheDocument()
  })

  it('a refused commit keeps focus in the input, selected, and a later free name still commits', async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(<Harness onRename={onRename} />)
    const menu = await openMenu(user)
    const input = within(menu).getByLabelText('field name') as HTMLInputElement
    await user.clear(input)
    await user.keyboard('field 1{Enter}')

    expect(onRename).not.toHaveBeenCalled()
    expect(await within(menu).findByText('a field is already called field 1')).toBeInTheDocument()
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('field 1'.length)

    await user.clear(input)
    await user.keyboard('due{Enter}')

    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('due')
    expect(screen.queryByRole('menu', { name: 'field 2 field menu' })).not.toBeInTheDocument()
  })
})

describe('FieldHeaderMenu — delete row', () => {
  it('renders `delete field` when canDelete, and calls onDelete when clicked', async () => {
    const user = userEvent.setup()
    const onDelete = jest.fn()
    render(<Harness canDelete onDelete={onDelete} />)
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: 'delete field' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('hides `delete field` when canDelete is false', async () => {
    const user = userEvent.setup()
    render(<Harness canDelete={false} />)
    const menu = await openMenu(user)

    expect(within(menu).queryByRole('menuitem', { name: 'delete field' })).not.toBeInTheDocument()
  })
})
