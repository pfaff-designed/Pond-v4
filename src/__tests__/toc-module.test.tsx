/**
 * The `toc` block (KAN-482 item 2) — `/table of contents`'s registration: schema,
 * both halves of the two-map contract, serialize (off siblings, never the block
 * itself), and AI-composability. The live view (siblings → rows → scroll) lands in
 * the next build item; `TocView` here is still the item-2 stub.
 */

import { tocSchema, tocDescriptor, TOC_EMPTY_LINE, type TocBlock } from '@/lib/modules/toc/schema'
import { TocView } from '@/lib/modules/toc/view'
import { blockSchema } from '@/lib/modules/content'
import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'
import { moduleDataSchema, createPageBlockSchema } from '@/lib/modules/ai-composition'
import { blockFrame } from '@/lib/modules/block-frame'
import { blockHoldsContent } from '@/lib/modules/block-holds-content'
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
})
