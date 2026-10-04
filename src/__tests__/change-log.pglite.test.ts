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
import { applyMigration, makeDb, seedUser } from './helpers/pglite-harness'

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
        // 0018: the tenancy key. Nullable for now — #314 ruled it stays nullable
        // until #318's children make every insert supply it.
        'pond_id',
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

  it('re-applies cleanly, so a replayed migration is a no-op not an abort', async () => {
    const db = await makeDb()
    // Every statement in 0011 is guarded except the `create policy` lines, which
    // sit inside begin;…commit; — so a re-run aborted the whole migration on a
    // duplicate-object error rather than doing nothing.
    await expect(applyMigration(db, '0011_change_log.sql')).resolves.toBeUndefined()

    const policies = await db.query<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'change_log'`
    )
    expect(policies.rows.map((r) => r.cmd).sort()).toEqual(['INSERT', 'SELECT', 'UPDATE'])
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

  it('refuses TRUNCATE, which a per-row trigger never sees', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await addRecord(db)

    // The append-only trigger is BEFORE ... FOR EACH ROW, and TRUNCATE fires no
    // row triggers at all — so the table could be emptied in one statement while
    // every row-level guarantee held. It needs owner rights, but 0011 claims the
    // log can never be emptied, and a claim with a hole in it is worse than no
    // claim.
    await expect(db.query('truncate public.change_log')).rejects.toThrow(/append-only/)

    const res = await db.query<{ n: number }>('select count(*)::int as n from public.change_log')
    expect(res.rows[0].n).toBe(1)
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

  it('freezes `links`: the relationships between records are set at birth', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const original = await addRecord(db)
    // Links are stamped at INSERT — a revision is born knowing what it revised.
    const revision = (
      await db.query<{ id: string }>(
        `insert into public.change_log
           (user_id, status, action, actor, links, transitions)
         values ($1,'proposed','edit','pond', jsonb_build_object('revised_from', $2::text), '[]'::jsonb)
         returning id`,
        [USER, original]
      )
    ).rows[0].id

    // Probe P2: `links` was outside the identity list, so the chain that ties a
    // revision to what it revised — and, downstream, a revert to what it
    // reverted (#103) and an undo to what it undid (#104) — could be re-pointed
    // at any other record after the fact. Revert/revise/undo/redo each INSERT a
    // new record carrying its own links; nothing ever re-links an existing one.
    await expect(
      db.query(
        `update public.change_log set links = jsonb_build_object('revised_from', $2::text) where id = $1`,
        [revision, revision]
      )
    ).rejects.toThrow(/links/)

    const res = await db.query<{ from: string }>(
      `select links ->> 'revised_from' as from from public.change_log where id = $1`,
      [revision]
    )
    expect(res.rows[0].from).toBe(original)
    await db.close()
  })

  it('freezes `read`: read-chip provenance may be redacted, never rewritten', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    // Read chips are captured at propose time, so they are stamped at INSERT.
    const id = (
      await db.query<{ id: string }>(
        `insert into public.change_log
           (user_id, status, action, actor, "read", transitions)
         values ($1,'proposed','edit','pond', '[{"pageId":"p1","title":"Sleep log"}]'::jsonb, '[]'::jsonb)
         returning id`,
        [USER]
      )
    ).rows[0].id

    // Probe P1: `read` is the provenance #110 criterion 1 names — what Pond read
    // before it proposed. Rewritable provenance is no provenance: it could be
    // made to claim Pond consulted something it never opened.
    await expect(
      db.query(
        `update public.change_log set "read" = '[{"pageId":"p2","title":"Something else"}]'::jsonb where id = $1`,
        [id]
      )
    ).rejects.toThrow(/read/)

    // Clearing it IS allowed — same rule as before/after, so deleting a memory
    // note can take its read chips with it.
    await db.query(`update public.change_log set "read" = null where id = $1`, [id])
    const res = await db.query<{ read: unknown }>(
      'select "read" from public.change_log where id = $1',
      [id]
    )
    expect(res.rows[0].read).toBeNull()
    await db.close()
  })

  it('refuses to forge an existing transition in place, even at the same length', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db)

    // A length guard alone is not append-only (review of #144, probe P3): the
    // birth entry can be REPLACED by a different one of the same length, so the
    // audit can be made to say a record was accepted, by someone who never
    // touched it, with no trace that anything was rewritten. Every entry already
    // in the array is history and is immutable; only the tail may grow.
    await expect(
      db.query(
        `update public.change_log
         set transitions = '[{"status":"accepted","at":"2020-01-01T00:00:00Z","actor":"FORGED"}]'::jsonb
         where id = $1`,
        [id]
      )
    ).rejects.toThrow(/transitions/)

    const res = await db.query<{ actor: string }>(
      `select transitions -> 0 ->> 'actor' as actor from public.change_log where id = $1`,
      [id]
    )
    expect(res.rows[0].actor).toBe('pond')
    await db.close()
  })

  it('refuses to replace the audit with non-transition junk of any length', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db)

    // Probe P4: `jsonb_typeof = 'array'` was the only element-level check, so an
    // array of scalars passed. It is longer than the original, so the length
    // guard waved it through too.
    await expect(
      db.query(`update public.change_log set transitions = '[1,2,3]'::jsonb where id = $1`, [id])
    ).rejects.toThrow(/transitions/)

    // …and an APPENDED entry must still look like a transition, not a scalar.
    await expect(
      db.query(
        `update public.change_log set transitions = transitions || '[42]'::jsonb where id = $1`,
        [id]
      )
    ).rejects.toThrow(/transitions/)
    await db.close()
  })

  it('refuses a status change that does not append its own transition', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db)

    // The audit is only provenance if it cannot disagree with the record. A raw
    // update could rewind `accepted` back to `proposed` and append nothing, so
    // the log said one thing and its own history said another — the same forgery
    // P3 achieved by overwriting an entry, reached from the other side.
    await expect(
      db.query(`update public.change_log set status = 'accepted' where id = $1`, [id])
    ).rejects.toThrow(/transition/)

    expect(await statusOf(db, id)).toBe('proposed')
    await db.close()
  })

  it('refuses an appended transition that disagrees with the status it lands on', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db)

    await expect(
      db.query(
        `update public.change_log
         set status = 'withdrawn',
             transitions = transitions || '[{"status":"accepted","at":"2026-01-01T00:00:00Z","actor":"x"}]'
         where id = $1`,
        [id]
      )
    ).rejects.toThrow(/transition/)
    await db.close()
  })

  it('refuses a transition entry carrying a status that is not one of the eight', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db)

    // The column CHECK constrains `status`; nothing constrained the same value
    // inside the audit array, so the history could name a status the table
    // itself would reject.
    await expect(
      db.query(
        `update public.change_log
         set status = 'rejected',
             transitions = transitions || '[{"status":"NOT_A_STATUS","at":"2026-01-01T00:00:00Z","actor":"x"}]'
         where id = $1`,
        [id]
      )
    ).rejects.toThrow(/transition/)
    await db.close()
  })

  it('refuses to rewind status_at', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db)

    await expect(
      db.query(`update public.change_log set status_at = '2000-01-01' where id = $1`, [id])
    ).rejects.toThrow(/status_at/)
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

  it('survives the mirror-row bypass: the account is auth.users, not public.users', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await addRecord(db, { userId: USER })

    // `0001_initial_schema.sql:13-14` grants the row owner `for all` on their
    // public.users MIRROR row — which includes DELETE — and change_log cascades
    // off that mirror. So if the trigger reads the mirror to decide "this is a
    // genuine account deletion", an ordinary browser client wipes its own log by
    // deleting a row it is permitted to delete, while the account itself
    // (auth.users) survives untouched. The account is auth.users; the mirror is
    // bookkeeping. Deleting the mirror alone must take the whole statement down.
    await expect(db.query('delete from public.users where id = $1', [USER])).rejects.toThrow(
      /append-only/
    )

    const log = await db.query<{ n: number }>('select count(*)::int as n from public.change_log')
    expect(log.rows[0].n).toBe(1)
    const mirror = await db.query<{ n: number }>('select count(*)::int as n from public.users')
    expect(mirror.rows[0].n).toBe(1)
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

describe('0011_change_log — advance_change_log_record', () => {
  it('appends the transition in SQL rather than replacing the array', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db)

    await db.query(`select public.advance_change_log_record($1,'proposed','rejected','you')`, [id])

    const res = await db.query<{ n: number; first: string; last: string; status: string }>(
      `select jsonb_array_length(transitions)::int as n,
              transitions -> 0 ->> 'status' as first,
              transitions -> -1 ->> 'status' as last,
              status
       from public.change_log where id = $1`,
      [id]
    )
    expect(res.rows[0].status).toBe('rejected')
    expect(res.rows[0].n).toBe(2)
    // The birth entry is still there, untouched — the audit grew, it did not move.
    expect(res.rows[0].first).toBe('proposed')
    expect(res.rows[0].last).toBe('rejected')
    await db.close()
  })

  it('touches nothing but status, status_at and transitions', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const page = await addPage(db)
    const id = await addRecord(db, {
      pageId: page,
      blockId: 'b1',
      before: { id: 'b1', type: 'text', content: 'old' },
      after: { id: 'b1', type: 'text', content: 'new' },
    })
    const wasRes = await db.query(
      `select action, actor, target_page_id, target_block_id, "before", "after", created_at
       from public.change_log where id = $1`,
      [id]
    )

    await db.query(`select public.advance_change_log_record($1,'proposed','accepted','you')`, [id])

    const nowRes = await db.query(
      `select action, actor, target_page_id, target_block_id, "before", "after", created_at
       from public.change_log where id = $1`,
      [id]
    )
    // An advance moves the STATUS. The diff it carries, who made it, where it
    // applies and when it was born are all exactly as they were.
    expect(nowRes.rows[0]).toEqual(wasRes.rows[0])
    await db.close()
  })

  it('refuses a stale advance instead of silently losing the other one', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db)

    // `advanceStatus` used to read the record, then write `[...transitions, new]`
    // from what it had read. Two advances racing both read one entry and both
    // wrote two, so whichever landed second ERASED the other's entry — a lost
    // update in a table whose whole promise is that it only grows. The caller
    // now states the status it believes it is advancing FROM, so a record that
    // moved underneath it is a loud conflict, not a silent overwrite.
    await db.query(`select public.advance_change_log_record($1,'proposed','accepted','you')`, [id])

    await expect(
      db.query(`select public.advance_change_log_record($1,'proposed','rejected','you')`, [id])
    ).rejects.toThrow(/no longer|expected/i)

    const res = await db.query<{ n: number; status: string }>(
      `select jsonb_array_length(transitions)::int as n, status
       from public.change_log where id = $1`,
      [id]
    )
    expect(res.rows[0].status).toBe('accepted')
    expect(res.rows[0].n).toBe(2)
    await db.close()
  })

  it('raises on a record that is not there', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await expect(
      db.query(
        `select public.advance_change_log_record('00000000-0000-0000-0000-000000000000','proposed','rejected','you')`
      )
    ).rejects.toThrow(/not found/)
    await db.close()
  })
})

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

// ── The accept path's sequence (#146 item 1) ─────────────────────────────────
//
// The store's units prove each call in isolation against a mocked builder. What
// they cannot prove is the SEQUENCE the accept path actually performs — commit +
// advance, then sweep the page's other proposals to `outdated` — surviving the
// append-only trigger, which has opinions about every one of those writes. That
// only holds against real SQL.

describe('0011_change_log — accept then sweep, end to end', () => {
  /** What markOutdated issues: every OTHER still-proposed record on the page. */
  async function sweepPage(
    db: PGlite,
    opts: { userId?: string; workspace?: string; pageId: string; exceptId: string }
  ): Promise<number> {
    const { userId = USER, workspace = 'main', pageId, exceptId } = opts
    const stale = await db.query<{ id: string }>(
      `select id from public.change_log
        where user_id = $1 and workspace = $2 and target_page_id = $3
          and status = 'proposed' and action = 'edit' and id <> $4`,
      [userId, workspace, pageId, exceptId]
    )
    for (const r of stale.rows) {
      await db.query('select * from public.advance_change_log_record($1, $2, $3, $4)', [
        r.id,
        'proposed',
        'outdated',
        'pond',
      ])
    }
    return stale.rows.length
  }

  it('accepts one proposal and outdates the page’s others, touching nothing else', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)

    const page = await addPage(db, { blocks: [{ id: 'b1', type: 'text', content: 'before' }] })
    const otherPage = await addPage(db, { title: 'Elsewhere' })

    const accepted = await addRecord(db, { pageId: page, after: [{ id: 'b1' }] })
    const sibling1 = await addRecord(db, { pageId: page })
    const sibling2 = await addRecord(db, { pageId: page })
    // Three records the sweep must leave alone.
    const elsewhere = await addRecord(db, { pageId: otherPage })
    const settled = await addRecord(db, { pageId: page, status: 'rejected' })
    const sandbox = await addRecord(db, { pageId: page, workspace: 'sandbox' })
    // A pending row insert on the SAME page. Its before/after live in the page's
    // rows, not its blocks, so a block write says nothing about it and it must
    // survive the sweep still accept-able.
    const rowInsert = await addRecord(db, { pageId: page, action: 'add_row' })

    const blocks = [{ id: 'b1', type: 'text', content: 'after' }]
    await db.query('select * from public.accept_change_log_record($1, $2, $3)', [
      accepted,
      JSON.stringify(blocks),
      'you',
    ])
    expect(await sweepPage(db, { pageId: page, exceptId: accepted })).toBe(2)

    // Criterion 5: the page moved on, so the proposals written against the old
    // state lose their accept affordance.
    expect(await statusOf(db, accepted)).toBe('accepted')
    expect(await statusOf(db, sibling1)).toBe('outdated')
    expect(await statusOf(db, sibling2)).toBe('outdated')
    // Never itself, never another page, never a settled record, never another pond,
    // and never an action whose diff is not a block diff.
    expect(await statusOf(db, elsewhere)).toBe('proposed')
    expect(await statusOf(db, settled)).toBe('rejected')
    expect(await statusOf(db, sandbox)).toBe('proposed')
    expect(await statusOf(db, rowInsert)).toBe('proposed')

    const pageBlocks = await db.query<{ blocks: unknown }>(
      'select blocks from public.pages where id = $1',
      [page]
    )
    expect(pageBlocks.rows[0].blocks).toEqual(blocks)

    // The audit has to agree with the status it landed on, for every record the
    // sequence touched — the trigger enforces that, so this proves the sweep's
    // writes are shaped the way it demands.
    const audit = await db.query<{ id: string; status: string; transitions: { status: string }[] }>(
      'select id, status, transitions from public.change_log where id = any($1::uuid[])',
      [[accepted, sibling1, sibling2]]
    )
    for (const r of audit.rows) {
      expect(r.transitions).toHaveLength(2)
      expect(r.transitions[0].status).toBe('proposed')
      expect(r.transitions[1].status).toBe(r.status)
    }
    await db.close()
  })

  it('refuses to outdate the record it just accepted, so the sweep’s filter is load-bearing', async () => {
    // markOutdated reads only `status = 'proposed'` and skips `exceptId`. If either
    // guard were dropped, the sweep would try to walk accepted → outdated — an edge
    // the state machine does not have. SQL is the backstop, and it holds.
    const db = await makeDb()
    await seedUser(db, USER)
    const page = await addPage(db, { blocks: [] })
    const id = await addRecord(db, { pageId: page })

    await db.query('select * from public.accept_change_log_record($1, $2)', [id, '[]'])
    await expect(
      db.query('select * from public.advance_change_log_record($1, $2, $3)', [
        id,
        'proposed',
        'outdated',
      ])
    ).rejects.toThrow()
    expect(await statusOf(db, id)).toBe('accepted')
    await db.close()
  })
})
