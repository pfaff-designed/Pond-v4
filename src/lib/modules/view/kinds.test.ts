/**
 * The ＋ view required-field contract (KAN-243): which kinds need a `status`/
 * `select` or `date` property to draw anything but their own remedy notice, and
 * the picker's remedy hint when a database lacks it.
 */
import { addViewRemedyLine, hasRequiredField, VIEW_KIND_REQUIREMENT, VIEW_KINDS } from './kinds'
import type { ViewMode } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'

const def = (id: string, type: PropertySchema[number]['type']): PropertySchema[number] => ({
  id,
  name: id,
  type,
})

const NO_FIELDS: PropertySchema = [def('p-text', 'text')]
const STATUS_ONLY: PropertySchema = [def('p-status', 'status')]
const SELECT_ONLY: PropertySchema = [def('p-select', 'select')]
const DATE_ONLY: PropertySchema = [def('p-date', 'date')]
const ALL: PropertySchema = [def('p-status', 'status'), def('p-select', 'select'), def('p-date', 'date')]

describe('hasRequiredField', () => {
  const schemas: Array<[string, PropertySchema]> = [
    ['no status/select/date', NO_FIELDS],
    ['a status', STATUS_ONLY],
    ['a select', SELECT_ONLY],
    ['a date', DATE_ONLY],
    ['all three', ALL],
  ]

  it.each(
    (Object.keys(VIEW_KINDS) as ViewMode[]).flatMap((mode) =>
      schemas.map(([label, schema]) => [mode, label, schema] as const)
    )
  )('%s over a schema with %s', (mode, _label, schema) => {
    const need = VIEW_KIND_REQUIREMENT[mode]
    const expected =
      !need || schema.some((d) => d.type === need || (need === 'status' && d.type === 'select'))
    expect(hasRequiredField(mode, schema)).toBe(expected)
  })

  it('is always true for a mode with no entry in VIEW_KIND_REQUIREMENT', () => {
    for (const mode of ['table', 'list', 'gallery', 'chart', 'big-number'] as const) {
      expect(VIEW_KIND_REQUIREMENT[mode]).toBeUndefined()
      expect(hasRequiredField(mode, NO_FIELDS)).toBe(true)
    }
  })

  it('a board is satisfied by a select even with no status property', () => {
    expect(hasRequiredField('board', SELECT_ONLY)).toBe(true)
    expect(hasRequiredField('board', NO_FIELDS)).toBe(false)
  })

  it('calendar and gantt need a date, not a status/select', () => {
    expect(hasRequiredField('calendar', STATUS_ONLY)).toBe(false)
    expect(hasRequiredField('calendar', DATE_ONLY)).toBe(true)
    expect(hasRequiredField('gantt', STATUS_ONLY)).toBe(false)
    expect(hasRequiredField('gantt', DATE_ONLY)).toBe(true)
  })
})

describe('addViewRemedyLine', () => {
  it('reads "add a status field to use board"', () => {
    expect(addViewRemedyLine('board')).toBe('add a status field to use board')
  })

  it('reads "add a date field to use calendar"', () => {
    expect(addViewRemedyLine('calendar')).toBe('add a date field to use calendar')
  })

  it('reads "add a date field to use timeline" (gantt\'s label)', () => {
    expect(addViewRemedyLine('gantt')).toBe('add a date field to use timeline')
  })
})
