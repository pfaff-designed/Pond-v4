import { propertyAtom } from './property-atom'
import type { PropertyDef } from './schema'

const def = (overrides: Partial<PropertyDef>): PropertyDef => ({
  id: 'f1',
  name: 'field',
  type: 'text',
  ...overrides,
})

describe('propertyAtom', () => {
  it('formats a date value as day + lowercase short month', () => {
    const result = propertyAtom(def({ type: 'date' }), '2026-09-19')
    expect(result).toEqual({ kind: 'date', value: '19 sep', empty: false })
  })

  it('reads a missing date as empty', () => {
    const result = propertyAtom(def({ type: 'date' }), null)
    expect(result).toEqual({ kind: 'date', value: undefined, empty: true })
  })

  it('formats a number with thousands grouping', () => {
    const result = propertyAtom(def({ type: 'number' }), 1040)
    expect(result).toEqual({ kind: 'number', value: '1,040', empty: false })
  })

  it('reads a missing number as empty', () => {
    const result = propertyAtom(def({ type: 'number' }), null)
    expect(result).toEqual({ kind: 'number', value: undefined, empty: true })
  })

  it('resolves a select value to its option label as a tag', () => {
    const field = def({
      type: 'select',
      options: [{ id: 'opt1', label: 'event' }],
    })
    const result = propertyAtom(field, 'opt1')
    expect(result).toEqual({ kind: 'tag', value: 'event', empty: false })
  })

  it('resolves a status value to its option label as a tag', () => {
    const field = def({
      type: 'status',
      options: [{ id: 'opt1', label: 'done' }],
    })
    const result = propertyAtom(field, 'opt1')
    expect(result).toEqual({ kind: 'tag', value: 'done', empty: false })
  })

  it('falls back to the raw value for an unmatched select option', () => {
    const field = def({ type: 'select', options: [] })
    const result = propertyAtom(field, 'legacy-label')
    expect(result).toEqual({ kind: 'tag', value: 'legacy-label', empty: false })
  })

  it('reads an unset select as an empty tag', () => {
    const field = def({ type: 'select', options: [{ id: 'opt1', label: 'event' }] })
    const result = propertyAtom(field, null)
    expect(result).toEqual({ kind: 'tag', value: undefined, empty: true })
  })

  it('reads text as text', () => {
    const result = propertyAtom(def({ type: 'text' }), 'chickpeas, soaked')
    expect(result).toEqual({ kind: 'text', value: 'chickpeas, soaked', empty: false })
  })

  it('reads a blank/missing text value as empty', () => {
    expect(propertyAtom(def({ type: 'text' }), null)).toEqual({
      kind: 'text',
      value: undefined,
      empty: true,
    })
    expect(propertyAtom(def({ type: 'text' }), '')).toEqual({
      kind: 'text',
      value: undefined,
      empty: true,
    })
  })

  it('reads an off-schema raw value (wrong type for the field) as empty', () => {
    const result = propertyAtom(def({ type: 'number' }), 'not a number')
    expect(result).toEqual({ kind: 'number', value: undefined, empty: true })
  })

  it('counts a relation as its link count, empty when unlinked', () => {
    const field = def({ type: 'relation' })
    expect(propertyAtom(field, ['a', 'b'])).toEqual({ kind: 'relation', value: '2', empty: false })
    expect(propertyAtom(field, [])).toEqual({ kind: 'relation', value: undefined, empty: true })
    expect(propertyAtom(field, null)).toEqual({ kind: 'relation', value: undefined, empty: true })
  })

  it('reads a rollup as empty (computed read is out of this item\'s scope)', () => {
    const result = propertyAtom(def({ type: 'rollup' }), 42)
    expect(result).toEqual({ kind: 'text', value: undefined, empty: true })
  })

  it('reads a checkbox as never empty, carrying no display text', () => {
    const field = def({ type: 'checkbox' })
    expect(propertyAtom(field, true)).toEqual({ kind: 'checkbox', value: undefined, empty: false })
    expect(propertyAtom(field, false)).toEqual({ kind: 'checkbox', value: undefined, empty: false })
  })
})
