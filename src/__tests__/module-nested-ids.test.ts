/**
 * Nested-id handling lives ON the module (arch-refinement Candidate 2).
 *
 * The fact "todo.items and table.rows carry ids" was encoded four times (hydrate,
 * preview, create card, ai-composition) and drifted. Now each descriptor declares
 * its id-bearing collections once (`nestedIdPaths`) and the write-time mint
 * (`hydrateBlock`) and display-time stamp (`stampDisplayIds`) walk that fact.
 *
 * The non-tautological check: `hydrateBlock` re-validates against `blockSchema`,
 * which REQUIRES nested ids — so a module whose schema demands ids but whose
 * descriptor forgets to declare the path hydrates to `null` and fails here.
 */

import { hydrateBlock } from '@/lib/modules/hydrate'
import { stampDisplayIds } from '@/lib/modules/preview'
import { moduleDescriptors, descriptorFor } from '@/lib/modules/registry'
import { moduleDataSchema } from '@/lib/modules/ai-composition'
import type { ModuleData } from '@/lib/modules/ai-composition'

// One AI-emitted (id-less) sample per content type. The completeness check fails
// if a registered type has no sample here — add one when you add a module.
const samples: Record<string, ModuleData> = {
  text: { type: 'text', content: 'Hello world' },
  todo: {
    type: 'todo',
    items: [
      { label: 'Buy wood', checked: false },
      { label: 'Sand it', checked: true },
    ],
  },
  metric: { type: 'metric', label: 'Boards cut', value: 12 },
  'metric-ring': { type: 'metric-ring', label: 'Overall Progress', pct: 0.2 },
  table: {
    type: 'table',
    columns: ['Tool', 'Location'],
    rows: [{ cells: ['Table Saw', 'Centre of shop'] }, { cells: ['Bandsaw', 'Left wall'] }],
  },
  // Kanban (ticket-35): two nested id levels — columns AND cards inside them.
  kanban: {
    type: 'kanban',
    columns: [
      {
        title: 'To do',
        cards: [{ title: 'Cut boards' }, { title: 'Sand', note: 'grit 120 then 220' }],
      },
      { title: 'Doing', cards: [{ title: 'Glue-up' }] },
      { title: 'Done', cards: [] },
    ],
  },
  // ticket-36: Bklit chart promotion. Charts have no nested id-bearing collections
  // (points are plain `{ x, values }`), so these round-trip with a top-level id strip.
  'chart-line': {
    type: 'chart-line',
    title: 'Weekly mileage',
    points: [
      { x: '2026-01', values: { Miles: 32 } },
      { x: '2026-02', values: { Miles: 38 } },
    ],
  },
  'chart-bar': {
    type: 'chart-bar',
    title: 'Spend by category',
    points: [
      { x: 'Rent', values: { Amount: 1800 } },
      { x: 'Food', values: { Amount: 420 } },
    ],
  },
  'chart-area': {
    type: 'chart-area',
    title: 'Balance',
    points: [
      { x: '2026-01', values: { Balance: 1200 } },
      { x: '2026-02', values: { Balance: 1650 } },
    ],
  },
}

/**
 * Resolve a nested-id path (`'columns'` or the deep `'columns.cards'`, ticket-35)
 * to the flat list of id-bearing element objects it addresses — the collections a
 * strip must have emptied of `id`. Mirrors the walker in `hydrate.ts`.
 */
function elementsAtPath(block: Record<string, unknown>, path: string): Record<string, unknown>[] {
  const dot = path.indexOf('.')
  if (dot === -1) {
    const collection = block[path]
    return Array.isArray(collection) ? (collection as Record<string, unknown>[]) : []
  }
  const parent = block[path.slice(0, dot)]
  if (!Array.isArray(parent)) return []
  return (parent as Record<string, unknown>[]).flatMap((el) =>
    elementsAtPath(el, path.slice(dot + 1))
  )
}

const contentTypes = Object.keys(moduleDescriptors).filter((t) => t !== 'page')

/**
 * The block's ID-BEARING object-array collections — the ones the descriptor
 * DECLARES via `nestedIdPaths`. Not every object-array carries ids: a `chart-*`
 * block's `points` are plain `{ x, values }` with no id, and hydrate/stamp
 * deliberately leave them alone (ticket-36). Walking the declared paths (not every
 * array-of-objects on the block) keeps this fence honest for those modules.
 */
function idBearingArrays(type: string, block: object): Record<string, unknown>[][] {
  const paths = descriptorFor(type)?.nestedIdPaths ?? []
  const rec = block as Record<string, unknown>
  return paths
    .map((p) => rec[p])
    .filter(
      (v): v is Record<string, unknown>[] =>
        Array.isArray(v) && v.every((el) => typeof el === 'object' && el !== null)
    )
}

describe('registry completeness', () => {
  it('every registered content type has an AI-emitted sample here', () => {
    for (const type of contentTypes) {
      expect(samples[type]).toBeDefined()
    }
  })
})

describe('hydrateBlock mints every nested id the schema demands', () => {
  it.each(contentTypes)('%s hydrates to a valid block (no id left unminted)', (type) => {
    let n = 0
    const block = hydrateBlock(samples[type], 'blk-1', () => `mint-${n++}`)
    // null would mean blockSchema rejected the hydrated block — i.e. a nested id
    // the schema requires was not minted.
    expect(block).not.toBeNull()
    expect(block!.id).toBe('blk-1')
    for (const arr of idBearingArrays(type, block!)) {
      for (const el of arr) {
        expect(typeof el.id).toBe('string')
        expect((el.id as string).startsWith('mint-')).toBe(true)
      }
    }
  })

  it('mints distinct ids per todo item and table row', () => {
    let n = 0
    const todo = hydrateBlock(samples.todo, 'blk-1', () => `mint-${n++}`)
    const table = hydrateBlock(samples.table, 'blk-2', () => `mint-${n++}`)
    const nested = [...idBearingArrays('todo', todo!), ...idBearingArrays('table', table!)]
      .flat()
      .map((el) => el.id)
    expect(new Set(nested).size).toBe(nested.length)
  })
})

describe('moduleDataSchema strips every id nestedIdPaths declares (ai-composition fence)', () => {
  // The strip site in ai-composition.ts hand-encodes each omit-chain; this pins it
  // to the descriptor's declared fact. Parse failure = the type is missing from the
  // union; a surviving id = its omit-chain doesn't cover a declared path.
  it.each(contentTypes)('%s round-trips: strip(hydrate(sample)) === sample', (type) => {
    let n = 0
    const hydrated = hydrateBlock(samples[type], 'blk-1', () => `mint-${n++}`)
    const parsed = moduleDataSchema.safeParse(hydrated)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const data = parsed.data as Record<string, unknown>
    expect('id' in data).toBe(false)
    for (const path of descriptorFor(type)?.nestedIdPaths ?? []) {
      const collection = elementsAtPath(data, path)
      expect(collection.length).toBeGreaterThan(0)
      for (const el of collection) {
        expect('id' in el).toBe(false)
      }
    }
    expect(parsed.data).toEqual(samples[type])
  })
})

describe('stampDisplayIds stamps the same collections for display', () => {
  it.each(contentTypes)('%s gets a block id and an id on every nested element', (type) => {
    const block = stampDisplayIds(samples[type], 'preview-0')
    expect(block.id).toBe('preview-0')
    for (const arr of idBearingArrays(type, block)) {
      arr.forEach((el, j) => {
        expect(el.id).toBe(`preview-0-${j}`)
      })
    }
  })

  it('todo items and table rows carry stamped display ids', () => {
    const todo = stampDisplayIds(samples.todo, 'preview-1')
    const table = stampDisplayIds(samples.table, 'preview-2')
    expect(idBearingArrays('todo', todo)[0].map((el) => el.id)).toEqual([
      'preview-1-0',
      'preview-1-1',
    ])
    expect(
      idBearingArrays('table', table)
        .flat()
        .map((el) => el.id)
    ).toEqual(['preview-2-0', 'preview-2-1'])
  })

  it('a chart block keeps its point objects id-free (no nestedIdPaths declared)', () => {
    // The complement of the todo/table case: a module that DOESN'T declare
    // nestedIdPaths must not have ids injected into its object-arrays.
    const chart = stampDisplayIds(samples['chart-line'], 'preview-3') as Record<string, unknown>
    const points = chart.points as Record<string, unknown>[]
    expect(points.every((p) => !('id' in p))).toBe(true)
  })
})
