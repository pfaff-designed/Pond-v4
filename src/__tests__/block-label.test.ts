/**
 * Labels on blocks (#258) — a label is a block's OWN persisted, optional field, not
 * its type's name. `PondTemplate.dc.html`'s `renderVals()`:
 *
 *   const v = filled ? d.f : d.e, bare = k === 'text' && !label;
 *   const b = { label, …, hasEyebrow: !!label, … }
 *
 * The board's `T` table labels every block in the twelve templates except the three
 * bare `text` blocks (`page`, `notes`) — `text → goal` / `notes`, `highlight →
 * kept`, `check → actions` / `today`, `kanban → tasks — board`, `entries → updates`.
 * So the field is declared ONCE (`labelledBlockFields`) and applied per schema to
 * `text`, `highlight`, `todo`, `view` and `entries`. `table` is the exception: its
 * existing `title` IS its label (persisted rows carry it; a rename needs a migration
 * this slice must not have), so it gets no second field.
 *
 * This file pins the persisted schema, the AI emit unions (ADR 0006: a block Pond
 * cannot label is a template Pond cannot write) and the strip∘hydrate∘stamp
 * round-trip. `blockFrame()`'s reading of the label is in `pond-block-frame.test.tsx`.
 */
import { blockSchema } from '@/lib/modules/content'
import { labelledBlockFields } from '@/lib/modules/types'
import { moduleDataSchema, createPageBlockSchema } from '@/lib/modules/ai-composition'
import type { ModuleData } from '@/lib/modules/ai-composition'
import { hydrateBlock } from '@/lib/modules/hydrate'
import { stampDisplayIds } from '@/lib/modules/preview'
import { textSchema } from '@/lib/modules/text/schema'
import { highlightSchema } from '@/lib/modules/highlight/schema'
import { todoSchema } from '@/lib/modules/todo/schema'
import { viewSchema } from '@/lib/modules/view/schema'
import { entriesSchema } from '@/lib/modules/entries/schema'
import { tableSchema } from '@/lib/modules/table/schema'

/** The board's own labels, one per labelled type, as AI-emitted (id-less) data. */
const labelled: Record<string, ModuleData> = {
  text: { type: 'text', label: 'goal', content: 'Out of the flat by the 14th.' },
  highlight: { type: 'highlight', label: 'kept', content: 'Three books at once is one too many.' },
  todo: { type: 'todo', label: 'actions', items: [{ label: 'Sam — final copy', checked: false }] },
  view: { type: 'view', label: 'tasks — board', mode: 'board', groupBy: 'p-status' },
  entries: {
    type: 'entries',
    label: 'updates',
    entries: [{ date: '28 oct', text: 'Van booked for the morning of the 14th.' }],
  },
}
const labelledTypes = Object.keys(labelled)

describe('labelledBlockFields — declared once, applied per schema', () => {
  it('is one optional string field named `label`', () => {
    expect(Object.keys(labelledBlockFields)).toEqual(['label'])
    expect(labelledBlockFields.label.safeParse(undefined).success).toBe(true)
    expect(labelledBlockFields.label.safeParse('goal').success).toBe(true)
    expect(labelledBlockFields.label.safeParse(3).success).toBe(false)
  })

  it.each([
    ['text', textSchema],
    ['highlight', highlightSchema],
    ['todo', todoSchema],
    ['view', viewSchema],
    ['entries', entriesSchema],
  ] as const)('%s carries the shared `label` field', (_type, schema) => {
    expect(schema.shape.label).toBe(labelledBlockFields.label)
  })

  it('table keeps `title` as its label and gets NO second field (no migration)', () => {
    expect('label' in tableSchema.shape).toBe(false)
    expect('title' in tableSchema.shape).toBe(true)
    // A `label` someone writes onto a table is dropped, not persisted.
    const parsed = blockSchema.parse({
      id: 't',
      type: 'table',
      title: 'log',
      label: 'log',
      columns: ['date'],
      rows: [],
    })
    expect('label' in parsed).toBe(false)
  })
})

describe('the persisted block union', () => {
  // `hydrateBlock` mints the nested ids the persisted schema demands (todo items,
  // entries) and re-validates against `blockSchema` — so a non-null result IS the
  // persisted shape. The label must come through it, and its absence must too.
  it.each(labelledTypes)('%s persists with its label and without one', (type) => {
    let n = 0
    const withLabel = hydrateBlock(labelled[type], 'b-1', () => `mint-${n++}`)
    expect(withLabel).not.toBeNull()
    expect(blockSchema.parse(withLabel)).toEqual(withLabel)
    expect((withLabel as { label?: string }).label).toBe(
      (labelled[type] as { label: string }).label
    )
    const rest = { ...labelled[type] } as Record<string, unknown>
    delete rest.label
    const without = hydrateBlock(rest as ModuleData, 'b-2', () => `mint-${n++}`)
    expect(without).not.toBeNull()
    expect('label' in without!).toBe(false)
  })

  it('rejects a non-string label', () => {
    expect(blockSchema.safeParse({ id: 'b', type: 'text', label: 7, content: 'x' }).success).toBe(
      false
    )
  })
})

describe('the AI emit unions carry the label (ADR 0006)', () => {
  it.each(labelledTypes)('moduleDataSchema keeps %s’s label', (type) => {
    const parsed = moduleDataSchema.parse(labelled[type])
    expect(parsed).toEqual(labelled[type])
  })

  it.each(labelledTypes)('createPageBlockSchema keeps %s’s label', (type) => {
    const parsed = createPageBlockSchema.parse(labelled[type])
    expect(parsed).toEqual(labelled[type])
  })
})

describe('round-trip: strip ∘ hydrate ∘ stamp leave the label intact', () => {
  it.each(labelledTypes)('%s: hydrate mints ids and keeps the label', (type) => {
    let n = 0
    const block = hydrateBlock(labelled[type], 'blk-1', () => `mint-${n++}`)
    expect(block).not.toBeNull()
    expect((block as { label?: string }).label).toBe((labelled[type] as { label: string }).label)
    // And the id strip gives the model back exactly what it emitted.
    expect(moduleDataSchema.parse(block)).toEqual(labelled[type])
  })

  it.each(labelledTypes)('%s: the display stamp keeps the label', (type) => {
    const block = stampDisplayIds(labelled[type], 'preview-0')
    expect((block as { label?: string }).label).toBe((labelled[type] as { label: string }).label)
  })
})
