// Schema tests for supabase/migrations/0037_undo_restore.sql part a (KAN-497).
//
// `change_log_undo_kind` is re-created from 0032's body (the latest, verified
// against origin/main) with one new arm: a `restore` record now classifies as
// kind `restore` instead of falling through to the unlisted-action `null`
// (which `undo_change_log_record` turns into `0A000 not-undoable`). Called
// directly here, against the owner connection (owners bypass RLS, so no
// `actAs` needed — this function reads nothing RLS would hide), rather than
// through the full undo flow: `change_log_set_back` carries no `restore`
// branch yet (that's part b), so the full flow isn't exercisable yet.

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

const addPage = async (db: PGlite, pondId: string, title = 'roof'): Promise<string> => {
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, props, blocks)
     values ($1, $2, null, 'page', $3, '{}'::jsonb, '[]'::jsonb) returning id`,
    [USER, pondId, title]
  )
  return res.rows[0].id
}

const addRecord = async (
  db: PGlite,
  pondId: string,
  pageId: string,
  action: string
): Promise<string> => {
  const res = await db.query<{ id: string }>(
    `insert into public.change_log
       (user_id, pond_id, status, action, actor, target_page_id, "before", "after", transitions)
     values ($1, $2, 'accepted', $3, 'you', $4, null, '{}'::jsonb,
       jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', now(), 'actor', 'you')))
     returning id`,
    [USER, pondId, action, pageId]
  )
  return res.rows[0].id
}

const undoKindOf = async (db: PGlite, recordId: string): Promise<string | null> => {
  const res = await db.query<{ kind: string | null }>(
    `select private.change_log_undo_kind(c) as kind
     from public.change_log c where c.id = $1`,
    [recordId]
  )
  return res.rows[0].kind
}

describe('0037_undo_restore part a — change_log_undo_kind learns restore', () => {
  it('classifies a restore record as kind restore', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, pondId)
    const recordId = await addRecord(db, pondId, pageId, 'restore')

    expect(await undoKindOf(db, recordId)).toBe('restore')
    await db.close()
  })

  it('still classifies every existing action the same as before this migration', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, pondId)

    const expected: Record<string, string | null> = {
      edit: 'blocks',
      revert: 'blocks',
      add_row: 'row',
      edit_row: 'row',
      edit_glyph: 'glyph',
      edit_area_role: 'area_role',
      create_page: 'page',
      move: 'move',
      duplicate_page: 'page',
      delete: null,
    }

    for (const [action, kind] of Object.entries(expected)) {
      const recordId = await addRecord(db, pondId, pageId, action)
      expect(await undoKindOf(db, recordId)).toBe(kind)
    }
    await db.close()
  })
})
