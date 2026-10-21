/**
 * Rule 4's between-row gap (KAN-345): `BlockGapLine` is wired between
 * `blockRows`' ROWS, not between every flat block, so a side-by-side row's
 * own inner gap draws no hit area — only the gap below a whole row does.
 */

import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { findAllTextBlocks } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

function Harness({ initial, chrome }: { initial: Block[]; chrome?: boolean }) {
  const [blocks, setBlocks] = useState<Block[]>(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="sourdough, 78%"
      onChange={setBlocks}
      onUndoRemove={() => {}}
      chrome={chrome}
    />
  )
}

function renderHarness(initial: Block[], chrome?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} chrome={chrome} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

describe('the between-row gap line (KAN-345 rule 4)', () => {
  it('two stacked blocks (different rows) get one boundary line; clicking it opens a focused empty line between them', async () => {
    const top: Block = { id: 'b-top', type: 'text', content: 'top' }
    const bottom: Block = { id: 'b-bottom', type: 'text', content: 'bottom' }
    renderHarness([top, bottom])
    await findAllTextBlocks()

    const lines = screen.getAllByTestId('block-gap-line')
    expect(lines).toHaveLength(1)

    fireEvent.click(lines[0])

    const fields = await waitFor(() => {
      const found = screen.getAllByRole('textbox', { name: 'text block' })
      expect(found).toHaveLength(3)
      return found
    })
    expect(fields[0].textContent).toBe('top')
    expect(fields[2].textContent).toBe('bottom')
    const inserted = fields[1]
    await waitFor(() => expect(inserted).toHaveFocus())
    expect(inserted.querySelector('p')).toHaveAttribute('data-placeholder', 'type, or / for blocks')
  })

  it('two blocks sized to share one row render no gap line between them', async () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    renderHarness([left, right])
    await findAllTextBlocks()

    expect(screen.queryAllByTestId('block-gap-line')).toHaveLength(0)
  })

  it('a double click on the between-row gap opens exactly one line, not two (G9)', async () => {
    const top: Block = { id: 'b-top', type: 'text', content: 'top' }
    const bottom: Block = { id: 'b-bottom', type: 'text', content: 'bottom' }
    renderHarness([top, bottom])
    await findAllTextBlocks()

    const line = screen.getByTestId('block-gap-line')
    fireEvent.click(line)
    fireEvent.click(line)

    await waitFor(() => {
      expect(screen.getAllByRole('textbox', { name: 'text block' })).toHaveLength(3)
    })
  })

  it('a ½+½ row followed by a stacked block renders exactly one gap line for that boundary', async () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    const below: Block = { id: 'b-below', type: 'text', content: 'below' }
    renderHarness([left, right, below])
    await findAllTextBlocks()

    expect(screen.getAllByTestId('block-gap-line')).toHaveLength(1)
  })

  it('with chrome={false} (read-only), no between-row gap line is in the DOM at all', async () => {
    const top: Block = { id: 'b-top', type: 'text', content: 'top' }
    const bottom: Block = { id: 'b-bottom', type: 'text', content: 'bottom' }
    renderHarness([top, bottom], false)
    await findAllTextBlocks()

    expect(screen.queryAllByTestId('block-gap-line')).toHaveLength(0)
  })
})
