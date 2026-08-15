/**
 * t16 — the AI composition contract derived from the t12 registry.
 *
 * Proves the two auto-generated artifacts: the `data` union the model fills (closed
 * over the registry, id-less) and the `propose_changes` batch shape, plus the
 * prompt catalog. These are the emit-time structural gate (branch 7 gate 1).
 */
import { moduleDataSchema, proposeChangesSchema, moduleCatalog } from '@/lib/modules/ai-composition'

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
})
