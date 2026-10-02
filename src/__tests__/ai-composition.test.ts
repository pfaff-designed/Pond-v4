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

  it('rejects a malformed content block (a table row must carry cells)', () => {
    expect(
      moduleDataSchema.safeParse({ type: 'table', columns: ['A'], rows: [{ label: 'x' }] }).success
    ).toBe(false)
  })

  /**
   * #111 — the nine data-HOLDING display blocks are DELETED. Each held its own copy of
   * the data; a chart or a headline figure is a MODE of the `view` block, aggregated
   * from the records, and a board is its board mode.
   *
   * This replaces the ticket-23/31/38 metric-binding emit tests: the metric block and
   * its `source` union (same-page / cross-page / child-pages / same-batch ref) are gone
   * outright, so there is no emit surface and no persisted schema left to pin. The
   * emit gate is kept honest against the old names so a resurrection has to be
   * deliberate rather than accidental.
   */
  it('REJECTS every deleted data-holding display block (#111)', () => {
    const retired: unknown[] = [
      { type: 'kanban', columns: [{ title: 'To do', cards: [{ title: 'Cut boards' }] }] },
      { type: 'metric', label: 'Balance', value: 42 },
      {
        type: 'metric',
        label: 'Done',
        value: 0,
        source: { ref: 'chores', kind: 'checklist-checked' },
      },
      { type: 'metric-ring', label: 'Progress', pct: 0.4 },
      { type: 'stat', label: 'Revenue', value: 1200 },
      { type: 'chart-line', title: 'Miles', points: [{ x: '2026-01', values: { Miles: 3 } }] },
      { type: 'chart-bar', title: 'Spend', points: [{ x: 'Rent', values: { Amount: 1 } }] },
      { type: 'chart-area', title: 'Balance', points: [{ x: '2026-01', values: { Amount: 1 } }] },
      { type: 'heatmap', title: 'Streak', cells: [{ date: '2026-01-01', value: 1 }] },
      { type: 'timeline', title: 'Plan', items: [{ label: 'Frame', start: '2026-01-01' }] },
    ]
    for (const data of retired) {
      expect(moduleDataSchema.safeParse(data).success).toBe(false)
      expect(createPageBlockSchema.safeParse(data).success).toBe(false)
    }
  })

  it('still lets the model compose the seven live content types', () => {
    const live: unknown[] = [
      { type: 'text', content: 'prose' },
      { type: 'todo', items: [{ label: 'a', checked: false }] },
      { type: 'table', columns: ['A'], rows: [{ cells: ['1'] }] },
      { type: 'view', mode: 'table' },
      { type: 'image', url: 'https://example.test/a.png' },
      // #249: the kept passage — authored content, so a block (ADR 0007).
      { type: 'highlight', content: 'a line worth keeping' },
      // #250: dated prose — authored content, so a block (ADR 0007).
      { type: 'entries', entries: [{ date: '28 oct', text: 'Van booked.' }] },
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
        chart: {
          kind: 'line',
          xProperty: 'p-date',
          series: [{ property: 'p-weight', agg: 'latest' }],
        },
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
    // #111 deleted the only module that BOUND to a bindKey (metric). The key itself is
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
    for (const type of ['text', 'todo', 'table', 'view', 'image', 'highlight', 'entries']) {
      expect(moduleCatalog.split('\n').some((l) => l.startsWith(`- ${type}:`))).toBe(true)
    }
  })

  it('omits the page container', () => {
    expect(moduleCatalog.split('\n').some((l) => l.startsWith('- page:'))).toBe(false)
  })

  /**
   * #111 — the catalog cannot advertise a block that no longer exists. The model is
   * coached toward define_schema + add_row + configure_view instead (pinned in
   * prompt-sections.test.ts).
   */
  it('omits every deleted data-holding display block (#111)', () => {
    const lines = moduleCatalog.split('\n')
    for (const type of [
      'kanban',
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
    // #111: the metric that USED to bind to a bindKey is deleted, so the entry-level
    // key is pinned on a live type instead. A scaffolded figure is a big-number view
    // over the page's own records.
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
