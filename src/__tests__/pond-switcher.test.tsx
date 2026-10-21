/**
 * The pond switcher in the rail head (#312 / #319, `Pond 06.13` `s6m1`).
 *
 * These prove the surface a person actually touches: the chevron, the list, and
 * making a pond. They mock `@/lib/pond/client` rather than the database, because
 * migration 0018 has not been applied to the hosted project yet — `ponds` answers
 * 404 there — and the component's behaviour must not wait on that.
 *
 * The before-0018 case is tested too, and it is the one that matters most while
 * the table is missing: `listPonds()` returns [] and the head must render exactly
 * what it rendered before, with NO chevron. A switcher that opens an empty menu is
 * the dead affordance that `#177` kept `import from notes` out for.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PondSwitcher } from '@/components/organisms/PondSwitcher'
import { PondProvider } from '@/lib/pond/context'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

let mockSearch = ''

jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  createPond: jest.fn(),
  setPondLastPage: jest.fn(),
}))

import { createPond, listPonds, setPondLastPage } from '@/lib/pond/client'

const LIFE = { id: 'p-life', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
const NOISE = { id: 'p-noise', name: 'make noise', glyph: 'lightning-03', theme: 'ink', order: 1 }

// Rendered inside the REAL provider, not a stub: the switcher and the shell share
// one pond list, and the bug this guards against lived in exactly that seam — a
// created pond was in the URL before the list had it, so the shell resolved back
// to the first pond and the new pond showed its pages.
function renderSwitcher() {
  return render(
    <PondProvider>
      <PondSwitcher fallbackName="life" />
    </PondProvider>
  )
}

beforeEach(() => {
  mockSearch = ''
  push.mockClear()
  ;(listPonds as jest.Mock).mockResolvedValue([LIFE, NOISE])
  ;(createPond as jest.Mock).mockReset()
  ;(setPondLastPage as jest.Mock).mockReset().mockResolvedValue(undefined)
})

describe('the rail head before migration 0018', () => {
  it('renders the plain name with NO chevron when there are no ponds', async () => {
    ;(listPonds as jest.Mock).mockResolvedValue([])
    const { container } = renderSwitcher()

    await waitFor(() => expect(listPonds).toHaveBeenCalled())
    expect(screen.getByText('life')).toBeInTheDocument()
    // No button, so nothing to click and no empty menu to open.
    expect(container.querySelector('[data-part="pond-switcher"]')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('the pond switcher', () => {
  it('shows the active pond and opens the list on click', async () => {
    const { container } = renderSwitcher()

    const head = await screen.findByRole('button')
    expect(head).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('[data-part="pond-name"]')).toHaveTextContent('life')
    // The chevron both boards draw.
    expect(head.querySelector('svg')).not.toBeNull()

    fireEvent.click(head)
    expect(head).toHaveAttribute('aria-expanded', 'true')

    const menu = screen.getByRole('menu', { name: 'Ponds' })
    expect(menu).toBeInTheDocument()
    expect(screen.getByText('make noise')).toBeInTheDocument()
  })

  it("draws PondRail's head: the pond's glyph, a .68 chevron turned down, up while open", async () => {
    mockSearch = 'pond=p-noise'
    const { container } = renderSwitcher()

    const head = await screen.findByRole('button')
    await waitFor(() =>
      expect(head.querySelector('[data-pond-mark] [data-icon]')).toHaveAttribute(
        'data-icon',
        'lightning-03'
      )
    )
    const chevron = head.querySelector('svg')!
    expect(chevron).toHaveAttribute('viewBox', '0 0 9 9')
    expect(chevron.querySelector('path')).toHaveAttribute('d', 'M3.5 2 L7 5 L3.5 8')
    expect(chevron).toHaveAttribute('stroke-width', '1.4')
    expect(chevron.getAttribute('class')).toMatch(/\btext-mn-text-secondary\b/)
    expect(chevron.getAttribute('class')).toMatch(/(^|\s)rotate-90\b/)

    fireEvent.click(head)
    expect(chevron.getAttribute('class')).toMatch(/-rotate-90\b/)
    expect(container.querySelector('[data-part="rail-head"]')).toBeInTheDocument()
  })

  it('falls back to waves-02 when the pond has no glyph of its own', async () => {
    ;(listPonds as jest.Mock).mockResolvedValue([{ ...LIFE, glyph: null }])
    const { container } = renderSwitcher()

    await screen.findByRole('button')
    expect(container.querySelector('[data-pond-mark] [data-icon]')).toHaveAttribute(
      'data-icon',
      'waves-02'
    )
  })

  it('names the pond from ?pond= rather than always the first', async () => {
    mockSearch = 'pond=p-noise'
    const { container } = renderSwitcher()

    await waitFor(() =>
      expect(container.querySelector('[data-part="pond-name"]')).toHaveTextContent('make noise')
    )
  })

  it('links each pond to ?pond=<id>, dropping any ?nodeId=', async () => {
    mockSearch = 'pond=p-life&nodeId=some-page'
    renderSwitcher()

    fireEvent.click(await screen.findByRole('button'))
    const link = screen.getByRole('menuitem', { name: /make noise/ })
    // A page id from one pond means nothing in another, so switching lands on the
    // new pond's root rather than carrying ?nodeId= across.
    expect(link).toHaveAttribute('href', '/workspace?pond=p-noise')
  })

  it('carries a pond’s remembered page as &nodeId=', async () => {
    ;(listPonds as jest.Mock).mockResolvedValue([LIFE, { ...NOISE, lastPageId: 'n-99' }])
    renderSwitcher()

    fireEvent.click(await screen.findByRole('button'))
    const link = screen.getByRole('menuitem', { name: /make noise/ })
    expect(link).toHaveAttribute('href', '/workspace?pond=p-noise&nodeId=n-99')
  })

  it('remembers page X across a real switch away and back (PATH_STEPS 2-4)', async () => {
    const PAGE_X = '11111111-1111-1111-1111-111111111111'
    mockSearch = 'pond=p-life'
    const { rerender } = renderSwitcher()
    const head = await screen.findByRole('button')

    // Step 2: open page X in life.
    mockSearch = `pond=p-life&nodeId=${PAGE_X}`
    rerender(
      <PondProvider>
        <PondSwitcher fallbackName="life" />
      </PondProvider>
    )
    await waitFor(() => expect(setPondLastPage).toHaveBeenCalledWith('p-life', PAGE_X))

    // Step 3: switch to make noise — via the href the menu itself renders for
    // that row, not a hand-authored string, so a broken href would be caught.
    fireEvent.click(head)
    const noiseHref = screen.getByRole('menuitem', { name: /make noise/ }).getAttribute('href')
    fireEvent.click(head)
    mockSearch = noiseHref!.split('?')[1] ?? ''
    rerender(
      <PondProvider>
        <PondSwitcher fallbackName="life" />
      </PondProvider>
    )
    await waitFor(() =>
      expect(screen.getByText('make noise')).toBeInTheDocument()
    )

    // Step 4: switch back to life via ITS href, read the same way — this is
    // the actual URL a click on that row would carry, including whatever
    // &nodeId= the switch-away-and-back left behind.
    fireEvent.click(head)
    const lifeHref = screen.getByRole('menuitem', { name: /life/ }).getAttribute('href')
    fireEvent.click(head)
    expect(lifeHref).toBe(`/workspace?pond=p-life&nodeId=${PAGE_X}`)
    mockSearch = lifeHref!.split('?')[1] ?? ''
    rerender(
      <PondProvider>
        <PondSwitcher fallbackName="life" />
      </PondProvider>
    )
    await screen.findByText('life')

    fireEvent.click(head)
    const lifeRow = screen.getByRole('menuitem', { name: /life/ })
    expect(lifeRow).toHaveAttribute('href', `/workspace?pond=p-life&nodeId=${PAGE_X}`)
  })

  it("opens the sheet's first of two steps, not a field in the menu", async () => {
    renderSwitcher()
    fireEvent.click(await screen.findByRole('button', { name: /life/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /new pond/ }))

    // `s6m2`: a sheet over a paper scrim, with the step counter and the title.
    const sheet = screen.getByRole('dialog', { name: 'New pond' })
    expect(sheet).toBeInTheDocument()
    expect(sheet).toHaveTextContent('New pond')
    expect(sheet).toHaveTextContent('1 of 2')
    // The board's rows are PRESENT, not omitted — #316 ships them disabled.
    expect(sheet).toHaveTextContent('glyph')
    expect(sheet).toHaveTextContent('theme')
    expect(sheet).toHaveTextContent('burnt orange')
  })

  it('walks the full path end to end: name → areas → make pond, with back and cancel', async () => {
    const user = userEvent.setup()
    ;(createPond as jest.Mock).mockResolvedValue({ ...NOISE, id: 'p-new', name: 'Studio' })
    renderSwitcher()
    await user.click(await screen.findByRole('button', { name: /life/ }))
    await user.click(screen.getByRole('menuitem', { name: /new pond/ }))

    const sheet = screen.getByRole('dialog', { name: 'New pond' })
    expect(sheet).toHaveTextContent('1 of 2')
    const nameField = screen.getByPlaceholderText('Name your pond')
    const continueButton = screen.getByRole('button', { name: 'continue' })
    expect(continueButton).toBeDisabled()

    // ↵ on a blank name does nothing.
    await user.type(nameField, '{Enter}')
    expect(sheet).toHaveTextContent('1 of 2')

    await user.type(nameField, 'Studio')
    expect(continueButton).toBeEnabled()

    await user.click(continueButton)
    expect(sheet).toHaveTextContent('2 of 2')
    expect(sheet).toHaveTextContent('Areas')
    expect(screen.getByText('clients')).toHaveAttribute('aria-disabled', 'true')

    // Back keeps the name.
    await user.click(screen.getByRole('button', { name: 'back' }))
    expect(sheet).toHaveTextContent('1 of 2')
    expect(screen.getByPlaceholderText('Name your pond')).toHaveValue('Studio')

    await user.click(screen.getByRole('button', { name: 'continue' }))
    expect(sheet).toHaveTextContent('2 of 2')

    // Esc on step 2 goes back, not cancel.
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'New pond' })).toHaveTextContent('1 of 2')
    expect(screen.getByPlaceholderText('Name your pond')).toHaveValue('Studio')

    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))
    await waitFor(() => expect(createPond).toHaveBeenCalledWith('Studio', { glyph: 'lightning-03' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workspace?pond=p-new'))
  })

  // Both tests below fire Escape with `document.body` as the event's own
  // target — exactly what the real bug produces: a step change unmounts the
  // element that was focused and nothing inside the sheet claims it, so the
  // next keydown's target is <body>, outside the dialog div's own subtree.
  // A listener that only sits on the dialog's `onKeyDown` never sees that
  // event; `document.body.focus()` cannot reproduce it on its own, since
  // step 1's name field re-claims focus via its own `autoFocus` the moment
  // it remounts.

  it('Escape still steps back once its target is <body> (Enter unmounted the name field)', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(await screen.findByRole('button', { name: /life/ }))
    await user.click(screen.getByRole('menuitem', { name: /new pond/ }))

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio{Enter}')
    const sheet = screen.getByRole('dialog', { name: 'New pond' })
    expect(sheet).toHaveTextContent('2 of 2')

    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(screen.getByRole('dialog', { name: 'New pond' })).toHaveTextContent('1 of 2')
    expect(screen.getByPlaceholderText('Name your pond')).toHaveValue('Studio')
  })

  it('Escape still cancels once its target is <body> (back unmounted itself)', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(await screen.findByRole('button', { name: /life/ }))
    await user.click(screen.getByRole('menuitem', { name: /new pond/ }))

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'continue' }))
    expect(screen.getByRole('dialog', { name: 'New pond' })).toHaveTextContent('2 of 2')

    await user.click(screen.getByRole('button', { name: 'back' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'New pond' })).not.toBeInTheDocument()
    expect(createPond).not.toHaveBeenCalled()
  })

  it('Escape mid-IME-composition only dismisses the composition, not the sheet', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(await screen.findByRole('button', { name: /life/ }))
    await user.click(screen.getByRole('menuitem', { name: /new pond/ }))

    const field = screen.getByPlaceholderText('Name your pond')
    await user.type(field, 'Studio')
    fireEvent.keyDown(field, { key: 'Escape', isComposing: true })

    expect(screen.getByRole('dialog', { name: 'New pond' })).toBeInTheDocument()
    expect(field).toHaveValue('Studio')
    expect(createPond).not.toHaveBeenCalled()
  })

  it('Esc on step 1 cancels and creates nothing', async () => {
    const user = userEvent.setup()
    renderSwitcher()
    await user.click(await screen.findByRole('button', { name: /life/ }))
    await user.click(screen.getByRole('menuitem', { name: /new pond/ }))
    expect(screen.getByRole('dialog', { name: 'New pond' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'New pond' })).not.toBeInTheDocument()
    expect(createPond).not.toHaveBeenCalled()
  })

  it('a scrim click cancels and creates nothing', async () => {
    const user = userEvent.setup()
    const { container } = renderSwitcher()
    await user.click(await screen.findByRole('button', { name: /life/ }))
    await user.click(screen.getByRole('menuitem', { name: /new pond/ }))
    expect(screen.getByRole('dialog', { name: 'New pond' })).toBeInTheDocument()

    // The sheet's own scrim, not the switcher menu's click-away div — both are
    // full-bleed overlays, and the sheet's is the later of the two since
    // NewPondFlow mounts after the still-open menu in PondSwitcher's JSX.
    const overlays = container.querySelectorAll('.fixed.inset-0')
    fireEvent.click(overlays[overlays.length - 1])

    expect(screen.queryByRole('dialog', { name: 'New pond' })).not.toBeInTheDocument()
    expect(createPond).not.toHaveBeenCalled()
  })

  it("beats a page panel's own Escape listener on the document bubble phase", async () => {
    // Simulates PageChangesPanel's document-level bubble listener: it only acts
    // on an Escape that reaches it with `defaultPrevented` still false. Mounted
    // BEFORE the sheet opens, matching the real registration order.
    const recorder = jest.fn()
    const handlePanelLike = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) recorder()
    }
    document.addEventListener('keydown', handlePanelLike)
    try {
      const user = userEvent.setup()
      renderSwitcher()
      await user.click(await screen.findByRole('button', { name: /life/ }))
      await user.click(screen.getByRole('menuitem', { name: /new pond/ }))
      expect(screen.getByRole('dialog', { name: 'New pond' })).toBeInTheDocument()

      await user.keyboard('{Escape}')

      expect(screen.queryByRole('dialog', { name: 'New pond' })).not.toBeInTheDocument()
      expect(createPond).not.toHaveBeenCalled()
      expect(recorder).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', handlePanelLike)
    }
  })

  it('surfaces a failure in the sheet instead of silently closing', async () => {
    const user = userEvent.setup()
    ;(createPond as jest.Mock).mockRejectedValue(new Error('relation "ponds" does not exist'))
    renderSwitcher()
    await user.click(await screen.findByRole('button', { name: /life/ }))
    await user.click(screen.getByRole('menuitem', { name: /new pond/ }))
    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))

    await waitFor(() => expect(screen.getByText(/could not make it/)).toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'New pond' })).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('Esc and a scrim click do nothing while make pond is in flight', async () => {
    const user = userEvent.setup()
    // Never resolves within the test: `pending` stays true for its whole body.
    ;(createPond as jest.Mock).mockReturnValue(new Promise(() => {}))
    const { container } = renderSwitcher()
    await user.click(await screen.findByRole('button', { name: /life/ }))
    await user.click(screen.getByRole('menuitem', { name: /new pond/ }))
    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'make pond' })).toBeDisabled())

    await user.keyboard('{Escape}')
    const overlays = container.querySelectorAll('.fixed.inset-0')
    fireEvent.click(overlays[overlays.length - 1])

    const sheet = screen.getByRole('dialog', { name: 'New pond' })
    expect(sheet).toHaveTextContent('2 of 2')
    expect(push).not.toHaveBeenCalled()
  })
})
