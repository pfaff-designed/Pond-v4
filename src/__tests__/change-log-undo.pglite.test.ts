// Schema tests for 0021_undo_redo.sql.
//
// "The undo is a record of its own, and the record it undid is marked undone."
// "redo ⇧⌘Z is a record too." Both are promises about the DATABASE — a page write,
// a new record, an advanced record and the outdated sweep land together or not at
// all — so they are proved here against real Postgres (PGLite, the real
// migrations from disk). Every refusal is checked for its reason code and for
// leaving the page AND the log exactly as they were.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'
const STRANGER = '22222222-2222-2222-2222-222222222222'

const A = [{ id: 'a', type: 'text', content: 'one' }]
const B = [{ id: 'a', type: 'text', content: 'ONE' }]
const C = [{ id: 'a', type: 'text', content: 'ONE!' }]

interface Row {
  id: string
  status: string
  action: string
  actor: string
  pond_id: string | null
  target_page_id: string | null
  before: unknown
  after: unknown
  links: Record<string, string>
  transitions: { status: string; actor: string }[]
}

const pondOf = async (db: PGlite, userId: string = USER): Promise<string> => {
  const res = await db.query<{ id: string }>(
    'select id from public.ponds where user_id = $1 order by "order" limit 1',
    [userId]
  )
  return res.rows[0].id
}

const otherPond = async (db: PGlite, userId: string = USER): Promise<string> => {
  const res = await db.query<{ id: string }>(
    `insert into public.ponds (user_id, name, "order") values ($1, 'elsewhere', 9) returning id`,
    [userId]
  )
  return res.rows[0].id
}

const addPage = async (
  db: PGlite,
  opts: { userId?: string; pondId?: string; blocks?: unknown; title?: string } = {}
): Promise<string> => {
  const { userId = USER, blocks = B, title = 'Target' } = opts
  const pondId = opts.pondId ?? (await pondOf(db, userId))
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, blocks)
     values ($1, $2, null, 'page', $3, $4) returning id`,
    [userId, pondId, title, JSON.stringify(blocks)]
  )
  return res.rows[0].id
}

const addRow = async (
  db: PGlite,
  collectionId: string,
  opts: {
    title: string
    props?: Record<string, unknown>
    blocks?: unknown
    order?: number
    createdAt?: string
    pondId?: string
  }
): Promise<string> => {
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, props, blocks, "order", created_at)
     values ($1, $2, $3, 'row', $4, $5, $6, $7, $8) returning id`,
    [
      USER,
      opts.pondId ?? (await pondOf(db)),
      collectionId,
      opts.title,
      JSON.stringify(opts.props ?? {}),
      JSON.stringify(opts.blocks ?? []),
      opts.order ?? 0,
      opts.createdAt ?? new Date().toISOString(),
    ]
  )
  return res.rows[0].id
}

const addRecord = async (
  db: PGlite,
  opts: {
    userId?: string
    pondId?: string | null
    status?: string
    action?: string
    pageId?: string | null
    before?: unknown
    after?: unknown
    links?: unknown
    createdAt?: string
  } = {}
): Promise<string> => {
  const {
    userId = USER,
    status = 'accepted',
    action = 'edit',
    pageId = null,
    before = null,
    after = null,
    links = {},
    createdAt = new Date().toISOString(),
  } = opts
  const pondId = opts.pondId === undefined ? await pondOf(db, userId) : opts.pondId
  const res = await db.query<{ id: string }>(
    `insert into public.change_log
       (user_id, pond_id, status, action, actor, target_page_id, "before", "after",
        links, transitions, created_at)
     values ($1,$2,$3,$4,'you',$5,$6,$7,$8,$9,$10) returning id`,
    [
      userId,
      pondId,
      status,
      action,
      pageId,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      JSON.stringify(links),
      JSON.stringify([{ status, at: createdAt, actor: 'you' }]),
      createdAt,
    ]
  )
  return res.rows[0].id
}

const record = async (db: PGlite, id: string): Promise<Row> => {
  const res = await db.query<Row>(
    `select id, status, action, actor, pond_id, target_page_id, "before", "after", links, transitions
       from public.change_log where id = $1`,
    [id]
  )
  return res.rows[0]
}

const blocksOf = async (db: PGlite, pageId: string): Promise<unknown> => {
  const res = await db.query<{ blocks: unknown }>('select blocks from public.pages where id = $1', [
    pageId,
  ])
  return res.rows[0]?.blocks ?? null
}

const rowOf = async (
  db: PGlite,
  id: string
): Promise<{ title: string; props: Record<string, unknown> } | null> => {
  const res = await db.query<{ title: string; props: Record<string, unknown> }>(
    'select title, props from public.pages where id = $1',
    [id]
  )
  return res.rows[0] ?? null
}

const logSize = async (db: PGlite): Promise<number> => {
  const res = await db.query<{ n: number }>('select count(*)::int as n from public.change_log')
  return res.rows[0].n
}

const undo = (db: PGlite, ids: string[], pondId: string) =>
  db.query<Row>(`select * from public.undo_change_log_record($1::uuid[], $2, 'you')`, [ids, pondId])

const redo = (db: PGlite, ids: string[], pondId: string) =>
  db.query<Row>(`select * from public.redo_change_log_record($1::uuid[], $2, 'you')`, [ids, pondId])

/** A refusal: its SQLSTATE and the reason code the client reads off DETAIL. */
const refusal = (code: string, detail: string) => ({ code, detail })

/** A page at B, and the accepted own edit that took it from A to B. */
const scene = async (db: PGlite) => {
  await seedUser(db, USER)
  const pondId = await pondOf(db)
  const pageId = await addPage(db, { blocks: B })
  const edit = await addRecord(db, { pageId, before: A, after: B })
  return { pondId, pageId, edit }
}

// ── Undo: the compare-and-swap succeeds ──────────────────────────────────────

describe('undo_change_log_record — the undo is a record of its own', () => {
  it('sets the page back, writes an undo record, and marks the original undone', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)

    const res = await undo(db, [edit], pondId)

    expect(await blocksOf(db, pageId)).toEqual(A)
    expect((await record(db, edit)).status).toBe('undone')
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0]).toMatchObject({
      status: 'accepted',
      action: 'undo',
      actor: 'you',
      pond_id: pondId,
      target_page_id: pageId,
      before: B,
      after: A,
      links: { undo_of: edit },
    })
    await db.close()
  })

  it('appends exactly one transition to the original and births the undo accepted', async () => {
    const db = await makeDb()
    const { pondId, edit } = await scene(db)

    const res = await undo(db, [edit], pondId)

    expect((await record(db, edit)).transitions.map((t) => t.status)).toEqual([
      'accepted',
      'undone',
    ])
    expect(res.rows[0].transitions.map((t) => t.status)).toEqual(['accepted'])
    await db.close()
  })

  it('never rewrites the original diff — the log only grows', async () => {
    const db = await makeDb()
    const { pondId, edit } = await scene(db)

    await undo(db, [edit], pondId)

    expect(await record(db, edit)).toMatchObject({ before: A, after: B, links: {} })
    expect(await logSize(db)).toBe(2)
    await db.close()
  })
})

// ── Undo: the compare-and-swap fails ─────────────────────────────────────────

describe('undo_change_log_record — a stale undo fails cleanly', () => {
  it('refuses when the page changed since, says so in a code, and writes nothing', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await db.query('update public.pages set blocks = $1 where id = $2', [JSON.stringify(C), pageId])

    await expect(undo(db, [edit], pondId)).rejects.toMatchObject(refusal('P0001', 'page-changed'))

    expect(await blocksOf(db, pageId)).toEqual(C)
    expect((await record(db, edit)).status).toBe('accepted')
    expect(await logSize(db)).toBe(1)
    await db.close()
  })

  it('is not fooled by JSONB key order', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await db.query('update public.pages set blocks = $1 where id = $2', [
      JSON.stringify([{ content: 'ONE', type: 'text', id: 'a' }]),
      pageId,
    ])

    await undo(db, [edit], pondId)

    expect(await blocksOf(db, pageId)).toEqual(A)
    await db.close()
  })
})

// ── Undo: what it refuses ────────────────────────────────────────────────────

describe('undo_change_log_record — refusals leave everything as it was', () => {
  it('refuses a record that is not accepted (nothing is undone twice)', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await undo(db, [edit], pondId)

    await expect(undo(db, [edit], pondId)).rejects.toMatchObject(refusal('22023', 'already-undone'))
    expect(await blocksOf(db, pageId)).toEqual(A)
    expect(await logSize(db)).toBe(2)
    await db.close()
  })

  it('refuses a record from another pond', async () => {
    const db = await makeDb()
    const { pageId, edit } = await scene(db)
    const elsewhere = await otherPond(db)

    await expect(undo(db, [edit], elsewhere)).rejects.toMatchObject(refusal('22023', 'other-pond'))
    expect(await blocksOf(db, pageId)).toEqual(B)
    expect((await record(db, edit)).status).toBe('accepted')
    await db.close()
  })

  it('refuses a record that does not exist', async () => {
    const db = await makeDb()
    const { pondId } = await scene(db)

    await expect(undo(db, ['99999999-9999-9999-9999-999999999999'], pondId)).rejects.toMatchObject(
      refusal('P0002', 'not-found')
    )
    await db.close()
  })

  it('refuses an empty step', async () => {
    const db = await makeDb()
    const { pondId } = await scene(db)

    await expect(undo(db, [], pondId)).rejects.toMatchObject(refusal('22023', 'not-found'))
    await db.close()
  })

  it('refuses when the page it changed is gone', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await db.query('delete from public.pages where id = $1', [pageId])

    await expect(undo(db, [edit], pondId)).rejects.toMatchObject(refusal('P0002', 'page-gone'))
    expect((await record(db, edit)).status).toBe('accepted')
    await db.close()
  })

  it('refuses a kind of change it cannot set back', async () => {
    const db = await makeDb()
    const { pondId } = await scene(db)
    const made = await addRecord(db, {
      action: 'create_page',
      after: { title: 'suppliers', parent: null },
    })

    await expect(undo(db, [made], pondId)).rejects.toMatchObject(refusal('0A000', 'not-undoable'))
    expect((await record(db, made)).status).toBe('accepted')
    await db.close()
  })

  it('decides by action, not by what the snapshots look like', async () => {
    // A `move` carrying block arrays must not be set back as if it were an edit.
    const db = await makeDb()
    const { pondId, pageId } = await scene(db)
    const moved = await addRecord(db, { action: 'move', pageId, before: A, after: B })

    await expect(undo(db, [moved], pondId)).rejects.toMatchObject(refusal('0A000', 'not-undoable'))
    expect(await blocksOf(db, pageId)).toEqual(B)
    await db.close()
  })

  it('refuses to undo an undo record — redo is the path', async () => {
    const db = await makeDb()
    const { pondId, edit } = await scene(db)
    const made = (await undo(db, [edit], pondId)).rows[0]

    await expect(undo(db, [made.id], pondId)).rejects.toMatchObject(
      refusal('0A000', 'not-undoable')
    )
    await db.close()
  })
})

// ── Undo of a revert ─────────────────────────────────────────────────────────

describe('undo and redo of an accepted revert', () => {
  /** The scene's edit, reverted through `accept_revert_record`: the page is back at A. */
  const reverted = async (db: PGlite) => {
    const { pondId, pageId, edit } = await scene(db)
    const revert = await addRecord(db, {
      status: 'proposed',
      action: 'revert',
      pageId,
      before: B,
      after: A,
      links: { revert_of: edit },
    })
    await db.query(`select public.accept_revert_record($1, $2, $3, 'you')`, [
      revert,
      JSON.stringify(A),
      JSON.stringify(B),
    ])
    return { pondId, pageId, edit, revert }
  }

  it('undoes the revert: the page is as it was before it, the original stays reverted', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit, revert } = await reverted(db)

    const res = await undo(db, [revert], pondId)

    expect(await blocksOf(db, pageId)).toEqual(B)
    expect((await record(db, revert)).status).toBe('undone')
    expect((await record(db, edit)).status).toBe('reverted')
    expect(res.rows[0]).toMatchObject({
      action: 'undo',
      before: A,
      after: B,
      links: { undo_of: revert },
    })
    await db.close()
  })

  it('redoes the revert, taking the change off the page again', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit, revert } = await reverted(db)
    const undid = (await undo(db, [revert], pondId)).rows[0]

    const res = await redo(db, [revert], pondId)

    expect(await blocksOf(db, pageId)).toEqual(A)
    expect(res.rows[0]).toMatchObject({ action: 'redo', links: { redo_of: revert } })
    expect((await record(db, undid.id)).status).toBe('undone')
    expect((await record(db, revert)).status).toBe('undone')
    expect((await record(db, edit)).status).toBe('reverted')
    await db.close()
  })
})

// ── Multi-record steps undo as one ───────────────────────────────────────────

describe('undo_change_log_record — one step, several records', () => {
  it('undoes two records as one, newest first, whatever order they are passed in', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, { blocks: C })
    const first = await addRecord(db, {
      pageId,
      before: A,
      after: B,
      createdAt: '2026-10-09T10:00:00.000Z',
    })
    const second = await addRecord(db, {
      pageId,
      before: B,
      after: C,
      createdAt: '2026-10-09T10:00:01.000Z',
    })

    const res = await undo(db, [first, second], pondId)

    expect(await blocksOf(db, pageId)).toEqual(A)
    expect((await record(db, first)).status).toBe('undone')
    expect((await record(db, second)).status).toBe('undone')
    expect(res.rows.map((r) => r.links.undo_of)).toEqual([second, first])
    await db.close()
  })

  it('keeps the order through undo → redo → undo, every time, made at the same instant', async () => {
    // Both records share one `created_at`, as a tick that wrote two would: only
    // the caller's order tells them apart. The redo records a step writes must
    // then be told apart too, or undoing them sets the second back first.
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)

    for (let i = 0; i < 25; i += 1) {
      const pageId = await addPage(db, { blocks: C, title: `Target ${i}` })
      const createdAt = new Date().toISOString()
      const first = await addRecord(db, { pageId, before: A, after: B, createdAt })
      const second = await addRecord(db, { pageId, before: B, after: C, createdAt })

      await undo(db, [first, second], pondId)
      expect(await blocksOf(db, pageId)).toEqual(A)
      const redone = (await redo(db, [first, second], pondId)).rows.map((r) => r.id)
      expect(await blocksOf(db, pageId)).toEqual(C)
      await undo(db, redone, pondId)
      expect(await blocksOf(db, pageId)).toEqual(A)
      await redo(db, redone, pondId)
      expect(await blocksOf(db, pageId)).toEqual(C)
    }
    await db.close()
  })

  it('applies none of the step when one record in it is stale', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, { blocks: B })
    const otherPage = await addPage(db, { blocks: C, title: 'Other' })
    const fine = await addRecord(db, { pageId, before: A, after: B })
    const stale = await addRecord(db, { pageId: otherPage, before: A, after: B })

    await expect(undo(db, [fine, stale], pondId)).rejects.toMatchObject(
      refusal('P0001', 'page-changed')
    )

    expect(await blocksOf(db, pageId)).toEqual(B)
    expect(await blocksOf(db, otherPage)).toEqual(C)
    expect((await record(db, fine)).status).toBe('accepted')
    expect((await record(db, stale)).status).toBe('accepted')
    expect(await logSize(db)).toBe(2)
    await db.close()
  })
})

// ── Redo ─────────────────────────────────────────────────────────────────────

describe('redo_change_log_record — redo is a record too', () => {
  it('re-applies the undone record, writes a redo record, and marks the undo undone', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    const undoRecord = (await undo(db, [edit], pondId)).rows[0]

    const res = await redo(db, [edit], pondId)

    expect(await blocksOf(db, pageId)).toEqual(B)
    expect(res.rows[0]).toMatchObject({
      status: 'accepted',
      action: 'redo',
      before: A,
      after: B,
      links: { redo_of: edit },
    })
    expect((await record(db, undoRecord.id)).status).toBe('undone')
    expect((await record(db, edit)).status).toBe('undone')
    await db.close()
  })

  it('lets the redo itself be undone, and redone again', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await undo(db, [edit], pondId)
    const redone = (await redo(db, [edit], pondId)).rows[0]

    await undo(db, [redone.id], pondId)
    expect(await blocksOf(db, pageId)).toEqual(A)
    await redo(db, [redone.id], pondId)
    expect(await blocksOf(db, pageId)).toEqual(B)
    expect(await logSize(db)).toBe(5)
    await db.close()
  })

  it('refuses a stale redo and writes nothing', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await undo(db, [edit], pondId)
    await db.query('update public.pages set blocks = $1 where id = $2', [JSON.stringify(C), pageId])

    await expect(redo(db, [edit], pondId)).rejects.toMatchObject(refusal('P0001', 'page-changed'))

    expect(await blocksOf(db, pageId)).toEqual(C)
    expect(await logSize(db)).toBe(2)
    await db.close()
  })

  it('refuses a record that was never undone', async () => {
    const db = await makeDb()
    const { pondId, edit } = await scene(db)

    await expect(redo(db, [edit], pondId)).rejects.toMatchObject(refusal('22023', 'not-undone'))
    await db.close()
  })

  it('refuses when its undo was already taken back', async () => {
    const db = await makeDb()
    const { pondId, edit } = await scene(db)
    await undo(db, [edit], pondId)
    await redo(db, [edit], pondId)

    await expect(redo(db, [edit], pondId)).rejects.toMatchObject(refusal('22023', 'not-undone'))
    await db.close()
  })

  it('refuses a record from another pond', async () => {
    const db = await makeDb()
    const { pondId, edit } = await scene(db)
    await undo(db, [edit], pondId)

    await expect(redo(db, [edit], await otherPond(db))).rejects.toMatchObject(
      refusal('22023', 'other-pond')
    )
    await db.close()
  })
})

// ── Pending diffs the step makes stale ───────────────────────────────────────

describe('the outdated sweep runs inside the step', () => {
  it('outdates a pending diff written against the state the undo left', async () => {
    const db = await makeDb()
    const { pondId, edit, pageId } = await scene(db)
    const againstB = await addRecord(db, {
      status: 'proposed',
      pageId,
      before: B,
      after: C,
    })
    const againstA = await addRecord(db, { status: 'proposed', pageId, before: A, after: C })
    const sentBack = await addRecord(db, {
      status: 'changes_requested',
      pageId,
      before: B,
      after: C,
    })

    await undo(db, [edit], pondId)

    const swept = await record(db, againstB)
    expect(swept.status).toBe('outdated')
    expect(swept.transitions.map((t) => t.status)).toEqual(['proposed', 'outdated'])
    // Written against the page as it now stands, so still applicable.
    expect((await record(db, againstA)).status).toBe('proposed')
    // Terminal: nothing advances out of changes requested.
    expect((await record(db, sentBack)).status).toBe('changes_requested')
    await db.close()
  })

  it('leaves nothing outdated when the step is refused', async () => {
    const db = await makeDb()
    const { pondId, edit, pageId } = await scene(db)
    const pending = await addRecord(db, { status: 'proposed', pageId, before: B, after: C })
    const otherPage = await addPage(db, { blocks: C, title: 'Other' })
    const stale = await addRecord(db, { pageId: otherPage, before: A, after: B })

    await expect(undo(db, [edit, stale], pondId)).rejects.toMatchObject({ code: 'P0001' })

    expect((await record(db, pending)).status).toBe('proposed')
    await db.close()
  })
})

// ── Records of a database ────────────────────────────────────────────────────

describe('undo and redo of a record edit (add_row / edit_row)', () => {
  const values = { f1: 'mains' }
  const snapshot = (id: string, title: string, v: Record<string, unknown> = values) => ({
    id,
    title,
    values: v,
    shown: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])),
  })

  const collection = async (db: PGlite) => {
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const recipes = await addPage(db, { title: 'recipes', blocks: [] })
    await db.query(`update public.pages set props = $1 where id = $2`, [
      JSON.stringify({ _schema: [{ id: 'f1', name: 'course', type: 'text' }] }),
      recipes,
    ])
    return { pondId, recipes }
  }

  it('undoes an added record by removing it, and redo brings it back', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const rowId = await addRow(db, recipes, { title: 'chickpeas, harissa', props: values })
    const added = await addRecord(db, {
      action: 'add_row',
      pageId: recipes,
      before: null,
      after: snapshot(rowId, 'chickpeas, harissa'),
    })

    const made = (await undo(db, [added], pondId)).rows[0]
    expect(await rowOf(db, rowId)).toBeNull()
    expect(made).toMatchObject({ action: 'undo', before: snapshot(rowId, 'chickpeas, harissa') })
    expect(made.after).toBeNull()

    await redo(db, [added], pondId)
    expect(await rowOf(db, rowId)).toEqual({ title: 'chickpeas, harissa', props: values })
    await db.close()
  })

  it('puts a redone record back where it was and when it was made', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const createdAt = '2026-01-02T03:04:05.000Z'
    const rowId = await addRow(db, recipes, { title: 'dal', props: values, order: 7, createdAt })
    const added = await addRecord(db, {
      action: 'add_row',
      pageId: recipes,
      after: snapshot(rowId, 'dal'),
    })

    const made = (await undo(db, [added], pondId)).rows[0]
    expect(made.before).toMatchObject({ position: { order: 7 } })
    await redo(db, [added], pondId)

    const res = await db.query<{ order: number; created_at: Date }>(
      'select "order", created_at from public.pages where id = $1',
      [rowId]
    )
    expect(res.rows[0].order).toBe(7)
    expect(new Date(res.rows[0].created_at).toISOString()).toBe(createdAt)
    await db.close()
  })

  it('will not remove an added record that has had more written into it', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const rowId = await addRow(db, recipes, {
      title: 'chickpeas, harissa',
      props: values,
      blocks: [{ id: 'n', type: 'text', content: 'soak overnight' }],
    })
    const added = await addRecord(db, {
      action: 'add_row',
      pageId: recipes,
      after: snapshot(rowId, 'chickpeas, harissa'),
    })

    await expect(undo(db, [added], pondId)).rejects.toMatchObject(
      refusal('P0001', 'record-changed')
    )
    expect(await rowOf(db, rowId)).not.toBeNull()
    await db.close()
  })

  it('will not remove an added record another record links to, until it is unlinked', async () => {
    // Relations are forward-only: menus.dishes holds the id; recipes holds nothing.
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const rowId = await addRow(db, recipes, { title: 'chickpeas, harissa', props: values })
    const added = await addRecord(db, {
      action: 'add_row',
      pageId: recipes,
      after: snapshot(rowId, 'chickpeas, harissa'),
    })
    const menus = await addPage(db, { title: 'menus', blocks: [] })
    await db.query(`update public.pages set props = $1 where id = $2`, [
      JSON.stringify({
        _schema: [{ id: 'dishes', name: 'dishes', type: 'relation', target: recipes }],
      }),
      menus,
    ])
    const sunday = await addRow(db, menus, { title: 'sunday', props: { dishes: [rowId] } })

    await expect(undo(db, [added], pondId)).rejects.toMatchObject(
      refusal('P0001', 'linked-elsewhere')
    )
    expect(await rowOf(db, rowId)).not.toBeNull()
    expect((await record(db, added)).status).toBe('accepted')
    expect(await logSize(db)).toBe(1)

    await db.query(`update public.pages set props = $1 where id = $2`, [
      JSON.stringify({ dishes: [] }),
      sunday,
    ])
    await undo(db, [added], pondId)
    expect(await rowOf(db, rowId)).toBeNull()
    await db.close()
  })

  it('looks for links only in the record’s own pond', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const rowId = await addRow(db, recipes, { title: 'chickpeas, harissa', props: values })
    const added = await addRecord(db, {
      action: 'add_row',
      pageId: recipes,
      after: snapshot(rowId, 'chickpeas, harissa'),
    })
    const elsewhere = await otherPond(db)
    const menus = await addPage(db, { title: 'menus', blocks: [], pondId: elsewhere })
    await db.query(`update public.pages set props = $1 where id = $2`, [
      JSON.stringify({
        _schema: [{ id: 'dishes', name: 'dishes', type: 'relation', target: recipes }],
      }),
      menus,
    ])
    await addRow(db, menus, { title: 'sunday', props: { dishes: [rowId] }, pondId: elsewhere })

    await undo(db, [added], pondId)

    expect(await rowOf(db, rowId)).toBeNull()
    await db.close()
  })

  it('does not mistake a non-relation value that happens to hold the id for a link', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const rowId = await addRow(db, recipes, { title: 'chickpeas, harissa', props: values })
    const added = await addRecord(db, {
      action: 'add_row',
      pageId: recipes,
      after: snapshot(rowId, 'chickpeas, harissa'),
    })
    await addRow(db, recipes, { title: 'notes', props: { f1: [rowId] } })

    await undo(db, [added], pondId)

    expect(await rowOf(db, rowId)).toBeNull()
    await db.close()
  })

  it('sets an edited record back, keeping the collection schema out of it', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const rowId = await addRow(db, recipes, { title: 'dal, weeknight', props: { f1: 'sides' } })
    const edited = await addRecord(db, {
      action: 'edit_row',
      pageId: recipes,
      before: snapshot(rowId, 'dal', { f1: 'mains' }),
      after: snapshot(rowId, 'dal, weeknight', { f1: 'sides' }),
    })

    await undo(db, [edited], pondId)

    expect(await rowOf(db, rowId)).toEqual({ title: 'dal', props: { f1: 'mains' } })
    expect((await record(db, edited)).status).toBe('undone')
    await db.close()
  })

  it('outdates a pending record edit written against the record the undo moved', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const rowId = await addRow(db, recipes, { title: 'dal, weeknight', props: { f1: 'sides' } })
    const otherRow = await addRow(db, recipes, { title: 'cacio e pepe', props: { f1: 'mains' } })
    const edited = await addRecord(db, {
      action: 'edit_row',
      pageId: recipes,
      before: snapshot(rowId, 'dal', { f1: 'mains' }),
      after: snapshot(rowId, 'dal, weeknight', { f1: 'sides' }),
    })
    const pending = await addRecord(db, {
      status: 'proposed',
      action: 'edit_row',
      pageId: recipes,
      before: snapshot(rowId, 'dal, weeknight', { f1: 'sides' }),
      after: snapshot(rowId, 'dal, weeknight', { f1: 'soups' }),
    })
    const unrelated = await addRecord(db, {
      status: 'proposed',
      action: 'edit_row',
      pageId: recipes,
      before: snapshot(otherRow, 'cacio e pepe', { f1: 'mains' }),
      after: snapshot(otherRow, 'cacio e pepe', { f1: 'sides' }),
    })

    await undo(db, [edited], pondId)

    expect((await record(db, pending)).status).toBe('outdated')
    expect((await record(db, unrelated)).status).toBe('proposed')
    await db.close()
  })

  it('refuses a stale record edit', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const rowId = await addRow(db, recipes, { title: 'dal, weeknight', props: { f1: 'soups' } })
    const edited = await addRecord(db, {
      action: 'edit_row',
      pageId: recipes,
      before: snapshot(rowId, 'dal', { f1: 'mains' }),
      after: snapshot(rowId, 'dal, weeknight', { f1: 'sides' }),
    })

    await expect(undo(db, [edited], pondId)).rejects.toMatchObject(
      refusal('P0001', 'record-changed')
    )
    expect(await rowOf(db, rowId)).toEqual({ title: 'dal, weeknight', props: { f1: 'soups' } })
    await db.close()
  })

  it('refuses a redo whose name a sibling has taken since', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const rowId = await addRow(db, recipes, { title: 'dal', props: values })
    const added = await addRecord(db, {
      action: 'add_row',
      pageId: recipes,
      after: snapshot(rowId, 'dal'),
    })
    await undo(db, [added], pondId)
    await addRow(db, recipes, { title: 'dal', props: values })

    await expect(redo(db, [added], pondId)).rejects.toMatchObject(refusal('23505', 'name-taken'))
    expect(await logSize(db)).toBe(2)
    await db.close()
  })

  it('undoes a tick that made two records — an edit and an add — as one step', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const ticked = await addRow(db, recipes, { title: 'water plants', props: { f1: 'done' } })
    const next = await addRow(db, recipes, {
      title: 'water plants, 16 oct',
      props: { f1: 'todo' },
    })
    const edit = await addRecord(db, {
      action: 'edit_row',
      pageId: recipes,
      before: snapshot(ticked, 'water plants', { f1: 'todo' }),
      after: snapshot(ticked, 'water plants', { f1: 'done' }),
      createdAt: '2026-10-09T10:00:00.000Z',
    })
    const add = await addRecord(db, {
      action: 'add_row',
      pageId: recipes,
      after: snapshot(next, 'water plants, 16 oct', { f1: 'todo' }),
      createdAt: '2026-10-09T10:00:00.500Z',
    })

    await undo(db, [edit, add], pondId)

    expect(await rowOf(db, ticked)).toEqual({ title: 'water plants', props: { f1: 'todo' } })
    expect(await rowOf(db, next)).toBeNull()
    await db.close()
  })
})

// ── The helpers are not part of the API ──────────────────────────────────────

describe('0021 keeps its helpers out of the exposed schema', () => {
  it('has no change_log_set_back in public', async () => {
    const db = await makeDb()

    const res = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc
        where proname like 'change_log_%' and pronamespace = 'public'::regnamespace
          and proname not in ('change_log_append_only', 'change_log_no_truncate')`
    )
    expect(res.rows[0].n).toBe(0)
    await expect(db.query('select public.change_log_set_back()')).rejects.toThrow(/does not exist/)
    await db.close()
  })

  it('grants the private schema to signed-in callers only', async () => {
    const db = await makeDb()
    await db.exec(`create role nobody_in_particular`)

    const res = await db.query<{ signed_in: boolean; anyone: boolean }>(
      `select has_schema_privilege('authenticated', 'private', 'usage') as signed_in,
              has_schema_privilege('nobody_in_particular', 'private', 'usage') as anyone`
    )
    expect(res.rows[0]).toEqual({ signed_in: true, anyone: false })
    await db.close()
  })
})

// ── Row-level security: the functions run as their caller ─────────────────────

describe('undo_change_log_record — another person’s record is out of reach', () => {
  /** Supabase's grants and auth.uid(), which the harness's owner connection lacks. */
  const actAs = async (db: PGlite, userId: string) => {
    await db.exec(`
      grant usage on schema public to authenticated;
      grant select, insert, update, delete on all tables in schema public to authenticated;
      create or replace function auth.uid() returns uuid language sql stable as
        $fn$ select nullif(current_setting('test.uid', true), '')::uuid $fn$;
    `)
    await db.exec(`set test.uid = '${userId}'; set role authenticated;`)
  }

  it('lets the owner undo and redo under row-level security', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await actAs(db, USER)

    await undo(db, [edit], pondId)
    await redo(db, [edit], pondId)

    await db.exec('reset role;')
    expect(await blocksOf(db, pageId)).toEqual(B)
    expect(await logSize(db)).toBe(3)
    await db.close()
  })

  it('cannot see, so cannot undo, a record that belongs to someone else', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await seedUser(db, STRANGER)
    await actAs(db, STRANGER)

    await expect(undo(db, [edit], pondId)).rejects.toMatchObject(refusal('P0002', 'not-found'))

    await db.exec('reset role;')
    expect(await blocksOf(db, pageId)).toEqual(B)
    expect((await record(db, edit)).status).toBe('accepted')
    await db.close()
  })
})

// ── 0024: no path back to the retryable errcode ──────────────────────────────

describe('0024 undo refusals are not retryable', () => {
  it('has no serialization_failure or 40001 left anywhere in public/private', async () => {
    const db = await makeDb()

    const res = await db.query<{ proname: string; prosrc: string }>(
      `select proname, prosrc from pg_proc
        where pronamespace in ('public'::regnamespace, 'private'::regnamespace)`
    )

    const named = res.rows.filter(({ proname }) =>
      ['change_log_set_back', 'undo_change_log_record', 'redo_change_log_record'].includes(proname)
    )
    expect(named.length).toBe(3)

    for (const { prosrc } of res.rows) {
      expect(prosrc).not.toMatch(/serialization_failure/)
      expect(prosrc).not.toMatch(/40001/)
    }
    await db.close()
  })
})

// ── 0025: accept/reject's own CAS stops being retryable too ──────────────────

describe('0025 accept refusals are not retryable', () => {
  it('refuses a stale advance_change_log_record call and writes nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addRecord(db, { status: 'proposed' })

    await db.query(`select public.advance_change_log_record($1,'proposed','accepted','you')`, [id])

    await expect(
      db.query(`select public.advance_change_log_record($1,'proposed','rejected','you')`, [id])
    ).rejects.toMatchObject(refusal('P0001', 'record-changed'))

    const res = await db.query<{ n: number; status: string }>(
      `select jsonb_array_length(transitions)::int as n, status
       from public.change_log where id = $1`,
      [id]
    )
    expect(res.rows[0].status).toBe('accepted')
    expect(res.rows[0].n).toBe(2)
    await db.close()
  })
})
