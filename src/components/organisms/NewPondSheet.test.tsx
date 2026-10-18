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
