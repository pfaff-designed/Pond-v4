import { filterHead, seedFromFilter } from './filter-seed'
import type { ViewFilter } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'To do' },
      { id: 'o-doing', label: 'Doing' },
    ],
  },
  {
    id: 'p-project',
    name: 'project',
    type: 'select',
    options: [
      { id: 'o-reno', label: 'Home Reno' },
      { id: 'o-web', label: 'Web design' },
    ],
  },
  { id: 'p-done', name: 'Done', type: 'checkbox' },
  { id: 'p-title', name: 'Title', type: 'text' },
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-count', name: 'Count', type: 'number' },
  { id: 'p-rel', name: 'Related', type: 'relation' },
]

describe('seedFromFilter', () => {
  it.each<[string, ViewFilter | undefined, Record<string, unknown>]>([
    ['no filter', undefined, {}],
    [
      'select eq, option present → the option id',
      { property: 'p-project', op: 'eq', value: 'o-reno' },
      { 'p-project': 'o-reno' },
    ],
    [
      'select eq by label, option present → the option id',
      { property: 'p-project', op: 'eq', value: 'Home Reno' },
      { 'p-project': 'o-reno' },
    ],
    [
      'select eq, option missing → {}',
      { property: 'p-project', op: 'eq', value: 'o-gone' },
      {},
    ],
    [
      'status eq, option present → the option id',
      { property: 'p-status', op: 'eq', value: 'o-todo' },
      { 'p-status': 'o-todo' },
    ],
    [
      'status eq, option missing → {}',
      { property: 'p-status', op: 'eq', value: 'o-gone' },
      {},
    ],
    [
      'select neq (other op) → {}',
      { property: 'p-project', op: 'neq', value: 'o-reno' },
      {},
    ],
    [
      'select contains (other op) → {}',
      { property: 'p-project', op: 'contains', value: 'Home' },
      {},
    ],
    [
      'checkbox eq true-ish → boolean true',
      { property: 'p-done', op: 'eq', value: 'true' },
      { 'p-done': true },
    ],
    [
      'checkbox eq checked → boolean true',
      { property: 'p-done', op: 'eq', value: 'checked' },
      { 'p-done': true },
    ],
    [
      'checkbox eq other value → boolean false',
      { property: 'p-done', op: 'eq', value: 'no' },
      { 'p-done': false },
    ],
    [
      'checkbox neq (other op) → {}',
      { property: 'p-done', op: 'neq', value: 'true' },
      {},
    ],
    [
      'text eq → the string',
      { property: 'p-title', op: 'eq', value: 'buy tiles' },
      { 'p-title': 'buy tiles' },
    ],
    [
      'text contains (other op) → {}',
      { property: 'p-title', op: 'contains', value: 'buy' },
      {},
    ],
    [
      'date eq → {}',
      { property: 'p-due', op: 'eq', value: '2026-10-24' },
      {},
    ],
    [
      'number eq → {}',
      { property: 'p-count', op: 'eq', value: '3' },
      {},
    ],
    [
      'relation eq → {}',
      { property: 'p-rel', op: 'eq', value: 'row-1' },
      {},
    ],
    [
      'eq on an unknown property → {}',
      { property: 'p-missing', op: 'eq', value: 'x' },
      {},
    ],
  ])('%s', (_label, filter, expected) => {
    expect(seedFromFilter(schema, filter)).toEqual(expected)
  })
})

describe('filterHead', () => {
  it.each<[string, ViewFilter | undefined, string]>([
    ['no filter → the name alone', undefined, 'tasks'],
    [
      'select eq, option present → name · label',
      { property: 'p-project', op: 'eq', value: 'o-reno' },
      'tasks · Home Reno',
    ],
    [
      'select eq by label → name · label',
      { property: 'p-project', op: 'eq', value: 'Home Reno' },
      'tasks · Home Reno',
    ],
    [
      'status eq, option present → name · label',
      { property: 'p-status', op: 'eq', value: 'o-todo' },
      'tasks · To do',
    ],
    [
      'select eq, option missing → the name alone',
      { property: 'p-project', op: 'eq', value: 'o-gone' },
      'tasks',
    ],
    [
      'select neq (other op) → the name alone',
      { property: 'p-project', op: 'neq', value: 'o-reno' },
      'tasks',
    ],
    [
      'checkbox eq (not a choice field) → the name alone',
      { property: 'p-done', op: 'eq', value: 'true' },
      'tasks',
    ],
    [
      'text eq (not a choice field) → the name alone',
      { property: 'p-title', op: 'eq', value: 'buy tiles' },
      'tasks',
    ],
    [
      'eq on an unknown property → the name alone',
      { property: 'p-missing', op: 'eq', value: 'x' },
      'tasks',
    ],
  ])('%s', (_label, filter, expected) => {
    expect(filterHead('tasks', schema, filter)).toBe(expected)
  })
})
