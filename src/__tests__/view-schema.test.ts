/**
 * The `view` block (#19) — config-only inline view of a collection's rows.
 *
 * Guards two things: (1) the persisted schema is config only and round-trips its
 * optional clauses (mode/groupBy/sort/filter/collectionId), and (2) `serialize`
 * renders every config clause (the AI re-emits it) plus the transiently-injected
 * row titles, and degrades honestly when a linked view isn't hydrated.
 */
import {
  viewSchema,
  viewDescriptor,
  type ViewBlock,
  type HydratedViewBlock,
} from '@/lib/modules/view/schema'

const base: ViewBlock = { id: 'v1', type: 'view', mode: 'table' }

describe('viewSchema (persisted, config-only)', () => {
  it('accepts a bare view (mode only)', () => {
    expect(viewSchema.safeParse(base).success).toBe(true)
  })

  it('round-trips every optional clause', () => {
    const full: ViewBlock = {
      id: 'v1',
      type: 'view',
      mode: 'board',
      groupBy: 'p-status',
      sort: { key: 'p-due', dir: 'asc' },
      filter: { property: 'p-status', op: 'eq', value: 'o-doing' },
      collectionId: 'coll-9',
    }
    const parsed = viewSchema.safeParse(full)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toEqual(full)
  })

  it('rejects an unknown mode and an unknown filter op', () => {
    expect(viewSchema.safeParse({ ...base, mode: 'timeline' }).success).toBe(false)
    expect(
      viewSchema.safeParse({ ...base, filter: { property: 'p', op: 'between', value: 'x' } })
        .success
    ).toBe(false)
  })

  it('does not carry rows (config only — rows are child pages)', () => {
    const parsed = viewSchema.parse({ ...base, rows: [{ id: 'r1', title: 'x' }] } as unknown)
    expect('rows' in parsed).toBe(false)
  })
})

describe('viewDescriptor.serialize', () => {
  const withRows = (b: ViewBlock, titles: string[]): HydratedViewBlock => ({
    ...b,
    rows: titles.map((t, i) => ({ id: `r${i}`, title: t })),
  })

  it('renders mode + injected row titles', () => {
    const out = viewDescriptor.serialize(withRows(base, ['Dune', 'Hyperion']) as ViewBlock)
    expect(out).toContain('table')
    expect(out).toContain('2 rows')
    expect(out).toContain('Dune')
    expect(out).toContain('Hyperion')
  })

  it('renders each config clause so a re-emit preserves it', () => {
    const out = viewDescriptor.serialize({
      ...base,
      mode: 'board',
      groupBy: 'p-status',
      sort: { key: 'p-due', dir: 'desc' },
      filter: { property: 'p-status', op: 'neq', value: 'o-done' },
    })
    expect(out).toContain('board')
    expect(out).toContain('grouped by p-status')
    expect(out).toContain('sorted by p-due desc')
    expect(out).toContain('filtered p-status neq o-done')
  })

  it('hydrates a linked view over another collection (#41 — was stubbed)', () => {
    // The linked target's rows are injected by the assemble seam before serialize,
    // exactly like an inline view. The config still names the linked collection so a
    // re-emit preserves it — but the "(not yet hydrated)" stub is gone.
    const out = viewDescriptor.serialize(
      withRows({ ...base, collectionId: 'coll-9' }, ['Dune', 'Hyperion']) as ViewBlock
    )
    expect(out).toContain('coll-9')
    expect(out).toContain('2 rows')
    expect(out).toContain('Dune')
    expect(out).not.toContain('not yet hydrated')
  })

  it('says "no rows" when nothing is injected', () => {
    expect(viewDescriptor.serialize(base)).toContain('no rows')
  })

  it('uses singular "row" for exactly one', () => {
    const out = viewDescriptor.serialize(withRows(base, ['Solo']) as ViewBlock)
    expect(out).toMatch(/\b1 row\b/)
    expect(out).not.toContain('1 rows')
  })
})
