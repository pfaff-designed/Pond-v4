/**
 * The mark popover's keyboard and focus behaviour — `PageMarkButton` (#134).
 *
 * Round three flagged this component as having no test at all, and all three of
 * its defects lived here: the popover was mouse-only (focus never entered it, so
 * Escape could not reach it), and once focus restoration was added it fired from
 * the SCROLL handler too, yanking the caret out of the editor mid-keystroke.
 * Both are behaviour a reader cannot see by reading, so they are pinned here.
 */

import { render, fireEvent, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PageMarkButton } from '@/components/organisms/PageMarkButton'
import type { PageMark } from '@/lib/pages/mark'

jest.mock('@/lib/pages/client', () => ({ setPageMark: jest.fn().mockResolvedValue(undefined) }))

const MARK: PageMark = { glyph: 'leaf-01', role: 'area-a', roleIsOwn: false, glyphIsOwn: false }

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <input aria-label="Elsewhere" />
      <PageMarkButton pageId="p1" pageTitle="Health" mark={MARK} />
    </QueryClientProvider>
  )
}

const trigger = () => screen.getByRole('button', { name: 'Change the mark for Health' })
const dialog = () => screen.queryByRole('dialog', { name: 'Mark for Health' })

describe('PageMarkButton — opening', () => {
  it('moves focus into the picker, so it is reachable without a mouse', () => {
    renderButton()
    fireEvent.click(trigger())
    expect(dialog()).toBeInTheDocument()
    // Not the trigger: focus on a SIBLING of the portal is what made Escape
    // unreachable and left Tab landing behind the click-away overlay.
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search glyphs' }))
  })

  it('announces itself as a popup', () => {
    renderButton()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('PageMarkButton — closing', () => {
  it('closes on Escape and hands focus back to the trigger', () => {
    renderButton()
    fireEvent.click(trigger())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dialog()).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on a second click on the mark', () => {
    renderButton()
    fireEvent.click(trigger())
    fireEvent.click(trigger())
    expect(dialog()).not.toBeInTheDocument()
  })

  it('closes on scroll WITHOUT stealing focus from elsewhere', () => {
    // The round-two regression round three caught. `close` doubles as the scroll
    // handler, and restoring focus there pulled the caret out of whatever the
    // person was typing in — then the next Space re-opened the picker.
    renderButton()
    fireEvent.click(trigger())
    const elsewhere = screen.getByRole('textbox', { name: 'Elsewhere' })
    elsewhere.focus()

    fireEvent.scroll(window)

    expect(dialog()).not.toBeInTheDocument()
    expect(document.activeElement).toBe(elsewhere)
  })

  it('does not steal focus on Escape pressed while focus is elsewhere', () => {
    renderButton()
    fireEvent.click(trigger())
    const elsewhere = screen.getByRole('textbox', { name: 'Elsewhere' })
    elsewhere.focus()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(dialog()).not.toBeInTheDocument()
    expect(document.activeElement).toBe(elsewhere)
  })
})

describe('PageMarkButton — a page with no glyph', () => {
  it('is still clickable, showing its KindDot', () => {
    // Only the six seeded areas have a title-derived glyph. Returning null here
    // meant every other page had nothing to click and so no route to a mark.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={client}>
        <PageMarkButton
          pageId="p2"
          pageTitle="Scratch"
          mark={{ glyph: null, role: 'area-b', roleIsOwn: false, glyphIsOwn: false }}
        />
      </QueryClientProvider>
    )
    const btn = screen.getByRole('button', { name: 'Change the mark for Scratch' })
    expect(btn).toBeInTheDocument()
    const dot = container.querySelector<HTMLElement>('[data-part="dot"]')!
    expect(dot).toBeInTheDocument()
    expect(dot.style.background).toBe('var(--mn-area-b)')
  })
})
