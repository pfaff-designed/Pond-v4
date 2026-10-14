import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PageProposalCard, type PageProposalCardProps } from '@/components/molecules/PageProposalCard'

const baseProps: PageProposalCardProps = {
  name: 'renovation blockers',
  parentId: 'kr',
  kind: 'page',
  status: 'proposed',
  parentOptions: [{ id: 'kr', title: 'creativity › kitchen renovation' }],
  onNameChange: jest.fn(),
  onParentChange: jest.fn(),
  onKindChange: jest.fn(),
  onMakePage: jest.fn(),
  onCancel: jest.fn(),
}

describe('PageProposalCard — name and kind commit on settle (KAN-290)', () => {
  it('shows each keystroke in the name field at once but calls onNameChange zero times until blur', async () => {
    const user = userEvent.setup()
    const onNameChange = jest.fn()
    render(<PageProposalCard {...baseProps} onNameChange={onNameChange} />)

    const name = screen.getByRole('textbox', { name: 'name' })
    await user.click(name)
    await user.keyboard('abc')
    expect(name).toHaveValue('renovation blockersabc')
    expect(onNameChange).not.toHaveBeenCalled()

    await user.tab()
    expect(onNameChange).toHaveBeenCalledTimes(1)
    expect(onNameChange).toHaveBeenCalledWith('renovation blockersabc')
  })

  it('commits the name once on Enter', async () => {
    const user = userEvent.setup()
    const onNameChange = jest.fn()
    render(<PageProposalCard {...baseProps} onNameChange={onNameChange} />)

    await user.click(screen.getByRole('textbox', { name: 'name' }))
    await user.keyboard('x{Enter}')

    expect(onNameChange).toHaveBeenCalledTimes(1)
    expect(onNameChange).toHaveBeenCalledWith('renovation blockersx')
  })

  it('reverts the name on Escape without calling onNameChange', async () => {
    const user = userEvent.setup()
    const onNameChange = jest.fn()
    render(<PageProposalCard {...baseProps} onNameChange={onNameChange} />)

    const name = screen.getByRole('textbox', { name: 'name' })
    await user.click(name)
    await user.keyboard(' extra{Escape}')

    expect(onNameChange).not.toHaveBeenCalled()
    expect(name).toHaveValue('renovation blockers')
  })

  it('shows each keystroke in the kind field at once but calls onKindChange zero times until blur', async () => {
    const user = userEvent.setup()
    const onKindChange = jest.fn()
    render(<PageProposalCard {...baseProps} onKindChange={onKindChange} />)

    const kind = screen.getByRole('textbox', { name: 'kind' })
    await user.click(kind)
    await user.keyboard('abc')
    expect(kind).toHaveValue('pageabc')
    expect(onKindChange).not.toHaveBeenCalled()

    await user.tab()
    expect(onKindChange).toHaveBeenCalledTimes(1)
    expect(onKindChange).toHaveBeenCalledWith('pageabc')
  })

  it('commits the kind once on Enter', async () => {
    const user = userEvent.setup()
    const onKindChange = jest.fn()
    render(<PageProposalCard {...baseProps} onKindChange={onKindChange} />)

    await user.click(screen.getByRole('textbox', { name: 'kind' }))
    await user.keyboard('x{Enter}')

    expect(onKindChange).toHaveBeenCalledTimes(1)
    expect(onKindChange).toHaveBeenCalledWith('pagex')
  })

  it('reverts the kind on Escape without calling onKindChange', async () => {
    const user = userEvent.setup()
    const onKindChange = jest.fn()
    render(<PageProposalCard {...baseProps} onKindChange={onKindChange} />)

    const kind = screen.getByRole('textbox', { name: 'kind' })
    await user.click(kind)
    await user.keyboard(' extra{Escape}')

    expect(onKindChange).not.toHaveBeenCalled()
    expect(kind).toHaveValue('page')
  })

  it('commits the edited name before make page is raised, with no explicit blur', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    const onNameChange = jest.fn((value: string) => calls.push(`name:${value}`))
    const onMakePage = jest.fn(() => calls.push('make-page'))
    render(<PageProposalCard {...baseProps} onNameChange={onNameChange} onMakePage={onMakePage} />)

    const name = screen.getByRole('textbox', { name: 'name' })
    await user.click(name)
    await user.keyboard(' renamed')
    await user.click(screen.getByRole('button', { name: 'make page' }))

    expect(onNameChange).toHaveBeenCalledTimes(1)
    expect(onNameChange).toHaveBeenCalledWith('renovation blockers renamed')
    expect(onMakePage).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['name:renovation blockers renamed', 'make-page'])
  })
})

describe('PageProposalCard — accepted state goes dead-link-safe in trash (KAN-308)', () => {
  it('renders "in trash" as plain text with no button when inTrash is true', () => {
    render(
      <PageProposalCard
        {...baseProps}
        status="accepted"
        inTrash={true}
        onOpenPage={jest.fn()}
      />
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/in trash/)).toBeInTheDocument()
  })

  it('still renders the "open <name>" button when inTrash is false', () => {
    render(
      <PageProposalCard
        {...baseProps}
        status="accepted"
        inTrash={false}
        onOpenPage={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: `open ${baseProps.name}` })).toBeInTheDocument()
  })
})
