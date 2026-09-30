// PGLite schema-invariant test harness (issue #74).
//
// Boots an in-process WASM Postgres, applies a minimal Supabase-compat shim,
// then runs the REAL `supabase/migrations/*.sql` from disk so schema-level
// invariants (FK cascade, workspace scoping) are exercised against genuine
// Postgres semantics — not the mocked supabase-js builder the jsdom unit suite
// uses. Reading migrations from disk (not fixtures) means new migrations are
// auto-covered.
//
// We connect as the PGLite owner role, so the RLS policies the migrations
// create are inert (owners bypass RLS) — `auth.uid()` only needs to EXIST for
// policy creation to parse, hence the null-returning stub.

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'

// Helper lives at src/__tests__/helpers/ → repo root is three levels up.
const MIGRATIONS_DIR = resolve(__dirname, '../../..', 'supabase/migrations')

// Applied BEFORE the migrations so the Supabase-managed schemas the migrations
// lean on exist on vanilla Postgres:
//   - auth: 0001 `references auth.users`, RLS policies call `auth.uid()`, grants
//     to `authenticated`, and an `after insert on auth.users` trigger.
//   - storage: 0008 inserts into `storage.buckets` and defines policies on
//     `storage.objects` using `storage.foldername()`.
// We connect as owner, so all the RLS these create is inert — the shim only has
// to make the objects resolvable, not enforce anything.
const SUPABASE_SHIM = `
  create schema if not exists auth;

  -- Stub of Supabase's auth.users. The email column is required because 0001's
  -- on_auth_user_created trigger copies new.email into public.users.email.
  create table if not exists auth.users (
    id uuid primary key,
    email text not null
  );

  -- RLS policies read auth.uid(); a null-returning stub is enough because we
  -- connect as owner and RLS never actually gates these tests.
  create or replace function auth.uid()
    returns uuid language sql stable as $fn$ select null::uuid $fn$;

  -- grant ... to authenticated in the migrations needs the role to exist.
  do $shim$
  begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
  end
  $shim$;

  -- Stub of Supabase Storage. 0008 inserts a bucket and creates policies on
  -- storage.objects; the columns/function below are the minimal surface those
  -- statements touch (path-splitting mirrors Supabase's storage.foldername).
  create schema if not exists storage;

  create table if not exists storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text
  );

  create or replace function storage.foldername(name text)
    returns text[] language sql immutable as $fn$
      select string_to_array(name, '/')
    $fn$;
`

/** Read every migration file from disk in lexical (0001, 0002, …) order. */
export function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }))
}

/** Apply one migration file by name, surfacing WHICH one broke. */
export async function applyMigration(db: PGlite, name: string): Promise<void> {
  const file = migrationFiles().find((m) => m.name === name)
  if (!file) throw new Error(`No such migration: ${name}`)
  try {
    await db.exec(file.sql)
  } catch (err) {
    throw new Error(`Migration ${name} failed to apply: ${(err as Error).message}`)
  }
}

/**
 * Boot a fresh in-memory Postgres with the auth shim + the real migrations
 * applied. Each call is an isolated database.
 *
 * `opts.through` stops after the named migration (inclusive), which is how a
 * data-converting migration gets tested: boot the db one short of it, insert the
 * pre-migration rows, then `applyMigration` the one under test (#108).
 */
export async function makeDb(opts: { through?: string } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { vector } })
  await db.exec(SUPABASE_SHIM)
  const all = migrationFiles()
  if (opts.through && !all.some((m) => m.name === opts.through)) {
    throw new Error(`No such migration: ${opts.through}`)
  }
  for (const { name, sql } of all) {
    try {
      await db.exec(sql)
    } catch (err) {
      // Surface WHICH migration broke — the shim is the known risk area.
      throw new Error(`Migration ${name} failed to apply: ${(err as Error).message}`)
    }
    if (name === opts.through) break
  }
  return db
}

/**
 * Seed the auth.users → public.users chain for a user id so pages (which FK to
 * public.users) can be inserted. Inserting auth.users fires 0001's trigger,
 * which creates the public.users row; the explicit upsert is a defensive
 * belt-and-braces in case the trigger is ever removed.
 */
export async function seedUser(
  db: PGlite,
  userId: string,
  email = `${userId}@example.test`
): Promise<void> {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [userId, email])
  await db.query(
    'insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing',
    [userId, email]
  )
}
