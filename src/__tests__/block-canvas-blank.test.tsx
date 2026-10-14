/**
 * On an empty page, `/` leads with templates (6f, KAN-276): `BlockCanvas` reads
 * `blank` off `isBlankBesides(i)` and the glass opens straight on the
 * `templates` group, no head. A page that already has content keeps the
 * ordinary, non-leading list.
 */

import React, { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { insertPageOptimistic } from '@/lib/pages/tree'
import type { Block } from '@/lib/documents/types'
import type { PondTemplate } from '@/lib/templates/types'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'
import { TEMPLATE_KINDS } from '@/lib/templates/types'
import { justSaved } from '@/lib/templates/just-saved'

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const textBlockIn = (blockId: string) =>
  within(blockRoot(blockId)).findByRole('textbox', { name: 'text block' })

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))
const mockListTemplates = jest.fn()
jest.mock('@/lib/templates/client', () => ({
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
const mockSiblingTemplateRanking = jest.fn()
jest.mock('@/lib/templates/provenance', () => ({
  ...jest.requireActual('@/lib/templates/provenance'),
  siblingTemplateRanking: (...args: unknown[]) => mockSiblingTemplateRanking(...args),
}))
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))
const mockGetPage = jest.fn()
const mockSaveProps = jest.fn().mockResolvedValue(undefined)
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: (...args: unknown[]) => mockGetPage(...args),
  saveProps: (...args: unknown[]) => mockSaveProps(...args),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))
const mockAppendOwnEdit = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))
const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: (...args: unknown[]) => mockRemember(...args) },
}))

const pageRows = [
  { id: 'root-1', parent_id: null, type: 'page', title: 'recipes', order: 0, updated_at: '' },
  {
    id: 'page-1',
    parent_id: 'root-1',
    type: 'page',
    title: 'sourdough, 78%',
    order: 0,
    updated_at: '',
  },
]

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId="page-1"
          pageTitle="sourdough, 78%"
          onChange={() => {}}
          onUndoRemove={() => {}}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue(pageRows)
  mockGetPage.mockResolvedValue(null)
  mockSaveProps.mockResolvedValue(undefined)
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-1' })
  mockListTemplates.mockResolvedValue([])
  mockSiblingTemplateRanking.mockResolvedValue([])
  justSaved.reset()
})

describe('the `/` menu on an empty page leads with templates (KAN-276)', () => {
  it('opens straight on `templates`, no head, and lists templates before the blocks', async () => {
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])
    writeInTextBlock(await findTextBlock(), '/')

    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(menu.parentElement!.querySelector('[data-part="head"]')).not.toBeInTheDocument()
    const groups = [...menu.parentElement!.querySelectorAll('[data-part="group"]')].map(
      (g) => g.textContent
    )
    expect(groups[0]).toBe('templates')
  })

  it('a page with existing content renders the ordinary rows, unchanged', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([note, emptyLine])
    writeInTextBlock(await textBlockIn('b-empty'), '/')

    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(menu.parentElement!.querySelector('[data-part="head"]')).not.toBeInTheDocument()
    const groups = [...menu.parentElement!.querySelectorAll('[data-part="group"]')].map(
      (g) => g.textContent
    )
    expect(groups).toEqual(['text', 'blocks', 'templates', 'pages'])
  })
})

describe("the blank list ranks the parent's other children's template use first (KAN-138)", () => {
  it('leads with the just-saved template, hinted `yours · just saved`', async () => {
    const WEEKNIGHT: PondTemplate = {
      id: 'weeknight-id',
      name: 'weeknight recipe',
      kind: 'notes',
      blocks: [],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([WEEKNIGHT])
    justSaved.set('pond-1', 'weeknight-id')
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])
    writeInTextBlock(await findTextBlock(), '/')

    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('weeknight recipe')
    // The leading row is selected by default, so its hint is hidden behind
    // `↵` (slash-row.tsx, the PondPicker DC's hide-hint-on-selected rule) —
    // move off it to read the hint underneath.
    await user.keyboard('{ArrowDown}')
    const firstRow = menu.querySelector('[data-part="row"]')!
    expect(firstRow.querySelector('[data-part="label"]')!.textContent).toBe('weeknight recipe')
    expect(firstRow.querySelector('[data-part="hint"]')!.textContent).toBe('yours · just saved')
  })

  it('leads with the sibling-used template, hinted `yours · used in {parent}`', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'recipe-id',
      name: 'recipe',
      kind: 'notes',
      blocks: [],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    mockSiblingTemplateRanking.mockResolvedValue(['recipe-id'])
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])
    writeInTextBlock(await findTextBlock(), '/')

    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')
    // The ranked row leads and is selected by default, so its hint is hidden
    // behind `↵` (slash-row.tsx) — move off it to read the hint underneath.
    await user.keyboard('{ArrowDown}')
    const firstRow = menu.querySelector('[data-part="row"]')!
    expect(firstRow.querySelector('[data-part="label"]')!.textContent).toBe('recipe')
    expect(firstRow.querySelector('[data-part="hint"]')!.textContent).toBe(
      'yours · used in recipes'
    )

    expect(mockSiblingTemplateRanking).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'pond-1',
      'root-1'
    )
  })

  it('does not rank before `pageRows` resolves, so it never ranks off a false `null` parentId', async () => {
    let resolvePages: (rows: typeof pageRows) => void = () => {}
    mockFetchPages.mockImplementation(() => new Promise((resolve) => (resolvePages = resolve)))
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])
    writeInTextBlock(await findTextBlock(), '/')

    await screen.findByRole('listbox', { name: 'blocks' })
    expect(mockSiblingTemplateRanking).not.toHaveBeenCalled()

    resolvePages(pageRows)
    await waitFor(() => expect(mockSiblingTemplateRanking).toHaveBeenCalled())
    expect(mockSiblingTemplateRanking).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'pond-1',
      'root-1'
    )
  })

  it('the path: a third blank child under `recipes` leads with `recipe` (used by its two siblings), `weeknight recipe` next, then premade in canonical order, foot reading apply-with-preview', async () => {
    const RECIPE: PondTemplate = {
      id: 'recipe-id',
      name: 'recipe',
      kind: 'notes',
      blocks: [],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    const WEEKNIGHT: PondTemplate = {
      id: 'weeknight-id',
      name: 'weeknight recipe',
      kind: 'notes',
      blocks: [],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([RECIPE, WEEKNIGHT])
    mockSiblingTemplateRanking.mockResolvedValue(['recipe-id'])
    mockFetchPages.mockResolvedValue([
      { id: 'root-1', parent_id: null, type: 'page', title: 'recipes', order: 0, updated_at: '' },
      {
        id: 'page-sibling-1',
        parent_id: 'root-1',
        type: 'page',
        title: 'sourdough, 78%',
        order: 0,
        updated_at: '',
      },
      {
        id: 'page-sibling-2',
        parent_id: 'root-1',
        type: 'page',
        title: 'weeknight pasta',
        order: 1,
        updated_at: '',
      },
      {
        id: 'page-1',
        parent_id: 'root-1',
        type: 'page',
        title: 'sourdough, 78%',
        order: 2,
        updated_at: '',
      },
    ])
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])
    writeInTextBlock(await findTextBlock(), '/')

    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')

    // `recipe` leads, selected — its foot already reads apply-with-preview.
    expect(document.querySelector('[data-part="foot"]')!.textContent).toBe(
      '↑↓ move→ preview↵ apply'
    )

    // Move off the leading row to read its hint (hidden behind `↵` while selected).
    await user.keyboard('{ArrowDown}')
    const rows = () => [...menu.querySelectorAll('[data-part="row"]')]
    expect(rows()[0].querySelector('[data-part="label"]')!.textContent).toBe('recipe')
    expect(rows()[0].querySelector('[data-part="hint"]')!.textContent).toBe(
      'yours · used in recipes'
    )

    // Move again to read the second row's hint.
    await user.keyboard('{ArrowDown}')
    expect(rows()[1].querySelector('[data-part="label"]')!.textContent).toBe('weeknight recipe')
    expect(rows()[1].querySelector('[data-part="hint"]')!.textContent).toBe('yours')

    // The remaining twelve premade kinds follow, in their canonical order — the
    // `templates` group ends where the next group (`text — scroll for …`) begins.
    expect(
      rows()
        .slice(2, 2 + TEMPLATE_KINDS.length)
        .map((r) => r.querySelector('[data-part="label"]')!.textContent)
    ).toEqual([...TEMPLATE_KINDS])
  })
})

/**
 * `BlockCanvas` is controlled, so a template pick replacing its blocks only
 * shows up once the host re-renders with them — a stateful harness, same as
 * `block-canvas-slash-path.test.tsx`. The title input lives outside
 * `BlockCanvas` (it is `DocumentPanel`'s) — stood in here so `focusPageTitle()`
 * has something real to find.
 */
function BlankPageHarness() {
  const [blocks, setBlocks] = useState<Block[]>([{ id: 'b-empty', type: 'text', content: '' }])
  return (
    <>
      <input aria-label="title" data-pond-page-title />
      <BlockCanvas
        blocks={blocks}
        pageId="page-1"
        pageTitle="sourdough, 78%"
        onChange={setBlocks}
        onUndoRemove={() => {}}
      />
    </>
  )
}

function renderBlankPageHarness(
  client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlankPageHarness />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return client
}

describe('a template pick on a blank page applies in place (KAN-124)', () => {
  it("replaces the page's blocks with the template's stack, makes no page, and focuses the title", async () => {
    const user = userEvent.setup()
    renderBlankPageHarness()

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    // The first template row is `page`; one ↓ reaches `notes`.
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(
        document.querySelector('[data-placeholder="anything, in any order"]')
      ).toBeInTheDocument()
    )
    // The blank page's own block is gone — replaced, not added alongside.
    expect(document.getElementById('block-b-empty')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('title')).toHaveFocus())

    expect(insertPageOptimistic).not.toHaveBeenCalled()
  })

  it("writes the kind label and provenance stamp onto the page, preserving its existing props, and reflects them in the ['page', id] cache", async () => {
    const user = userEvent.setup()
    const existing = {
      id: 'page-1',
      parentId: null,
      type: 'page' as const,
      title: 'sourdough, 78%',
      blocks: [],
      props: { glyph: 'leaf' },
      order: 0,
    }
    mockGetPage.mockResolvedValue(existing)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['page', 'page-1'], existing)
    renderBlankPageHarness(client)

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    // The first template row is `page`; one ↓ reaches `notes`.
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSaveProps).toHaveBeenCalled())
    const writtenProps = mockSaveProps.mock.calls[0][2]
    expect(writtenProps.glyph).toBe('leaf')
    expect(writtenProps.kind).toBe('notes')
    expect(writtenProps.madeFromTemplate).toEqual(
      expect.objectContaining({ templateId: 'premade:notes', name: 'notes' })
    )

    // The cache's blocks moved to the applied stack first (so use-page-draft's
    // adopt branch can fold them in); the props write layers onto THAT, not the
    // stale `existing.blocks`.
    const appliedBlocks = mockSaveBlocks.mock.calls[0][2]
    await waitFor(() =>
      expect(client.getQueryData(['page', 'page-1'])).toEqual({
        ...existing,
        blocks: appliedBlocks,
        props: writtenProps,
      })
    )
  })

  it('persists the applied blocks as one own-edit record, remembered as one undo step', async () => {
    const user = userEvent.setup()
    const existing = {
      id: 'page-1',
      parentId: null,
      type: 'page' as const,
      title: 'sourdough, 78%',
      blocks: [{ id: 'b-empty', type: 'text' as const, content: '' }],
      props: {},
      order: 0,
    }
    mockGetPage.mockResolvedValue(existing)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['page', 'page-1'], existing)
    renderBlankPageHarness(client)

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    // The first template row is `page`; one ↓ reaches `notes`.
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    const input = mockAppendOwnEdit.mock.calls[0][1]
    expect(input.before).toEqual(existing.blocks)
    expect(input.after).toEqual(mockSaveBlocks.mock.calls[0][2])
    expect(input.targetPageId).toBe('page-1')

    expect(mockRemember).toHaveBeenCalledTimes(1)
    expect(mockRemember).toHaveBeenCalledWith({ pondId: 'pond-1', recordIds: ['record-1'] })

    // No duplicate save/record for the same apply.
    expect(mockSaveBlocks).toHaveBeenCalledTimes(1)
  })

  it('G9: two quick picks/returns on the same template run the write once', async () => {
    const user = userEvent.setup()
    const existing = {
      id: 'page-1',
      parentId: null,
      type: 'page' as const,
      title: 'sourdough, 78%',
      blocks: [{ id: 'b-empty', type: 'text' as const, content: '' }],
      props: {},
      order: 0,
    }
    mockGetPage.mockResolvedValue(existing)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['page', 'page-1'], existing)
    renderBlankPageHarness(client)

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    // The first template row is `page`; one ↓ reaches `notes`.
    await user.keyboard('{ArrowDown}')
    // Fire two returns in quick succession, no await between them — the second
    // must land while the first apply is still in its awaits.
    await Promise.all([user.keyboard('{Enter}'), user.keyboard('{Enter}')])

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    expect(mockSaveProps).toHaveBeenCalledTimes(1)
    expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1)
    expect(mockRemember).toHaveBeenCalledTimes(1)
  })

  it('the path: a schema-carrying premade template applies in place on one double ↵, after a foot that already read apply', async () => {
    const user = userEvent.setup()
    renderBlankPageHarness()

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })

    // The foot already reads `↵ apply` while the row is still `page` — before
    // any pick is made.
    expect(document.querySelector('[data-part="foot"]')?.textContent).toContain('↵ apply')

    // `page`(0) … `meeting notes`(9) — a schema-carrying premade (`date`/`with`)
    // with no collection view block, so applying it stays clear of the live
    // view/collection fetch path (out of scope here).
    await user.keyboard('{ArrowDown}'.repeat(9))
    // Two quick returns (G9): the write still runs once.
    await Promise.all([user.keyboard('{Enter}'), user.keyboard('{Enter}')])

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const appliedBlocks = mockSaveBlocks.mock.calls[0][2]
    expect(appliedBlocks.map((b: Block) => b.type)).toEqual(['text', 'todo'])

    // The rendered stack is the instantiated one, exactly once — no leftover
    // blank-page block, no duplicate render of the applied stack.
    await waitFor(() =>
      expect(document.querySelector('[data-placeholder="what was said"]')).toBeInTheDocument()
    )
    expect(document.getElementById('block-b-empty')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByLabelText('title')).toHaveFocus())

    expect(insertPageOptimistic).not.toHaveBeenCalled()
    expect(mockSaveProps).toHaveBeenCalledTimes(1)
    expect(mockSaveProps.mock.calls[0][2].kind).toBe('meeting notes')
  })

  it('a `yours` template applies in place the same way, stamping its NAME as the kind, with its view block carrying no stale collectionId', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'weekly review',
      kind: 'meeting notes',
      blocks: [
        { id: 'orig-1', type: 'text', content: 'already written' } as Block,
        {
          id: 'orig-2',
          type: 'view',
          mode: 'table',
          label: 'entries',
          collectionId: 'db-elsewhere',
        } as Block,
      ],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    renderBlankPageHarness()

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    // `yours` templates lead the `templates` group — no ↓ needed.
    await screen.findByText('weekly review')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const appliedBlocks = mockSaveBlocks.mock.calls[0][2] as Block[]
    expect(appliedBlocks.map((b) => (b.type === 'text' ? b.content : null))).toEqual([
      'already written',
      null,
    ])
    // `templateBlocksFrom` strips the tie to the original page's database — the
    // view binds to THIS page via `viewCollectionId`'s `collectionId ?? pageId`
    // fallback (`block-frame.ts`) at render time, needing no rebind code here.
    const appliedView = appliedBlocks[1]
    expect(appliedView.type).toBe('view')
    expect(appliedView.type === 'view' ? appliedView.collectionId : 'not-a-view').toBeUndefined()

    await waitFor(() => expect(mockSaveProps).toHaveBeenCalledTimes(1))
    expect(mockSaveProps.mock.calls[0][2].kind).toBe('weekly review')

    await waitFor(() => expect(screen.getByLabelText('title')).toHaveFocus())
    expect(insertPageOptimistic).not.toHaveBeenCalled()
  })
})
