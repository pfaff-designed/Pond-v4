/**
 * The change-log write layer (issue #102, spec #110) — src/lib/change-log/store.ts.
 *
 * Mirrors the mocked-chain approach in pages-client.test.ts: no live Supabase.
 * The DATABASE half of the only-grows contract is proved for real in
 * change-log.pglite.test.ts; this file proves the half the store owns —
 *   - a proposal persists the before/after SNAPSHOT, not just a decision;
 *   - an advance appends to `transitions` and never replaces it;
 *   - an illegal advance throws before any write is issued;
 *   - revise / revert / undo INSERT and link rather than update;
 *   - the module exposes no delete verb at all.
 */

import * as store from '@/lib/change-log/store'
import { IllegalTransitionError } from '@/lib/change-log/status'
import type { ChangeLogRow } from '@/lib/change-log/types'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const USER = 'user-1'

// ── Chain mock ───────────────────────────────────────────────────────────────

function row(overrides: Partial<ChangeLogRow> = {}): ChangeLogRow {
  return {
    id: 'rec-1',
    user_id: USER,
    workspace: 'main',
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    target_page_id: 'page-1',
    target_block_id: 'b1',
    before: { id: 'b1', type: 'text', content: 'old' },
    after: { id: 'b1', type: 'text', content: 'new' },
    source_thread_id: 'thread-1',
    tool_call_id: 'call-1',
    read: null,
    links: {},
    transitions: [{ status: 'proposed', at: '2026-01-01T00:00:00.000Z', actor: 'pond' }],
    created_at: '2026-01-01T00:00:00.000Z',
    status_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** A supabase double whose builder is one chainable, awaitable object. */
function makeSupabase(
  opts: {
    single?: ChangeLogRow
    maybeSingle?: ChangeLogRow | null
    list?: ChangeLogRow[]
    count?: number
    rpc?: unknown
    rpcError?: unknown
  } = {}
) {
  const chain: Record<string, jest.Mock> & { then?: unknown } = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    single: jest.fn(async () => ({ data: opts.single ?? row(), error: null })),
    maybeSingle: jest.fn(async () => ({
      data: opts.maybeSingle === undefined ? row() : opts.maybeSingle,
      error: null,
    })),
  }
  // Awaiting the chain (listRecords / countProposed) resolves here.
  chain.then = (resolve_: (v: unknown) => void) =>
    resolve_({ data: opts.list ?? [], error: null, count: opts.count ?? 0 })

  const supabase = {
    from: jest.fn(() => chain),
    rpc: jest.fn(async () => ({
      data: opts.rpc ?? row({ status: 'accepted' }),
      error: opts.rpcError ?? null,
    })),
    _chain: chain,
  }
  return supabase
}

/** The payload handed to .insert() / .update() on the last call. */
function writtenTo(sb: ReturnType<typeof makeSupabase>, verb: 'insert' | 'update') {
  const calls = sb._chain[verb].mock.calls
  return calls[calls.length - 1][0] as Record<string, unknown>
}

// ── Appends ──────────────────────────────────────────────────────────────────

describe('appendProposal', () => {
  it('persists the full before/after snapshot, not just a decision', async () => {
    const sb = makeSupabase()
    await store.appendProposal(sb as never, {
      userId: USER,
      action: 'edit',
      targetPageId: 'page-1',
      targetBlockId: 'b1',
      before: { id: 'b1', type: 'text', content: 'old' },
      after: { id: 'b1', type: 'text', content: 'new' },
      sourceThreadId: 'thread-1',
      toolCallId: 'call-1',
    })

    expect(sb.from).toHaveBeenCalledWith('change_log')
    const insert = writtenTo(sb, 'insert')
    expect(insert.status).toBe('proposed')
    expect(insert.actor).toBe('pond')
    expect(insert.before).toEqual({ id: 'b1', type: 'text', content: 'old' })
    expect(insert.after).toEqual({ id: 'b1', type: 'text', content: 'new' })
    // The transcript ↔ log link, so a card can be re-derived on reload.
    expect(insert.source_thread_id).toBe('thread-1')
    expect(insert.tool_call_id).toBe('call-1')
  })

  it('stamps the birth status as the first transition', async () => {
    const sb = makeSupabase()
    await store.appendProposal(sb as never, { userId: USER, action: 'create_page' })
    const transitions = writtenTo(sb, 'insert').transitions as { status: string; actor: string }[]
    expect(transitions).toHaveLength(1)
    expect(transitions[0].status).toBe('proposed')
    expect(transitions[0].actor).toBe('pond')
  })

  it('defaults the pond scope to main and carries sandbox through', async () => {
    const sb = makeSupabase()
    await store.appendProposal(sb as never, { userId: USER, action: 'edit' })
    expect(writtenTo(sb, 'insert').workspace).toBe('main')

    await store.appendProposal(sb as never, { userId: USER, action: 'edit', workspace: 'sandbox' })
    expect(writtenTo(sb, 'insert').workspace).toBe('sandbox')
  })
})

describe('appendOwnEdit', () => {
  it('lands a person’s own edit directly as accepted, by you', async () => {
    const sb = makeSupabase({ single: row({ status: 'accepted', actor: 'you' }) })
    const record = await store.appendOwnEdit(sb as never, {
      userId: USER,
      action: 'edit',
      targetPageId: 'page-1',
      after: { id: 'b1', type: 'text', content: 'typed' },
    })

    const insert = writtenTo(sb, 'insert')
    expect(insert.status).toBe('accepted') // never sits as a proposal
    expect(insert.actor).toBe('you')
    expect(record.status).toBe('accepted')
  })
})

describe('reviseRecord', () => {
  it('inserts a NEW proposed record linked to the original, touching nothing', async () => {
    const sb = makeSupabase()
    const original = store.mapChangeLogRow(row({ id: 'rec-1', status: 'changes_requested' }))

    await store.reviseRecord(sb as never, original, {
      action: 'edit',
      targetPageId: 'page-1',
      before: { content: 'old' },
      after: { content: 'revised' },
    })

    const insert = writtenTo(sb, 'insert')
    expect(insert.status).toBe('proposed')
    expect(insert.links).toEqual({ revised_from: 'rec-1' })
    expect(insert.user_id).toBe(USER)
    // The original is never rewritten — only an insert was issued.
    expect(sb._chain.update).not.toHaveBeenCalled()
  })

  it('revises an outdated record too', async () => {
    const sb = makeSupabase()
    const original = store.mapChangeLogRow(row({ status: 'outdated' }))
    await expect(
      store.reviseRecord(sb as never, original, { action: 'edit' })
    ).resolves.toBeTruthy()
  })

  it('refuses to revise anything else', async () => {
    const sb = makeSupabase()
    for (const status of ['proposed', 'accepted', 'rejected', 'withdrawn'] as const) {
      const original = store.mapChangeLogRow(row({ status }))
      await expect(store.reviseRecord(sb as never, original, { action: 'edit' })).rejects.toThrow(
        /only a changes_requested or outdated record is revised/
      )
    }
    expect(sb._chain.insert).not.toHaveBeenCalled()
  })
})

// ── Advances ─────────────────────────────────────────────────────────────────

describe('advanceStatus', () => {
  it('appends to the transition audit rather than replacing it', async () => {
    const sb = makeSupabase({
      maybeSingle: row({ status: 'proposed' }),
      single: row({ status: 'rejected' }),
    })
    await store.advanceStatus(sb as never, 'rec-1', 'rejected', 'you')

    const update = writtenTo(sb, 'update')
    expect(update.status).toBe('rejected')
    expect(update.status_at).toEqual(expect.any(String))
    const transitions = update.transitions as { status: string; actor: string }[]
    expect(transitions.map((t) => t.status)).toEqual(['proposed', 'rejected'])
    expect(transitions[1].actor).toBe('you')
  })

  it('never touches before, after, action or actor', async () => {
    const sb = makeSupabase({ maybeSingle: row(), single: row({ status: 'withdrawn' }) })
    await store.advanceStatus(sb as never, 'rec-1', 'withdrawn')
    expect(Object.keys(writtenTo(sb, 'update')).sort()).toEqual([
      'status',
      'status_at',
      'transitions',
    ])
  })

  it('throws on an illegal edge BEFORE issuing any write', async () => {
    const sb = makeSupabase({ maybeSingle: row({ status: 'outdated' }) })
    await expect(store.advanceStatus(sb as never, 'rec-1', 'accepted')).rejects.toBeInstanceOf(
      IllegalTransitionError
    )
    expect(sb._chain.update).not.toHaveBeenCalled()
  })

  it('throws when the record is not there', async () => {
    const sb = makeSupabase({ maybeSingle: null })
    await expect(store.advanceStatus(sb as never, 'nope', 'rejected')).rejects.toThrow(/not found/)
    expect(sb._chain.update).not.toHaveBeenCalled()
  })

  it('exposes the three settle verbs on top of it', async () => {
    for (const [fn, expected] of [
      [store.rejectRecord, 'rejected'],
      [store.requestChanges, 'changes_requested'],
      [store.withdrawRecord, 'withdrawn'],
    ] as const) {
      const sb = makeSupabase({ maybeSingle: row({ status: 'proposed' }) })
      await fn(sb as never, 'rec-1')
      expect(writtenTo(sb, 'update').status).toBe(expected)
    }
  })
})

describe('acceptRecord', () => {
  it('goes through the atomic RPC, never a bare status update', async () => {
    const sb = makeSupabase({ rpc: row({ status: 'accepted' }) })
    const blocks = [{ id: 'b1', type: 'text', content: 'new' }]
    const record = await store.acceptRecord(sb as never, 'rec-1', blocks, 'you')

    expect(sb.rpc).toHaveBeenCalledWith('accept_change_log_record', {
      p_record_id: 'rec-1',
      p_blocks: blocks,
      p_actor: 'you',
    })
    // The page commit and the status advance cannot be split across two calls.
    expect(sb._chain.update).not.toHaveBeenCalled()
    expect(record.status).toBe('accepted')
  })

  it('surfaces the RPC error rather than swallowing it', async () => {
    const sb = makeSupabase({ rpcError: new Error('only a proposed record can be accepted') })
    await expect(store.acceptRecord(sb as never, 'rec-1', [])).rejects.toThrow(
      /only a proposed record/
    )
  })
})

describe('markOutdated (G2)', () => {
  it('sweeps every other proposed record on the touched blocks', async () => {
    const sb = makeSupabase({
      list: [
        row({ id: 'same-block', target_block_id: 'b1' }),
        row({ id: 'other-block', target_block_id: 'b2' }),
        row({ id: 'page-level', target_block_id: null }),
        row({ id: 'the-accepted-one', target_block_id: 'b1' }),
      ],
      maybeSingle: row({ status: 'proposed' }),
    })

    const swept = await store.markOutdated(sb as never, {
      userId: USER,
      targetPageId: 'page-1',
      blockIds: ['b1'],
      exceptId: 'the-accepted-one',
    })

    // b1 and the page-level proposal go stale; b2 is untouched, and the record
    // that was just accepted never sweeps itself.
    expect(writtenTo(sb, 'update').status).toBe('outdated')
    expect(swept).toHaveLength(2)
    expect(sb._chain.update).toHaveBeenCalledTimes(2)
  })

  it('sweeps the whole page when no blocks are named', async () => {
    const sb = makeSupabase({
      list: [row({ id: 'a', target_block_id: 'b1' }), row({ id: 'b', target_block_id: 'b9' })],
      maybeSingle: row({ status: 'proposed' }),
    })
    const swept = await store.markOutdated(sb as never, { userId: USER, targetPageId: 'page-1' })
    expect(swept).toHaveLength(2)
  })

  it('reads only this pond’s still-proposed records for that page', async () => {
    const sb = makeSupabase({ list: [] })
    await store.markOutdated(sb as never, {
      userId: USER,
      workspace: 'sandbox',
      targetPageId: 'page-1',
    })
    const eqArgs = sb._chain.eq.mock.calls
    expect(eqArgs).toContainEqual(['user_id', USER])
    expect(eqArgs).toContainEqual(['workspace', 'sandbox'])
    expect(eqArgs).toContainEqual(['target_page_id', 'page-1'])
    expect(eqArgs).toContainEqual(['status', 'proposed'])
  })
})

describe('redactRecordContent', () => {
  it('clears the content to null and leaves the record, its actor and its status', async () => {
    const sb = makeSupabase({
      single: row({ action: 'memory_note', actor: 'you', before: null, after: null }),
    })
    const record = await store.redactRecordContent(sb as never, 'rec-1')

    expect(writtenTo(sb, 'update')).toEqual({ before: null, after: null })
    expect(record.before).toBeNull()
    expect(record.after).toBeNull()
    expect(record.action).toBe('memory_note')
    expect(record.actor).toBe('you') // "a note was deleted, by whom"
  })
})

// ── Reads ────────────────────────────────────────────────────────────────────

describe('listRecords', () => {
  it('always scopes to one pond and orders newest first', async () => {
    const sb = makeSupabase({ list: [row()] })
    await store.listRecords(sb as never, { userId: USER, workspace: 'sandbox' })
    expect(sb._chain.eq.mock.calls).toContainEqual(['user_id', USER])
    expect(sb._chain.eq.mock.calls).toContainEqual(['workspace', 'sandbox'])
    expect(sb._chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('filters the saved views: proposed, by page, memory', async () => {
    const sb = makeSupabase({ list: [] })
    await store.listRecords(sb as never, { userId: USER, status: 'proposed' })
    expect(sb._chain.eq.mock.calls).toContainEqual(['status', 'proposed'])

    await store.listRecords(sb as never, { userId: USER, targetPageId: 'page-1' })
    expect(sb._chain.eq.mock.calls).toContainEqual(['target_page_id', 'page-1'])

    await store.listRecords(sb as never, { userId: USER, action: 'memory_note' })
    expect(sb._chain.eq.mock.calls).toContainEqual(['action', 'memory_note'])

    await store.listRecords(sb as never, { userId: USER, status: ['accepted', 'reverted'] })
    expect(sb._chain.in).toHaveBeenCalledWith('status', ['accepted', 'reverted'])
  })
})

describe('countProposed', () => {
  it('counts the pond’s open records — the "N proposed, waiting on you" figure', async () => {
    const sb = makeSupabase({ count: 3 })
    expect(await store.countProposed(sb as never, USER)).toBe(3)
    expect(sb._chain.eq.mock.calls).toContainEqual(['status', 'proposed'])
    expect(sb._chain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
  })

  it('reads zero when the pond has nothing waiting', async () => {
    const sb = makeSupabase({ count: undefined })
    expect(await store.countProposed(sb as never, USER)).toBe(0)
  })
})

describe('listRevisionsOf', () => {
  it('walks the revised_from chain in order and stops on a cycle', async () => {
    const sb = makeSupabase({
      list: [
        row({ id: 'v3', links: { revised_from: 'v2' } }),
        row({ id: 'v2', links: { revised_from: 'v1' } }),
        row({ id: 'unrelated', links: {} }),
      ],
    })
    const chain = await store.listRevisionsOf(sb as never, { userId: USER, recordId: 'v1' })
    expect(chain.map((r) => r.id)).toEqual(['v2', 'v3'])
  })
})

// ── Mapping ──────────────────────────────────────────────────────────────────

describe('mapChangeLogRow', () => {
  it('reads links in either casing and drops anything malformed', () => {
    expect(
      store.mapChangeLogRow(
        row({ links: { revert_of: 'a', revised_from: 'b', undo_of: 'c', redo_of: 'd' } })
      ).links
    ).toEqual({ revertOf: 'a', revisedFrom: 'b', undoOf: 'c', redoOf: 'd' })
    expect(store.mapChangeLogRow(row({ links: { revertOf: 'a' } })).links).toEqual({
      revertOf: 'a',
    })
    expect(store.mapChangeLogRow(row({ links: null })).links).toEqual({})
    expect(store.mapChangeLogRow(row({ links: { revert_of: 7 } })).links).toEqual({})
  })

  it('drops transition entries with an unknown status rather than throwing a view away', () => {
    const record = store.mapChangeLogRow(
      row({
        transitions: [
          { status: 'proposed', at: 'x', actor: 'pond' },
          { status: 'pending', at: 'x', actor: 'pond' },
          'nonsense',
        ],
      })
    )
    expect(record.transitions.map((t) => t.status)).toEqual(['proposed'])
  })

  it('throws loudly on a row whose status this build does not know', () => {
    expect(() => store.mapChangeLogRow(row({ status: 'pending' }))).toThrow(/unknown status/)
  })

  it('normalises absent content to null', () => {
    const record = store.mapChangeLogRow(row({ before: null, after: undefined, read: undefined }))
    expect(record.before).toBeNull()
    expect(record.after).toBeNull()
    expect(record.read).toBeNull()
  })
})

// ── The only-grows gate ──────────────────────────────────────────────────────

describe('the log only grows', () => {
  it('exposes no delete verb on the store module', () => {
    const verbs = Object.keys(store)
    expect(verbs.filter((v) => /delete|remove|purge|destroy|wipe/i.test(v))).toEqual([])
    // Redaction is the only content mutation, and it is named for what it is.
    expect(verbs).toContain('redactRecordContent')
  })

  it('has no code path anywhere that deletes a change_log row', () => {
    const offenders: string[] = []
    const SRC = resolve(__dirname, '..')
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          // The tests themselves DO issue deletes — to prove the DB refuses
          // them — so the gate covers application code only.
          if (entry === 'node_modules' || entry === '__tests__' || entry === '__mocks__') continue
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue
        const text = readFileSync(full, 'utf8')
        // A delete issued against the change-log table, in either the builder
        // form (.from('change_log')….delete()) or raw SQL.
        if (/from\(\s*['"`]change_log['"`]\s*\)[\s\S]{0,200}?\.delete\(/.test(text)) {
          offenders.push(full)
        }
        if (/delete\s+from\s+(public\.)?change_log/i.test(text)) {
          offenders.push(full)
        }
      }
    }
    walk(SRC)
    expect(offenders).toEqual([])
  })

  it('never writes before/after on an update outside redaction', () => {
    const text = readFileSync(resolve(__dirname, '../lib/change-log/store.ts'), 'utf8')
    const updates = [...text.matchAll(/\.update\(\{[\s\S]*?\}\)/g)].map((m) => m[0])
    expect(updates.length).toBeGreaterThan(0)
    for (const update of updates) {
      if (/before/.test(update) || /after/.test(update)) {
        // The one permitted mutation: cleared to null, never replaced.
        expect(update).toMatch(/before:\s*null/)
        expect(update).toMatch(/after:\s*null/)
      }
    }
  })
})
