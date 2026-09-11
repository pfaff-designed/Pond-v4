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
import { moduleDescriptors, descriptorFor, RETIRED_FROM_CREATION } from '@/lib/modules/registry'
import { moduleDataSchema } from '@/lib/modules/ai-composition'
import type { ModuleData } from '@/lib/modules/ai-composition'

// One AI-emitted (id-less) sample per COMPOSABLE content type. The completeness check
// fails if a composable type has no sample here — add one when you add a module.
// Retired-from-creation types (kanban, #19 slice 6) are NOT composable, so they live in
// `retiredSamples` below and only exercise the read-tolerance (hydrate) path.
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
  // #19: a view is config only (no nested id-bearing collections), so it round-trips
  // with a flat top-level id strip — like a chart.
  view: { type: 'view', mode: 'board', groupBy: 'p-status' },
  // #12: heatmap + stat promotions. Like the charts, neither carries a nested
  // id-bearing collection (heatmap `cells` are plain `{ date, value }`), so a flat
  // top-level id strip is the whole omit-chain.
  heatmap: {
    type: 'heatmap',
    title: 'Workouts',
    cells: [
      { date: '2026-01-05', value: 1 },
      { date: '2026-01-07', value: 2 },
    ],
  },
  stat: { type: 'stat', label: 'MRR', value: 12500, format: 'currency', delta: 0.12 },
  // #11: standalone timeline (Gantt). Its `items` are plain `{ label, start, end? }`
  // with no ids (like heatmap cells / chart points), so a flat top-level id strip
  // is the whole omit-chain.
  timeline: {
    type: 'timeline',
    title: 'Renovation',
    items: [
      { label: 'Demo', start: '2026-09-01', end: '2026-09-05' },
      { label: 'Inspection', start: '2026-09-30' },
    ],
  },
  // #61: an image/file attachment carries no nested id-bearing collections —
  // just the storage URL + display metadata, so a flat top-level id strip is
  // the whole omit-chain.
  image: {
    type: 'image',
    url: 'https://cdn.example/user-1/board.png',
    filename: 'board.png',
    mediaType: 'image/png',
    caption: 'The workbench',
  },
}

/**
 * Retired-from-creation samples (#19 slice 6): kanban is no longer in `moduleDataSchema`,
 * so its id-less shape isn't a `ModuleData` and can't be strip∘hydrate round-tripped
 * through the composition union. But a PERSISTED kanban must still hydrate + render, so
 * we keep an id-less sample here to exercise the read-tolerance hydrate path only.
 * Typed loosely (not `ModuleData`) precisely because the union no longer admits it.
 */
const retiredSamples: Record<string, unknown> = {
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

const retiredTypes = new Set<string>(RETIRED_FROM_CREATION)
const contentTypes = Object.keys(moduleDescriptors).filter((t) => t !== 'page')
// Composable = content types the AI/palette may mint (have an id-less `ModuleData`
// sample). Retired-from-creation types (kanban) still hydrate on read but are not in
// `moduleDataSchema`, so they're excluded from the composition round-trip + stamp loops.
const composableTypes = contentTypes.filter((t) => !retiredTypes.has(t))

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

// Every content type resolves to a sample for the read-tolerance hydrate path:
// composable types from `samples`, retired-from-creation types from `retiredSamples`.
const sampleFor = (type: string): unknown => samples[type] ?? retiredSamples[type]

describe('registry completeness', () => {
  it('every composable content type has an AI-emitted sample here', () => {
    for (const type of composableTypes) {
      expect(samples[type]).toBeDefined()
    }
  })

  it('every retired-from-creation type has a read-tolerance sample', () => {
    for (const type of retiredTypes) {
      expect(retiredSamples[type]).toBeDefined()
    }
  })
})

describe('hydrateBlock mints every nested id the schema demands', () => {
  // Covers ALL content types, retired included — a persisted kanban must still hydrate.
  it.each(contentTypes)('%s hydrates to a valid block (no id left unminted)', (type) => {
    let n = 0
    const block = hydrateBlock(sampleFor(type), 'blk-1', () => `mint-${n++}`)
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
  it.each(composableTypes)('%s round-trips: strip(hydrate(sample)) === sample', (type) => {
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
  it.each(composableTypes)('%s gets a block id and an id on every nested element', (type) => {
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
