/**
 * The `toc` block (KAN-482) — `/table of contents`'s registration: schema, both
 * halves of the two-map contract, serialize (off siblings, never the block
 * itself), AI-composability, and the live view (siblings → rows → scroll).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { tocSchema, tocDescriptor, TOC_EMPTY_LINE, type TocBlock } from '@/lib/modules/toc/schema'
import { TocView } from '@/lib/modules/toc/view'
import { blockSchema } from '@/lib/modules/content'
import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'
import { moduleDataSchema, createPageBlockSchema } from '@/lib/modules/ai-composition'
import { blockFrame } from '@/lib/modules/block-frame'
import { blockHoldsContent } from '@/lib/modules/block-holds-content'
import { emptyBlockForType, mintPreset } from '@/lib/modules/palette'
import { blockDomId } from '@/lib/modules/block-dom'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import type { Block } from '@/lib/modules/content'

const toc: TocBlock = { id: 'c1', type: 'toc' }

describe('toc schema + registry facets', () => {
  it('persists through blockSchema (round-trips the block)', () => {
    expect(blockSchema.parse(toc)).toEqual(toc)
  })

  it('rejects a block missing its type literal', () => {
    expect(tocSchema.safeParse({ id: 'c1' }).success).toBe(false)
  })

  it('is registered in both halves of the two-map contract', () => {
    expect(moduleDescriptors.toc).toBe(tocDescriptor)
    expect(moduleRenderers.toc.view).toBe(TocView)
    expect(tocDescriptor.label).toBe('table of contents')
  })

  it('serializes the headings read off siblings, indented by level', () => {
    const siblings: Block[] = [
      { id: 'h1', type: 'text', content: '# one' },
      { id: 'p1', type: 'text', content: 'some prose' },
      { id: 'h2', type: 'text', content: '## two' },
      toc,
    ]
    expect(tocDescriptor.serialize(toc, siblings)).toBe(
      'Table of contents:\n- one\n  - two'
    )
  })

  it('serializes the empty line when the page has no headings', () => {
    expect(tocDescriptor.serialize(toc, [toc])).toBe(`Table of contents: (${TOC_EMPTY_LINE})`)
  })

  it('says so, rather than guessing, when no siblings are in reach', () => {
    expect(tocDescriptor.serialize(toc)).not.toBe('')
    expect(tocDescriptor.serialize(toc)).toMatch(/no page in reach/)
  })

  it('skips a malformed sibling rather than throwing, and still lists the valid headings', () => {
    const siblings: readonly unknown[] = [
      { id: 'h1', type: 'text', content: '# one' },
      { type: 'text' },
      42,
      null,
      toc,
    ]
    expect(() => tocDescriptor.serialize(toc, siblings)).not.toThrow()
    expect(tocDescriptor.serialize(toc, siblings)).toBe('Table of contents:\n- one')
  })

  it('is AI-composable id-less (moduleDataSchema + createPageBlockSchema)', () => {
    const data = { type: 'toc' }
    const r = moduleDataSchema.safeParse(data)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual(data)
    expect(createPageBlockSchema.safeParse({ ...data, bindKey: 'k' }).success).toBe(true)
    // An id the model volunteers is dropped, not honoured.
    const stripped = moduleDataSchema.parse({ id: 'ai-made', ...data })
    expect('id' in stripped).toBe(false)
  })

  it('renders in the list card, eyebrow "contents", no note (the count lives with siblings)', () => {
    expect(blockFrame(toc)).toEqual({ kind: 'list', heading: 'contents', headNote: '' })
  })

  it('holds no content of its own, so deleting it never asks first', () => {
    expect(blockHoldsContent(toc)).toBe(false)
  })

  it('mints a bare id/type block from the `/` row (item 3)', () => {
    const block = emptyBlockForType('toc')
    expect(block).toMatchObject({ type: 'toc' })
    expect(typeof (block as TocBlock).id).toBe('string')
    expect(mintPreset('table-of-contents')).toMatchObject({ type: 'toc' })
  })
})

describe('TocView', () => {
  const threeHeadings: Block[] = [
    { id: 'h1', type: 'text', content: '# one' },
    { id: 'p1', type: 'text', content: 'some prose' },
    { id: 'h2', type: 'text', content: '## two' },
    { id: 'h3', type: 'text', content: '### three' },
  ]

  it('lists the headings in order, indented 14px per level below the shallowest', () => {
    render(
      <SiblingBlocksProvider value={{ blocks: threeHeadings }}>
        <TocView />
      </SiblingBlocksProvider>
    )
    const rows = screen.getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual(['one', 'two', 'three'])
    expect(rows[0].style.paddingLeft).toBe('0px')
    expect(rows[1].style.paddingLeft).toBe('14px')
    expect(rows[2].style.paddingLeft).toBe('28px')
  })

  it('each row paints its own hover wash and focus-visible ring', () => {
    render(
      <SiblingBlocksProvider value={{ blocks: threeHeadings }}>
        <TocView />
      </SiblingBlocksProvider>
    )
    const row = screen.getAllByRole('button')[0]
    expect(row.className).toContain('hover:bg-mn-text/5')
    expect(row.className).toContain('focus-visible:outline-mn-area-b')
  })

  it('updates live when the siblings rerender with changed blocks', () => {
    const { rerender } = render(
      <SiblingBlocksProvider value={{ blocks: threeHeadings }}>
        <TocView />
      </SiblingBlocksProvider>
    )
    expect(screen.getAllByRole('button').map((row) => row.textContent)).toEqual([
      'one',
      'two',
      'three',
    ])

    const renamed: Block[] = [
      { id: 'h1', type: 'text', content: '# one' },
      { id: 'h2', type: 'text', content: '## second' },
    ]
    rerender(
      <SiblingBlocksProvider value={{ blocks: renamed }}>
        <TocView />
      </SiblingBlocksProvider>
    )
    expect(screen.getAllByRole('button').map((row) => row.textContent)).toEqual([
      'one',
      'second',
    ])
  })

  it('renders "no headings yet" when the page has none', () => {
    render(
      <SiblingBlocksProvider value={{ blocks: [] }}>
        <TocView />
      </SiblingBlocksProvider>
    )
    expect(screen.getByText(TOC_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it("a click scrolls its heading to 'start', clear of the composer, with no highlight", async () => {
    const target = document.createElement('div')
    target.id = blockDomId('h3')
    target.scrollIntoView = jest.fn()
    document.body.appendChild(target)

    render(
      <SiblingBlocksProvider value={{ blocks: threeHeadings }}>
        <TocView />
      </SiblingBlocksProvider>
    )
    await userEvent.click(screen.getByRole('button', { name: 'three' }))
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(target.classList.contains('ring-2')).toBe(false)
    target.remove()
  })
})
