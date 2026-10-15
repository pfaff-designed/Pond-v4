import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelationChip } from '@/components/atoms/RelationChip'

describe('RelationChip', () => {
  it('renders a trashed chip struck through, inert, and never opens on click', async () => {
    const user = userEvent.setup()
    const onOpen = jest.fn()
    render(<RelationChip id="page-1" trashedTitle="kitchen renovation" onOpen={onOpen} />)

    const label = screen.getByText('kitchen renovation')
    expect(label).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: 'kitchen renovation' })).not.toBeInTheDocument()

    await user.click(label)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('labels a trashed chip\'s remove button with the trashed title, not the raw id', () => {
    render(
      <RelationChip
        id="page-1"
        trashedTitle="kitchen renovation"
        onOpen={jest.fn()}
        onRemove={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Remove kitchen renovation' })).toBeInTheDocument()
  })
})
