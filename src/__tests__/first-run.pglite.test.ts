// Schema tests for 0026_first_run_done_at.sql (KAN-195).
//
// public.users has been SELECT-only for the client since 0012 (#145) — no
// UPDATE or DELETE policy. This proves the column lands, the policy stays
// exactly that narrow, and mark_first_run_done() is the only door: it sets
// the flag once and a second call never moves the timestamp.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'

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

describe('0026_first_run_done_at — the column', () => {
  it('is null by default for a brand-new account', async () => {
    const db = await makeDb()
    await seedUser(db, USER)

    const res = await db.query<{ first_run_done_at: string | null }>(
      'select first_run_done_at from public.users where id = $1',
      [USER]
    )
    expect(res.rows).toEqual([{ first_run_done_at: null }])
    await db.close()
  })
})

describe('0026_first_run_done_at — mark_first_run_done()', () => {
  it("sets the caller's own flag once", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await actAs(db, USER)

    await db.query('select public.mark_first_run_done()')

    await db.exec('reset role;')
    const res = await db.query<{ first_run_done_at: string | null }>(
      'select first_run_done_at from public.users where id = $1',
      [USER]
    )
    expect(res.rows[0].first_run_done_at).not.toBeNull()
    await db.close()
  })

  it('keeps the first timestamp on a second call (idempotent)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await actAs(db, USER)

    await db.query('select public.mark_first_run_done()')
    const first = (
      await db.query<{ first_run_done_at: string }>(
        'select first_run_done_at from public.users where id = $1',
        [USER]
      )
    ).rows[0].first_run_done_at

    await db.query('select public.mark_first_run_done()')
    const second = (
      await db.query<{ first_run_done_at: string }>(
        'select first_run_done_at from public.users where id = $1',
        [USER]
      )
    ).rows[0].first_run_done_at

    expect(second).toEqual(first)
    await db.exec('reset role;')
    await db.close()
  })
})

describe('0026_first_run_done_at — the users policy stays SELECT-only', () => {
  it('has exactly one policy on public.users, and it is SELECT', async () => {
    const db = await makeDb()

    const res = await db.query<{ policyname: string; cmd: string }>(
      `select policyname, cmd from pg_policies
        where schemaname = 'public' and tablename = 'users'`
    )
    expect(res.rows).toEqual([{ policyname: 'users: read own row', cmd: 'SELECT' }])
    await db.close()
  })

  it('cannot be set by a direct client update under RLS — only the function may write it', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await actAs(db, USER)

    const res = await db.query(
      `update public.users set first_run_done_at = now() where id = $1`,
      [USER]
    )
    // No UPDATE policy grants this, so the client's update affects zero rows
    // rather than erroring — the same silent-no-op RLS gives any other table.
    expect(res.affectedRows ?? 0).toBe(0)

    await db.exec('reset role;')
    const check = await db.query<{ first_run_done_at: string | null }>(
      'select first_run_done_at from public.users where id = $1',
      [USER]
    )
    expect(check.rows[0].first_run_done_at).toBeNull()
    await db.close()
  })
})
