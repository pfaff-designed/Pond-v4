/**
 * Module registry foundation (t12) — functional proof.
 *
 * 1. Registry integrity: descriptor keys and renderer keys match exactly (the two
 *    maps are joined by `type`; a drift means the AI can propose a type the client
 *    can't render, or vice versa).
 * 2. Recursive composition: a `page` container renders every child block by
 *    dispatching through the registry (never hard-coding block types) — the seam
 *    t12 §6 locks in.
 * 3. Editability is a host-passed prop: an editable todo emits a whole new block
 *    state via onChange (full-state, no ops), and a read-only view does not.
 * 4. Zod is the single source of truth: valid blocks parse, malformed ones reject.
 * 5. An unregistered type renders nothing rather than throwing (no read-side
 *    validation — a stale persisted block must never hard-fail a page load).
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import { moduleDescriptors, blockSchema } from '@/lib/modules/registry'
import { moduleRenderers, ModuleView } from '@/lib/modules/renderers'
import { PageView } from '@/lib/modules/page/view'
import { samplePage as page } from '@/lib/modules/page/sample'
import type { Block } from '@/lib/modules/content'

describe('module registry (t12)', () => {
  it('descriptor keys and renderer keys match exactly', () => {
    expect(Object.keys(moduleRenderers).sort()).toEqual(Object.keys(moduleDescriptors).sort())
  })

  it('every descriptor carries a schema and a description', () => {
    for (const [type, d] of Object.entries(moduleDescriptors)) {
      expect(d.type).toBe(type)
      expect(typeof d.description).toBe('string')
      expect(d.description.length).toBeGreaterThan(0)
      expect(d.schema).toBeDefined()
    }
  })

  it('renders a page and all its child blocks recursively through the registry', () => {
    render(<PageView data={page} />)
    expect(screen.getByText('Marathon Training')).toBeInTheDocument()
    expect(screen.getByText(/Base build week/)).toBeInTheDocument() // text
    expect(screen.getByText('Long run')).toBeInTheDocument() // todo item
    expect(screen.getByText('Recovery swim')).toBeInTheDocument()
    expect(screen.getByText('Weekly mileage')).toBeInTheDocument() // metric
    expect(screen.getByText('Miles')).toBeInTheDocument() // metric-ring (the new module)
  })

  it('an editable todo emits a new full block state via onChange', () => {
    const onChange = jest.fn()
    render(<ModuleView type="todo" data={page.blocks[1]} editable onChange={onChange} />)
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[1]) // toggle "Recovery swim" on
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Extract<Block, { type: 'todo' }>
    expect(next.items[1].checked).toBe(true)
    expect(next.items[0].checked).toBe(true) // untouched item preserved
  })

  it('a read-only view does not emit and its checkboxes are disabled', () => {
    const onChange = jest.fn()
    render(<ModuleView type="todo" data={page.blocks[1]} onChange={onChange} />)
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes[0].disabled).toBe(true)
    fireEvent.click(boxes[1])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('blockSchema (Zod SoT) accepts valid blocks and rejects malformed ones', () => {
    expect(blockSchema.safeParse(page.blocks[0]).success).toBe(true)
    expect(blockSchema.safeParse(page.blocks[3]).success).toBe(true)
    // metric-ring pct out of range
    expect(
      blockSchema.safeParse({ id: 'x', type: 'metric-ring', label: '9', pct: 2 }).success
    ).toBe(false)
    // unknown type
    expect(blockSchema.safeParse({ id: 'x', type: 'kanban', cards: [] }).success).toBe(false)
    // metric missing required value
    expect(blockSchema.safeParse({ id: 'x', type: 'metric', label: 'X' }).success).toBe(false)
  })

  it('an unregistered module type renders nothing instead of throwing', () => {
    const { container } = render(<ModuleView type="kanban" data={{ id: 'z', type: 'kanban' }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
