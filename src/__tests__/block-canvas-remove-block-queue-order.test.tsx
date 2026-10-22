/**
 * KAN-495 — `removeBlockAt` (⌘⌫) is the ONE structural entry point: it calls
 * `onStructuralWrite` synchronously (no await in between), never also calling
 * `onChange` itself — so no second (typed) write of the same blocks ever
 * queues up behind it. A host with no queue (Storybook) falls back to plain
 * `onChange` alone.
 */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const heading: Block = { id: 'b-heading', type: 'text', content: '## ingredients' }
const table: Block = {
  id: 'b-table',
  type: 'table',
  columns: ['Tool', 'Location'],
  rows: [{ id: 'r1', cells: ['Saw', 'Wall'] }],
}

function renderCanvas(initial: Block[], onStructuralWrite?: (next: Block[]) => Promise<boolean>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onChange = jest.fn()
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={initial}
          pageId="page-1"
          pageTitle="sourdough, 78%"
          onChange={onChange}
          onStructuralWrite={onStructuralWrite}
          onUndoRemove={() => {}}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onChange }
}

const platform = Object.getOwnPropertyDescriptor(window.navigator, 'platform')

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
})

afterEach(() => {
  if (platform) Object.defineProperty(window.navigator, 'platform', platform)
})

describe('⌘⌫ writes through onStructuralWrite, the one structural entry point', () => {
  it('calls onStructuralWrite synchronously with the next blocks, never onChange', async () => {
    const onStructuralWrite = jest.fn(() => Promise.resolve(true))
    const { onChange } = renderCanvas([heading, table], onStructuralWrite)
    const root = document.getElementById('block-b-table')!
    root.focus()

    fireEvent.keyDown(root, { key: 'Backspace', metaKey: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(onStructuralWrite).toHaveBeenCalledWith(
      [heading],
      expect.objectContaining({ onUndoHandle: expect.any(Function) })
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('falls back to onChange alone when no onStructuralWrite is given (Storybook/other hosts)', async () => {
    const { onChange } = renderCanvas([heading, table])
    const root = document.getElementById('block-b-table')!
    root.focus()

    fireEvent.keyDown(root, { key: 'Backspace', metaKey: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(onChange.mock.calls.at(-1)![0].map((b: Block) => b.id)).toEqual(['b-heading'])
    expect(await screen.findByText('deleted table ·')).toBeInTheDocument()
  })
})
