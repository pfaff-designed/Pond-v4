/**
 * #260, KAN-350 — `props` framed. ADR 0007: `PropertyInspector` (#17) IS the
 * board's `properties` kind, rendering a page's `_schema` as field-rows and
 * holding no copy, so the work is to FRAME it: DocumentPanel mounts it inside
 * `PondBlock kind="properties"` (400) with `record` as the eyebrow and the
 * collection's own title as the note (`PondBlock.dc.html` `['record', 'recipes']`),
 * `empty` when the schema has no fields. The old hairline wrapper
 * (`border-b border-mn-hair`) is gone — no board draws it.
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { formatAtomDate, localToday, parseDateInput } from '@/lib/properties/date-input'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))
const mockGetPage = jest.fn()
const mockDefineSchema = jest.fn().mockResolvedValue(undefined)
const mockSetProperty = jest.fn().mockResolvedValue(undefined)
const mockSaveProps = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: (...args: unknown[]) => mockSetProperty(...args),
  defineSchema: (...args: unknown[]) => mockDefineSchema(...args),
  saveProps: (...args: unknown[]) => mockSaveProps(...args),
}))
jest.mock('@/lib/pages/commit', () => jest.requireActual('./helpers/page-commit-mock').pageCommitMock())

function renderWith(props: Record<string, unknown>) {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Recipe', blocks: [], props })
  mockFetchPages.mockResolvedValue([])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('DocumentPanel — the inspector sits in the properties card', () => {
  it('a page with a schema: the full-width card, `record` eyebrow, the page’s own title as the note, field-rows inside', async () => {
    renderWith({
      _schema: [
        { id: 'kcal', name: 'kcal per serving', type: 'number' },
        { id: 'source', name: 'source', type: 'text' },
      ],
      kcal: 520,
    })
    const value = await screen.findByText('520')
    const card = value.closest<HTMLElement>('[data-block-kind]')!
    expect(card.dataset.blockKind).toBe('properties')
    expect(card.dataset.blockState).toBe('rest')
    // ADR 0008: the card fills its content column, not the board's old 400px.
    expect(card.className.split(' ')).toContain('w-full')
    expect(card.className.split(' ')).not.toContain('w-[400px]')
    const eyebrow = screen.getByText('record')
    expect(eyebrow.className).toBe(pageEyebrowClass)
    expect(card.contains(eyebrow)).toBe(true)
    // `renderWith` mocks `getPage` with `title: 'Recipe'` — this page has no
    // parent collection, so the note (KAN-350) is its own title.
    expect(card.textContent).toContain('Recipe')
    expect(card.querySelectorAll('[data-kind="field-row"]')).toHaveLength(2)
    // `source` has no value — it reads `empty`, never a native `<input>`.
    expect(card.contains(screen.getByText('empty'))).toBe(true)
    expect(card.querySelector('input, select')).toBeNull()
    // The hairline wrapper is gone: the card is the separation.
    expect(card.parentElement!.className.split(' ')).not.toContain('border-mn-hair')
  })

  it('a schema with no fields: the frame’s empty state — `no fields yet`, no dead action', async () => {
    renderWith({ _schema: [] })
    const line = await screen.findByText('no fields yet')
    const card = line.closest<HTMLElement>('[data-block-kind]')!
    expect(card.dataset.blockKind).toBe('properties')
    expect(card.dataset.blockState).toBe('empty')
    expect(card.textContent).toContain('Recipe')
    expect(card.querySelector('button')).toBeNull()
    expect(screen.queryByText(/no properties/i)).toBeNull()
  })

  it('a page with no schema has no properties card at all', async () => {
    renderWith({})
    await screen.findByLabelText('Page title')
    expect(document.querySelector('[data-block-kind="properties"]')).toBeNull()
  })

  it('KAN-350: a ROW page reads its PARENT collection’s schema, with the parent’s title as the note', async () => {
    mockGetPage.mockImplementation((...args: unknown[]) => {
      const id = args[1] as string
      // `renderWith`'s `useSearchParams` mock always names `nodeId=page-1` — this row
      // uses that same id so the panel actually opens it.
      if (id === 'page-1') {
        return Promise.resolve({
          id: 'page-1',
          parentId: 'collection-1',
          type: 'row',
          title: 'Pad thai',
          blocks: [],
          props: { kcal: 520 },
        })
      }
      return Promise.resolve({
        id: 'collection-1',
        parentId: null,
        type: 'page',
        title: 'Recipes',
        blocks: [],
        props: {
          _schema: [{ id: 'kcal', name: 'kcal per serving', type: 'number' }],
        },
      })
    })
    mockFetchPages.mockResolvedValue([])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <DocumentPanel />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
    const value = await screen.findByText('520')
    const card = value.closest<HTMLElement>('[data-block-kind]')!
    expect(card.dataset.blockKind).toBe('properties')
    // The row's own value (520), read against the PARENT's field definition.
    expect(card.querySelector('input, select')).toBeNull()
    // The note names the PARENT collection, not the row's own title.
    expect(card.textContent).toContain('Recipes')
    expect(card.textContent).not.toContain('Pad thai')
  })

  it('KAN-350 "+ new tag": a ROW page adds the option to the PARENT\'s schema and sets its own value', async () => {
    const user = userEvent.setup()
    mockGetPage.mockImplementation((...args: unknown[]) => {
      const id = args[1] as string
      if (id === 'page-1') {
        return Promise.resolve({
          id: 'page-1',
          parentId: 'collection-1',
          type: 'row',
          title: 'Pad thai',
          blocks: [],
          props: { stage: null },
        })
      }
      return Promise.resolve({
        id: 'collection-1',
        parentId: null,
        type: 'page',
        title: 'Recipes',
        blocks: [],
        props: {
          _schema: [
            { id: 'stage', name: 'Stage', type: 'status', options: [{ id: 'todo', label: 'To do' }] },
          ],
        },
      })
    })
    mockFetchPages.mockResolvedValue([])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <DocumentPanel />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    const trigger = await screen.findByRole('button', { name: 'Stage value' })
    await user.click(trigger)
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'Blocked')
    await user.click(screen.getByRole('option', { name: /new tag/ }))

    expect(mockDefineSchema).toHaveBeenCalledTimes(1)
    const [, schemaOwnerId, nextSchema] = mockDefineSchema.mock.calls[0]
    expect(schemaOwnerId).toBe('collection-1')
    const stageDef = nextSchema.find((d: { id: string }) => d.id === 'stage')
    expect(stageDef.options).toEqual([
      { id: 'todo', label: 'To do' },
      { id: expect.any(String), label: 'Blocked' },
    ])
    const mintedId = stageDef.options[1].id

    expect(mockSetProperty).toHaveBeenCalledTimes(1)
    expect(mockSetProperty).toHaveBeenCalledWith(expect.anything(), 'page-1', 'stage', mintedId)

    // The chip reflects the pick at once (optimistic), with no reload.
    expect(await screen.findByText('Blocked')).toBeInTheDocument()
  })

  it('KAN-350 "+ new tag" on a database page: one combined props write, not a schema write racing a value write', async () => {
    const user = userEvent.setup()
    renderWith({
      _schema: [
        { id: 'stage', name: 'Stage', type: 'status', options: [{ id: 'todo', label: 'To do' }] },
      ],
      stage: null,
    })

    const trigger = await screen.findByRole('button', { name: 'Stage value' })
    await user.click(trigger)
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'Blocked')
    await user.click(screen.getByRole('option', { name: /new tag/ }))

    // The schema (`defineSchema`) and the value (`setProperty`) live on this SAME
    // page here, so neither of their independent read-modify-write paths may run —
    // only the one combined write.
    expect(mockDefineSchema).not.toHaveBeenCalled()
    expect(mockSetProperty).not.toHaveBeenCalled()
    expect(mockSaveProps).toHaveBeenCalledTimes(1)
    const [, savedId, savedProps] = mockSaveProps.mock.calls[0]
    expect(savedId).toBe('page-1')
    const stageDef = savedProps._schema.find((d: { id: string }) => d.id === 'stage')
    expect(stageDef.options).toEqual([
      { id: 'todo', label: 'To do' },
      { id: expect.any(String), label: 'Blocked' },
    ])
    expect(savedProps.stage).toBe(stageDef.options[1].id)

    // The chip reflects the pick at once (optimistic), with no reload.
    expect(await screen.findByText('Blocked')).toBeInTheDocument()
  })

  it('KAN-350 "+ new tag": a rejected write rolls the optimistic schema/value cache back', async () => {
    const user = userEvent.setup()
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockSaveProps.mockRejectedValueOnce(new Error('network'))
    renderWith({
      _schema: [
        { id: 'stage', name: 'Stage', type: 'status', options: [{ id: 'todo', label: 'To do' }] },
      ],
      stage: null,
    })

    const trigger = await screen.findByRole('button', { name: 'Stage value' })
    await user.click(trigger)
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'Blocked')
    await user.click(screen.getByRole('option', { name: /new tag/ }))

    // The rejected network write rolls the optimistic cache back to what's
    // actually stored — the new option and the value pick never stick.
    await waitFor(() => expect(mockSaveProps).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Blocked')).toBeNull()
    expect(screen.getByText('empty')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('KAN-350 path test: PATH_STEPS 1, 2, 4, 6, 7 — no native control, edit in place, Tab/Enter/Esc', async () => {
    const user = userEvent.setup()
    mockGetPage.mockImplementation((...args: unknown[]) => {
      const id = args[1] as string
      if (id === 'page-1') {
        return Promise.resolve({
          id: 'page-1',
          parentId: 'collection-1',
          type: 'row',
          title: 'Pad thai',
          blocks: [],
          props: { due: '2026-10-01', stage: 'event', notes: 'leftovers' },
        })
      }
      return Promise.resolve({
        id: 'collection-1',
        parentId: null,
        type: 'page',
        title: 'Recipes',
        blocks: [],
        props: {
          _schema: [
            { id: 'due', name: 'Due', type: 'date' },
            {
              id: 'stage',
              name: 'Stage',
              type: 'status',
              options: [
                { id: 'event', label: 'event' },
                { id: 'appointment', label: 'appointment' },
              ],
            },
            { id: 'notes', name: 'Notes', type: 'text' },
          ],
        },
      })
    })
    mockFetchPages.mockResolvedValue([])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <DocumentPanel />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    // PATH_STEPS 1 — `record` · the parent database's title, one row per field,
    // values formatted, no native control anywhere in the card.
    const dueTrigger = await screen.findByRole('button', { name: 'Due value' })
    const card = dueTrigger.closest<HTMLElement>('[data-block-kind]')!
    expect(card.dataset.blockKind).toBe('properties')
    expect(within(card).getByText('record')).toBeInTheDocument()
    expect(card.textContent).toContain('Recipes')
    expect(card.querySelectorAll('[data-kind="field-row"]')).toHaveLength(3)
    expect(within(card).getByText('1 oct')).toBeInTheDocument()
    expect(within(card).getByText('event')).toBeInTheDocument()
    expect(within(card).getByText('leftovers')).toBeInTheDocument()

    // PATH_STEPS 2 — click the date, type `tomorrow`, the preview resolves it,
    // ↵ commits and the row reads the new day.
    await user.click(dueTrigger)
    const dueInput = screen.getByRole('textbox', { name: 'Due value' })
    await user.clear(dueInput)
    await user.type(dueInput, 'tomorrow')
    const resolvedTomorrow = parseDateInput('tomorrow', localToday()) as string
    expect(within(card).getByText(formatAtomDate(resolvedTomorrow))).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(mockSetProperty).toHaveBeenCalledWith(
      expect.anything(),
      'page-1',
      'due',
      resolvedTomorrow
    )
    expect(await within(card).findByRole('button', { name: 'Due value' })).toBeInTheDocument()
    expect(within(card).getByText(formatAtomDate(resolvedTomorrow))).toBeInTheDocument()

    // PATH_STEPS 4 — click the status chip, pick an option from the menu.
    const stageTrigger = within(card).getByRole('button', { name: 'Stage value' })
    await user.click(stageTrigger)
    await user.click(screen.getByRole('option', { name: 'appointment' }))
    expect(mockSetProperty).toHaveBeenCalledWith(
      expect.anything(),
      'page-1',
      'stage',
      'appointment'
    )
    expect(await within(card).findByText('appointment')).toBeInTheDocument()

    // PATH_STEPS 6 — click the text value, clear it, ↵ commits `empty`.
    const notesTrigger = within(card).getByRole('button', { name: 'Notes value' })
    await user.click(notesTrigger)
    await user.clear(screen.getByRole('textbox', { name: 'Notes value' }))
    await user.keyboard('{Enter}')
    expect(mockSetProperty).toHaveBeenCalledWith(expect.anything(), 'page-1', 'notes', null)
    expect(await within(card).findByText('empty')).toBeInTheDocument()

    // PATH_STEPS 7 — Tab moves between values; Enter opens one; Esc cancels it
    // with nothing newly written.
    const freshDueTrigger = within(card).getByRole('button', { name: 'Due value' })
    freshDueTrigger.focus()
    expect(document.activeElement).toBe(freshDueTrigger)
    await user.tab()
    expect(document.activeElement).toBe(within(card).getByRole('button', { name: 'Stage value' }))
    await user.keyboard('{Enter}')
    expect(screen.getByRole('listbox', { name: 'options' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox', { name: 'options' })).toBeNull()
    const setPropertyCallsBeforeEsc = mockSetProperty.mock.calls.length
    expect(setPropertyCallsBeforeEsc).toBe(3)
    expect(within(card).getByText('appointment')).toBeInTheDocument()

    // No native browser control anywhere in the card, at any point on this path.
    expect(card.querySelector('input[type="date"]')).toBeNull()
    expect(card.querySelector('select')).toBeNull()
  })
})
