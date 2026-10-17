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
  addDateField,
  addStatusField,
  addOption,
  removeField,
  renameField,
  isFieldNameTaken,
  freeFieldName,
  restoreFieldAt,
  DEFAULT_STATUS_OPTIONS,
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
  it('has exactly the 8 grilled types', () => {
    expect([...PROPERTY_TYPES]).toEqual([
      'text',
      'number',
      'date',
      'select',
      'status',
      'checkbox',
      'relation',
      'rollup',
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

describe('rollup — a derived property that aggregates over a relation (#20)', () => {
  it('round-trips a rollup def: relationId + rollupProperty + aggregate', () => {
    const parsed = propertyDefSchema.safeParse({
      id: 'r',
      name: 'Total spent',
      type: 'rollup',
      relationId: 'p-purchases',
      rollupProperty: 'p-amount',
      aggregate: 'sum',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.aggregate).toBe('sum')
  })

  it('a count rollup needs no rollupProperty', () => {
    const parsed = propertyDefSchema.safeParse({
      id: 'r',
      name: 'How many',
      type: 'rollup',
      relationId: 'p-purchases',
      aggregate: 'count',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.rollupProperty).toBeUndefined()
  })

  it('rejects an unknown aggregate', () => {
    const parsed = propertyDefSchema.safeParse({
      id: 'r',
      name: 'X',
      type: 'rollup',
      relationId: 'p',
      aggregate: 'median',
    })
    expect(parsed.success).toBe(false)
  })

  it('the AI-proposed rollup names the relation + rolled property by NAME', () => {
    const parsed = aiPropertyDefSchema.safeParse({
      name: 'Total spent',
      type: 'rollup',
      relation: 'Purchases',
      rollupProperty: 'Amount',
      aggregate: 'sum',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.relation).toBe('Purchases')
  })

  it('is never-stored: valueSchemaFor rejects any raw value, coerceValue → null', () => {
    const d = def({ type: 'rollup' })
    expect(valueSchemaFor(d).safeParse(5).success).toBe(false)
    expect(valueSchemaFor(d).safeParse('x').success).toBe(false)
    expect(coerceValue(d, 42)).toBeNull()
    expect(emptyValue(d)).toBeNull()
  })
})

describe('addDateField — the dateless-view remedy (#292)', () => {
  it('appends a field named "date" with the minted id', () => {
    const out = addDateField(SCHEMA, () => 'new-id')
    expect(out).toEqual([...SCHEMA, { id: 'new-id', name: 'date', type: 'date' }])
  })

  it('does not mutate the input schema', () => {
    const before = [...SCHEMA]
    addDateField(SCHEMA, () => 'new-id')
    expect(SCHEMA).toEqual(before)
  })

  it('falls back to "date 2" when "date" already names another field', () => {
    const withDate: PropertySchema = [...SCHEMA, { id: 'due2', name: 'date', type: 'text' }]
    const out = addDateField(withDate, () => 'new-id')
    expect(out[out.length - 1]).toEqual({ id: 'new-id', name: 'date 2', type: 'date' })
  })
})

describe('addStatusField — the laneless-board remedy (#351)', () => {
  const mintIds = (...ids: string[]) => {
    let i = 0
    return () => ids[i++]
  }

  it('appends a "status" field carrying the three default options as minted pairs', () => {
    const out = addStatusField(SCHEMA, mintIds('field-id', 'opt-1', 'opt-2', 'opt-3'))
    expect(out).toEqual([
      ...SCHEMA,
      {
        id: 'field-id',
        name: 'status',
        type: 'status',
        options: [
          { id: 'opt-1', label: 'to do' },
          { id: 'opt-2', label: 'doing' },
          { id: 'opt-3', label: 'done' },
        ],
      },
    ])
    expect(DEFAULT_STATUS_OPTIONS).toEqual(['to do', 'doing', 'done'])
  })

  it('does not mutate the input schema', () => {
    const before = [...SCHEMA]
    addStatusField(SCHEMA, mintIds('field-id', 'opt-1', 'opt-2', 'opt-3'))
    expect(SCHEMA).toEqual(before)
  })

  it('falls back to "status 2" when "status" already names another field', () => {
    const withStatus: PropertySchema = [...SCHEMA, { id: 'other', name: 'status', type: 'text' }]
    const out = addStatusField(withStatus, mintIds('field-id', 'opt-1', 'opt-2', 'opt-3'))
    expect(out[out.length - 1].name).toBe('status 2')
  })

  it('is undone by removeField, same as addDateField', () => {
    const out = addStatusField(SCHEMA, mintIds('field-id', 'opt-1', 'opt-2', 'opt-3'))
    expect(removeField(out, 'field-id')).toEqual(SCHEMA)
  })
})

describe('addOption — the tag editor\'s "+ new tag" (#350)', () => {
  it('appends a minted {id, label} option to the named select/status field', () => {
    const { schema: out, optionId } = addOption(SCHEMA, 'stage', 'Blocked', () => 'opt-new')
    expect(optionId).toBe('opt-new')
    const stage = out.find((d) => d.id === 'stage')
    expect(stage?.options).toEqual([
      { id: 'todo', label: 'To do' },
      { id: 'done', label: 'Done', color: 'green' },
      { id: 'opt-new', label: 'Blocked' },
    ])
  })

  it('does not mutate the input schema or the field it leaves alone', () => {
    const before = JSON.parse(JSON.stringify(SCHEMA))
    const { schema: out } = addOption(SCHEMA, 'stage', 'Blocked', () => 'opt-new')
    expect(SCHEMA).toEqual(before)
    expect(out.find((d) => d.id === 'count')).toEqual(SCHEMA.find((d) => d.id === 'count'))
  })

  it('a field id that names a non-select/status type is returned unchanged, with a null optionId', () => {
    const { schema: out, optionId } = addOption(SCHEMA, 'count', 'Blocked', () => 'opt-new')
    expect(out).toEqual(SCHEMA)
    expect(optionId).toBeNull()
  })

  it('an unknown field id is returned unchanged, with a null optionId', () => {
    const { schema: out, optionId } = addOption(SCHEMA, 'nope', 'Blocked', () => 'opt-new')
    expect(out).toEqual(SCHEMA)
    expect(optionId).toBeNull()
  })
})

describe('renameField — the header menu rename row (#380)', () => {
  it('renames the field with the matching id', () => {
    const out = renameField(SCHEMA, 'due', 'deadline')
    expect(out.find((d) => d.id === 'due')).toEqual({ id: 'due', name: 'deadline', type: 'date' })
  })

  it('does not mutate the input schema', () => {
    const before = [...SCHEMA]
    renameField(SCHEMA, 'due', 'deadline')
    expect(SCHEMA).toEqual(before)
  })

  it('leaves the schema unchanged when the id is not found', () => {
    expect(renameField(SCHEMA, 'nope', 'deadline')).toEqual(SCHEMA)
  })
})

describe('isFieldNameTaken — the rename row collision guard (#380)', () => {
  it('is taken when another field already has the name, case-insensitively and trimmed', () => {
    expect(isFieldNameTaken(SCHEMA, 'DUE')).toBe(true)
    expect(isFieldNameTaken(SCHEMA, '  due  ')).toBe(true)
  })

  it('is not taken against the field’s own current name when excluded', () => {
    expect(isFieldNameTaken(SCHEMA, 'due', 'due')).toBe(false)
  })

  it('is taken against the reserved title label "Name", case-insensitively', () => {
    expect(isFieldNameTaken(SCHEMA, 'Name')).toBe(true)
    expect(isFieldNameTaken(SCHEMA, 'name')).toBe(true)
  })

  it('is not taken for a name nothing else has', () => {
    expect(isFieldNameTaken(SCHEMA, 'unused')).toBe(false)
  })
})

describe('freeFieldName — delete field’s undo name-clash fallback (#380)', () => {
  it('returns the name as-is when nothing claims it', () => {
    expect(freeFieldName(SCHEMA, 'Due', 'due')).toBe('Due')
  })

  it('falls back to "<name> 2" when another field already has the name', () => {
    const withStage2 = [...SCHEMA, { id: 'stage2', name: 'Stage', type: 'text' as const }]
    expect(freeFieldName(withStage2, 'Stage', 'stage')).toBe('Stage 2')
  })

  it('counts past "<name> 2" when that is also taken', () => {
    const taken = [
      ...SCHEMA,
      { id: 'stage2', name: 'Stage', type: 'text' as const },
      { id: 'stage3', name: 'Stage 2', type: 'text' as const },
    ]
    expect(freeFieldName(taken, 'Stage', 'stage')).toBe('Stage 3')
  })

  it('is not a collision with its own excluded id', () => {
    expect(freeFieldName(SCHEMA, 'Stage', 'stage')).toBe('Stage')
  })
})

describe('restoreFieldAt — delete field’s undo (#380)', () => {
  it('reinserts the def at its original index, preserving column order', () => {
    const removed = removeField(SCHEMA, 'due')
    const restored = restoreFieldAt(removed, 2, SCHEMA[2])
    expect(restored).toEqual(SCHEMA)
  })

  it('does not mutate the input schema', () => {
    const removed = removeField(SCHEMA, 'due')
    const before = [...removed]
    restoreFieldAt(removed, 2, SCHEMA[2])
    expect(removed).toEqual(before)
  })

  it('clamps an out-of-range index instead of throwing', () => {
    const removed = removeField(SCHEMA, 'due')
    expect(restoreFieldAt(removed, 999, SCHEMA[2]).at(-1)).toEqual(SCHEMA[2])
    expect(restoreFieldAt(removed, -5, SCHEMA[2])[0]).toEqual(SCHEMA[2])
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
