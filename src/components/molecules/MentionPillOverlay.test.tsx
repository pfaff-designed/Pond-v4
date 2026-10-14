import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MentionPillOverlay } from './MentionPillOverlay'

describe('MentionPillOverlay', () => {
  const textareaRef = createRef<HTMLTextAreaElement>()

  it('paints the pill span over the @<title> run for a matching reference', () => {
    render(
      <>
        <textarea ref={textareaRef} />
        <MentionPillOverlay
          value="what is actually blocking @kitchen renovation?"
          titles={['kitchen renovation']}
          textareaRef={textareaRef}
        />
      </>
    )
    const pill = screen.getByText('@kitchen renovation')
    expect(pill.dataset.part).toBe('mention-pill')
    expect(pill.className).toContain('bg-mn-text/[0.07]')
  })

  it('keeps the pill span free of padding/margin so its run width matches the textarea text, and paints the box on a ::before instead', () => {
    render(
      <>
        <textarea ref={textareaRef} />
        <MentionPillOverlay
          value="what is actually blocking @kitchen renovation?"
          titles={['kitchen renovation']}
          textareaRef={textareaRef}
        />
      </>
    )
    const pill = screen.getByText('@kitchen renovation')
    expect(pill.className).not.toMatch(/\b(?:p|m)[xytblr]?-\[/)
    expect(pill.className).toContain('before:bg-mn-text/[0.07]')
    expect(pill.className).toContain('before:rounded-[6px]')
    expect(pill.className).toContain('before:-left-[6px]')
    expect(pill.className).toContain('before:-right-[6px]')
  })

  it('renders no pill for an @word with no matching reference', () => {
    render(
      <>
        <textarea ref={textareaRef} />
        <MentionPillOverlay
          value="ping @someone please"
          titles={['kitchen renovation']}
          textareaRef={textareaRef}
        />
      </>
    )
    expect(document.querySelector('[data-part="mention-pill"]')).toBeNull()
  })

  it('follows the textarea scrollTop when the textarea scrolls', () => {
    const { container } = render(
      <>
        <textarea ref={textareaRef} />
        <MentionPillOverlay
          value="what is actually blocking @kitchen renovation?"
          titles={['kitchen renovation']}
          textareaRef={textareaRef}
        />
      </>
    )
    const overlay = container.querySelector('[aria-hidden]') as HTMLDivElement
    expect(overlay.scrollTop).toBe(0)

    textareaRef.current!.scrollTop = 42
    fireEvent.scroll(textareaRef.current!)

    expect(overlay.scrollTop).toBe(42)
  })
})
