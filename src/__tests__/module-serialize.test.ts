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
  // #19: config-only view. Serializes its config (no rows injected here → "no rows").
  view: { id: 'b1', type: 'view', mode: 'table' },
  // #61: image/file attachment — serialize carries filename, caption AND url
  // (full fidelity: the model must be able to re-emit the block on a wholesale
  // edit without losing the stored file reference).
  image: {
    id: 'b1',
    type: 'image',
    url: 'https://cdn.example/user-1/board.png',
    filename: 'board.png',
    mediaType: 'image/png',
    caption: 'The workbench',
  },
  // #249: a kept passage. Serializes with a `Highlight:` marker — `blocksToText`
  // joins lines with no type label, so bare content would read as prose.
  highlight: { id: 'b1', type: 'highlight', content: 'Three books at once is one too many.' },
  // #250: dated prose. Serializes every row (date — text) behind an `Entries:` marker.
  entries: {
    id: 'b1',
    type: 'entries',
    entries: [
      { id: 'e1', date: '28 oct', text: 'Van booked for the morning of the 14th.' },
      { id: 'e2', date: '24 oct', text: 'Landlord confirmed the inventory date.' },
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

  it('table: every column and every cell, not a summary', () => {
    expect(serialize(samples.table)).toBe(
      'Power Tools — columns: Tool | Location; rows: Table Saw | Centre of shop ; Bandsaw | Left wall'
    )
  })

  it('view: renders its config; "no rows" until the assemble seam injects them', () => {
    expect(serialize(samples.view)).toBe('View (table) — no rows')
  })

  it('highlight: the passage behind a Highlight: marker, so it is never mistaken for prose', () => {
    expect(serialize(samples.highlight)).toBe('Highlight: Three books at once is one too many.')
  })

  it('entries: every row, date then prose, behind an Entries: marker', () => {
    expect(serialize(samples.entries)).toBe(
      'Entries:\n28 oct — Van booked for the morning of the 14th.\n24 oct — Landlord confirmed the inventory date.'
    )
  })
})

describe('descriptor.preview (one-line listing)', () => {
  it('todo overrides preview: labels only, comma-joined', () => {
    expect(preview(samples.todo)).toBe('Buy wood, Sand it')
  })

  it('image overrides preview too: the filename alone, no caption or url', () => {
    expect(preview(samples.image)).toBe('Attachment: board.png')
  })

  it('entries overrides preview: the dates alone, comma-joined', () => {
    expect(preview(samples.entries)).toBe('28 oct, 24 oct')
  })

  it('every type WITHOUT a preview facet falls back to serialize', () => {
    const fallbacks = Object.values(moduleDescriptors).filter(
      (d) => d.type !== 'page' && d.preview === undefined
    )
    expect(fallbacks.length).toBeGreaterThan(0)
    for (const d of fallbacks) {
      expect(preview(samples[d.type])).toBe(serialize(samples[d.type]))
    }
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
