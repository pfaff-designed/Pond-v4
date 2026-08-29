/**
 * SlashMenu molecule — unit tests.
 *
 * Covers: filter-as-you-type, keyboard navigation (↑↓), Enter to select,
 * Escape to close, and the empty-state message.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlashMenu, type SlashMenuItem } from '@/components/molecules/SlashMenu'

const items: SlashMenuItem[] = [
  { id: 'text', name: 'Text', description: 'A prose block.' },
  { id: 'todo', name: 'Todo', description: 'A checklist.' },
  { id: 'table', name: 'Table', description: 'A table of rows.' },
  { id: 'metric', name: 'Metric', description: 'A single figure.' },
]

function renderMenu(overrides: Partial<React.ComponentProps<typeof SlashMenu>> = {}) {
  const onSelect = jest.fn()
  const onClose = jest.fn()
  render(<SlashMenu items={items} onSelect={onSelect} onClose={onClose} {...overrides} />)
  return { onSelect, onClose }
}

describe('SlashMenu', () => {
  it('renders all items', () => {
    renderMenu()
    expect(screen.getByText('Text')).toBeInTheDocument()
    expect(screen.getByText('Todo')).toBeInTheDocument()
    expect(screen.getByText('Table')).toBeInTheDocument()
    expect(screen.getByText('Metric')).toBeInTheDocument()
  })

  it('shows descriptions under item names', () => {
    renderMenu()
    expect(screen.getByText('A prose block.')).toBeInTheDocument()
    expect(screen.getByText('A checklist.')).toBeInTheDocument()
  })

  it('filters items by name (case-insensitive)', () => {
    renderMenu()
    const input = screen.getByLabelText('Filter blocks')
    fireEvent.change(input, { target: { value: 'ta' } })
    expect(screen.getByText('Table')).toBeInTheDocument()
    // Metric and Text should still show if they don't match... only "Table" matches "ta"
    expect(screen.queryByText('Todo')).not.toBeInTheDocument()
    expect(screen.queryByText('Metric')).not.toBeInTheDocument()
  })

  it('shows "No blocks match" when filter yields nothing', () => {
    renderMenu()
    const input = screen.getByLabelText('Filter blocks')
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No blocks match')).toBeInTheDocument()
  })

  it('shows empty state message when items list is empty', () => {
    renderMenu({ items: [] })
    expect(screen.getByText('No blocks match')).toBeInTheDocument()
  })

  it('calls onSelect when clicking an item', () => {
    const { onSelect } = renderMenu()
    fireEvent.click(screen.getByText('Todo'))
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })

  it('calls onSelect with Enter on the active item', () => {
    const { onSelect } = renderMenu()
    const input = screen.getByLabelText('Filter blocks')
    // First item (Text) is active by default
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(items[0])
  })

  it('moves active index down with ArrowDown', () => {
    const { onSelect } = renderMenu()
    const input = screen.getByLabelText('Filter blocks')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Second item (Todo) should be selected
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })

  it('moves active index up with ArrowUp', () => {
    const { onSelect } = renderMenu()
    const input = screen.getByLabelText('Filter blocks')
    // Go down twice then up once → lands on index 1 (Todo)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })

  it('does not go below 0 with ArrowUp at the first item', () => {
    const { onSelect } = renderMenu()
    const input = screen.getByLabelText('Filter blocks')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Still on the first item
    expect(onSelect).toHaveBeenCalledWith(items[0])
  })

  it('does not go beyond the last item with ArrowDown', () => {
    const { onSelect } = renderMenu()
    const input = screen.getByLabelText('Filter blocks')
    // Press down many times
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
    }
    fireEvent.keyDown(input, { key: 'Enter' })
    // Should land on last item (Metric)
    expect(onSelect).toHaveBeenCalledWith(items[3])
  })

  it('calls onClose on Escape', () => {
    const { onClose } = renderMenu()
    const input = screen.getByLabelText('Filter blocks')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('resets activeIndex to 0 when filter changes', () => {
    const { onSelect } = renderMenu()
    const input = screen.getByLabelText('Filter blocks')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Change filter — should reset active index
    fireEvent.change(input, { key: 't', target: { value: 't' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // With filter 't', Text and Todo and Table match; first match (Text) should be selected
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'text' }))
  })

  it('applies className to the panel div', () => {
    const { container } = render(
      <SlashMenu
        items={items}
        onSelect={() => {}}
        onClose={() => {}}
        className="absolute bottom-full"
      />
    )
    expect(container.firstChild).toHaveClass('absolute', 'bottom-full')
  })
})
