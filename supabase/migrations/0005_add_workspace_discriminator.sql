-- ── Workspace discriminator (ticket-43 — sandbox scope) ──────────────────────
--
-- ADDITIVE: adds a `workspace` text column to `pages` and `conversations`,
-- defaulting to 'main'. Sandbox rows use 'sandbox'. All existing rows silently
-- inherit 'main' via the DEFAULT, so no data migration is needed.
--
-- REVERSIBLE: to roll back, drop the column from both tables (see comment at
-- bottom). The DEFAULT keeps the column backwards-compatible if the column is
-- re-added after a rollback.
--
-- Isolation guarantee: every query that touches `pages` or `conversations` in
-- application code MUST add .eq('workspace', scope). The real /workspace route
-- always passes scope='main'; /sandbox always passes scope='sandbox'. Rows never
-- cross scopes in application reads.

-- ── pages ─────────────────────────────────────────────────────────────────────

alter table public.pages
  add column if not exists workspace text not null default 'main'
    check (workspace in ('main', 'sandbox'));

create index if not exists pages_workspace_idx on public.pages (workspace);

-- ── conversations ─────────────────────────────────────────────────────────────

alter table public.conversations
  add column if not exists workspace text not null default 'main'
    check (workspace in ('main', 'sandbox'));

create index if not exists conversations_workspace_idx on public.conversations (workspace);

-- ── Sandbox seed function ─────────────────────────────────────────────────────
-- Inserts 2 areas + 1 demo page into the sandbox scope for a user.
-- Called by the "Reset sandbox" action (wipes first, then calls this).

create or replace function public.seed_sandbox_pages(p_user_id uuid)
returns void language plpgsql as $$
declare
  v_area1_id uuid;
  v_area2_id uuid;
begin
  -- Area 1
  insert into public.pages (user_id, parent_id, type, title, "order", workspace)
  values (p_user_id, null, 'area', 'Sandbox Area A', 0, 'sandbox')
  returning id into v_area1_id;

  -- Area 2
  insert into public.pages (user_id, parent_id, type, title, "order", workspace)
  values (p_user_id, null, 'area', 'Sandbox Area B', 1, 'sandbox')
  returning id into v_area2_id;

  -- Demo page inside Area A
  insert into public.pages (user_id, parent_id, type, title, "order", workspace)
  values (p_user_id, v_area1_id, 'page', 'Demo Page', 0, 'sandbox');
end;
$$;

grant execute on function public.seed_sandbox_pages(uuid) to authenticated;

-- ── Reset sandbox function ────────────────────────────────────────────────────
-- Atomically wipes all sandbox rows for a user and re-seeds the fixture.
-- Safe to call repeatedly; idempotent result (fixture state after each call).

create or replace function public.reset_sandbox(p_user_id uuid)
returns void language plpgsql as $$
begin
  -- Delete sandbox conversations
  delete from public.conversations
  where user_id = p_user_id and workspace = 'sandbox';

  -- Delete sandbox pages (cascade removes descendants via FK)
  delete from public.pages
  where user_id = p_user_id and workspace = 'sandbox' and parent_id is null;

  -- Re-seed the fixture
  perform public.seed_sandbox_pages(p_user_id);
end;
$$;

grant execute on function public.reset_sandbox(uuid) to authenticated;

-- ── ROLLBACK (apply manually if needed) ──────────────────────────────────────
-- alter table public.pages drop column if exists workspace;
-- alter table public.conversations drop column if exists workspace;
-- drop function if exists public.seed_sandbox_pages(uuid);
-- drop function if exists public.reset_sandbox(uuid);
