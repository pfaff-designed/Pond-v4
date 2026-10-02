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
    expect(screen.getByText('Weekly mileage')).toBeInTheDocument() // table title
    expect(screen.getByText('The long-run route')).toBeInTheDocument() // image caption
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

  it('a read-only view does not emit, and its boxes are READ-ONLY checkboxes to assistive tech (#219)', () => {
    const onChange = jest.fn()
    render(<ModuleView type="todo" data={page.blocks[1]} onChange={onChange} />)
    // Not `<input>`s any more (the molecule's inert atom), but still announced:
    // a done step must read as checked even though its strike is CSS-only.
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    for (const box of boxes) {
      expect(box.tagName).toBe('SPAN')
      expect(box).toHaveAttribute('aria-readonly', 'true')
    }
    expect(boxes[0]).toHaveAttribute('aria-checked', 'true')
    expect(boxes[1]).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(boxes[1])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('blockSchema (Zod SoT) accepts valid blocks and rejects malformed ones', () => {
    expect(blockSchema.safeParse(page.blocks[0]).success).toBe(true)
    expect(blockSchema.safeParse(page.blocks[3]).success).toBe(true)
    // a view naming a mode outside the union
    expect(blockSchema.safeParse({ id: 'x', type: 'view', mode: 'gantt-ish' }).success).toBe(false)
    // unknown type
    expect(blockSchema.safeParse({ id: 'x', type: 'gantt', cards: [] }).success).toBe(false)
    // table missing its required rows
    expect(blockSchema.safeParse({ id: 'x', type: 'table', columns: ['A'] }).success).toBe(false)
  })

  it('an unregistered module type renders nothing instead of throwing', () => {
    const { container } = render(<ModuleView type="gantt" data={{ id: 'z', type: 'gantt' }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
