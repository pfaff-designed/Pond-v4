/**
 * The `/` menu flips away from the floating composer (KAN-100, PATH_STEPS 2–4),
 * walked on the real `BlockCanvas` and the real `SlashMenu` rather than
 * `sideTowardFreeSpace`/`composerBottomBound` in isolation: a shell publishing
 * `--pond-composer-clearance` plus a caret that sits inside that band opens the
 * glass above (`style.bottom`, never `style.top`); a caret near the top of the
 * viewport opens it below (`style.top`) even with the same band published.
 */

import React from 'react'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { COMPOSER_CLEARANCE_VAR } from '@/lib/layout/composer-clearance'
import { blockDomId } from '@/lib/modules/block-dom'
import { writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

let restoreInnerHeight: (() => void) | undefined

function stubInnerHeight(height: number): void {
  const original = window.innerHeight
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
  restoreInnerHeight = () => Object.defineProperty(window, 'innerHeight', { value: original, configurable: true })
}

/** A caret rect at the given top, 20px tall — the only dimensions these tests vary. */
function rectAt(top: number): DOMRect {
  return {
    top,
    bottom: top + 20,
    left: 0,
    right: 0,
    width: 0,
    height: 20,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

/** Stands in for the composer card: a footprint tall enough that any caret
 * below it sits inside the band regardless of the menu's own computed height. */
function publishComposerClearance(shell: HTMLElement, footprintPx: number) {
  shell.style.setProperty(COMPOSER_CLEARANCE_VAR, `${footprintPx}px`)
}

function renderCanvasInShell(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container, ...utils } = render(
    <div data-part="shell">
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <BlockCanvas
            blocks={blocks}
            pageId="page-1"
            pageTitle="sourdough, 78%"
            onChange={() => {}}
          />
        </DeletionUndoProvider>
      </QueryClientProvider>
    </div>
  )
  const shell = container.querySelector<HTMLElement>('[data-part="shell"]')!
  // jsdom never lays elements out, so the shell's own rect defaults to all
  // zeros; stand it in for a shell spanning the full (stubbed) viewport, the
  // way it does in the real app.
  shell.getBoundingClientRect = () => ({ bottom: window.innerHeight }) as DOMRect
  return { ...utils, shell }
}

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  restoreInnerHeight?.()
  restoreInnerHeight = undefined
})

describe('the `/` menu opens toward free space, never under the composer (KAN-100)', () => {
  it('opens above (style.bottom) when the caret sits inside the composer band, and below (style.top) near the top', async () => {
    stubInnerHeight(900)
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    const { shell } = renderCanvasInShell([note, emptyLine])
    publishComposerClearance(shell, 400) // bound = 900 − 400 = 500

    const row = document.getElementById(blockDomId('b-empty'))!
    const field = await within(row).findByRole('textbox', { name: 'text block' })
    // 440–460 sits in the full viewport's upper half (the old, composer-blind
    // `sideTowardFreeSpace(…, window.innerHeight, …)` would still pick 'bottom'
    // here), but the 500px bound is already past at 460 — inside the band.
    row.getBoundingClientRect = () => rectAt(440)

    writeInTextBlock(field, '/')
    const glassBelowBound = await waitFor(() => {
      const glass = document.querySelector<HTMLElement>('[data-part="glass"][data-kind="slash"]')
      if (!glass) throw new Error('slash glass not mounted yet')
      return glass
    })
    expect(glassBelowBound.style.bottom).not.toBe('')
    expect(glassBelowBound.style.top).toBe('')

    // Delete the slash to close, move the caret near the top, and reopen.
    writeInTextBlock(field, '')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    row.getBoundingClientRect = () => rectAt(50)

    writeInTextBlock(field, '/')
    const glassNearTop = await waitFor(() => {
      const glass = document.querySelector<HTMLElement>('[data-part="glass"][data-kind="slash"]')
      if (!glass) throw new Error('slash glass not mounted yet')
      return glass
    })
    expect(glassNearTop.style.top).not.toBe('')
    expect(glassNearTop.style.bottom).toBe('')
  })

  it('caps the glass to the chosen side’s room when neither side fully fits (KAN-100)', async () => {
    stubInnerHeight(900)
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    const { shell } = renderCanvasInShell([note, emptyLine])
    publishComposerClearance(shell, 125) // bound = 900 − 125 = 775

    const row = document.getElementById(blockDomId('b-empty'))!
    const field = await within(row).findByRole('textbox', { name: 'text block' })
    // Mid-band: below (775 − 320 − 4 = 451) still beats above (300 − 4 = 296),
    // so the menu stays below the caret — but 451px is short of the viewport's
    // own 60vh (540px) default, which would otherwise reach past the bound.
    row.getBoundingClientRect = () => rectAt(300)

    writeInTextBlock(field, '/')
    const glass = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-part="glass"][data-kind="slash"]')
      if (!el) throw new Error('slash glass not mounted yet')
      return el
    })
    expect(glass.style.top).not.toBe('')
    expect(glass.style.bottom).toBe('')
    expect(glass.style.maxHeight).toBe('451px')
  })
})

describe('the source picker opens toward free space, never under the composer (KAN-100)', () => {
  it('“/table” inside the composer band opens the source picker above (style.bottom)', async () => {
    stubInnerHeight(900)
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    const { shell } = renderCanvasInShell([note, emptyLine])
    publishComposerClearance(shell, 400) // bound = 900 − 400 = 500

    const row = document.getElementById(blockDomId('b-empty'))!
    const field = await within(row).findByRole('textbox', { name: 'text block' })
    // Same mid-band rect block-canvas-slash-path.test.tsx uses for the `/` menu
    // itself: past the 500px bound, so `/`'s own glass opens above too.
    row.getBoundingClientRect = () => rectAt(440)

    writeInTextBlock(field, '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(field, '/table')
    fireEvent.click(within(menu).getByText('table'))

    const glass = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-part="glass"][data-kind="source"]')
      if (!el) throw new Error('source glass not mounted yet')
      return el
    })
    expect(glass.style.bottom).not.toBe('')
    expect(glass.style.top).toBe('')
  })
})
