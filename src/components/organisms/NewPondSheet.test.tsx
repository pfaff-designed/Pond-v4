import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewPondSheet } from '@/components/organisms/NewPondSheet'

describe('NewPondSheet — one name field, a required name (KAN-487)', () => {
  it('step 1 shows one "New pond" heading and one field for the name', () => {
    render(<NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />)

    expect(screen.getAllByText('New pond')).toHaveLength(1)
    expect(screen.getByPlaceholderText('Name your pond')).toBeInTheDocument()
  })

  it('disables continue while the name is blank or whitespace-only, and enables it once typed', async () => {
    const user = userEvent.setup()
    render(<NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />)

    const continueButton = screen.getByRole('button', { name: 'continue' })
    const field = screen.getByPlaceholderText('Name your pond')
    expect(continueButton).toBeDisabled()

    await user.type(field, '   ')
    expect(continueButton).toBeDisabled()

    await user.type(field, 'Studio')
    expect(continueButton).toBeEnabled()
  })
})

describe('NewPondSheet — back and Esc (KAN-488)', () => {
  it('Escape or ArrowLeft on step 2 returns to step 1 with the name intact', async () => {
    const user = userEvent.setup()
    render(<NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />)

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'continue' }))
    expect(screen.getByText('2 of 2')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Name your pond')).toHaveValue('Studio')

    await user.click(screen.getByRole('button', { name: 'continue' }))
    expect(screen.getByText('2 of 2')).toBeInTheDocument()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Name your pond')).toHaveValue('Studio')
  })

  it('Escape on step 1 calls onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = jest.fn()
    render(<NewPondSheet onCreate={jest.fn()} onCancel={onCancel} />)

    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('ArrowLeft while focus is in the name field moves the caret instead of going back', async () => {
    const user = userEvent.setup()
    render(<NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />)

    const field = screen.getByPlaceholderText('Name your pond')
    await user.type(field, 'Studio')
    await user.keyboard('{ArrowLeft}')

    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(field).toHaveValue('Studio')
  })

  it('shows a ghost "back" control from step 2 on, with no back control on step 1', async () => {
    const user = userEvent.setup()
    render(<NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />)

    expect(screen.queryByRole('button', { name: 'back' })).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'continue' }))

    const backButton = screen.getByRole('button', { name: 'back' })
    expect(backButton).toBeInTheDocument()

    await user.click(backButton)
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Name your pond')).toHaveValue('Studio')
  })
})

describe('NewPondSheet — Enter in the name field (KAN-488)', () => {
  it('Enter with a blank name is a no-op', async () => {
    const user = userEvent.setup()
    render(<NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />)

    await user.click(screen.getByPlaceholderText('Name your pond'))
    await user.keyboard('{Enter}')

    expect(screen.getByText('1 of 2')).toBeInTheDocument()
  })

  it('Enter with a name advances a step', async () => {
    const user = userEvent.setup()
    render(<NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />)

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.keyboard('{Enter}')

    expect(screen.getByText('2 of 2')).toBeInTheDocument()
  })

  it('"make pond" calls onCreate with the trimmed name', async () => {
    const user = userEvent.setup()
    const onCreate = jest.fn()
    render(<NewPondSheet onCreate={onCreate} onCancel={jest.fn()} />)

    await user.type(screen.getByPlaceholderText('Name your pond'), '  Studio  ')
    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))

    expect(onCreate).toHaveBeenCalledWith('Studio')
  })
})

describe('NewPondSheet — areas step pills and field are aria-disabled (KAN-488)', () => {
  it('the areas pills and "add your own" field report aria-disabled and have no click action', async () => {
    const user = userEvent.setup()
    render(<NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />)

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'continue' }))

    const pill = screen.getByText('clients')
    expect(pill).toHaveAttribute('aria-disabled', 'true')
    const field = screen.getByPlaceholderText('add your own')
    expect(field).toHaveAttribute('aria-disabled', 'true')

    await user.click(pill)
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
  })
})

describe('NewPondSheet — no sources step, no skip (KAN-488)', () => {
  it('has no skip control and never shows more than "2" at either step', async () => {
    const user = userEvent.setup()
    render(<NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />)

    expect(screen.queryByRole('button', { name: 'skip' })).not.toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'continue' }))

    expect(screen.queryByRole('button', { name: 'skip' })).not.toBeInTheDocument()
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'make pond' })).toBeInTheDocument()
  })
})
