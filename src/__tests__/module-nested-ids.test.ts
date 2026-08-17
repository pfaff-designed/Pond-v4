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
import { moduleDescriptors } from '@/lib/modules/registry'
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
}

const contentTypes = Object.keys(moduleDescriptors).filter((t) => t !== 'page')

/** Every array-of-objects field on a block (the shape nested ids live in). */
function objectArrays(block: object): Record<string, unknown>[][] {
  return Object.values(block).filter(
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
    for (const arr of objectArrays(block!)) {
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
    const nested = [...objectArrays(todo!), ...objectArrays(table!)].flat().map((el) => el.id)
    expect(new Set(nested).size).toBe(nested.length)
  })
})

describe('stampDisplayIds stamps the same collections for display', () => {
  it.each(contentTypes)('%s gets a block id and an id on every nested element', (type) => {
    const block = stampDisplayIds(samples[type], 'preview-0')
    expect(block.id).toBe('preview-0')
    for (const arr of objectArrays(block)) {
      arr.forEach((el, j) => {
        expect(el.id).toBe(`preview-0-${j}`)
      })
    }
  })

  it('todo items and table rows carry stamped display ids', () => {
    const todo = stampDisplayIds(samples.todo, 'preview-1')
    const table = stampDisplayIds(samples.table, 'preview-2')
    expect(objectArrays(todo)[0].map((el) => el.id)).toEqual(['preview-1-0', 'preview-1-1'])
    expect(
      objectArrays(table)
        .flat()
        .map((el) => el.id)
    ).toEqual(['preview-2-0', 'preview-2-1'])
  })
})
