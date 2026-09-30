/**
 * t16 — the AI composition contract derived from the t12 registry.
 *
 * Proves the two auto-generated artifacts: the `data` union the model fills (closed
 * over the registry, id-less) and the `propose_changes` batch shape, plus the
 * prompt catalog. These are the emit-time structural gate (branch 7 gate 1).
 */
import {
  moduleDataSchema,
  proposeChangesSchema,
  createPageBlockSchema,
  moduleCatalog,
} from '@/lib/modules/ai-composition'
import { metricSchema } from '@/lib/modules/metric/schema'

describe('moduleDataSchema (AI-emitted module data)', () => {
  it('accepts a content block with no id', () => {
    expect(moduleDataSchema.safeParse({ type: 'text', content: 'hi' }).success).toBe(true)
    expect(
      moduleDataSchema.safeParse({ type: 'table', columns: ['A'], rows: [{ cells: ['1'] }] })
        .success
    ).toBe(true)
  })

  it('rejects an unknown module type (union is closed over the registry)', () => {
    expect(moduleDataSchema.safeParse({ type: 'chart', points: [] }).success).toBe(false)
  })

  it('rejects the page container (composition stays flat content until t18)', () => {
    expect(moduleDataSchema.safeParse({ type: 'page', blocks: [] }).success).toBe(false)
  })

  it('strips a block id the model volunteers (client mints on accept)', () => {
    const parsed = moduleDataSchema.parse({ id: 'ai-made-this', type: 'text', content: 'hi' })
    expect('id' in parsed).toBe(false)
  })

  it('strips nested todo item ids too', () => {
    const parsed = moduleDataSchema.parse({
      type: 'todo',
      items: [{ id: 'x', label: 'a', checked: false }],
    })
    expect(parsed.type === 'todo' && 'id' in parsed.items[0]).toBe(false)
  })

  it('REJECTS a kanban block — retired from creation (#19 slice 6), superseded by view board mode', () => {
    // Kanban stays renderable/persistable for read-tolerance, but the AI may no longer
    // MINT one: it's absent from the composition union, so a kanban emit fails the gate
    // (repairToolCall re-asks). A board of items is now a `view` with mode 'board'.
    expect(
      moduleDataSchema.safeParse({
        type: 'kanban',
        columns: [{ title: 'To do', cards: [{ title: 'Cut boards' }] }],
      }).success
    ).toBe(false)
  })

  it('rejects a malformed content block (a table row must carry cells)', () => {
    expect(
      moduleDataSchema.safeParse({ type: 'table', columns: ['A'], rows: [{ label: 'x' }] }).success
    ).toBe(false)
  })

  /**
   * #111 — the eight data-HOLDING display blocks left the emit union, exactly as
   * `kanban` did in #19 slice 6. Each held its own copy of the data; a chart or a
   * headline figure is now a MODE of the `view` block, aggregated from the records.
   *
   * This replaces the ticket-23/31/38 metric-binding emit tests: the model can no
   * longer author OR edit a metric, so the `source` union (same-page / cross-page /
   * child-pages / same-batch ref) has no emit surface left to pin. The PERSISTED
   * `metricSchema` — and its source forms — are still guarded below, because pages
   * that already hold a bound metric must keep rendering it.
   */
  it('REJECTS every retired data-holding display block (#111 — read-tolerant, not composable)', () => {
    const retired: unknown[] = [
      { type: 'metric', label: 'Balance', value: 42 },
      { type: 'metric', label: 'Done', value: 0, source: { ref: 'chores', kind: 'checklist-checked' } },
      { type: 'metric-ring', label: 'Progress', pct: 0.4 },
      { type: 'stat', label: 'Revenue', value: 1200 },
      { type: 'chart-line', title: 'Miles', points: [{ x: '2026-01', values: { Miles: 3 } }] },
      { type: 'chart-bar', title: 'Spend', points: [{ x: 'Rent', values: { Amount: 1 } }] },
      { type: 'chart-area', title: 'Balance', points: [{ x: '2026-01', values: { Amount: 1 } }] },
      { type: 'heatmap', title: 'Streak', cells: [{ date: '2026-01-01', value: 1 }] },
      { type: 'timeline', title: 'Plan', items: [{ label: 'Frame', start: '2026-01-01' }] },
      { type: 'kanban', columns: [] },
    ]
    for (const data of retired) {
      expect(moduleDataSchema.safeParse(data).success).toBe(false)
      expect(createPageBlockSchema.safeParse(data).success).toBe(false)
    }
  })

  it('still lets the model compose the five live content types', () => {
    const live: unknown[] = [
      { type: 'text', content: 'prose' },
      { type: 'todo', items: [{ label: 'a', checked: false }] },
      { type: 'table', columns: ['A'], rows: [{ cells: ['1'] }] },
      { type: 'view', mode: 'table' },
      { type: 'image', url: 'https://example.test/a.png' },
    ]
    for (const data of live) {
      expect(moduleDataSchema.safeParse(data).success).toBe(true)
    }
  })

  it('offers the chart + big-number VIEW modes in place of the retired blocks (#111)', () => {
    expect(
      moduleDataSchema.safeParse({
        type: 'view',
        mode: 'chart',
        chart: { kind: 'line', xProperty: 'p-date', series: [{ property: 'p-weight', agg: 'latest' }] },
      }).success
    ).toBe(true)
    expect(
      moduleDataSchema.safeParse({
        type: 'view',
        mode: 'big-number',
        bigNumber: { property: 'p-hours', agg: 'sum', format: 'number' },
      }).success
    ).toBe(true)
  })

  it('accepts a table with an opt-in sum footer (ticket-31)', () => {
    const r = moduleDataSchema.safeParse({
      type: 'table',
      columns: ['Item', 'Cost'],
      rows: [{ cells: ['Wood', '$120'] }],
      sumColumn: 1,
    })
    expect(r.success).toBe(true)
  })
})

describe('proposeChangesSchema (the tool input)', () => {
  it('accepts a create with data and no blockId', () => {
    const r = proposeChangesSchema.safeParse({
      changes: [{ op: 'create', data: { type: 'text', content: 'new' } }],
    })
    expect(r.success).toBe(true)
  })

  it('accepts an anchored create', () => {
    const r = proposeChangesSchema.safeParse({
      changes: [{ op: 'create', after: 'blk-1', data: { type: 'text', content: 'x' } }],
    })
    expect(r.success).toBe(true)
  })

  it('accepts a keyed create (batch-local bindKey for same-batch binding, ticket-31)', () => {
    // #111 retired the only module that BOUND to a bindKey (metric). The key itself is
    // still carried on a create op — the accept path still resolves ref→minted id — so
    // this pins the envelope, not the (now absent) metric consumer.
    const r = proposeChangesSchema.safeParse({
      changes: [
        {
          op: 'create',
          bindKey: 'chores',
          data: { type: 'todo', items: [{ label: 'a', checked: false }] },
        },
        { op: 'create', data: { type: 'text', content: 'Two of three done.' } },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('requires blockId on edit and remove', () => {
    expect(
      proposeChangesSchema.safeParse({
        changes: [{ op: 'edit', data: { type: 'text', content: 'x' } }],
      }).success
    ).toBe(false)
    expect(proposeChangesSchema.safeParse({ changes: [{ op: 'remove' }] }).success).toBe(false)
  })

  it('accepts a multi-op batch (create + edit + remove)', () => {
    const r = proposeChangesSchema.safeParse({
      changes: [
        { op: 'create', data: { type: 'text', content: 'a' } },
        {
          op: 'edit',
          blockId: 'b',
          data: { type: 'todo', items: [{ label: 't', checked: false }] },
        },
        { op: 'remove', blockId: 'c' },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('rejects an empty batch and an unknown op', () => {
    expect(proposeChangesSchema.safeParse({ changes: [] }).success).toBe(false)
    expect(
      proposeChangesSchema.safeParse({ changes: [{ op: 'move', blockId: 'a' }] }).success
    ).toBe(false)
  })

  // ── ticket-30: cross-page targeting + inferred split ──────────────────────
  it('accepts an optional targetPageId naming another page to edit (ticket-30)', () => {
    const r = proposeChangesSchema.safeParse({
      targetPageId: 'page-abc',
      changes: [{ op: 'edit', blockId: 'b1', data: { type: 'text', content: 'x' } }],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.targetPageId).toBe('page-abc')
  })

  it('omitting targetPageId is valid (edits the open page)', () => {
    const r = proposeChangesSchema.safeParse({
      changes: [{ op: 'create', data: { type: 'text', content: 'x' } }],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.targetPageId).toBeUndefined()
  })

  it('accepts an inferred flag on any op, and defaults it off (ticket-30)', () => {
    const r = proposeChangesSchema.safeParse({
      changes: [
        { op: 'create', data: { type: 'text', content: 'requested' } },
        {
          op: 'edit',
          blockId: 'b',
          inferred: true,
          data: { type: 'text', content: 'side-effect' },
        },
        { op: 'remove', blockId: 'c', inferred: true },
      ],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.changes[0].inferred).toBeUndefined()
      expect(r.data.changes[1].inferred).toBe(true)
      expect(r.data.changes[2].inferred).toBe(true)
    }
  })

  it('rejects a non-boolean inferred', () => {
    expect(
      proposeChangesSchema.safeParse({
        changes: [{ op: 'create', inferred: 'yes', data: { type: 'text', content: 'x' } }],
      }).success
    ).toBe(false)
  })
})

describe('moduleCatalog (prompt teaching)', () => {
  it('lists every composable content type', () => {
    for (const type of ['text', 'todo', 'table', 'view', 'image']) {
      expect(moduleCatalog.split('\n').some((l) => l.startsWith(`- ${type}:`))).toBe(true)
    }
  })

  it('omits the page container', () => {
    expect(moduleCatalog.split('\n').some((l) => l.startsWith('- page:'))).toBe(false)
  })

  it('omits kanban — retired from creation (#19 slice 6), so the prompt stops advertising it', () => {
    expect(moduleCatalog.split('\n').some((l) => l.startsWith('- kanban:'))).toBe(false)
  })

  /**
   * #111 — the catalog stops advertising every data-HOLDING display block, not just
   * kanban. This replaces the three ticket-23/31/38 metric-teaching tests: with metric
   * out of the emit union, teaching its `source` binding would advertise a capability
   * the gate rejects. The model is coached toward define_schema + add_row +
   * configure_view instead (pinned in prompt-sections.test.ts).
   */
  it('omits every retired data-holding display block (#111)', () => {
    const lines = moduleCatalog.split('\n')
    for (const type of [
      'metric',
      'metric-ring',
      'stat',
      'chart-line',
      'chart-bar',
      'chart-area',
      'heatmap',
      'timeline',
    ]) {
      expect(lines.some((l) => l.startsWith(`- ${type}:`))).toBe(false)
    }
  })

  it('teaches the view block as the way to show a database, charts and figures included', () => {
    const viewLine = moduleCatalog.split('\n').find((l) => l.startsWith('- view:'))!
    expect(viewLine).toContain('chart')
    expect(viewLine).toContain('big-number')
    // The law, stated where the model reads it: a figure is read from the records.
    expect(viewLine).toMatch(/aggregate/i)
  })
})

describe('persisted metric source schema (ticket-38 — stable forms persist, ref does not)', () => {
  const base = { id: 'm1', type: 'metric' as const, label: 'x', value: 0 }

  it('PERSISTS the cross-page form, keeping pageId (a stable reference, unlike a ref)', () => {
    const r = metricSchema.safeParse({
      ...base,
      source: { pageId: 'p', blockId: 'b', kind: 'checklist-checked' },
    })
    expect(r.success).toBe(true)
    if (r.success)
      expect(r.data.source).toEqual({ pageId: 'p', blockId: 'b', kind: 'checklist-checked' })
  })

  it('PERSISTS the child-pages aggregate form', () => {
    const r = metricSchema.safeParse({ ...base, source: { pages: 'children', kind: 'table-rows' } })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.source).toEqual({ pages: 'children', kind: 'table-rows' })
  })

  it('still REJECTS a raw ref source at persistence (the ticket-31 invariant is intact)', () => {
    // The ephemeral `ref` must never reach storage: the persisted union has no ref
    // branch, so hydration fails and the change is skipped rather than persisting a
    // dangling binding. Cross-page/aggregate are stable and DO persist — that's the
    // whole justification per the t31 precedent.
    const r = metricSchema.safeParse({
      ...base,
      source: { ref: 'chores', kind: 'checklist-checked' },
    })
    expect(r.success).toBe(false)
  })
})

describe('createPageBlockSchema (create_page block entries, ticket-31)', () => {
  it('preserves a bindKey on a block entry (a bare moduleDataSchema would strip it)', () => {
    const r = createPageBlockSchema.safeParse({
      type: 'todo',
      bindKey: 'milestones',
      items: [{ label: 'a', checked: false }],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.bindKey).toBe('milestones')
  })

  it('accepts an entry without a bindKey, and one that declares a bindKey', () => {
    expect(createPageBlockSchema.safeParse({ type: 'text', content: 'hi' }).success).toBe(true)
    // #111: the metric that USED to bind to a bindKey is retired from creation, so the
    // entry-level key is pinned on a live type instead. A scaffolded figure is a
    // big-number view over the page's own records.
    expect(
      createPageBlockSchema.safeParse({
        type: 'todo',
        bindKey: 'milestones',
        items: [{ label: 'Frame the wall', checked: false }],
      }).success
    ).toBe(true)
    expect(
      createPageBlockSchema.safeParse({
        type: 'view',
        mode: 'big-number',
        bigNumber: { agg: 'count' },
      }).success
    ).toBe(true)
  })

  it('still rejects an unknown module type', () => {
    expect(createPageBlockSchema.safeParse({ type: 'chart', bindKey: 'x' }).success).toBe(false)
  })
})
