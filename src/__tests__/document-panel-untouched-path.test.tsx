/**
 * KAN-119's path test, PATH_STEPS 2–5: an untouched page rendered as its real
 * surface, `DocumentPanel` — not `BlockCanvas` alone, since the title and
 * eyebrow it must show live one level up. PATH_STEP 1 (the rail's `+`) is
 * `rail-add-child-seed.test.tsx`'s; PATH_STEP 6 (reload persists the seeded
 * block) is the same shape `premade-template-placeholder-path.test.tsx`
 * already walks for a premade template; PATH_STEP 7 (theme parity) is the
 * live verifier's.
 *
 * The slash menu's own assertions follow `block-canvas-slash-path.test.tsx`'s
 * pattern (`groupsOf`, the `data-part="group"` query). Typing is
 * `writeInTextBlock` throughout — tiptap under jsdom isn't driven by real
 * keystrokes.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { instantiateTemplate } from '@/lib/templates/instantiate'
import { PROSE_LINE_PLACEHOLDER } from '@/lib/modules/text/prose'
import { BLANK_TEXT_GROUP } from '@/components/molecules/slash-entries'
import { findTextBlock, findAllTextBlocks, writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => jest.requireActual('./helpers/page-commit-mock').pageCommitMock())

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue([
    { id: 'parent-1', parentId: null, type: 'page', title: 'recipes', order: 0 },
  ])
})

const groupsOf = (menu: HTMLElement) =>
  [...menu.parentElement!.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)

function renderUntouchedPage() {
  mockGetPage.mockResolvedValue({
    id: 'page-1',
    parentId: 'parent-1',
    title: '',
    blocks: instantiateTemplate(PREMADE_TEMPLATES.page).blocks,
    props: {},
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

describe('an untouched page, walked end to end on its real surface (KAN-119)', () => {
  it('shows the untitled/new/hint state, opens the templates-led menu, then falls back once typed', async () => {
    renderUntouchedPage()

    // PATH_STEP 2: the title placeholder reads `Untitled` at ink .68 (the
    // decided three-tier law overrides board 6f frame 1's ink .3 — see
    // PLAN.md deviations), the eyebrow at `new — in recipes`.
    const title = await screen.findByPlaceholderText('Untitled')
    expect(title).toHaveClass('placeholder:text-mn-text-secondary')
    expect(await screen.findByText('new — in recipes')).toBeInTheDocument()

    // PATH_STEP 3: the body is exactly one text block, its hint drawn in the
    // mono override, and no "+ Add a block" foot.
    const blocks = await findAllTextBlocks()
    expect(blocks).toHaveLength(1)
    const field = blocks[0]
    expect(field.closest('[class*="before:font-mono"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Add a block' })).not.toBeInTheDocument()

    // PATH_STEP 4: `/` opens the slash menu from that line, leading with templates.
    writeInTextBlock(field, '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(groupsOf(menu)).toEqual(['templates', BLANK_TEXT_GROUP, 'blocks', 'templates', 'pages'])

    // PATH_STEP 5: typing a letter instead drops the hint (tiptap removes
    // `is-editor-empty`, which is what the mono `::before` rule is scoped to)
    // and the eyebrow falls back to the ordinary save-state line.
    writeInTextBlock(field, 'h')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    const typedField = await findTextBlock()
    expect(typedField.querySelector('.is-editor-empty')).toBeNull()
    await waitFor(() => expect(screen.getByText('saving…')).toBeInTheDocument())
    expect(screen.queryByText('new — in recipes')).toBeNull()
  })

  it("the `page` template's own seeded line never autofocuses on arrival (KAN-345 rule 1: a fresh page's body is blank at rest) — no hint at all until the trailing gap is clicked, then the generic line", async () => {
    renderUntouchedPage()

    // No blur, no click: the line arrived with the page, so rule 1 says it
    // never took focus on its own in the first place. Tiptap applies
    // `autofocus` from a `window.setTimeout(..., 0)` queued at mount
    // (`@tiptap/core`'s `Editor.mount`) — flush real time past that before
    // asserting, or this reads "not focused yet" even with the bug (autofocus
    // left on) still in place: confirmed with a bare 0ms flush, which still let
    // this test pass with the bug reverted; 50ms (RTL's own default `waitFor`
    // poll interval) reliably outlasts it.
    const field = await findTextBlock()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(field).not.toHaveFocus()
    expect(field).not.toHaveClass('ProseMirror-focused')
    expect(document.body.textContent).not.toContain('blocks and templates')
    expect(document.querySelector('[data-placeholder*="blocks and templates"]')).toBeNull()
    expect(document.querySelector('[data-hover-ghost="true"]')).toBeNull()

    fireEvent.click(screen.getByTestId('trailing-block-gap'))

    await waitFor(() => expect(field).toHaveClass('ProseMirror-focused'))
    const line = field.querySelector('.is-editor-empty')!
    expect(line).toHaveAttribute('data-placeholder', PROSE_LINE_PLACEHOLDER)
  })
})
