/**
 * Unit tests for the template store (src/lib/templates/client.ts, issue #154).
 *
 * Mirrors the mocked-chain approach in pages-client.test.ts — no live Supabase.
 * Verifies the CRUD surface every other Phase 4 slice builds on:
 *   - listTemplates        (per pond; [] on a fresh pond)
 *   - getTemplate          (by id, null when missing)
 *   - createTemplate       (insert; 23505 → DuplicateTemplateNameError, NO auto-suffix)
 *   - renameTemplate       (update name; 23505 → DuplicateTemplateNameError)
 *   - saveTemplateBlocks   (whole block array written on save)
 *   - deleteTemplate       (by id)
 */

import {
  TEMPLATE_COLUMNS,
  DuplicateTemplateNameError,
  listTemplates,
  getTemplate,
  createTemplate,
  renameTemplate,
  saveTemplateBlocks,
  deleteTemplate,
} from '@/lib/templates/client'
import type { Block } from '@/lib/modules/content'

// ── Chain mock helpers ──────────────────────────────────────────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

function makeSupabase(chain = makeChain()) {
  return { from: jest.fn().mockReturnValue(chain), _chain: chain }
}

const sampleBlocks: Block[] = [
  { id: 'b1', type: 'text', content: '# Agenda' },
  { id: 'b2', type: 'todo', items: [{ id: 'i1', label: 'Decide', checked: false }] },
]

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    name: 'Weekly review',
    kind: 'meeting notes',
    blocks: sampleBlocks,
    origin: 'yours',
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
    ...overrides,
  }
}

// ── listTemplates ─────────────────────────────────────────────────────────────

describe('listTemplates', () => {
  it('reads the pond scope and maps rows to PondTemplate', async () => {
    const rows = [templateRow(), templateRow({ id: 'tpl-2', name: 'Habit', kind: 'habit' })]
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: rows, error: null }) })
    const sb = makeSupabase(chain)

    const out = await listTemplates(sb as never, 'user-1', 'sandbox')

    expect(sb.from).toHaveBeenCalledWith('templates')
    expect(chain.select).toHaveBeenCalledWith(TEMPLATE_COLUMNS)
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      id: 'tpl-1',
      name: 'Weekly review',
      kind: 'meeting notes',
      blocks: sampleBlocks,
      origin: 'yours',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    })
    expect(out[1]).toMatchObject({ id: 'tpl-2', kind: 'habit' })
  })

  it('returns [] on a fresh pond without throwing (premade are code constants, not rows)', async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)
    await expect(listTemplates(sb as never, 'user-1')).resolves.toEqual([])
  })

  it('coerces a non-array blocks column to []', async () => {
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: [templateRow({ blocks: null })], error: null }),
    })
    const out = await listTemplates(makeSupabase(chain) as never, 'user-1')
    expect(out[0].blocks).toEqual([])
  })

  it('throws (no silent swallow) when the read errors', async () => {
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: null, error: { message: 'read boom' } }),
    })
    await expect(listTemplates(makeSupabase(chain) as never, 'user-1')).rejects.toThrow(/read boom/)
  })

  it('refuses a row whose kind is outside the vocabulary (the DB CHECK makes this a future-migration row)', async () => {
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: [templateRow({ kind: 'recipe' })], error: null }),
    })
    await expect(listTemplates(makeSupabase(chain) as never, 'user-1')).rejects.toThrow(/recipe/)
  })
})

// ── getTemplate ───────────────────────────────────────────────────────────────

describe('getTemplate', () => {
  it('returns one template by id', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: templateRow(), error: null }),
    })
    const sb = makeSupabase(chain)

    const out = await getTemplate(sb as never, 'tpl-1')

    expect(sb.from).toHaveBeenCalledWith('templates')
    expect(chain.eq).toHaveBeenCalledWith('id', 'tpl-1')
    expect(out).toMatchObject({ id: 'tpl-1', name: 'Weekly review', origin: 'yours' })
  })

  it('returns null when the template does not exist', async () => {
    const sb = makeSupabase(makeChain())
    expect(await getTemplate(sb as never, 'missing')).toBeNull()
  })

  it('throws when the read errors', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'get boom' } }),
    })
    await expect(getTemplate(makeSupabase(chain) as never, 'tpl-1')).rejects.toThrow(/get boom/)
  })
})

// ── createTemplate ────────────────────────────────────────────────────────────

describe('createTemplate — the pond is always stamped (KAN-10)', () => {
  /**
   * A template with a null `pond_id` is invisible: `listTemplates` filters on the
   * pond, so the row is saved and gone. Worse, `templates_name_uniq` is keyed
   * `(pond_id, lower(btrim(name)))` and NULLs are DISTINCT in a unique index — so
   * two null-pond templates with the same name do not even collide.
   *
   * This is not theoretical. Found in the browser on 2026-10-04: a `?pond=` naming
   * a pond that had since been deleted makes `resolveActivePond` return null by
   * design (it never substitutes another pond silently), so the whole shell runs
   * unscoped and hands `createTemplate` a null. Two invisible duplicates landed,
   * and nothing anywhere went red — every unit test, the pglite suite and the
   * browser all looked fine.
   *
   * `createPage` already guards this the same way; templates did not.
   */
  it('resolves the person’s first pond when the caller has none', async () => {
    const ponds = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'pond-first' }, error: null }),
    })
    const templates = makeChain({
      single: jest.fn().mockResolvedValue({ data: templateRow(), error: null }),
    })
    const sb = {
      from: jest.fn((table: string) => (table === 'ponds' ? ponds : templates)),
    }

    await createTemplate(sb as never, 'user-1', { name: 'Weekly review', kind: 'page' })

    expect(templates.insert.mock.calls[0][0]).toMatchObject({ pond_id: 'pond-first' })
  })

  it('prefers the pond the caller names over the fallback', async () => {
    const ponds = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'pond-first' }, error: null }),
    })
    const templates = makeChain({
      single: jest.fn().mockResolvedValue({ data: templateRow(), error: null }),
    })
    const sb = { from: jest.fn((t: string) => (t === 'ponds' ? ponds : templates)) }

    await createTemplate(sb as never, 'user-1', {
      name: 'Weekly review',
      kind: 'page',
      pondId: 'pond-named',
    })

    expect(templates.insert.mock.calls[0][0]).toMatchObject({ pond_id: 'pond-named' })
    // The fallback is not even consulted when the caller knows its pond.
    expect(sb.from).not.toHaveBeenCalledWith('ponds')
  })

  it('still writes when there is genuinely no pond — before 0018, or no row yet', async () => {
    // `firstPondId` answers null on ANY failure, which means "no pond scope" —
    // the behaviour every caller had before ponds existed. The template is still
    // saved rather than the save failing.
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: templateRow(), error: null }),
    })
    const sb = makeSupabase(chain)

    await createTemplate(sb as never, 'user-1', { name: 'Weekly review', kind: 'page' })

    expect(chain.insert.mock.calls[0][0]).not.toHaveProperty('pond_id')
  })
})

describe('createTemplate', () => {
  it('inserts user_id, name, kind, blocks and origin, returning the saved row', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: templateRow({ id: 'tpl-new' }), error: null }),
    })
    const sb = makeSupabase(chain)

    const out = await createTemplate(sb as never, 'user-1', {
      name: 'Weekly review',
      kind: 'meeting notes',
      blocks: sampleBlocks,
      origin: 'yours',
    })

    expect(sb.from).toHaveBeenCalledWith('templates')
    expect(chain.insert.mock.calls[0][0]).toEqual({
      user_id: 'user-1',
      name: 'Weekly review',
      kind: 'meeting notes',
      blocks: sampleBlocks,
      origin: 'yours',
    })
    expect(chain.select).toHaveBeenCalledWith(TEMPLATE_COLUMNS)
    expect(out.id).toBe('tpl-new')
    expect(out.blocks).toEqual(sampleBlocks)
  })

  it("defaults blocks to [] and origin to 'yours'", async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: templateRow(), error: null }),
    })
    await createTemplate(makeSupabase(chain) as never, 'user-1', { name: 'Habit', kind: 'habit' })
    expect(chain.insert.mock.calls[0][0]).toMatchObject({
      blocks: [],
      origin: 'yours',
    })
  })

  it('raises DuplicateTemplateNameError on a same-pond name collision (23505) and does NOT auto-suffix', async () => {
    const chain = makeChain({
      single: jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } }),
    })
    const sb = makeSupabase(chain)

    const attempt = createTemplate(sb as never, 'user-1', { name: 'Weekly review', kind: 'notes' })

    await expect(attempt).rejects.toBeInstanceOf(DuplicateTemplateNameError)
    await expect(attempt).rejects.toMatchObject({ templateName: 'Weekly review' })
    // Unlike createPage (#84), a template name is the user's to resolve: one
    // insert, no " 2" retry.
    expect(chain.insert).toHaveBeenCalledTimes(1)
  })

  it('throws a plain Error on any other insert failure', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'insert boom' } }),
    })
    await expect(
      createTemplate(makeSupabase(chain) as never, 'user-1', { name: 'X', kind: 'page' })
    ).rejects.toThrow(/insert boom/)
  })

  it('throws when the insert returns neither a row nor an error', async () => {
    const chain = makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: null }) })
    await expect(
      createTemplate(makeSupabase(chain) as never, 'user-1', { name: 'X', kind: 'page' })
    ).rejects.toThrow()
  })
})

// ── renameTemplate ────────────────────────────────────────────────────────────

describe('renameTemplate', () => {
  it('updates the name and bumps updated_at', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await renameTemplate(sb as never, 'tpl-1', 'Monthly review')

    expect(sb.from).toHaveBeenCalledWith('templates')
    const patch = chain.update.mock.calls[0][0]
    expect(patch.name).toBe('Monthly review')
    expect(typeof patch.updated_at).toBe('string')
    expect(chain.eq).toHaveBeenCalledWith('id', 'tpl-1')
  })

  it('maps a 23505 collision to DuplicateTemplateNameError', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } }),
    })
    await expect(
      renameTemplate(makeSupabase(chain) as never, 'tpl-1', 'Taken')
    ).rejects.toBeInstanceOf(DuplicateTemplateNameError)
  })

  it('throws on any other update failure', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'rename boom' } }),
    })
    await expect(renameTemplate(makeSupabase(chain) as never, 'tpl-1', 'X')).rejects.toThrow(
      /rename boom/
    )
  })
})

// ── saveTemplateBlocks ────────────────────────────────────────────────────────

describe('saveTemplateBlocks', () => {
  it('writes the entire block array and bumps updated_at', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await saveTemplateBlocks(sb as never, 'tpl-1', sampleBlocks)

    expect(sb.from).toHaveBeenCalledWith('templates')
    const patch = chain.update.mock.calls[0][0]
    expect(patch.blocks).toEqual(sampleBlocks)
    expect(typeof patch.updated_at).toBe('string')
    expect(chain.eq).toHaveBeenCalledWith('id', 'tpl-1')
  })

  it('throws when the update errors', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'save boom' } }),
    })
    await expect(saveTemplateBlocks(makeSupabase(chain) as never, 'tpl-1', [])).rejects.toThrow(
      /save boom/
    )
  })
})

// ── deleteTemplate ────────────────────────────────────────────────────────────

describe('deleteTemplate', () => {
  it('deletes by id — and touches ONLY the templates table (pages keep their stamps)', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await deleteTemplate(sb as never, 'tpl-1')

    expect(sb.from).toHaveBeenCalledTimes(1)
    expect(sb.from).toHaveBeenCalledWith('templates')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'tpl-1')
    expect(chain.update).not.toHaveBeenCalled()
  })

  it('throws when the delete errors', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'del boom' } }),
    })
    await expect(deleteTemplate(makeSupabase(chain) as never, 'tpl-1')).rejects.toThrow(/del boom/)
  })
})

// ── DuplicateTemplateNameError ────────────────────────────────────────────────

describe('DuplicateTemplateNameError', () => {
  it('is a typed Error carrying the colliding name', () => {
    const err = new DuplicateTemplateNameError('Weekly review')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('DuplicateTemplateNameError')
    expect(err.templateName).toBe('Weekly review')
    expect(err.message).toMatch(/Weekly review/)
  })
})
