import { render, screen } from '@testing-library/react'
import { PlaceRow } from '@/components/molecules/place-row'

describe('PlaceRow — a blank-titled page in the place list', () => {
  it('renders the option as Untitled, not empty', () => {
    render(
      <PlaceRow
        id="place"
        parentId={null}
        parentOptions={[{ id: 'blank', title: '' }]}
        onParentChange={jest.fn()}
      />
    )

    const option = screen.getByRole('option', { name: 'Untitled' })
    expect(option).toHaveValue('blank')
  })
})
