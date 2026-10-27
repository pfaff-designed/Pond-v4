/**
 * KAN-473 — leave-and-return via `useBlockLinkArrival`. A cross-page nav uses
 * `pushState` (`nav.ts`), which drops the hash without firing `hashchange`,
 * so `landedOn` must clear on the empty hash itself, not just on the event.
 */

import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { useBlockLinkArrival } from './block-link'
import { blockDomId, scrollToBlock } from './block-dom'
import type { Block } from './content'

jest.mock('./block-dom', () => ({
  ...jest.requireActual('./block-dom'),
  scrollToBlock: jest.fn(),
}))

const b1: Block = { id: 'b1', type: 'text', content: 'first' } as Block
const other: Block = { id: 'other', type: 'text', content: 'other page' } as Block

function Host({ blocks }: { blocks: readonly Block[] }) {
  useBlockLinkArrival(blocks)
  return (
    <div>
      <div id={blockDomId('b1')} tabIndex={-1} />
      <div id={blockDomId('other')} tabIndex={-1} />
    </div>
  )
}

describe('useBlockLinkArrival survives a pushState leave-and-return (KAN-473)', () => {
  afterEach(() => {
    jest.clearAllMocks()
    window.history.pushState({}, '', '/')
  })

  it('lands again on the same block after a cross-page pushState clears and restores the hash', async () => {
    window.history.pushState({}, '', '/#block-b1')
    const { rerender } = render(<Host blocks={[b1]} />)
    await waitFor(() => expect(scrollToBlock).toHaveBeenCalledTimes(1))

    // Cross-page nav: pushState drops the hash (no `hashchange`) and the
    // host swaps in the other page's blocks.
    window.history.pushState({}, '', '/')
    rerender(<Host blocks={[other]} />)

    // Back on the original page, the URL carries the same hash again —
    // still via pushState, never a `hashchange`.
    window.history.pushState({}, '', '/#block-b1')
    rerender(<Host blocks={[b1]} />)

    await waitFor(() => expect(scrollToBlock).toHaveBeenCalledTimes(2))
  })
})
