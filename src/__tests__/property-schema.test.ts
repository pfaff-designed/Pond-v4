/**
 * Typed page properties — the #17 foundation (src/lib/properties/schema.ts).
 *
 * The load-bearing invariant this file guards: `_schema` and the row values share
 * one `props` object, so the merge helpers must never let a value write drop the
 * schema, nor a schema write drop the values. Everything downstream (#18 rows, #19
 * views) trusts that fence.
 */
import {
  PROPERTY_TYPES,
  SCHEMA_KEY,
  aiPropertyDefSchema,
  propertyDefSchema,
  propertySchemaSchema,
  valueSchemaFor,
  emptyValue,
  coerceValue,
  resolveOptionValue,
  optionForValue,
  readSchema,
  isCollection,
  readValues,
  withSchema,
  withValue,
  type PropertyDef,
  type PropertySchema,
} from '@/lib/properties/schema'

const def = (over: Partial<PropertyDef> & Pick<PropertyDef, 'type'>): PropertyDef => ({
  id: over.id ?? 'p1',
  name: over.name ?? 'Prop',
  ...over,
})

const SCHEMA: PropertySchema = [
  { id: 'title', name: 'Title', type: 'text' },
  { id: 'count', name: 'Count', type: 'number' },
  { id: 'due', name: 'Due', type: 'date' },
  {
    id: 'stage',
    name: 'Stage',
    type: 'status',
    options: [
      { id: 'todo', label: 'To do' },
      { id: 'done', label: 'Done', color: 'green' },
    ],
  },
  { id: 'done', name: 'Done', type: 'checkbox' },
  { id: 'links', name: 'Links', type: 'relation' },
]

describe('property type set', () => {
  it('has exactly the 7 grilled types', () => {
    expect([...PROPERTY_TYPES]).toEqual([
      'text',
      'number',
      'date',
      'select',
      'status',
      'checkbox',
      'relation',
    ])
  })

  it('accepts a well-formed schema and rejects an unknown type', () => {
    expect(propertySchemaSchema.safeParse(SCHEMA).success).toBe(true)
    expect(propertyDefSchema.safeParse({ id: 'x', name: 'X', type: 'url' }).success).toBe(false)
  })
})

describe('valueSchemaFor / emptyValue', () => {
  it('validates each type against a conforming value', () => {
    expect(valueSchemaFor(def({ type: 'text' })).safeParse('hi').success).toBe(true)
    expect(valueSchemaFor(def({ type: 'number' })).safeParse(3).success).toBe(true)
    expect(valueSchemaFor(def({ type: 'number' })).safeParse('3').success).toBe(false)
    expect(valueSchemaFor(def({ type: 'checkbox' })).safeParse(true).success).toBe(true)
    expect(valueSchemaFor(def({ type: 'select' })).safeParse('opt').success).toBe(true)
    expect(valueSchemaFor(def({ type: 'relation' })).safeParse(['a', 'b']).success).toBe(true)
    expect(valueSchemaFor(def({ type: 'relation' })).safeParse('a').success).toBe(false)
  })

  it('canonical empties: null scalar, false checkbox, [] relation', () => {
    expect(emptyValue(def({ type: 'text' }))).toBeNull()
    expect(emptyValue(def({ type: 'status' }))).toBeNull()
    expect(emptyValue(def({ type: 'checkbox' }))).toBe(false)
    expect(emptyValue(def({ type: 'relation' }))).toEqual([])
  })
})

describe('coerceValue is lenient (never throws, collapses non-conforming to empty)', () => {
  it('returns a conforming value as-is', () => {
    expect(coerceValue(def({ type: 'number' }), 42)).toBe(42)
    expect(coerceValue(def({ type: 'relation' }), ['a'])).toEqual(['a'])
  })

  it('collapses missing / wrong-typed values to the empty', () => {
    expect(coerceValue(def({ type: 'number' }), undefined)).toBeNull()
    expect(coerceValue(def({ type: 'number' }), 'not a number')).toBeNull()
    expect(coerceValue(def({ type: 'checkbox' }), 'nope')).toBe(false)
    expect(coerceValue(def({ type: 'relation' }), 'a')).toEqual([])
  })
})

describe('resolveOptionValue — select/status label→id (the value-is-an-id contract)', () => {
  const stage = def({
    type: 'select',
    options: [
      { id: 'o-todo', label: 'To Do' },
      { id: 'o-doing', label: 'Doing' },
    ],
  })

  it('resolves a label to its option id, case-insensitively', () => {
    expect(resolveOptionValue(stage, 'Doing')).toBe('o-doing')
    expect(resolveOptionValue(stage, 'to do')).toBe('o-todo')
  })

  it('keeps a value that is already an option id (idempotent re-writes)', () => {
    expect(resolveOptionValue(stage, 'o-doing')).toBe('o-doing')
  })

  it('keeps an unmatched value raw (lenient — never silently dropped)', () => {
    expect(resolveOptionValue(stage, 'Archived')).toBe('Archived')
  })

  it('empty / blank / nullish → null', () => {
    expect(resolveOptionValue(stage, '')).toBeNull()
    expect(resolveOptionValue(stage, '   ')).toBeNull()
    expect(resolveOptionValue(stage, null)).toBeNull()
    expect(resolveOptionValue(stage, undefined)).toBeNull()
  })
})

describe('optionForValue — read-side chip resolution (#19 views)', () => {
  const stage = def({
    type: 'status',
    options: [
      { id: 'o-todo', label: 'To Do', color: 'gray' },
      { id: 'o-doing', label: 'Doing', color: 'blue' },
    ],
  })

  it('resolves a stored id to its option (label + color for the chip)', () => {
    expect(optionForValue(stage, 'o-doing')).toEqual({
      id: 'o-doing',
      label: 'Doing',
      color: 'blue',
    })
  })

  it('falls back to a label match so a legacy label-stored row still renders', () => {
    expect(optionForValue(stage, 'To Do')).toEqual({ id: 'o-todo', label: 'To Do', color: 'gray' })
  })

  it('returns undefined for an unmatched value or a non-choice property', () => {
    expect(optionForValue(stage, 'Archived')).toBeUndefined()
    expect(optionForValue(def({ type: 'text' }), 'anything')).toBeUndefined()
    expect(optionForValue(stage, '')).toBeUndefined()
  })
})

describe('relation target — a relation may name the collection it points at (#20)', () => {
  it('round-trips an optional target collection id on a relation def', () => {
    const parsed = propertyDefSchema.safeParse({
      id: 'links',
      name: 'Links',
      type: 'relation',
      target: 'col-books',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.target).toBe('col-books')
  })

  it('target is optional — a relation without one is still valid (unscoped link)', () => {
    const parsed = propertyDefSchema.safeParse({ id: 'l', name: 'L', type: 'relation' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.target).toBeUndefined()
  })

  it('the AI-proposed def carries a target too (ids still optional — a NAME at author time)', () => {
    const parsed = aiPropertyDefSchema.safeParse({
      name: 'Links',
      type: 'relation',
      target: 'Books',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.target).toBe('Books')
  })
})

describe('reserved-key merge helpers', () => {
  it('readSchema / isCollection detect a well-formed _schema', () => {
    const props = { [SCHEMA_KEY]: SCHEMA, title: 'hello' }
    expect(readSchema(props)).toEqual(SCHEMA)
    expect(isCollection(props)).toBe(true)
    expect(isCollection({ title: 'lone page' })).toBe(false)
    expect(isCollection(null)).toBe(false)
  })

  it('readSchema returns null for a malformed _schema (tolerated, not thrown)', () => {
    expect(readSchema({ [SCHEMA_KEY]: [{ nope: true }] })).toBeNull()
  })

  it('readValues strips the reserved key', () => {
    expect(readValues({ [SCHEMA_KEY]: SCHEMA, title: 'x', count: 3 })).toEqual({
      title: 'x',
      count: 3,
    })
  })

  it('withSchema preserves existing values (never clobbers row data)', () => {
    const before = { title: 'keep me', count: 7 }
    const after = withSchema(before, SCHEMA)
    expect(after[SCHEMA_KEY]).toEqual(SCHEMA)
    expect(after.title).toBe('keep me')
    expect(after.count).toBe(7)
  })

  it('withValue preserves _schema and sibling values (never clobbers schema)', () => {
    const before = { [SCHEMA_KEY]: SCHEMA, title: 'old', count: 1 }
    const after = withValue(before, 'title', 'new')
    expect(after[SCHEMA_KEY]).toEqual(SCHEMA)
    expect(after.title).toBe('new')
    expect(after.count).toBe(1)
  })

  it('withValue refuses to write the reserved key', () => {
    expect(() => withValue({}, SCHEMA_KEY, 'x')).toThrow(/_schema/)
  })

  it('merge helpers do not mutate their input', () => {
    const before = { title: 'x' }
    withSchema(before, SCHEMA)
    withValue(before, 'title', 'y')
    expect(before).toEqual({ title: 'x' })
  })
})
