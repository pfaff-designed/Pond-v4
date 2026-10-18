/**
 * On an empty page, `/` leads with templates (6f, KAN-276): `BlockCanvas` reads
 * `blank` off `isBlankBesides(i)` and the glass opens straight on the
 * `templates` group, no head. A page that already has content keeps the
 * ordinary, non-leading list.
 */

import React, { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
// Captures whatever `anchor`/width the glass is given, each render — jsdom
// never lays anything out (every element's own rect is zeroed, `hidden` or
// not), so the only way to prove the glass was handed the VISIBLE slot rather
// than the hidden block (and the right preview width) is to intercept the
// call itself, not measure the rendered box.
let lastSlashAnchor: { getBoundingClientRect(): Pick<DOMRect, 'top' | 'bottom' | 'left'> } | null =
  null
let lastSlashWidth: number | undefined
jest.mock('@/components/molecules/use-anchored-box', () => {
  const actual = jest.requireActual('@/components/molecules/use-anchored-box')
  return {
    ...actual,
    useAnchoredBox: (...args: [unknown, unknown, number | undefined]) => {
      lastSlashAnchor = args[0] as typeof lastSlashAnchor
      lastSlashWidth = args[2]
      return actual.useAnchoredBox(...args)
    },
  }
})

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
function BlankPageHarness({
  onPreviewNameChange,
}: {
  onPreviewNameChange?: (name: string | null) => void
} = {}) {
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
        onPreviewNameChange={onPreviewNameChange}
      />
    </>
  )
}

function renderBlankPageHarness(
  client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  onPreviewNameChange?: (name: string | null) => void
) {
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlankPageHarness onPreviewNameChange={onPreviewNameChange} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return client
}

/**
 * `DocumentPanel` stays mounted across `?nodeId` changes and `BlockCanvas` is
 * never keyed by page — this harness owns `previewName` itself (a REAL
 * `useState` setter passed as `onPreviewNameChange`, not a `jest.fn()`
 * double, since only a real parent `setState` called from a child's render
 * can reproduce React's "Cannot update a component while rendering a
 * different component"), but deliberately carries NO reset of its own on a
 * `pageId` change — clearing `previewName` on a nodeId change is
 * `DocumentPanel`'s own job (tested at that level), not something this
 * harness should do on `BlockCanvas`'s behalf. A harness that mirrored
 * `DocumentPanel`'s reset here would race it: its own reset would set
 * `previewName` to `null` before `BlockCanvas` ever got a chance to, so the
 * test could pass whether or not `BlockCanvas` still (wrongly) called
 * `onPreviewNameChange` from its own render.
 */
function PageSwitchableHarness({ pageId }: { pageId: string }) {
  const [blocks, setBlocks] = useState<Block[]>([{ id: 'b-empty', type: 'text', content: '' }])
  const [previewName, setPreviewName] = useState<string | null>(null)
  return (
    <>
      <input aria-label="title" data-pond-page-title />
      <span data-testid="preview-name">{previewName ?? ''}</span>
      <BlockCanvas
        blocks={blocks}
        pageId={pageId}
        pageTitle="sourdough, 78%"
        onChange={setBlocks}
        onUndoRemove={() => {}}
        onPreviewNameChange={setPreviewName}
      />
    </>
  )
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

  it("rule 2 (KAN-345): the applied template's own unwritten line ends up with the caret, same as any other session insert — `focusPageTitle` lands first, then the new line's own mount-time autofocus takes over, since the apply marked its ids inserted", async () => {
    const user = userEvent.setup()
    renderBlankPageHarness()

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    // The first template row is `page`; one ↓ reaches `notes`.
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    const field = await findTextBlock()
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveClass('ProseMirror-focused')
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

describe('→ on a template row previews it, writing nothing (KAN-131)', () => {
  it('a `yours` template fixture previewed never saves, logs, or touches the page cache', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'weekly review',
      kind: 'meeting notes',
      blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderBlankPageHarness(client)

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    // `yours` templates lead the `templates` group — no ↓ needed.
    await screen.findByText('weekly review')
    await user.keyboard('{ArrowRight}')

    expect(mockSaveBlocks).not.toHaveBeenCalled()
    expect(mockSaveProps).not.toHaveBeenCalled()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
    expect(client.getQueryData(['page', 'page-1'])).toBeUndefined()
  })

  it("draws the template's blocks as flat outline rows, beside the still-open templates menu, not in place of it (6f frame 3's s3.1.3)", async () => {
    // 6f frame 3's recipe: big number — time, list — ingredients, checklist —
    // method, entry log — cooked, text — notes.
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [
        { id: 'orig-1', type: 'view', mode: 'big-number', label: 'time' } as Block,
        { id: 'orig-2', type: 'todo', marker: 'dot', label: 'ingredients', items: [] } as Block,
        { id: 'orig-3', type: 'todo', marker: 'check', label: 'method', items: [] } as Block,
        { id: 'orig-4', type: 'entries', label: 'cooked', entries: [] } as Block,
        { id: 'orig-5', type: 'text', label: 'notes', content: '' } as Block,
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
    await screen.findByText('recipe')
    await user.keyboard('{ArrowRight}')

    const rows = await waitFor(() => {
      const found = document.querySelectorAll('[data-part="outline-row"]')
      expect(found.length).toBe(5)
      return found
    })
    expect([...rows].map((row) => row.textContent)).toEqual([
      'big number — time',
      'list — ingredients',
      'checklist — method',
      'entry log — cooked',
      'text — notes',
    ])

    // The templates menu stays open and visible beside the outline — item 9's
    // fix: the blank block (and its `SlashMenu`) stays MOUNTED while
    // previewing, so the glass never unmounts.
    const menu = screen.getByRole('listbox', { name: 'blocks' })
    expect(menu).toBeVisible()
    expect(document.querySelector('[data-part="foot"]')?.textContent).toBe('↵ applyesc back')

    // The blank page's own empty block is still in the DOM (so the menu it
    // hosts stays alive) but its own body — text, caret — is gone from view.
    expect(document.getElementById('block-b-empty')).not.toBeVisible()
    // No template block ever becomes a real, editable block editor.
    expect(document.getElementById('block-orig-1')).not.toBeInTheDocument()
  })

  it('anchors the glass to the visible preview slot, not the hidden block, while previewing (6f frame 3)', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    renderBlankPageHarness()

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')

    // Before a preview, the glass anchors off the caret — the hidden slot
    // (not yet rendered) is never read.
    expect(document.querySelector('[data-part="preview-anchor-slot"]')).not.toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(1)
    )

    const slot = document.querySelector('[data-part="preview-anchor-slot"]')
    expect(slot).toBeInTheDocument()
    expect(slot).toBeVisible()
    const SENTINEL = { top: 11, bottom: 11, left: 22 }
    ;(slot as HTMLElement).getBoundingClientRect = jest.fn(() => SENTINEL as DOMRect)

    expect(lastSlashAnchor).not.toBeNull()
    // The SLOT's own stub is read — proving the glass's anchor is the visible
    // slot, not `rootRef`'s zeroed rect off the hidden block — shifted up 4px
    // on desktop so `useAnchoredBox`'s own `bottom + 4` lands exactly on the
    // slot's top, per the next test's own, more specific assertion.
    expect(lastSlashAnchor!.getBoundingClientRect()).toEqual({
      top: SENTINEL.top - 4,
      bottom: SENTINEL.top - 4,
      left: SENTINEL.left,
    })
  })

  it('the glass is 250px wide and top-aligned with the slot while previewing on desktop (6f frame 3)', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    renderBlankPageHarness()

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')
    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(1)
    )

    const slot = document.querySelector('[data-part="preview-anchor-slot"]')!
    // A real (non-zero-height) rect: proves the glass reads the slot's own
    // TOP, not `bottom + 4` below it (today's bug, a zero-height slot's own
    // `top === bottom` would hide this).
    const RECT = { top: 50, bottom: 80, left: 10 }
    ;(slot as HTMLElement).getBoundingClientRect = jest.fn(() => RECT as DOMRect)
    // `useAnchoredBox`'s own effect only re-measures on mount or a `resize`/
    // `scroll` event — force it to pick up the stub just set.
    await act(async () => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(lastSlashWidth).toBe(250)
    const glass = document.querySelector('[data-part="glass"][data-kind="slash"]') as HTMLElement
    expect(glass.className).toContain('w-[250px]')
    expect(glass.style.top).toBe(`${RECT.top}px`)
  })

  it('at phone width, the outline takes the full row and the glass anchors below it instead of beside a slot (6f frame 3)', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      const YOURS_TEMPLATE: PondTemplate = {
        id: 'tpl-9',
        name: 'recipe',
        kind: 'notes',
        blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
        origin: 'yours',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      }
      mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
      const user = userEvent.setup()
      renderBlankPageHarness()

      writeInTextBlock(await findTextBlock(), '/')
      await screen.findByRole('listbox', { name: 'blocks' })
      await screen.findByText('recipe')
      await user.keyboard('{ArrowRight}')
      await waitFor(() =>
        expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(1)
      )

      // No 250px slot beside the outline at phone width — the 340px glass
      // would overhang it and cover the outline rows.
      expect(document.querySelector('[data-part="preview-anchor-slot"]')).not.toBeInTheDocument()
      // The glass keeps its ordinary mobile width and anchors off the outline
      // pane itself, landing below it (the same `bottom + 4` every other
      // anchor already gets, now reading the outline's own, real rect).
      expect(lastSlashWidth).toBe(340)
      const glass = document.querySelector('[data-part="glass"][data-kind="slash"]') as HTMLElement
      expect(glass.className).toContain('w-[340px]')
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })

  it('esc clears the preview and gives the blank page back, with the menu still open on `templates`', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    renderBlankPageHarness()

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')
    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(1)
    )

    await user.keyboard('{Escape}')

    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const groups = [...menu.parentElement!.querySelectorAll('[data-part="group"]')].map(
      (g) => g.textContent
    )
    expect(groups[0]).toBe('templates')
    expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(0)
    expect(document.getElementById('block-b-empty')).toBeInTheDocument()
    expect(mockSaveBlocks).not.toHaveBeenCalled()
  })

  it('round 3 fix (live finding 1): the host editor keeps focus through →, esc and ↓, and typing while previewing drops the outline and still filters', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    renderBlankPageHarness()

    const field = await findTextBlock()
    writeInTextBlock(field, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')
    field.focus()
    expect(document.activeElement).toBe(field)

    // `→` previews — the host editor must still be the focused element (not
    // blurred to `<body>` by a `display:none` swap).
    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(1)
    )
    expect(document.activeElement).toBe(field)

    // `esc` clears the outline — still focused.
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(0)
    )
    expect(document.activeElement).toBe(field)

    // Typing (the query changing) reaches the still-focused field and filters
    // the rows — the bug this item fixes left nothing focused to type into.
    writeInTextBlock(field, '/rec')
    await waitFor(() => expect(screen.getByRole('listbox', { name: 'blocks' })).toHaveTextContent('recipe'))
    expect(document.activeElement).toBe(field)

    // `→` previews again; a query change while previewing drops it the same
    // way an arrow key does, so the outline never sits over a filtered list
    // it no longer matches.
    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(1)
    )
    writeInTextBlock(field, '/re')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(0)
    )
    expect(document.activeElement).toBe(field)

    // `→` then `↓` — still focused, and typing afterward still filters.
    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(1)
    )
    await user.keyboard('{ArrowDown}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(0)
    )
    expect(document.activeElement).toBe(field)
    writeInTextBlock(field, '/r')
    await waitFor(() => expect(screen.getByRole('listbox', { name: 'blocks' })).toHaveTextContent('recipe'))
    expect(document.activeElement).toBe(field)
  })

  it("KAN-131 item 8: reports the previewed template's name, then null on esc, for the host's eyebrow", async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    const onPreviewNameChange = jest.fn()
    renderBlankPageHarness(undefined, onPreviewNameChange)

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(onPreviewNameChange).toHaveBeenCalledWith('recipe'))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onPreviewNameChange).toHaveBeenLastCalledWith(null))

    expect(onPreviewNameChange.mock.calls.map((call) => call[0])).toEqual(['recipe', null])
  })

  it('the path: / → ↓ onto a yours template → → previews it beside the open menu → esc brings the blank page back with the menu open → → then ↵ applies it in place (KAN-131)', async () => {
    // 6f frame 3's recipe, same fixture as the drawing test above.
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [
        { id: 'orig-1', type: 'view', mode: 'big-number', label: 'time' } as Block,
        { id: 'orig-2', type: 'todo', marker: 'dot', label: 'ingredients', items: [] } as Block,
        { id: 'orig-3', type: 'todo', marker: 'check', label: 'method', items: [] } as Block,
        { id: 'orig-4', type: 'entries', label: 'cooked', entries: [] } as Block,
        { id: 'orig-5', type: 'text', label: 'notes', content: '' } as Block,
      ],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    renderBlankPageHarness()

    writeInTextBlock(await findTextBlock(), '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    // `yours` templates lead the `templates` group, so `recipe` is already the
    // active row here — no ↓ needed to reach it this time (unlike the PATH_STEPS'
    // generic premade example).
    await within(menu).findByText('recipe')
    await user.keyboard('{ArrowRight}')

    const rows = await waitFor(() => {
      const found = document.querySelectorAll('[data-part="outline-row"]')
      expect(found.length).toBe(5)
      return found
    })
    expect([...rows].map((row) => row.textContent)).toEqual([
      'big number — time',
      'list — ingredients',
      'checklist — method',
      'entry log — cooked',
      'text — notes',
    ])
    expect(document.querySelector('[data-part="foot"]')?.textContent).toBe('↵ applyesc back')

    // The previewed row is also the selected one; slash-row.tsx's `Row` keeps
    // its hint alongside `↵` while previewed, so `5 blocks` reads directly on
    // the still-selected row (6f frame 3's s3.1.3).
    const recipeRow = within(menu).getByText('recipe').closest('[data-part="row"]')!
    expect(recipeRow.textContent).toContain('5 blocks')
    expect(recipeRow.textContent).toContain('↵')

    expect(mockSaveBlocks).not.toHaveBeenCalled()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')

    const reopenedMenu = await screen.findByRole('listbox', { name: 'blocks' })
    const groups = [...reopenedMenu.parentElement!.querySelectorAll('[data-part="group"]')].map(
      (g) => g.textContent
    )
    expect(groups[0]).toBe('templates')
    expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(0)
    expect(document.getElementById('block-b-empty')).toBeVisible()

    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(5)
    )
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const appliedBlocks = mockSaveBlocks.mock.calls[0][2] as Block[]
    expect(appliedBlocks).toHaveLength(5)
    expect(document.getElementById('block-b-empty')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('title')).toHaveFocus())
    expect(insertPageOptimistic).not.toHaveBeenCalled()
  })

  it('AUDIT G2: a template deleted mid-preview applies as a no-op on ↵, with no outline left stuck on screen', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderBlankPageHarness(client)

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')
    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(1)
    )

    // Deleted in another tab: the next `applyPickFor` finds nothing, neither
    // in the already-fetched list nor (mocked, this file's default) `getTemplate`.
    client.setQueryData(['templates', 'pond-1'], [])

    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(0)
    )
    expect(document.getElementById('block-b-empty')).toBeInTheDocument()
    expect(mockSaveBlocks).not.toHaveBeenCalled()
    expect(mockSaveProps).not.toHaveBeenCalled()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('an esc fired before a resolving preview settles leaves no stale outline or eyebrow (staleness guard)', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const onPreviewNameChange = jest.fn()
    renderBlankPageHarness(undefined, onPreviewNameChange)

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')

    // `handlePreviewTemplate`'s `await applyPickFor(pick)` never settles
    // within the same tick it is called — `applyPickFor` is itself `async`,
    // so even its synchronous `.find()` branch resolves one microtask later.
    // Firing esc right after → (no `await`/`waitFor` between the two
    // `fireEvent` calls, so no microtask gets to run in between) lands
    // squarely in that gap — the exact race the ticket describes, without a
    // hand-rolled deferred promise for `getTemplate`.
    act(() => {
      fireEvent.keyDown(document, { key: 'ArrowRight' })
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    // Flush every pending microtask so the dropped preview's resolution gets
    // every chance to (wrongly) land before asserting it didn't.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(0)
    expect(onPreviewNameChange).not.toHaveBeenCalledWith('recipe')
  })

  it('KAN-131 fix: leaving the page mid-preview (a pageId change, since DocumentPanel stays mounted) clears the outline with no cross-component render warning, even when the parent does not reset `previewName` on its own', async () => {
    const YOURS_TEMPLATE: PondTemplate = {
      id: 'tpl-9',
      name: 'recipe',
      kind: 'notes',
      blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
    const user = userEvent.setup()
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <PageSwitchableHarness pageId="page-1" />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    writeInTextBlock(await findTextBlock(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    await screen.findByText('recipe')
    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(1)
    )
    await waitFor(() => expect(screen.getByTestId('preview-name').textContent).toBe('recipe'))

    // The person navigates to a different page — `BlockCanvas` is not keyed
    // by page, so this is a prop change on the same instance, not a remount.
    // `PageSwitchableHarness` owns `previewName` with a REAL `useState`
    // setter (not a `jest.fn()`) and, unlike an earlier version of this
    // harness, resets nothing of its own on the `pageId` change — so if
    // `BlockCanvas` still (wrongly) called `onPreviewNameChange` from its own
    // render-phase `pageId` reset, React's "Cannot update a component while
    // rendering a different component" would fire here, and nothing else in
    // this test would mask it.
    rerender(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <PageSwitchableHarness pageId="page-2" />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    // The outline itself is `BlockCanvas`'s own `previewing` state, cleared by
    // its own render-phase `pageId` reset — that still happens here. Whether
    // `previewName` (the eyebrow, owned by the parent) also clears on a nodeId
    // change is `DocumentPanel`'s own concern, covered at that level instead
    // (see `document-panel-preview-nodeid-reset.test.tsx`).
    expect(document.querySelectorAll('[data-part="outline-row"]').length).toBe(0)
    const renderWarnings = errorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('Cannot update a component'))
    )
    expect(renderWarnings).toEqual([])
    errorSpy.mockRestore()
  })
})
