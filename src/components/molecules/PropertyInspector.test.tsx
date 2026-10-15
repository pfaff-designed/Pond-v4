/**
 * Path test (KAN-311): `PropertyInspector` is the real row-inspector host of the
 * relation field (not `RelationValueField` alone). Walks PATH_STEPS 3–5 — a
 * linked page's chip flips live → trashed → live as the query caches that back
 * it are swapped and invalidated, with no reload. Steps 1–2 (linking via the
 * picker, trashing via the rail) are KAN-97/already-built and covered by their
 * own tests.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'
import type { PropertySchema } from '@/lib/properties/schema'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }),
}))

const mockGetPage = jest.fn()
const mockGetCollectionRows = jest.fn()
const mockListPages = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...a: unknown[]) => mockGetPage(...a),
  getCollectionRows: (...a: unknown[]) => mockGetCollectionRows(...a),
  listPages: (...a: unknown[]) => mockListPages(...a),
}))

const mockExistingPageIds = jest.fn()
jest.mock('@/lib/change-log/trash', () => ({
  existingPageIds: (...a: unknown[]) => mockExistingPageIds(...a),
}))

const mockListRecords = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  listRecords: (...a: unknown[]) => mockListRecords(...a),
}))

function pageB() {
  return { id: 'page-b', parentId: null, type: 'page' as const, title: 'Page B', blocks: [], props: {}, order: 0 }
}

const schema: PropertySchema = [{ id: 'rel1', name: 'Related', type: 'relation' }]

beforeEach(() => {
  mockPush.mockReset()
  mockGetPage.mockReset()
  mockGetCollectionRows.mockReset()
  mockListPages.mockReset().mockResolvedValue([])
  mockExistingPageIds.mockReset().mockResolvedValue(new Set())
  mockListRecords.mockReset().mockResolvedValue([])
})

describe('PropertyInspector — relation chip tombstone path (KAN-311)', () => {
  it('flips a linked page B live → trashed → live with no reload', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetPage.mockResolvedValue(pageB())

    render(
      <QueryClientProvider client={client}>
        <PropertyInspector schema={schema} values={{ rel1: ['page-b'] }} onChange={jest.fn()} />
      </QueryClientProvider>
    )

    const liveChip = await screen.findByRole('button', { name: 'Page B' })
    expect(liveChip.querySelector('[data-part="suffix"]')).toHaveTextContent('›')

    // B is trashed: its own page resolves to nothing, but `existingPageIds` still
    // finds it and the `delete` record's snapshot carries its title.
    mockGetPage.mockResolvedValue(null)
    mockExistingPageIds.mockResolvedValue(new Set(['page-b']))
    mockListRecords.mockResolvedValue([
      {
        id: 'rec1',
        action: 'delete',
        before: {
          title: 'Page B',
          parentId: null,
          order: 0,
          pageIds: ['page-b'],
          blockCount: 0,
          nestedPageCount: 0,
          parentPath: [],
        },
      },
    ])
    await client.invalidateQueries({ queryKey: ['page'] })

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Page B' })).not.toBeInTheDocument()
    )
    const trashedLabel = screen.getByText('Page B')
    expect(trashedLabel).toHaveClass('line-through')
    expect(trashedLabel.querySelector('[data-part="suffix"]')).not.toBeInTheDocument()

    await user.click(trashedLabel)
    expect(mockPush).not.toHaveBeenCalled()

    // Restored: the page resolves live again and the same ['page'] invalidation
    // that a real restore issues brings the live chip back.
    mockGetPage.mockResolvedValue(pageB())
    await client.invalidateQueries({ queryKey: ['page'] })

    const restoredChip = await screen.findByRole('button', { name: 'Page B' })
    expect(restoredChip.querySelector('[data-part="suffix"]')).toHaveTextContent('›')
    expect(mockPush).not.toHaveBeenCalled()
  })
})
