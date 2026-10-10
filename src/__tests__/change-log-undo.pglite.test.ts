// Schema tests for 0021_undo_redo.sql (KAN-93).
//
// "The undo is a record of its own, and the record it undid is marked undone."
// "redo ⇧⌘Z is a record too." Both are promises about the DATABASE — a page write,
// a new record and an advanced record land together or not at all — so they are
// proved here against real Postgres (PGLite, the real migrations from disk).
// Every refusal is checked for leaving the page AND the log exactly as they were:
// the log only grows, so a half-applied undo could never be repaired.

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

async function pondOf(db: PGlite, userId: string = USER): Promise<string> {
  const res = await db.query<{ id: string }>(
    'select id from public.ponds where user_id = $1 order by "order" limit 1',
    [userId]
  )
  return res.rows[0].id
}

async function otherPond(db: PGlite, userId: string = USER): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.ponds (user_id, name, "order") values ($1, 'elsewhere', 9) returning id`,
    [userId]
  )
  return res.rows[0].id
}

async function addPage(
  db: PGlite,
  opts: { userId?: string; pondId?: string; blocks?: unknown; title?: string } = {}
): Promise<string> {
  const { userId = USER, blocks = B, title = 'Target' } = opts
  const pondId = opts.pondId ?? (await pondOf(db, userId))
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, blocks)
     values ($1, $2, null, 'page', $3, $4) returning id`,
    [userId, pondId, title, JSON.stringify(blocks)]
  )
  return res.rows[0].id
}

async function addRow(
  db: PGlite,
  collectionId: string,
  opts: { title: string; props?: Record<string, unknown>; blocks?: unknown }
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, props, blocks)
     values ($1, $2, $3, 'row', $4, $5, $6) returning id`,
    [
      USER,
      await pondOf(db),
      collectionId,
      opts.title,
      JSON.stringify(opts.props ?? {}),
      JSON.stringify(opts.blocks ?? []),
    ]
  )
  return res.rows[0].id
}

async function addRecord(
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
): Promise<string> {
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

async function record(db: PGlite, id: string): Promise<Row> {
  const res = await db.query<Row>(
    `select id, status, action, actor, pond_id, target_page_id, "before", "after", links, transitions
       from public.change_log where id = $1`,
    [id]
  )
  return res.rows[0]
}

async function blocksOf(db: PGlite, pageId: string): Promise<unknown> {
  const res = await db.query<{ blocks: unknown }>('select blocks from public.pages where id = $1', [
    pageId,
  ])
  return res.rows[0]?.blocks ?? null
}

async function rowOf(
  db: PGlite,
  id: string
): Promise<{ title: string; props: Record<string, unknown> } | null> {
  const res = await db.query<{ title: string; props: Record<string, unknown> }>(
    'select title, props from public.pages where id = $1',
    [id]
  )
  return res.rows[0] ?? null
}

async function logSize(db: PGlite): Promise<number> {
  const res = await db.query<{ n: number }>('select count(*)::int as n from public.change_log')
  return res.rows[0].n
}

const undo = (db: PGlite, ids: string[], pondId: string) =>
  db.query<Row>(`select * from public.undo_change_log_record($1::uuid[], $2, 'you')`, [ids, pondId])

const redo = (db: PGlite, ids: string[], pondId: string) =>
  db.query<Row>(`select * from public.redo_change_log_record($1::uuid[], $2, 'you')`, [ids, pondId])

/** A page at B, and the accepted own edit that took it from A to B. */
async function scene(db: PGlite) {
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
    const made = res.rows[0]
    expect(made).toMatchObject({
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
  it('refuses when the page changed since, and writes nothing at all', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await db.query('update public.pages set blocks = $1 where id = $2', [JSON.stringify(C), pageId])

    await expect(undo(db, [edit], pondId)).rejects.toThrow(/changed since/)

    expect(await blocksOf(db, pageId)).toEqual(C)
    expect((await record(db, edit)).status).toBe('accepted')
    expect(await logSize(db)).toBe(1)
    await db.close()
  })

  it('reports the stale case with serialization_failure, so a caller can tell it apart', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await db.query('update public.pages set blocks = $1 where id = $2', [JSON.stringify(C), pageId])

    await expect(undo(db, [edit], pondId)).rejects.toMatchObject({ code: '40001' })
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

    await expect(undo(db, [edit], pondId)).rejects.toThrow(/only an accepted record/)
    expect(await blocksOf(db, pageId)).toEqual(A)
    expect(await logSize(db)).toBe(2)
    await db.close()
  })

  it('refuses a record from another pond', async () => {
    const db = await makeDb()
    const { pageId, edit } = await scene(db)
    const elsewhere = await otherPond(db)

    await expect(undo(db, [edit], elsewhere)).rejects.toThrow(/not in this pond/)
    expect(await blocksOf(db, pageId)).toEqual(B)
    expect((await record(db, edit)).status).toBe('accepted')
    await db.close()
  })

  it('refuses a record that does not exist', async () => {
    const db = await makeDb()
    const { pondId } = await scene(db)

    await expect(undo(db, ['99999999-9999-9999-9999-999999999999'], pondId)).rejects.toThrow(
      /not found/
    )
    await db.close()
  })

  it('refuses an empty step', async () => {
    const db = await makeDb()
    const { pondId } = await scene(db)

    await expect(undo(db, [], pondId)).rejects.toThrow(/nothing to undo/)
    await db.close()
  })

  it('refuses when the page it changed is gone', async () => {
    const db = await makeDb()
    const { pondId, pageId, edit } = await scene(db)
    await db.query('delete from public.pages where id = $1', [pageId])

    await expect(undo(db, [edit], pondId)).rejects.toThrow(/page it changed is gone/)
    expect((await record(db, edit)).status).toBe('accepted')
    await db.close()
  })

  it('refuses a kind of change it cannot set back, and says so', async () => {
    const db = await makeDb()
    const { pondId } = await scene(db)
    const made = await addRecord(db, {
      action: 'create_page',
      after: { title: 'suppliers', parent: null },
    })

    await expect(undo(db, [made], pondId)).rejects.toThrow(/a create_page cannot be undone/)
    expect((await record(db, made)).status).toBe('accepted')
    await db.close()
  })
})

// ── Multi-record steps undo as one ───────────────────────────────────────────

describe('undo_change_log_record — one step, several records', () => {
  it('undoes two records as one, newest first, whatever order they are passed in', async () => {
    // One step that made two records on the same page: A → B, then B → C.
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

  it('applies none of the step when one record in it is stale', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, { blocks: B })
    const otherPage = await addPage(db, { blocks: C, title: 'Other' })
    const fine = await addRecord(db, { pageId, before: A, after: B })
    // Claims the other page reads B; it reads C, so this half is stale.
    const stale = await addRecord(db, { pageId: otherPage, before: A, after: B })

    await expect(undo(db, [fine, stale], pondId)).rejects.toThrow(/changed since/)

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
    // Redo is the undo of the undo: the undo record is what gets taken back.
    expect((await record(db, undoRecord.id)).status).toBe('undone')
    // The original stays undone — the redo record is the one that now stands.
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

    await expect(redo(db, [edit], pondId)).rejects.toMatchObject({ code: '40001' })

    expect(await blocksOf(db, pageId)).toEqual(C)
    expect(await logSize(db)).toBe(2)
    await db.close()
  })

  it('refuses a record that was never undone', async () => {
    const db = await makeDb()
    const { pondId, edit } = await scene(db)

    await expect(redo(db, [edit], pondId)).rejects.toThrow(/only an undone record/)
    await db.close()
  })

  it('refuses when its undo was already taken back', async () => {
    const db = await makeDb()
    const { pondId, edit } = await scene(db)
    await undo(db, [edit], pondId)
    await redo(db, [edit], pondId)

    await expect(redo(db, [edit], pondId)).rejects.toThrow(/no standing undo/)
    await db.close()
  })

  it('refuses a record from another pond', async () => {
    const db = await makeDb()
    const { pondId, edit } = await scene(db)
    await undo(db, [edit], pondId)

    await expect(redo(db, [edit], await otherPond(db))).rejects.toThrow(/not in this pond/)
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

  async function collection(db: PGlite) {
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
    // The board's own example: "undo · added chickpeas, harissa" on recipes.
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

    await expect(undo(db, [added], pondId)).rejects.toMatchObject({ code: '40001' })
    expect(await rowOf(db, rowId)).not.toBeNull()
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

    await expect(undo(db, [edited], pondId)).rejects.toThrow(/changed since/)
    expect(await rowOf(db, rowId)).toEqual({ title: 'dal, weeknight', props: { f1: 'soups' } })
    await db.close()
  })

  it('undoes a tick that made two records — an edit and an add — as one step', async () => {
    const db = await makeDb()
    const { pondId, recipes } = await collection(db)
    const ticked = await addRow(db, recipes, { title: 'water plants', props: { f1: 'done' } })
    const next = await addRow(db, recipes, { title: 'water plants, 16 oct', props: { f1: 'todo' } })
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

// ── Row-level security: the function runs as its caller ──────────────────────

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

  it('lets the owner undo under row-level security', async () => {
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

    await expect(undo(db, [edit], pondId)).rejects.toThrow(/not found/)

    await db.exec('reset role;')
    expect(await blocksOf(db, pageId)).toEqual(B)
    expect((await record(db, edit)).status).toBe('accepted')
    await db.close()
  })
})
