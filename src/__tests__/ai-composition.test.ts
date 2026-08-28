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
      moduleDataSchema.safeParse({ type: 'metric', label: 'Balance', value: 42 }).success
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

  it('rejects a malformed content block (metric value must be a number)', () => {
    expect(moduleDataSchema.safeParse({ type: 'metric', label: 'x', value: 'lots' }).success).toBe(
      false
    )
  })

  it('accepts a metric bound to an existing block (ticket-23 source binding)', () => {
    const r = moduleDataSchema.safeParse({
      type: 'metric',
      label: 'Books finished',
      value: 0,
      source: { blockId: 'existing-todo', kind: 'checklist-checked' },
    })
    expect(r.success).toBe(true)
  })

  it('rejects a metric binding with an unknown kind', () => {
    expect(
      moduleDataSchema.safeParse({
        type: 'metric',
        label: 'x',
        value: 0,
        source: { blockId: 'b', kind: 'sum-of-cells' },
      }).success
    ).toBe(false)
  })

  it('accepts a metric bound by a same-batch ref (ticket-31)', () => {
    const r = moduleDataSchema.safeParse({
      type: 'metric',
      label: 'Done',
      value: 0,
      source: { ref: 'chores', kind: 'checklist-checked' },
    })
    expect(r.success).toBe(true)
  })

  it('a source with both blockId and ref resolves to the blockId form (ref dropped)', () => {
    // The union's blockId branch matches first and strips the extra `ref` key, so the
    // safe, existing-block binding wins — no ambiguous both-keys source survives.
    const r = moduleDataSchema.safeParse({
      type: 'metric',
      label: 'x',
      value: 0,
      source: { blockId: 'b', ref: 'r', kind: 'table-rows' },
    })
    expect(r.success).toBe(true)
    if (r.success && r.data.type === 'metric') {
      expect(r.data.source).toEqual({ blockId: 'b', kind: 'table-rows' })
    }
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
    const r = proposeChangesSchema.safeParse({
      changes: [
        {
          op: 'create',
          bindKey: 'chores',
          data: { type: 'todo', items: [{ label: 'a', checked: false }] },
        },
        {
          op: 'create',
          data: {
            type: 'metric',
            label: 'Done',
            value: 0,
            source: { ref: 'chores', kind: 'checklist-checked' },
          },
        },
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
    for (const type of ['text', 'todo', 'metric', 'metric-ring']) {
      expect(moduleCatalog).toContain(type)
    }
  })

  it('omits the page container', () => {
    expect(moduleCatalog.split('\n').some((l) => l.startsWith('- page:'))).toBe(false)
  })

  it('teaches the metric binding, incl. same-batch ref binding (ticket-23 + ticket-31)', () => {
    const metricLine = moduleCatalog.split('\n').find((l) => l.startsWith('- metric:'))
    expect(metricLine).toBeDefined()
    expect(metricLine).toContain('source')
    expect(metricLine).toContain('checklist-checked')
    // Still teaches binding to an EXISTING block…
    expect(metricLine).toMatch(/EXISTING/i)
    // …and now the same-batch ref path that ticket-31 opened (the bindKey↔ref pairing).
    expect(metricLine).toContain('ref')
    expect(metricLine).toContain('bindKey')
    expect(metricLine).toMatch(/same batch/i)
  })

  it('scopes the bindKey teaching to where it actually works (review fix: catalog ↔ reality)', () => {
    // The original audit bug reborn: teaching key/ref where it silently drops would
    // recreate static lying metrics. bindKey now works in BOTH surfaces — the create
    // op (propose_changes) and the block entry (create_page) — and the catalog must
    // say exactly that, naming both, so the model never emits a ref anywhere it
    // would be dropped. Pinned here so a future catalog edit cannot silently
    // reopen the gap.
    const metricLine = moduleCatalog.split('\n').find((l) => l.startsWith('- metric:'))!
    expect(metricLine).toContain('propose_changes')
    expect(metricLine).toContain('create_page')
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

  it('accepts an entry without a bindKey and a ref-bound metric entry', () => {
    expect(createPageBlockSchema.safeParse({ type: 'text', content: 'hi' }).success).toBe(true)
    expect(
      createPageBlockSchema.safeParse({
        type: 'metric',
        label: 'Done',
        value: 0,
        source: { ref: 'milestones', kind: 'checklist-checked' },
      }).success
    ).toBe(true)
  })

  it('still rejects an unknown module type', () => {
    expect(createPageBlockSchema.safeParse({ type: 'chart', bindKey: 'x' }).success).toBe(false)
  })
})
