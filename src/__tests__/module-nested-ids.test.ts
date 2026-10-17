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

// One AI-emitted (id-less) sample per content type. The completeness check fails if a
// registered type has no sample here — add one when you add a module. #111 closed the
// retired-but-registered tier (the nine data-holding display blocks are deleted), so
// every content type is composable and this one table covers every loop below.
const samples: Record<string, ModuleData> = {
  text: { type: 'text', content: 'Hello world' },
  todo: {
    type: 'todo',
    items: [
      { label: 'Buy wood', checked: false },
      { label: 'Sand it', checked: true },
    ],
  },
  table: {
    type: 'table',
    columns: ['Tool', 'Location'],
    rows: [{ cells: ['Table Saw', 'Centre of shop'] }, { cells: ['Bandsaw', 'Left wall'] }],
  },
  // #19 / KAN-32: a view's config (including each saved view's) references existing
  // property ids — nothing to strip there. `views` itself carries ids (one per saved
  // view), so the omit-chain strips at `nestedIdPaths: ['views']` and hydrate mints
  // them back, like todo's items.
  view: {
    type: 'view',
    mode: 'board',
    groupBy: 'p-status',
    views: [
      { label: 'board', kind: 'board', config: { groupBy: 'p-status' } },
      { label: 'timeline', kind: 'gantt' },
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
  // #249: a kept passage — authored text, no nested id-bearing collections, so a
  // flat top-level id strip is the whole omit-chain.
  highlight: { type: 'highlight', content: 'Three books at once is one too many.' },
  // #250: dated prose. The rows carry their own ids (like todo's items), so the
  // omit-chain strips at `nestedIdPaths: ['entries']` and hydrate mints them back.
  entries: {
    type: 'entries',
    entries: [
      { date: '28 oct', text: 'Van booked for the morning of the 14th.' },
      { date: '24 oct', text: 'Landlord confirmed the inventory date.' },
    ],
  },
  // KAN-122: `pageId` references an existing page — no nested id-bearing
  // collections, so a flat top-level id strip is the whole omit-chain.
  'page-link': { type: 'page-link', pageId: 'page-1' },
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
 * DECLARES via `nestedIdPaths`. Not every object-array carries ids: a chart-mode
 * view's `chart.series` is a plain `{ property, agg }` list, and hydrate/stamp
 * deliberately leave it alone. Walking the declared paths (not every array-of-objects
 * on the block) keeps this fence honest for those modules.
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
  it('every content type has an AI-emitted sample here', () => {
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

  it('a chart view keeps its series objects id-free (no nestedIdPaths declared)', () => {
    // The complement of the todo/table case: a module that DOESN'T declare
    // nestedIdPaths must not have ids injected into its object-arrays. A chart-mode
    // view's `chart.series` is the live instance of that — plain `{ property, agg }`.
    const chartView = stampDisplayIds(
      {
        type: 'view',
        mode: 'chart',
        chart: { kind: 'bar', xProperty: 'p-month', series: [{ property: 'p-out', agg: 'sum' }] },
      },
      'preview-3'
    ) as Record<string, unknown>
    const chart = chartView.chart as Record<string, unknown>
    const series = chart.series as Record<string, unknown>[]
    expect(series.every((entry) => !('id' in entry))).toBe(true)
  })
})
