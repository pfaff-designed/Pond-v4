import { render, screen } from '@testing-library/react'
import { RelationValue } from '@/components/molecules/RelationValue'

describe('RelationValue', () => {
  it('renders the three-way state per linked id: live, trashed, and missing', () => {
    render(
      <RelationValue
        value={['live', 'trashed', 'gone']}
        titles={new Map([['live', 'Live Page']])}
        trashedTitles={new Map([['trashed', 'Trashed Page']])}
        candidates={[]}
        onChange={jest.fn()}
        onOpen={jest.fn()}
      />
    )

    const liveChip = screen.getByRole('button', { name: 'Live Page' })
    expect(liveChip.querySelector('[data-part="suffix"]')).toHaveTextContent('›')

    const trashedLabel = screen.getByText('Trashed Page')
    expect(trashedLabel).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: 'Trashed Page' })).not.toBeInTheDocument()
    expect(trashedLabel.querySelector('[data-part="suffix"]')).not.toBeInTheDocument()

    expect(screen.getByText('Missing page')).toBeInTheDocument()
  })
})
