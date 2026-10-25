/**
 * The ⋮⋮ handle is drag-only on desktop (KAN-485): a no-move press-and-release,
 * or Enter/Space on the focused handle, selects the row instead of opening the
 * block menu. Phone (`size="mobile"`) keeps the old tap-opens-the-menu path.
 * Harness copied from `block-menu.test.tsx`.
 */

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

const heading: Block = { id: 'b-heading', type: 'text', content: '## ingredients' }
const list: Block = {
  id: 'b-list',
  type: 'text',
  content: '- 500g strong white flour\n- 350g water\n- 100g levain\n- 10g salt',
}

interface HarnessProps {
  initial: Block[]
  onChange: jest.Mock
}

function Harness({ initial, onChange }: HarnessProps) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="sourdough, 78%"
      onChange={(next) => {
        onChange(next)
        setBlocks(next)
      }}
    />
  )
}

function renderCanvas(initial: Block[]) {
  const onChange = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} onChange={onChange} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onChange }
}

const handleOf = (blockId: string) =>
  within(document.getElementById(`block-${blockId}`)!).getByRole('button', {
    name: /drag to move/i,
  })

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('the handle is drag-only on desktop (KAN-485)', () => {
  it('a no-move press-and-release on the handle selects the row and opens no menu', () => {
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(handle)
    fireEvent.click(handle)

    expect(document.getElementById('block-b-list')).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('Enter on the focused handle selects the row and opens no menu', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    handleOf('b-list').focus()

    await user.keyboard('{Enter}')

    expect(document.getElementById('block-b-list')).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('the handle is a plain button — no aria-haspopup for a menu it never opens (KAN-485)', () => {
    renderCanvas([heading, list])

    expect(handleOf('b-list')).not.toHaveAttribute('aria-haspopup')
  })
})

describe('phone keeps the tap-opens-the-menu path on the handle (frame 6)', () => {
  const originalMatchMedia = window.matchMedia
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('a tap on the handle still opens the menu', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])

    await user.click(handleOf('b-list'))

    expect(await screen.findByRole('menu', { name: /block menu/i })).toBeInTheDocument()
  })

  it('the handle keeps aria-haspopup — it still opens the menu here (KAN-485)', () => {
    renderCanvas([heading, list])

    expect(handleOf('b-list')).toHaveAttribute('aria-haspopup', 'menu')
  })
})
