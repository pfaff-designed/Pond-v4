import { render, screen } from '@testing-library/react'
import { MentionPillOverlay } from './MentionPillOverlay'

describe('MentionPillOverlay', () => {
  it('paints the pill span over the @<title> run for a matching reference', () => {
    render(
      <MentionPillOverlay
        value="what is actually blocking @kitchen renovation?"
        titles={['kitchen renovation']}
      />
    )
    const pill = screen.getByText('@kitchen renovation')
    expect(pill.dataset.part).toBe('mention-pill')
    expect(pill.className).toContain('bg-mn-text/[0.07]')
  })

  it('renders no pill for an @word with no matching reference', () => {
    render(<MentionPillOverlay value="ping @someone please" titles={['kitchen renovation']} />)
    expect(document.querySelector('[data-part="mention-pill"]')).toBeNull()
  })
})
