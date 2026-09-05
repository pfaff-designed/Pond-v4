/**
 * Pure rollup computation (#20) — src/lib/modules/view/compute-rollup.ts.
 * Guards the aggregation math + the tolerate-don't-crash posture: unresolvable or
 * wrong-type targets, empty sets, and missing per-row values all resolve to a
 * defined result ("—" or the aggregate's identity), never a throw.
 */
import { computeRollup, type RollupRow } from '@/lib/modules/view/compute-rollup'
import type { PropertyDef, PropertySchema } from '@/lib/properties/schema'

const rollup = (over: Partial<PropertyDef>): PropertyDef => ({
  id: 'r',
  name: 'Roll',
  type: 'rollup',
  ...over,
})

// A target collection: an Amount (number), a Due (date), a Note (text).
const TARGET_SCHEMA: PropertySchema = [
  { id: 'p-amount', name: 'Amount', type: 'number' },
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-note', name: 'Note', type: 'text' },
]

const rows: RollupRow[] = [
  { id: 'row-1', props: { 'p-amount': 10, 'p-due': '2026-01-05', 'p-note': 'a' } },
  { id: 'row-2', props: { 'p-amount': 30, 'p-due': '2026-03-01', 'p-note': 'b' } },
  { id: 'row-3', props: { 'p-amount': 5, 'p-due': '2026-02-10', 'p-note': 'c' } },
]

describe('computeRollup — count (ignores rows/schema; works untargeted)', () => {
  it('counts the linked pages', () => {
    const def = rollup({ relationId: 'rel', aggregate: 'count' })
    expect(computeRollup(def, ['row-1', 'row-2'], [], null)).toEqual({ kind: 'number', value: 2 })
  })

  it('empty relation → 0', () => {
    const def = rollup({ relationId: 'rel', aggregate: 'count' })
    expect(computeRollup(def, [], rows, TARGET_SCHEMA)).toEqual({ kind: 'number', value: 0 })
  })
})

describe('computeRollup — number aggregates', () => {
  const linked = ['row-1', 'row-2', 'row-3'] // amounts 10, 30, 5

  it('sum', () => {
    const def = rollup({ relationId: 'rel', rollupProperty: 'p-amount', aggregate: 'sum' })
    expect(computeRollup(def, linked, rows, TARGET_SCHEMA)).toEqual({ kind: 'number', value: 45 })
  })

  it('average', () => {
    const def = rollup({ relationId: 'rel', rollupProperty: 'p-amount', aggregate: 'average' })
    expect(computeRollup(def, linked, rows, TARGET_SCHEMA)).toEqual({ kind: 'number', value: 15 })
  })

  it('min / max', () => {
    const min = rollup({ relationId: 'rel', rollupProperty: 'p-amount', aggregate: 'min' })
    const max = rollup({ relationId: 'rel', rollupProperty: 'p-amount', aggregate: 'max' })
    expect(computeRollup(min, linked, rows, TARGET_SCHEMA)).toEqual({ kind: 'number', value: 5 })
    expect(computeRollup(max, linked, rows, TARGET_SCHEMA)).toEqual({ kind: 'number', value: 30 })
  })

  it('skips missing rows and empty values (not read as 0)', () => {
    const withGap: RollupRow[] = [
      { id: 'row-1', props: { 'p-amount': 10 } },
      { id: 'row-2', props: {} }, // no amount → skipped
    ]
    // row-9 isn't in the target rows → skipped too.
    const avg = rollup({ relationId: 'rel', rollupProperty: 'p-amount', aggregate: 'average' })
    expect(computeRollup(avg, ['row-1', 'row-2', 'row-9'], withGap, TARGET_SCHEMA)).toEqual({
      kind: 'number',
      value: 10, // averages only the one real value, not 10/3
    })
  })

  it('sum of no values → 0 (identity); average/min/max of no values → empty', () => {
    const empty: RollupRow[] = [{ id: 'row-1', props: {} }]
    const sum = rollup({ relationId: 'rel', rollupProperty: 'p-amount', aggregate: 'sum' })
    const avg = rollup({ relationId: 'rel', rollupProperty: 'p-amount', aggregate: 'average' })
    expect(computeRollup(sum, ['row-1'], empty, TARGET_SCHEMA)).toEqual({
      kind: 'number',
      value: 0,
    })
    expect(computeRollup(avg, ['row-1'], empty, TARGET_SCHEMA)).toEqual({ kind: 'empty' })
  })
})

describe('computeRollup — date min/max', () => {
  const linked = ['row-1', 'row-2', 'row-3'] // 2026-01-05, 2026-03-01, 2026-02-10

  it('min returns the earliest ISO, max the latest', () => {
    const min = rollup({ relationId: 'rel', rollupProperty: 'p-due', aggregate: 'min' })
    const max = rollup({ relationId: 'rel', rollupProperty: 'p-due', aggregate: 'max' })
    expect(computeRollup(min, linked, rows, TARGET_SCHEMA)).toEqual({
      kind: 'date',
      value: '2026-01-05',
    })
    expect(computeRollup(max, linked, rows, TARGET_SCHEMA)).toEqual({
      kind: 'date',
      value: '2026-03-01',
    })
  })
})

describe('computeRollup — tolerate (→ empty)', () => {
  it('no aggregate → empty', () => {
    expect(computeRollup(rollup({ relationId: 'rel' }), ['row-1'], rows, TARGET_SCHEMA)).toEqual({
      kind: 'empty',
    })
  })

  it('value aggregate with no rollupProperty → empty', () => {
    const def = rollup({ relationId: 'rel', aggregate: 'sum' })
    expect(computeRollup(def, ['row-1'], rows, TARGET_SCHEMA)).toEqual({ kind: 'empty' })
  })

  it('no target schema → empty (value aggregate)', () => {
    const def = rollup({ relationId: 'rel', rollupProperty: 'p-amount', aggregate: 'sum' })
    expect(computeRollup(def, ['row-1'], rows, null)).toEqual({ kind: 'empty' })
  })

  it('sum over a non-number property → empty', () => {
    const def = rollup({ relationId: 'rel', rollupProperty: 'p-note', aggregate: 'sum' })
    expect(computeRollup(def, ['row-1'], rows, TARGET_SCHEMA)).toEqual({ kind: 'empty' })
  })

  it('rolling over a rollup-typed property → empty (D6: cycles impossible)', () => {
    const schemaWithRollup: PropertySchema = [
      { id: 'p-child', name: 'Child roll', type: 'rollup', relationId: 'x', aggregate: 'count' },
    ]
    const def = rollup({ relationId: 'rel', rollupProperty: 'p-child', aggregate: 'sum' })
    expect(computeRollup(def, ['row-1'], rows, schemaWithRollup)).toEqual({ kind: 'empty' })
  })

  it('min/max over a text property → empty', () => {
    const def = rollup({ relationId: 'rel', rollupProperty: 'p-note', aggregate: 'max' })
    expect(computeRollup(def, ['row-1'], rows, TARGET_SCHEMA)).toEqual({ kind: 'empty' })
  })
})
