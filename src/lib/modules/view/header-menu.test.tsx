/**
 * `HeaderMenu` (KAN-380, #521) in isolation: the name row's commit/revert/
 * collision paths and the `delete <entityLabel>` row's presence, independent
 * of either host that mounts it (the table's field header, the board's
 * column header).
 */

import { useRef, useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeaderMenu } from './header-menu'
import { fieldNameClash, type PropertyDef, type PropertySchema } from '@/lib/properties/schema'

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
      <HeaderMenu
        name={field2.name}
        entityLabel="field"
        clash={(candidate) => fieldNameClash(schema, candidate, field2.id)}
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

describe('HeaderMenu — open/close', () => {
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

describe('HeaderMenu — commit', () => {
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

describe('HeaderMenu — invalid commits', () => {
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

describe('HeaderMenu — delete row', () => {
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

describe('HeaderMenu — a different entityLabel words the menu for its own host (#521)', () => {
  const ColumnHarness = ({
    onRename = jest.fn(),
    onDelete = jest.fn(),
  }: {
    onRename?: (name: string) => void
    onDelete?: () => void
  }) => {
    const [open, setOpen] = useState(false)
    const anchorRef = useRef<HTMLDivElement>(null)
    const options = [
      { id: 'o-1', label: 'to do' },
      { id: 'o-2', label: 'done' },
    ]
    return (
      <div ref={anchorRef}>
        <HeaderMenu
          name="done"
          entityLabel="column"
          clash={(candidate) =>
            options.find(
              (o) => o.id !== 'o-2' && o.label.trim().toLowerCase() === candidate.trim().toLowerCase()
            )?.label ?? null
          }
          canDelete
          onRename={onRename}
          onDelete={onDelete}
          open={open}
          onOpenChange={setOpen}
          trigger={<button type="button">done</button>}
          placement={{ anchor: anchorRef, align: 'start', top: 32, alignOffset: 0 }}
        />
      </div>
    )
  }

  it('opens as "<name> column menu", with a "column name" input and a "delete column" row', async () => {
    const user = userEvent.setup()
    render(<ColumnHarness />)
    await user.click(screen.getByRole('button', { name: 'done' }))
    const menu = await screen.findByRole('menu', { name: 'done column menu' })

    expect(within(menu).getByLabelText('column name')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'delete column' })).toBeInTheDocument()
  })

  it('a collision reads as "a column is already called …" and refuses the commit', async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(<ColumnHarness onRename={onRename} />)
    await user.click(screen.getByRole('button', { name: 'done' }))
    const menu = await screen.findByRole('menu', { name: 'done column menu' })
    const input = within(menu).getByLabelText('column name')
    await user.clear(input)
    await user.keyboard('to do{Enter}')

    expect(onRename).not.toHaveBeenCalled()
    expect(await within(menu).findByText('a column is already called to do')).toBeInTheDocument()
  })

  it('`delete column` calls onDelete', async () => {
    const user = userEvent.setup()
    const onDelete = jest.fn()
    render(<ColumnHarness onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'done' }))
    const menu = await screen.findByRole('menu', { name: 'done column menu' })
    await user.click(within(menu).getByRole('menuitem', { name: 'delete column' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
