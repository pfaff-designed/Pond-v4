/**
 * KAN-175 — non-Mac platforms get Ctrl+Alt+H, not ⌥⌘H (AUDIT K1–K4). Mirrors
 * `isComposerToggleKey`'s split: `isApplePlatform()` picks which chord is
 * live, so only one branch can ever fire per platform.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePageChangesPanel } from '@/components/organisms/PageChangesPanel'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue({
    id: 'page-1',
    parentId: null,
    type: 'page',
    title: 'Page 1',
    blocks: [],
    props: {},
    order: 0,
  }),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: jest.fn().mockResolvedValue([]),
}))

function Host() {
  const { overlay } = usePageChangesPanel('page-1')
  return overlay
}

function renderHost() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Host />
    </QueryClientProvider>
  )
}

const ctrlAltH = { key: 'h', ctrlKey: true, altKey: true, code: 'KeyH' }

describe('usePageChangesPanel — non-Mac shortcut', () => {
  const platform = jest.spyOn(window.navigator, 'platform', 'get')

  afterEach(() => {
    platform.mockReset()
  })

  it('opens and closes on Ctrl+Alt+H, and the head shows Ctrl+Alt+H', async () => {
    platform.mockReturnValue('Win32')
    renderHost()

    expect(screen.queryByRole('complementary', { name: 'Changes to this page' })).toBeNull()

    fireEvent.keyDown(document, ctrlAltH)
    const panel = await screen.findByRole('complementary', { name: 'Changes to this page' })
    expect(panel).toHaveTextContent('Ctrl+Alt+H')

    fireEvent.keyDown(document, ctrlAltH)
    expect(screen.queryByRole('complementary', { name: 'Changes to this page' })).toBeNull()
  })

  it('does not open on the Mac chord', async () => {
    platform.mockReturnValue('Win32')
    renderHost()

    fireEvent.keyDown(document, { key: 'h', altKey: true, metaKey: true, code: 'KeyH' })
    expect(screen.queryByRole('complementary', { name: 'Changes to this page' })).toBeNull()
  })
})
