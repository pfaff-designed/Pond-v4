/**
 * The `toggle` block (KAN-480 slice 1, build item 1) — registration: schema round
 * trip (absent `body`/`folded` read as today's behaviour), both halves of the
 * two-map contract, serialize, AI-composability (without `folded`), and
 * `blockHoldsContent`. The ▸ fold control, the hosted editors and the path test
 * land in later build items of this ticket.
 */

import { toggleSchema, toggleDescriptor, type ToggleBlock } from '@/lib/modules/toggle/schema'
import { ToggleView } from '@/lib/modules/toggle/view'
import { blockSchema } from '@/lib/modules/content'
import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'
import { moduleDataSchema, createPageBlockSchema } from '@/lib/modules/ai-composition'
import { blockFrame } from '@/lib/modules/block-frame'
import { blockHoldsContent } from '@/lib/modules/block-holds-content'

const bare: ToggleBlock = { id: 't1', type: 'toggle', content: 'Packing list' }
const full: ToggleBlock = {
  id: 't1',
  type: 'toggle',
  content: 'Packing list',
  body: 'Passport',
  folded: true,
}

describe('toggle schema + registry facets', () => {
  it('persists through blockSchema with body/folded absent — reads as today’s behaviour', () => {
    expect(blockSchema.parse(bare)).toEqual(bare)
    expect('body' in blockSchema.parse(bare)).toBe(false)
    expect('folded' in blockSchema.parse(bare)).toBe(false)
  })

  it('persists through blockSchema with body and folded set', () => {
    expect(blockSchema.parse(full)).toEqual(full)
  })

  it('rejects a block missing its type literal', () => {
    expect(toggleSchema.safeParse({ id: 't1', content: '' }).success).toBe(false)
  })

  it('is registered in both halves of the two-map contract', () => {
    expect(moduleDescriptors.toggle).toBe(toggleDescriptor)
    expect(moduleRenderers.toggle.view).toBe(ToggleView)
    expect(toggleDescriptor.label).toBe('toggle')
  })

  it('serializes the summary alone behind a Toggle: marker', () => {
    expect(toggleDescriptor.serialize(bare)).toBe('Toggle: Packing list')
  })

  it('serializes the summary and body, so a wholesale re-emit never drops the body', () => {
    expect(toggleDescriptor.serialize(full)).toBe('Toggle: Packing list\nPassport')
  })

  it('serializes a placeholder line for an unwritten summary', () => {
    expect(toggleDescriptor.serialize({ id: 't1', type: 'toggle', content: '' })).toBe(
      'Toggle: (no summary yet)'
    )
  })

  it('is AI-composable without folded (moduleDataSchema + createPageBlockSchema)', () => {
    const data = { type: 'toggle', content: 'Packing list', body: 'Passport' }
    const r = moduleDataSchema.safeParse(data)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual(data)
    expect(createPageBlockSchema.safeParse({ ...data, bindKey: 'k' }).success).toBe(true)
    // An id, and a fold state, the model volunteers are both dropped, not honoured.
    const stripped = moduleDataSchema.parse({ id: 'ai-made', folded: true, ...data })
    expect('id' in stripped).toBe(false)
    expect('folded' in stripped).toBe(false)
  })

  it('renders bare, no PondBlock frame — as an unlabelled text block', () => {
    expect(blockFrame(bare)).toBeNull()
  })

  it('blockHoldsContent: a summary or a body holds something; neither does not', () => {
    expect(blockHoldsContent({ id: 't1', type: 'toggle', content: '' })).toBe(false)
    expect(blockHoldsContent({ id: 't1', type: 'toggle', content: '   ' })).toBe(false)
    expect(blockHoldsContent({ id: 't1', type: 'toggle', content: 'Packing list' })).toBe(true)
    expect(
      blockHoldsContent({ id: 't1', type: 'toggle', content: '', body: 'Passport' })
    ).toBe(true)
    expect(blockHoldsContent({ id: 't1', type: 'toggle', content: '', body: '  ' })).toBe(false)
  })
})
