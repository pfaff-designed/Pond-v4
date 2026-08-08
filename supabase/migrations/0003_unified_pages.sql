-- ─── Unified Page Tree ───────────────────────────────────────────────────────
-- Collapses areas / routines / projects / actions / documents into ONE self-
-- referential `pages` tree. "Everything is a page; type is just a tag." A page
-- IS its own document — its content (blocks) and embedding live on the row.
--
-- ADDITIVE migration: creates + populates `pages`, leaves the legacy tables
-- intact as a rollback valve. A later `0005_drop_legacy_tables.sql` removes them
-- only after all application code has cut over and is verified green.
--
-- Existing UUIDs are PRESERVED so old references (conversation transcript
-- node_ids, open URLs, embeddings) keep working.

-- ── Table ────────────────────────────────────────────────────────────────────
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- null = top-level. Self-referential → arbitrary-depth tree + subtree cascade
  -- delete via the FK (no trigger). DEFERRABLE so bulk id-preserving inserts
  -- (and future reparent/reorder) don't hit within-statement ordering checks.
  parent_id uuid references public.pages(id) on delete cascade
    deferrable initially deferred,
  -- Tag, not a hard type. CHECK kept for now so nothing downstream silently gets
  -- an unknown label (formatNodeContext / AI tools switch on these); loosen later
  -- if free-form tags are wanted.
  type text not null default 'page'
    check (type in ('area', 'project', 'routine', 'action', 'page')),
  title text not null default 'Untitled',
  blocks jsonb not null default '[]',   -- page content (was documents.blocks)
  embedding vector(1536),               -- OpenAI text-embedding-3-small (was documents.embedding)
  status text,                          -- optional (project | action)
  props jsonb not null default '{}',    -- type extras: due_date, description, cadence, resource_tags, scheduled_at, …
  "order" int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.pages enable row level security;
create policy "pages: own rows" on public.pages
  for all using (auth.uid() = user_id);

-- Vector similarity index for semantic search (mirrors documents index)
create index on public.pages using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ── Data migration (id-preserving, in dependency order) ──────────────────────
-- Order matters for the data LOOKUPs (documents left-joins the already-inserted
-- node pages); FK *checks* are deferred to commit, so action→action nesting is
-- safe regardless of row order.

-- Areas → top-level pages
insert into public.pages (id, user_id, parent_id, type, title, "order", updated_at, created_at)
select id, user_id, null, 'area', name, "order", created_at, created_at
from public.areas;

-- Projects → child pages of their area
insert into public.pages (id, user_id, parent_id, type, title, status, props, "order", updated_at, created_at)
select
  id, user_id, area_id, 'project', title, status,
  jsonb_build_object('due_date', due_date, 'description', description),
  "order", created_at, created_at
from public.projects;

-- Routines → child pages of their area
insert into public.pages (id, user_id, parent_id, type, title, props, "order", updated_at, created_at)
select
  id, user_id, area_id, 'routine', name,
  jsonb_build_object('cadence', cadence),
  "order", created_at, created_at
from public.routines;

-- Actions → child pages. Polymorphic parent: prefer project, then area, then the
-- generic parent_id (routine/project/action). Documented precedence.
insert into public.pages (id, user_id, parent_id, type, title, status, props, "order", updated_at, created_at)
select
  id, user_id, coalesce(project_id, area_id, parent_id), 'action', title, status,
  jsonb_build_object(
    'type', type,
    'due_at', due_at,
    'scheduled_at', scheduled_at,
    'duration_minutes', duration_minutes,
    'resource_tags', to_jsonb(resource_tags)
  ),
  "order", created_at, created_at
from public.actions;

-- Attached documents → child pages of their node. LEFT JOIN neutralizes any
-- dangling node_id (documents.node_id has no FK) to a top-level page so the
-- migration can never abort on a stale pointer.
insert into public.pages (id, user_id, parent_id, type, title, blocks, embedding, "order", updated_at, created_at)
select
  d.id, d.user_id,
  case when p.id is not null then d.node_id else null end,
  'page', d.title, d.blocks, d.embedding,
  0, d.updated_at, d.created_at
from public.documents d
left join public.pages p on p.id = d.node_id
where d.node_id is not null;

-- Free-floating documents → top-level pages
insert into public.pages (id, user_id, parent_id, type, title, blocks, embedding, "order", updated_at, created_at)
select id, user_id, null, 'page', title, blocks, embedding, 0, updated_at, created_at
from public.documents
where node_id is null;

-- ── match_pages RPC (replaces match_documents; same cosine logic) ────────────
-- SECURITY INVOKER (default) so RLS on public.pages applies via the authed
-- client; the explicit user_id filter scopes the service-role smoke-test path.
create or replace function public.match_pages(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  parent_id uuid,
  type text,
  title text,
  blocks jsonb,
  similarity float
)
language sql
stable
as $$
  select
    p.id,
    p.parent_id,
    p.type,
    p.title,
    p.blocks,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.pages p
  where p.user_id = match_user_id
    and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_pages(vector, uuid, int) to authenticated;

-- ── Seed: default pages for a new user (replaces seed_default_areas) ─────────
-- Old seed_default_areas is kept until 0005 so nothing breaks mid-cutover.
create or replace function public.seed_default_pages(p_user_id uuid)
returns void language plpgsql as $$
begin
  insert into public.pages (user_id, parent_id, type, title, "order") values
    (p_user_id, null, 'area', 'Personal',     0),
    (p_user_id, null, 'area', 'Professional', 1),
    (p_user_id, null, 'area', 'Health',       2),
    (p_user_id, null, 'area', 'Financial',    3),
    (p_user_id, null, 'area', 'Creativity',   4);
end;
$$;
