// Schema tests for 0011_change_log.sql (issue #102, spec #110).
//
// Seam under test: the change-log table's own contract. The store in
// src/lib/change-log/ is the typed front door, but "the log only grows" is a
// promise about the DATABASE — so it is proved here against a real Postgres
// (PGLite, the real migrations from disk), not against a mocked builder. If the
// SQL is wrong, these fail.
//
// What's asserted: the 8-status CHECK, the three indexes, RLS shaped so there is
// no delete policy at all, the append-only trigger (no delete, no rewrite of
// identity or diff content, transitions only grow), the ONE permitted mutation
// (redacting a deleted memory note to null), per-pond isolation, what survives a
// page/thread delete, and the atomicity of `accept_change_log_record`.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

const STATUSES = [
  'proposed',
  'accepted',
  'rejected',
  'changes_requested',
  'outdated',
  'withdrawn',
  'undone',
  'reverted',
]

async function addPage(
  db: PGlite,
  opts: { userId?: string; title?: string; workspace?: string; blocks?: unknown } = {}
): Promise<string> {
  const { userId = USER, title = 'Target', workspace = 'main', blocks = [] } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, parent_id, type, title, workspace, blocks)
     values ($1, null, 'page', $2, $3, $4) returning id`,
    [userId, title, workspace, JSON.stringify(blocks)]
  )
  return res.rows[0].id
}

async function addRecord(
  db: PGlite,
  opts: {
    userId?: string
    workspace?: string
    status?: string
    action?: string
    actor?: string
    pageId?: string | null
    blockId?: string | null
    before?: unknown
    after?: unknown
    threadId?: string | null
  } = {}
): Promise<string> {
  const {
    userId = USER,
    workspace = 'main',
    status = 'proposed',
    action = 'edit',
    actor = 'pond',
    pageId = null,
    blockId = null,
    before = null,
    after = null,
    threadId = null,
  } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.change_log
       (user_id, workspace, status, action, actor, target_page_id, target_block_id,
        "before", "after", source_thread_id, transitions)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [
      userId,
      workspace,
      status,
      action,
      actor,
      pageId,
      blockId,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      threadId,
      JSON.stringify([{ status, at: new Date().toISOString(), actor }]),
    ]
  )
  return res.rows[0].id
}

async function statusOf(db: PGlite, id: string): Promise<string | null> {
  const res = await db.query<{ status: string }>(
    'select status from public.change_log where id = $1',
    [id]
  )
  return res.rows[0]?.status ?? null
}

// ── Shape ────────────────────────────────────────────────────────────────────

describe('0011_change_log — shape', () => {
  it('creates the table with every column the spec names', async () => {
    const db = await makeDb()
    const cols = await db.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'change_log'`
    )
    const names = cols.rows.map((r) => r.column_name).sort()
    expect(names).toEqual(
      [
        'action',
        'actor',
        'after',
        'before',
        'created_at',
        'id',
        'links',
        'read',
        'source_thread_id',
        'status',
        'status_at',
        'target_block_id',
        'target_page_id',
        'tool_call_id',
        'transitions',
        'user_id',
        'workspace',
      ].sort()
    )
    // before/after are nullable — a create has no before, a redaction clears both.
    const byName = new Map(cols.rows.map((r) => [r.column_name, r.is_nullable]))
    expect(byName.get('before')).toBe('YES')
    expect(byName.get('after')).toBe('YES')
    expect(byName.get('status')).toBe('NO')
    await db.close()
  })

  it('creates the three indexes the spec names', async () => {
    const db = await makeDb()
    const idx = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' and tablename = 'change_log'`
    )
    const names = idx.rows.map((r) => r.indexname)
    expect(names).toContain('change_log_pond_recent_idx') // (user, workspace, created_at desc)
    expect(names).toContain('change_log_pond_status_idx') // (user, workspace, status)
    expect(names).toContain('change_log_target_page_idx') // (target_page_id)
    await db.close()
  })

  it('accepts all eight statuses and rejects a ninth', async () => {
    const db = await makeDb()
    await seedUser(db, USER)

    for (const status of STATUSES) {
      await expect(addRecord(db, { status })).resolves.toBeTruthy()
    }
    // A ninth is a migration, not a typo.
    await expect(addRecord(db, { status: 'pending' })).rejects.toThrow(/change_log_status_check/)
    await expect(addRecord(db, { status: 'changes requested' })).rejects.toThrow(
      /change_log_status_check/
    )
    await db.close()
  })

  it('leaves `action` unconstrained so a new tool needs no migration', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    for (const action of ['edit', 'create_page', 'memory_note', 'revert', 'some_future_tool']) {
      await expect(addRecord(db, { action })).resolves.toBeTruthy()
    }
    await db.close()
  })

  it('scopes per pond: workspace defaults to main and is constrained', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await db
      .query<{ id: string }>(
        `insert into public.change_log (user_id, status, action) values ($1,'proposed','edit') returning id`,
        [USER]
      )
      .then((r) => r.rows[0].id)
    const res = await db.query<{ workspace: string }>(
      'select workspace from public.change_log where id = $1',
      [id]
    )
    expect(res.rows[0].workspace).toBe('main')
    await expect(addRecord(db, { workspace: 'elsewhere' })).rejects.toThrow(/workspace/)
    await db.close()
  })
})

// ── Row-level security ───────────────────────────────────────────────────────

describe('0011_change_log — RLS', () => {
  it('enables RLS with select/insert/update policies and NO delete policy', async () => {
    const db = await makeDb()
    const rls = await db.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where oid = 'public.change_log'::regclass`
    )
    expect(rls.rows[0].relrowsecurity).toBe(true)

    const policies = await db.query<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'change_log'`
    )
    const cmds = policies.rows.map((r) => r.cmd).sort()
    expect(cmds).toEqual(['INSERT', 'SELECT', 'UPDATE'])
    // The absent DELETE policy is the first "only grows" gate — an ordinary
    // client cannot even attempt a delete.
    expect(cmds).not.toContain('DELETE')
    expect(cmds).not.toContain('ALL')
    await db.close()
  })
})

// ── The append-only contract ─────────────────────────────────────────────────

describe('0011_change_log — the log only grows', () => {
  it('refuses a DELETE even as table owner (RLS is bypassed, the trigger is not)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db, { status: 'accepted' })

    await expect(db.query('delete from public.change_log where id = $1', [id])).rejects.toThrow(
      /append-only/
    )
    // Still there.
    expect(await statusOf(db, id)).toBe('accepted')

    // Not even a blanket wipe.
    await expect(db.query('delete from public.change_log')).rejects.toThrow(/append-only/)
    await db.close()
  })

  it('refuses to rewrite before/after with different content', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db, {
      before: { id: 'b1', type: 'text', content: 'old' },
      after: { id: 'b1', type: 'text', content: 'new' },
    })

    await expect(
      db.query(
        `update public.change_log set "after" = '{"content":"tampered"}'::jsonb where id = $1`,
        [id]
      )
    ).rejects.toThrow(/before may only be redacted|after may only be redacted/)
    await expect(
      db.query(
        `update public.change_log set "before" = '{"content":"tampered"}'::jsonb where id = $1`,
        [id]
      )
    ).rejects.toThrow(/before may only be redacted/)

    const res = await db.query<{ after: { content: string } }>(
      'select "after" from public.change_log where id = $1',
      [id]
    )
    expect(res.rows[0].after.content).toBe('new')
    await db.close()
  })

  it('refuses to rewrite identity and provenance columns', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    const id = await addRecord(db, { action: 'edit', actor: 'pond' })

    for (const sql of [
      `update public.change_log set action = 'delete' where id = $1`,
      `update public.change_log set actor = 'you' where id = $1`,
      `update public.change_log set workspace = 'sandbox' where id = $1`,
      `update public.change_log set created_at = now() - interval '1 day' where id = $1`,
      `update public.change_log set target_block_id = 'other-block' where id = $1`,
      `update public.change_log set user_id = '${OTHER}' where id = $1`,
    ]) {
      await expect(db.query(sql, [id])).rejects.toThrow(/append-only/)
    }
    await db.close()
  })

  it('refuses to shrink the transitions audit, and allows it to grow', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db)

    await expect(
      db.query(`update public.change_log set transitions = '[]'::jsonb where id = $1`, [id])
    ).rejects.toThrow(/transitions may only grow/)

    // Growing is the normal path: an advance appends one entry.
    await db.query(
      `update public.change_log
       set status = 'accepted', status_at = now(),
           transitions = transitions || jsonb_build_array(jsonb_build_object('status','accepted','at',now(),'actor','you'))
       where id = $1`,
      [id]
    )
    const res = await db.query<{ n: number }>(
      'select jsonb_array_length(transitions)::int as n from public.change_log where id = $1',
      [id]
    )
    expect(res.rows[0].n).toBe(2)
    expect(await statusOf(db, id)).toBe('accepted')
    await db.close()
  })

  it('permits exactly one content mutation: redacting a deleted memory note to null', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    // "deleting a note removes its content from the log — the record keeps only
    // 'a note was deleted, by whom'."
    const id = await addRecord(db, {
      action: 'memory_note',
      status: 'accepted',
      actor: 'you',
      after: { note: 'something private' },
    })

    await db.query(`update public.change_log set "before" = null, "after" = null where id = $1`, [
      id,
    ])

    const res = await db.query<{
      action: string
      actor: string
      before: unknown
      after: unknown
    }>('select action, actor, "before", "after" from public.change_log where id = $1', [id])
    expect(res.rows).toHaveLength(1) // the RECORD survives
    expect(res.rows[0].after).toBeNull() // its CONTENT does not
    expect(res.rows[0].action).toBe('memory_note')
    expect(res.rows[0].actor).toBe('you') // "by whom" is kept

    // And a redacted record still cannot be refilled with new content.
    await expect(
      db.query(`update public.change_log set "after" = '{"note":"back"}'::jsonb where id = $1`, [
        id,
      ])
    ).rejects.toThrow(/after may only be redacted/)
    await db.close()
  })
})

// ── What a record outlives ───────────────────────────────────────────────────

describe('0011_change_log — records outlive their targets', () => {
  it('keeps the record when its target page is deleted, clearing only the link', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const page = await addPage(db, { title: 'Doomed' })
    const id = await addRecord(db, {
      action: 'delete',
      status: 'accepted',
      pageId: page,
      before: { title: 'Doomed' },
    })

    // ON DELETE SET NULL, not CASCADE — "the record keeps the name + when it
    // went even after the trash empties". The append-only trigger must NOT
    // block the FK's own clear, or pages could never be deleted at all.
    await db.query('delete from public.pages where id = $1', [page])

    const res = await db.query<{ target_page_id: string | null; before: { title: string } }>(
      'select target_page_id, "before" from public.change_log where id = $1',
      [id]
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].target_page_id).toBeNull()
    expect(res.rows[0].before.title).toBe('Doomed') // the name is still in the log
    await db.close()
  })

  it('keeps the record when its source thread is dissolved', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const thread = await db
      .query<{ id: string }>(
        `insert into public.conversations (user_id) values ($1) returning id`,
        [USER]
      )
      .then((r) => r.rows[0].id)
    const id = await addRecord(db, { threadId: thread })

    await db.query('delete from public.conversations where id = $1', [thread])

    const res = await db.query<{ source_thread_id: string | null }>(
      'select source_thread_id from public.change_log where id = $1',
      [id]
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].source_thread_id).toBeNull()
    await db.close()
  })

  it('goes with the pond: deleting the user cascades the log away', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    await addRecord(db, { userId: USER })
    await addRecord(db, { userId: OTHER })

    // The trigger blocks application deletes; a record dies only WITH its pond,
    // so the account cascade must still work — otherwise the append-only rule
    // would quietly make users undeletable.
    await db.query('delete from auth.users where id = $1', [USER])

    const res = await db.query<{ user_id: string }>('select user_id from public.change_log')
    expect(res.rows.map((r) => r.user_id)).toEqual([OTHER])

    // …and the surviving pond's records are still un-deletable.
    await expect(
      db.query('delete from public.change_log where user_id = $1', [OTHER])
    ).rejects.toThrow(/append-only/)
    await db.close()
  })

  it('isolates ponds: a workspace-scoped read never sees the other scope', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const mainRec = await addRecord(db, { workspace: 'main', action: 'edit' })
    const sandboxRec = await addRecord(db, { workspace: 'sandbox', action: 'edit' })

    const mainRows = await db.query<{ id: string }>(
      `select id from public.change_log where user_id = $1 and workspace = 'main'`,
      [USER]
    )
    const sandboxRows = await db.query<{ id: string }>(
      `select id from public.change_log where user_id = $1 and workspace = 'sandbox'`,
      [USER]
    )
    expect(mainRows.rows.map((r) => r.id)).toEqual([mainRec])
    expect(sandboxRows.rows.map((r) => r.id)).toEqual([sandboxRec])
    await db.close()
  })
})

// ── Atomic accept ────────────────────────────────────────────────────────────

describe('0011_change_log — accept_change_log_record', () => {
  const NEW_BLOCKS = [{ id: 'b1', type: 'text', content: 'after' }]

  async function blocksOf(db: PGlite, pageId: string): Promise<unknown> {
    const res = await db.query<{ blocks: unknown }>(
      'select blocks from public.pages where id = $1',
      [pageId]
    )
    return res.rows[0].blocks
  }

  it('commits the page blocks and advances the record in one call', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const page = await addPage(db, { blocks: [{ id: 'b1', type: 'text', content: 'before' }] })
    const id = await addRecord(db, {
      pageId: page,
      blockId: 'b1',
      before: { id: 'b1', type: 'text', content: 'before' },
      after: NEW_BLOCKS[0],
    })

    const res = await db.query<{ status: string; transitions: unknown[] }>(
      'select status, transitions from public.accept_change_log_record($1, $2, $3)',
      [id, JSON.stringify(NEW_BLOCKS), 'you']
    )
    expect(res.rows[0].status).toBe('accepted')
    expect(res.rows[0].transitions).toHaveLength(2) // proposed, then accepted

    expect(await blocksOf(db, page)).toEqual(NEW_BLOCKS)
    expect(await statusOf(db, id)).toBe('accepted')
    await db.close()
  })

  it('refuses to accept anything but a proposed record, leaving the page untouched', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const original = [{ id: 'b1', type: 'text', content: 'before' }]

    for (const status of ['accepted', 'rejected', 'outdated', 'withdrawn']) {
      const page = await addPage(db, { title: `Page ${status}`, blocks: original })
      const id = await addRecord(db, { status, pageId: page })
      await expect(
        db.query('select * from public.accept_change_log_record($1, $2)', [
          id,
          JSON.stringify(NEW_BLOCKS),
        ])
      ).rejects.toThrow(/only a proposed record can be accepted/)
      // No committed block without an accepted record.
      expect(await blocksOf(db, page)).toEqual(original)
    }
    await db.close()
  })

  it('rolls the page write back when the log write fails — never an orphan either way', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const original = [{ id: 'b1', type: 'text', content: 'before' }]
    const page = await addPage(db, { blocks: original })
    const id = await addRecord(db, { pageId: page })

    // Force the SECOND half of the function to fail. If the two writes were not
    // in one transaction the page would already carry the new blocks.
    await db.exec(`
      create or replace function public.change_log_boom()
      returns trigger language plpgsql as $$
      begin raise exception 'boom'; end $$;
      create trigger change_log_boom_trg before update on public.change_log
        for each row execute procedure public.change_log_boom();
    `)

    await expect(
      db.query('select * from public.accept_change_log_record($1, $2)', [
        id,
        JSON.stringify(NEW_BLOCKS),
      ])
    ).rejects.toThrow(/boom/)

    await db.exec('drop trigger change_log_boom_trg on public.change_log')
    expect(await blocksOf(db, page)).toEqual(original) // rolled back
    expect(await statusOf(db, id)).toBe('proposed') // still waiting
    await db.close()
  })

  it('raises on a missing record and on a record with no target page', async () => {
    const db = await makeDb()
    await seedUser(db, USER)

    await expect(
      db.query('select * from public.accept_change_log_record($1, $2)', [
        '33333333-3333-3333-3333-333333333333',
        '[]',
      ])
    ).rejects.toThrow(/not found/)

    const pondLevel = await addRecord(db, { pageId: null })
    await expect(
      db.query('select * from public.accept_change_log_record($1, $2)', [pondLevel, '[]'])
    ).rejects.toThrow(/no target page/)
    await db.close()
  })
})
