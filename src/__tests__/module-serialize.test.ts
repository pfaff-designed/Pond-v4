/**
 * The serialize facet on ModuleDescriptor (arch-refinement Candidate 1).
 *
 * "What is a block of type X as text" lives ON the module, not in hand-kept
 * switches in context/assemble.ts. `serialize` is required (full-fidelity body —
 * prompt injection + embeddings; a block the model can't read is silently
 * destroyed on the next wholesale edit). `preview` is optional (one-line listing
 * for the id-addressed context; falls back to serialize).
 *
 * Expected strings are the shipped blocksToText/blockPreview outputs — the
 * behavior existing prompt/eval surfaces already depend on.
 */

import { moduleDescriptors } from '@/lib/modules/registry'
import type { ModuleDescriptor } from '@/lib/modules/types'
import type { Block } from '@/lib/documents/types'

// One known-good sample per content type. The completeness loop below fails if a
// registered type has no sample here — add one when you add a module.
const samples: Record<string, Block> = {
  text: { id: 'b1', type: 'text', content: 'Hello world' },
  todo: {
    id: 'b1',
    type: 'todo',
    items: [
      { id: 't1', label: 'Buy wood', checked: false },
      { id: 't2', label: 'Sand it', checked: true },
    ],
  },
  metric: { id: 'b1', type: 'metric', label: 'Boards cut', value: 12, unit: 'pcs' },
  'metric-ring': {
    id: 'b1',
    type: 'metric-ring',
    label: 'Overall Progress',
    sub: 'Phase 1 of 5',
    pct: 0.2,
  },
  table: {
    id: 'b1',
    type: 'table',
    title: 'Power Tools',
    columns: ['Tool', 'Location'],
    rows: [
      { id: 'r1', cells: ['Table Saw', 'Centre of shop'] },
      { id: 'r2', cells: ['Bandsaw', 'Left wall'] },
    ],
  },
}

function serialize(block: Block): string {
  const d = moduleDescriptors[block.type] as ModuleDescriptor<unknown>
  return d.serialize(block)
}

function preview(block: Block): string {
  const d = moduleDescriptors[block.type] as ModuleDescriptor<unknown>
  return (d.preview ?? d.serialize)(block)
}

describe('descriptor.serialize (full-fidelity body)', () => {
  it('text: the markdown content', () => {
    expect(serialize(samples.text)).toBe('Hello world')
  })

  it('todo: a checkbox line per item', () => {
    expect(serialize(samples.todo)).toBe('- [ ] Buy wood\n- [x] Sand it')
  })

  it('metric: label, value, unit', () => {
    expect(serialize(samples.metric)).toBe('Boards cut: 12 pcs')
  })

  it('metric-ring: label, sub, percentage', () => {
    expect(serialize(samples['metric-ring'])).toBe('Overall Progress (Phase 1 of 5): 20%')
  })

  it('table: every column and every cell, not a summary', () => {
    expect(serialize(samples.table)).toBe(
      'Power Tools — columns: Tool | Location; rows: Table Saw | Centre of shop ; Bandsaw | Left wall'
    )
  })
})

describe('descriptor.preview (one-line listing)', () => {
  it('todo overrides preview: labels only, comma-joined', () => {
    expect(preview(samples.todo)).toBe('Buy wood, Sand it')
  })

  it('every other content type falls back to serialize', () => {
    for (const type of ['text', 'metric', 'metric-ring', 'table'] as const) {
      expect(preview(samples[type])).toBe(serialize(samples[type]))
    }
  })
})

describe('bound metric serialize (ticket-23 — AI sees what the UI shows)', () => {
  const checklist: Block = {
    id: 'todo-1',
    type: 'todo',
    items: [
      { id: 'i1', label: 'Dune', checked: true },
      { id: 'i2', label: 'Hyperion', checked: true },
      { id: 'i3', label: 'Neuromancer', checked: false },
    ],
  }
  const bound: Extract<Block, { type: 'metric' }> = {
    id: 'm1',
    type: 'metric',
    label: 'Books finished',
    value: 99,
    source: { blockId: 'todo-1', kind: 'checklist-checked' },
  }
  const metricSerialize = moduleDescriptors.metric.serialize

  it('with siblings: emits the DERIVED value (matches the view), never the manual one', () => {
    const out = metricSerialize(bound, [checklist, bound])
    expect(out).toContain('Books finished: 2')
    expect(out).not.toContain('99')
    expect(out).toContain('todo-1') // the binding is visible to the model
  })

  it('with siblings but a missing source: manual value, flagged — not silently wrong', () => {
    const out = metricSerialize(bound, [bound])
    expect(out).toContain('99')
    expect(out).toMatch(/missing/)
  })

  it('without siblings: states the binding + fallback instead of guessing a number', () => {
    const out = metricSerialize(bound)
    expect(out).toContain('derived live from block todo-1')
    expect(out).toContain('manual fallback: 99')
    expect(out).not.toMatch(/^Books finished: 99$/)
  })

  it('unbound metric output is unchanged with or without siblings', () => {
    const unbound = samples.metric as Extract<Block, { type: 'metric' }>
    expect(metricSerialize(unbound, [unbound])).toBe('Boards cut: 12 pcs')
  })
})

describe('cross-page & aggregate metric serialize honesty (ticket-38)', () => {
  const metricSerialize = moduleDescriptors.metric.serialize

  const crossPage: Extract<Block, { type: 'metric' }> = {
    id: 'm1',
    type: 'metric',
    label: 'Milestone tasks',
    value: 7,
    source: { pageId: 'page-A', blockId: 'todo-1', kind: 'checklist-checked' },
  }
  const aggregate: Extract<Block, { type: 'metric' }> = {
    id: 'm2',
    type: 'metric',
    label: 'Tasks across milestones',
    value: 42,
    source: { pages: 'children', kind: 'checklist-checked' },
  }

  // The whole point: serialize can't reach OTHER pages (siblings hold only this page's
  // blocks, and serialize is a pure server-safe facet). It must NEVER print a derived
  // number it cannot compute — it states the binding + the manual fallback honestly, so
  // the AI's context can never disagree with the UI by fabricating a value.
  it('cross-page: never emits a fabricated number; names the page + block + fallback', () => {
    // Even when THIS page happens to hold a same-id todo, the cross-page source must
    // not be derived from it — honesty over a wrong guess.
    const localDecoy: Block = {
      id: 'todo-1',
      type: 'todo',
      items: [{ id: 'x', label: 'wrong', checked: true }],
    }
    const out = metricSerialize(crossPage, [localDecoy])
    expect(out).toContain('page page-A')
    expect(out).toContain('block todo-1')
    expect(out).toContain('cross-page')
    expect(out).toContain('manual fallback: 7')
    // No bare "Milestone tasks: <number>" that would read as a live value.
    expect(out).not.toMatch(/^Milestone tasks: \d/)
  })

  it('aggregate: states the rollup scope + fallback, never a computed sum', () => {
    const out = metricSerialize(aggregate, [])
    expect(out).toMatch(/child pages/)
    expect(out).toContain('manual fallback: 42')
    expect(out).not.toMatch(/^Tasks across milestones: \d/)
  })

  it('cross-page/aggregate honesty holds whether or not siblings are passed', () => {
    // siblings can never resolve these forms, so the output must be identical with and
    // without them — no accidental branch that emits a number when siblings are present.
    expect(metricSerialize(crossPage)).toBe(metricSerialize(crossPage, []))
    expect(metricSerialize(aggregate)).toBe(metricSerialize(aggregate, []))
  })
})

describe('table sum footer serialize (ticket-31 — AI sees the total the page shows)', () => {
  const tableSerialize = moduleDescriptors.table.serialize
  const budget: Extract<Block, { type: 'table' }> = {
    id: 't1',
    type: 'table',
    title: 'Budget',
    columns: ['Item', 'Cost'],
    rows: [
      { id: 'r1', cells: ['Wood', '$120'] },
      { id: 'r2', cells: ['Screws', '$8 (bought)'] },
      { id: 'r3', cells: ['Stain', 'TBD'] },
    ],
    sumColumn: 1,
  }

  it('appends the derived column total (lenient parse; junk skipped)', () => {
    const out = tableSerialize(budget)
    expect(out).toContain('total Cost: 128')
  })

  it('omits the total when the summed column has no numbers', () => {
    const out = tableSerialize({ ...budget, sumColumn: 0 })
    expect(out).not.toMatch(/total/i)
  })

  it('a table without sumColumn serializes exactly as before', () => {
    const out = tableSerialize({ ...budget, sumColumn: undefined })
    expect(out).not.toMatch(/total/i)
  })
})

describe('registry completeness', () => {
  const contentDescriptors = Object.values(moduleDescriptors).filter((d) => d.type !== 'page')

  it('every registered content type has a sample here', () => {
    for (const d of contentDescriptors) {
      expect(samples[d.type]).toBeDefined()
    }
  })

  it('every registered content type serializes its sample to non-empty text', () => {
    for (const d of contentDescriptors) {
      expect(serialize(samples[d.type]).length).toBeGreaterThan(0)
    }
  })

  it('the page container serializes to its title', () => {
    const out = moduleDescriptors.page.serialize({
      id: 'p1',
      type: 'page',
      title: 'Workshop',
      blocks: [],
    })
    expect(out).toBe('Workshop')
  })
})
