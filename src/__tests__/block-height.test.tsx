/**
 * KAN-442 — drag a view, image or table's top or bottom edge to set its height.
 * Prose has no strips. Release writes one edit; locking to fit clears the height;
 * Esc cancels. A view keeps its bar outside the scrolling body.
 */

import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { BlockHeightProvider } from '@/components/organisms/block-height-context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { CollectionView } from '@/lib/modules/view/view'
import type { PropertySchema } from '@/lib/properties/schema'

jest.mock('@/lib/modules/block-height', () => {
  const actual = jest.requireActual<typeof import('@/lib/modules/block-height')>(
    '@/lib/modules/block-height'
  )
  return {
    ...actual,
    measureBlockHeightBounds: jest.fn(() => ({ fit: 400, min: 160 })),
  }
})

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const text: Block = { id: 'b-text', type: 'text', content: 'a paragraph' }
const todo: Block = {
  id: 'b-todo',
  type: 'todo',
  marker: 'dot',
  items: [{ id: 'i1', label: 'eggs', checked: false }],
}
const table: Block = {
  id: 'b-table',
  type: 'table',
  title: 'notes',
  columns: ['Tool'],
  rows: [{ id: 'r1', cells: ['Saw'] }],
}
const image: Block = {
  id: 'b-image',
  type: 'image',
  url: 'https://example.com/a.png',
  mediaType: 'image/png',
  filename: 'a.png',
}

function renderCanvas(initial: Block[]) {
  const onChange = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Harness() {
    const [blocks, setBlocks] = React.useState(initial)
    return (
      <BlockCanvas
        blocks={blocks}
        pageId="page-1"
        pageTitle="notes"
        onChange={(next) => {
          onChange(next)
          setBlocks(next)
        }}
        onUndoRemove={() => {}}
      />
    )
  }
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onChange }
}

const handlesIn = (blockId: string) =>
  within(document.getElementById(`block-${blockId}`)!).queryAllByRole('separator', {
    name: /resize height/i,
  })

const pointer = (type: string, clientY: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 1, clientY, pointerType: 'mouse' })
  return event
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('height strips', () => {
  it('a table and an image have a top and a bottom edge; text and a list do not', () => {
    renderCanvas([text, todo, table, image])
    expect(handlesIn('b-text')).toHaveLength(0)
    expect(handlesIn('b-todo')).toHaveLength(0)
    expect(handlesIn('b-table').map((handle) => handle.getAttribute('data-edge'))).toEqual([
      'top',
      'bottom',
    ])
    expect(handlesIn('b-image')).toHaveLength(2)
    for (const handle of handlesIn('b-table')) {
      expect(handle.getAttribute('aria-orientation')).toBe('horizontal')
      expect(handle.tabIndex).toBe(0)
    }
  })

  it('a stored height sizes the card, and the body scrolls', () => {
    renderCanvas([{ ...table, height: 280 }])
    const size = document.querySelector<HTMLElement>('[data-part="block-size"]')!
    expect(size.style.height).toBe('280px')
    expect(document.querySelector('[data-part="block-body"]')?.className).toContain(
      'overflow-y-auto'
    )
    expect(document.querySelector('[data-part="block-head"]')).toBeTruthy()
  })

  it('dragging the bottom edge commits one height, and undo restores the block', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([table])
    const bottom = handlesIn('b-table').find(
      (handle) => handle.getAttribute('data-edge') === 'bottom'
    )!
    act(() => {
      bottom.dispatchEvent(pointer('pointerdown', 200))
      bottom.dispatchEvent(pointer('pointermove', 280))
    })
    expect(document.querySelector('[data-part="height-readout"]')?.textContent).toBe('480px')
    expect(document.body.style.cursor).toBe('ns-resize')
    act(() => {
      bottom.dispatchEvent(pointer('pointerup', 280))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0].height).toBe(480)
    expect(document.body.style.cursor).toBe('')
    expect(screen.getByText('Set the block height')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1][0][0].height).toBeUndefined()
  })

  it('a drag that locks to fit writes nothing when the block was already fit', () => {
    const { onChange } = renderCanvas([table])
    const bottom = handlesIn('b-table')[1]
    act(() => {
      bottom.dispatchEvent(pointer('pointerdown', 200))
      bottom.dispatchEvent(pointer('pointermove', 204))
      bottom.dispatchEvent(pointer('pointerup', 204))
    })
    expect(document.querySelector('[data-part="height-readout"]')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a drag that locks to fit clears a stored height', () => {
    const { onChange } = renderCanvas([{ ...table, height: 480 }])
    const bottom = handlesIn('b-table')[1]
    act(() => {
      bottom.dispatchEvent(pointer('pointerdown', 200))
      // start 480, fit is 400, moving up 80 lands on fit
      bottom.dispatchEvent(pointer('pointermove', 120))
      bottom.dispatchEvent(pointer('pointerup', 120))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).not.toHaveProperty('height')
    expect(screen.getByText('Fit the block height')).toBeInTheDocument()
  })

  it('Esc cancels the drag and writes nothing', () => {
    const { onChange } = renderCanvas([table])
    const bottom = handlesIn('b-table')[1]
    act(() => {
      bottom.dispatchEvent(pointer('pointerdown', 200))
      bottom.dispatchEvent(pointer('pointermove', 280))
    })
    const sized = () => document.querySelector<HTMLElement>('[data-part="block-size"]')
    expect(sized()?.style.height).toBe('480px')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(sized()?.style.height).toBe('')
    expect(onChange).not.toHaveBeenCalled()
    act(() => {
      bottom.dispatchEvent(pointer('pointerup', 280))
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('arrow keys step 8px, and shift steps 40px, each as one edit', () => {
    const { onChange } = renderCanvas([table])
    const bottom = handlesIn('b-table')[1]
    fireEvent.keyDown(bottom, { key: 'ArrowUp' })
    expect(onChange.mock.calls[0][0][0].height).toBe(408)
    cleanup()
    const again = renderCanvas([{ ...table, height: 408 }])
    fireEvent.keyDown(handlesIn('b-table')[1], { key: 'ArrowDown', shiftKey: true })
    expect(again.onChange.mock.calls[0][0][0].height).toBe(368)
  })

  it('locks to the height of the block beside it', () => {
    const { onChange } = renderCanvas([
      { ...table, width: '1/2', rowStart: true },
      { ...image, width: '1/2' },
    ])
    const imageRow = document.getElementById('block-b-image')!
    Object.defineProperty(imageRow, 'offsetHeight', { value: 280 })
    const bottom = handlesIn('b-table')[1]
    act(() => {
      bottom.dispatchEvent(pointer('pointerdown', 300))
      bottom.dispatchEvent(pointer('pointermove', 180))
    })
    expect(document.querySelector('[data-part="height-readout"]')?.textContent).toBe('= image')
    act(() => {
      bottom.dispatchEvent(pointer('pointerup', 180))
    })
    const saved = onChange.mock.calls[0][0] as Block[]
    expect(saved.find((block) => block.id === 'b-table')?.height).toBe(280)
  })

  it('the top edge grows the block upward and keeps it top-aligned', () => {
    renderCanvas([table])
    const top = handlesIn('b-table')[0]
    const size = document.querySelector<HTMLElement>('[data-part="block-size"]')!
    act(() => {
      top.dispatchEvent(pointer('pointerdown', 200))
      top.dispatchEvent(pointer('pointermove', 160))
    })
    expect(size.style.height).toBe('440px')
    expect(size.style.top).toBe('')
  })

  it('a reorder drag takes the strips off the page', () => {
    renderCanvas([table])
    const handle = within(document.getElementById('block-b-table')!).getByRole('button', {
      name: /drag to move/i,
    })
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.dragStart(document.getElementById('block-b-table')!)
    expect(handlesIn('b-table')).toHaveLength(0)
    fireEvent.dragEnd(document.getElementById('block-b-table')!)
    expect(handlesIn('b-table')).toHaveLength(2)
  })

  it('the block menu offers fit height only once a height is set, and clears it', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([{ ...table, height: 280 }])
    fireEvent.contextMenu(document.getElementById('block-b-table')!)
    const menu = await screen.findByRole('menu', { name: /block menu/i })
    await user.click(within(menu).getByRole('menuitem', { name: 'fit height' }))
    expect(onChange.mock.calls[0][0][0]).not.toHaveProperty('height')
  })
})

describe('a view scrolls under a fixed bar', () => {
  const schema: PropertySchema = [{ id: 'p-title', name: 'Title', type: 'text' }]
  const rows = [
    { id: 'r1', title: 'one', values: {} },
    { id: 'r2', title: 'two', values: {} },
  ]
  const config = {
    id: 'v1',
    type: 'view' as const,
    mode: 'table' as const,
    views: [{ id: 'saved', label: 'table', kind: 'table' as const, config: {} }],
    activeViewId: 'saved',
  }

  it('the view bar stays outside the scrolling body', () => {
    const { container } = render(
      <BlockHeightProvider constrained>
        <CollectionView config={config} schema={schema} rows={rows} collectionName="notes" />
      </BlockHeightProvider>
    )
    const chrome = container.querySelector('[data-part="view-chrome"]')!
    const body = container.querySelector('[data-part="view-body"]')!
    expect(body.className).toContain('overflow-y-auto')
    expect(body.contains(chrome)).toBe(false)
    expect(chrome.textContent).toContain('notes')
    expect(body.textContent).toContain('one')
  })
})
