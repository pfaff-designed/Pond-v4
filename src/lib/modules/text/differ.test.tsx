import { render, screen, within } from '@testing-library/react'
import type { TextBlock } from './schema'
import { TextDiffer } from './differ'
import { TextView } from './view'

const block = (content: string): TextBlock => ({ id: 't', type: 'text', content })

const proseOf = (container: HTMLElement): HTMLElement => {
  const prose = container.querySelector<HTMLElement>('[data-text-prose]')
  if (!prose) throw new Error('no text block prose')
  return prose
}

describe('TextDiffer — the diff card reads a text block exactly as the page does', () => {
  it.each([
    'milk\neggs\nbread',
    '- [ ] milk\n- [x] eggs',
    '| room | budget |\n| --- | --- |\n| kitchen | 9000 |',
    '![plan](https://example.com/p.png)',
    'see www.example.com',
    '~soft~ strike',
    '## Warm-up\n\n- **light** cardio\n\n1. [plans](https://example.com)',
  ])('the card draws %j with the page’s own document', (content) => {
    const page = render(<TextView data={block(content)} />)
    const card = render(<TextDiffer before={null} after={block(content)} />)
    expect(proseOf(card.container).innerHTML).toBe(proseOf(page.container).innerHTML)
  })

  it('a single newline is a line in the card too', () => {
    const { container } = render(<TextDiffer before={null} after={block('milk\neggs\nbread')} />)
    expect(proseOf(container).querySelectorAll('br')).toHaveLength(2)
  })

  it('syntax a text block has no structure for stays text in the card', () => {
    render(
      <TextDiffer
        before={block('- [ ] milk\n\n| a | b |\n| - | - |')}
        after={block('![plan](https://example.com/p.png) ~soft~ www.example.com')}
      />
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(document.querySelector('s, del')).toBeNull()
    expect(screen.getByText(/\[ \] milk/)).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['plan'])
  })

  it('the removal and the addition are each the block’s typeset document', () => {
    const { container } = render(
      <TextDiffer before={block('Rest **day**.')} after={block('Rest **week**.')} />
    )
    const [removal, addition] = container.querySelectorAll<HTMLElement>('[data-kind="diff-line"]')
    expect(removal).toHaveAttribute('data-variant', 'remove')
    expect(within(removal).getByText('day').tagName).toBe('STRONG')
    expect(within(addition).getByText('week').tagName).toBe('STRONG')
    expect(container.textContent).not.toContain('**')
  })
})
