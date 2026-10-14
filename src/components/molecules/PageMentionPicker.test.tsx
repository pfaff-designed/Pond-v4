import { render, screen } from '@testing-library/react'
import { PageMentionPicker, type PageMentionItem } from '@/components/molecules/PageMentionPicker'

const ITEMS: PageMentionItem[] = [
  { id: 'a', glyph: 'heart', label: 'kitchen renovation', sub: 'home' },
  { id: 'b', glyph: 'star-01', label: 'budget', sub: 'money' },
  { id: 'c', glyph: 'leaf', label: 'garden plan', sub: 'home' },
]

describe('PageMentionPicker — the composer @ popover rows', () => {
  it('heads with "pages" and renders each row', () => {
    render(<PageMentionPicker items={ITEMS} activeIndex={0} onHover={jest.fn()} onPick={jest.fn()} />)

    expect(screen.getByText('pages')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('option', { name: /kitchen renovation/ })).toBeInTheDocument()
    expect(screen.getAllByText('home')).toHaveLength(2)
  })

  it('highlights only the given activeIndex row', () => {
    render(<PageMentionPicker items={ITEMS} activeIndex={1} onHover={jest.fn()} onPick={jest.fn()} />)

    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('aria-selected', 'false')
    expect(rows[0].className).not.toContain('bg-mn-text/[0.07]')
    expect(rows[1]).toHaveAttribute('aria-selected', 'true')
    expect(rows[1].className).toContain('bg-mn-text/[0.07]')
    expect(rows[2]).toHaveAttribute('aria-selected', 'false')
    expect(rows[2].className).not.toContain('bg-mn-text/[0.07]')
  })
})
