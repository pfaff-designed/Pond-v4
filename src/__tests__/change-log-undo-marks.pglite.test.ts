// Schema tests for 0023_undo_marks.sql.
//
// A glyph pick is logged as the person's own accepted `edit_glyph` record
// (KAN-248, `Rail.tsx`'s `handlePickGlyph`) — before/after a glyph id or null
// (automatic), never a `Block[]`. 0021 taught `change_log_undo_kind` /
// `change_log_set_back` only `blocks` and `row`, so an `edit_glyph` record was
// `0A000 not-undoable`. Proved here against real Postgres (PGLite, the real
// migrations from disk), same compare-and-swap discipline as the other kinds.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'

const pondOf = async (db: PGlite): Promise<string> => {
  const res = await db.query<{ id: string }>(
    'select id from public.ponds where user_id = $1 order by "order" limit 1',
    [USER]
  )
  return res.rows[0].id
}

const addPage = async (
  db: PGlite,
  opts: { glyph?: string | null; pondId?: string; title?: string } = {}
): Promise<string> => {
  const pondId = opts.pondId ?? (await pondOf(db))
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, glyph)
     values ($1, $2, null, 'page', $3, $4) returning id`,
    [USER, pondId, opts.title ?? 'Target', opts.glyph ?? null]
  )
  return res.rows[0].id
}

const addRecord = async (
  db: PGlite,
  opts: {
    pondId?: string
    status?: string
    action?: string
    pageId: string
    before?: string | null
    after?: string | null
  }
): Promise<string> => {
  const { status = 'accepted', action = 'edit_glyph', pageId } = opts
  const pondId = opts.pondId ?? (await pondOf(db))
  const createdAt = new Date().toISOString()
  const res = await db.query<{ id: string }>(
    `insert into public.change_log
       (user_id, pond_id, status, action, actor, target_page_id, "before", "after",
        links, transitions, created_at)
     values ($1,$2,$3,$4,'you',$5,$6,$7,'{}','[]',$8) returning id`,
    [
      USER,
      pondId,
      status,
      action,
      pageId,
      opts.before === undefined ? null : JSON.stringify(opts.before),
      opts.after === undefined ? null : JSON.stringify(opts.after),
      createdAt,
    ]
  )
  return res.rows[0].id
}

const glyphOf = async (db: PGlite, pageId: string): Promise<string | null> => {
  const res = await db.query<{ glyph: string | null }>(
    'select glyph from public.pages where id = $1',
    [pageId]
  )
  return res.rows[0]?.glyph ?? null
}

const statusOf = async (db: PGlite, id: string): Promise<string> => {
  const res = await db.query<{ status: string }>(
    'select status from public.change_log where id = $1',
    [id]
  )
  return res.rows[0].status
}

const undo = (db: PGlite, ids: string[], pondId: string) =>
  db.query<{ id: string; action: string; before: unknown; after: unknown; links: Record<string, string> }>(
    `select * from public.undo_change_log_record($1::uuid[], $2, 'you')`,
    [ids, pondId]
  )

const redo = (db: PGlite, ids: string[], pondId: string) =>
  db.query<{ id: string; action: string; before: unknown; after: unknown; links: Record<string, string> }>(
    `select * from public.redo_change_log_record($1::uuid[], $2, 'you')`,
    [ids, pondId]
  )

/** A refusal: its SQLSTATE and the reason code the client reads off DETAIL. */
const refusal = (code: string, detail: string) => ({ code, detail })

describe('undo_change_log_record — an edit_glyph record sets the pick back', () => {
  it('puts the previous glyph back, writes an undo record, and marks the pick undone', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, { glyph: 'beaker' })
    const pick = await addRecord(db, { pageId, before: 'flask', after: 'beaker' })

    const res = await undo(db, [pick], pondId)

    expect(await glyphOf(db, pageId)).toBe('flask')
    expect(await statusOf(db, pick)).toBe('undone')
    expect(res.rows[0]).toMatchObject({
      action: 'undo',
      before: 'beaker',
      after: 'flask',
      links: { undo_of: pick },
    })
    await db.close()
  })

  it('treats a pick of automatic (null) as a real before/after, not a missing one', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, { glyph: 'beaker' })
    const pick = await addRecord(db, { pageId, before: null, after: 'beaker' })

    await undo(db, [pick], pondId)

    expect(await glyphOf(db, pageId)).toBeNull()
    await db.close()
  })

  it('refuses when the glyph changed since, says so in a code, and writes nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, { glyph: 'retort' })
    const pick = await addRecord(db, { pageId, before: 'flask', after: 'beaker' })

    await expect(undo(db, [pick], pondId)).rejects.toMatchObject(refusal('40001', 'page-changed'))

    expect(await glyphOf(db, pageId)).toBe('retort')
    expect(await statusOf(db, pick)).toBe('accepted')
    await db.close()
  })

  it('redoes the pick, putting the glyph back and marking the undo undone', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, { glyph: 'beaker' })
    const pick = await addRecord(db, { pageId, before: 'flask', after: 'beaker' })
    const undone = (await undo(db, [pick], pondId)).rows[0]

    const res = await redo(db, [pick], pondId)

    expect(await glyphOf(db, pageId)).toBe('beaker')
    expect(res.rows[0]).toMatchObject({ action: 'redo', before: 'flask', after: 'beaker', links: { redo_of: pick } })
    expect(await statusOf(db, undone.id)).toBe('undone')
    expect(await statusOf(db, pick)).toBe('undone')
    await db.close()
  })

  it('does not stamp updated_at — a mark write never does', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, { glyph: 'beaker' })
    const before = (
      await db.query<{ updated_at: Date }>('select updated_at from public.pages where id = $1', [pageId])
    ).rows[0].updated_at
    const pick = await addRecord(db, { pageId, before: 'flask', after: 'beaker' })

    await undo(db, [pick], pondId)

    const after = (
      await db.query<{ updated_at: Date }>('select updated_at from public.pages where id = $1', [pageId])
    ).rows[0].updated_at
    expect(new Date(after).getTime()).toBe(new Date(before).getTime())
    await db.close()
  })
})
