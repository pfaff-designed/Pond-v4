/**
 * `rankTemplateRows` (KAN-138): the blank-page `templates` group ranked —
 * just-saved, then sibling-used, then your other templates, then the
 * remaining premade twelve — deduped across tiers, deleted siblings skipped.
 */
import { rankTemplateRows, type YourTemplate } from '@/components/molecules/slash-entries'
import { TEMPLATE_KINDS } from '@/lib/templates/types'

const RECIPE: YourTemplate = { id: 'recipe-id', name: 'recipe' }
const WEEKNIGHT: YourTemplate = { id: 'weeknight-id', name: 'weeknight recipe' }
const YOURS: readonly YourTemplate[] = [RECIPE, WEEKNIGHT]

describe('rankTemplateRows', () => {
  it('with no ranking data, yours lead then premade in canonical order, no hints on premade', () => {
    const rows = rankTemplateRows(YOURS)
    expect(rows.map((r) => r.id)).toEqual([
      'yours:recipe-id',
      'yours:weeknight-id',
      ...TEMPLATE_KINDS.map((k) => `premade:${k}`),
    ])
    expect(rows.filter((r) => r.template?.origin === 'yours').every((r) => r.key === 'yours')).toBe(
      true
    )
    expect(rows.filter((r) => r.template?.origin === 'premade').every((r) => r.key === undefined)).toBe(
      true
    )
  })

  it('tier 1: a just-saved template leads with its hint, ahead of sibling ranking', () => {
    const rows = rankTemplateRows(YOURS, ['premade:journal'], 'weeknight-id', 'recipes')
    expect(rows[0]).toMatchObject({ id: 'yours:weeknight-id', key: 'yours · just saved' })
    expect(rows[1]).toMatchObject({ id: 'premade:journal', key: 'used in recipes' })
  })

  it('tier 2: sibling ranking order, yours hinted `yours · used in {parent}`, premade `used in {parent}`', () => {
    const rows = rankTemplateRows(YOURS, ['premade:journal', 'recipe-id'], null, 'recipes')
    expect(rows[0]).toMatchObject({ id: 'premade:journal', key: 'used in recipes' })
    expect(rows[1]).toMatchObject({ id: 'yours:recipe-id', key: 'yours · used in recipes' })
  })

  it('tier 3: your other templates (not just-saved, not in sibling ranking) hinted plain `yours`', () => {
    const rows = rankTemplateRows(YOURS, ['recipe-id'], null, 'recipes')
    const weeknight = rows.find((r) => r.id === 'yours:weeknight-id')
    expect(weeknight).toMatchObject({ key: 'yours' })
  })

  it('tier 4: the remaining premade twelve in canonical order, no hint', () => {
    const rows = rankTemplateRows(YOURS, ['premade:journal'], null, 'recipes')
    const premadeIds = rows.filter((r) => r.template?.origin === 'premade').map((r) => r.id)
    expect(premadeIds).toEqual([
      'premade:journal',
      ...TEMPLATE_KINDS.filter((k) => k !== 'journal').map((k) => `premade:${k}`),
    ])
    const page = rows.find((r) => r.id === 'premade:page')
    expect(page?.key).toBeUndefined()
  })

  it('dedupes across tiers: a just-saved id in sibling ranking is not repeated', () => {
    const rows = rankTemplateRows(YOURS, ['weeknight-id', 'recipe-id'], 'weeknight-id', 'recipes')
    const ids = rows.map((r) => r.id)
    expect(ids.filter((id) => id === 'yours:weeknight-id')).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'yours:weeknight-id', key: 'yours · just saved' })
    expect(rows[1]).toMatchObject({ id: 'yours:recipe-id', key: 'yours · used in recipes' })
  })

  it('a premade id repeated in sibling ranking is not duplicated either', () => {
    const rows = rankTemplateRows(YOURS, ['premade:journal', 'premade:journal'], null, 'recipes')
    expect(rows.filter((r) => r.id === 'premade:journal')).toHaveLength(1)
  })

  it('skips a sibling-ranking id with no matching row (a deleted `yours` template), rather than throwing', () => {
    expect(() => rankTemplateRows(YOURS, ['deleted-id'], null, 'recipes')).not.toThrow()
    const rows = rankTemplateRows(YOURS, ['deleted-id'], null, 'recipes')
    expect(rows.some((r) => r.id === 'yours:deleted-id')).toBe(false)
    expect(rows.map((r) => r.id)).toEqual([
      'yours:recipe-id',
      'yours:weeknight-id',
      ...TEMPLATE_KINDS.map((k) => `premade:${k}`),
    ])
  })

  it('skips a sibling-ranking id naming a premade kind that does not exist, rather than throwing', () => {
    expect(() => rankTemplateRows(YOURS, ['premade:nonexistent'], null, 'recipes')).not.toThrow()
    const rows = rankTemplateRows(YOURS, ['premade:nonexistent'], null, 'recipes')
    expect(rows.some((r) => r.id === 'premade:nonexistent')).toBe(false)
  })

  it('a just-saved id with no matching `yours` row is skipped, not thrown', () => {
    expect(() => rankTemplateRows(YOURS, [], 'missing-id', 'recipes')).not.toThrow()
    const rows = rankTemplateRows(YOURS, [], 'missing-id', 'recipes')
    expect(rows.map((r) => r.id)).toEqual([
      'yours:recipe-id',
      'yours:weeknight-id',
      ...TEMPLATE_KINDS.map((k) => `premade:${k}`),
    ])
  })

  it('with no parent title, the sibling-used hint falls back to `used` without `in {parent}`', () => {
    const rows = rankTemplateRows(YOURS, ['premade:journal', 'recipe-id'], null, null)
    expect(rows[0]).toMatchObject({ id: 'premade:journal', key: 'used' })
    expect(rows[1]).toMatchObject({ id: 'yours:recipe-id', key: 'yours · used' })
  })
})
