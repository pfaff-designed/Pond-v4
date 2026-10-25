/**
 * KAN-485's own path test, walking PATH_STEPS on a real `BlockCanvas`: a
 * chart card + text, right-click the chart to set its width, then the handle
 * selects on a no-move press and only drags once the press moves. Harness
 * copied verbatim from `block-menu.test.tsx`.
 */

import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { blockWidthStyle } from '@/lib/modules/layout-rows'
import type { Block } from '@/lib/documents/types'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'

jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => {
    const [rows] = useState<CollectionRow[]>([])
    return {
      schema: [] as PropertySchema,
      rows,
      collectionName: 'Shop',
      isLoading: false,
      isError: false,
      setValue: jest.fn(),
      addRow: jest.fn(),
      removeRow: jest.fn(),
      renameRow: jest.fn(),
      updateSchema: jest.fn(),
    }
  },
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

const chart: Block = { id: 'b-chart', type: 'view', mode: 'chart' }
const note: Block = { id: 'b-note', type: 'text', content: 'walk the dog' }

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
      pageTitle="verification scratch"
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

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const handleOf = (blockId: string) =>
  within(blockRoot(blockId)).getByRole('button', { name: /drag to move/i })
/** jsdom's CSSOM re-serializes a `calc()` expression — see `block-canvas-kan-440-path.test.tsx`. */
function normalizedWidth(value: string) {
  const probe = document.createElement('div')
  probe.style.width = value
  return probe.style.width
}

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('PATH_STEPS: right-click the chart to set its width, then the handle only drags', () => {
  it('opens the menu at the pointer, sets ½ and closes it, then selects on a no-move press and drags past the threshold', async () => {
    const user = userEvent.setup()
    renderCanvas([chart, note])

    fireEvent.contextMenu(blockRoot('b-chart'))
    await user.click(await screen.findByRole('menuitem', { name: '½' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(blockRoot('b-chart').parentElement!.style.width).toBe(
        normalizedWidth(blockWidthStyle('1/2'))
      )
    )

    const handle = handleOf('b-chart')
    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(handle)
    fireEvent.click(handle)

    expect(blockRoot('b-chart')).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(handle, { clientX: 10, clientY: 40 })

    expect(blockRoot('b-chart')).toHaveAttribute('draggable', 'true')
  })
})
