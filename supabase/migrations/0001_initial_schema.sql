-- Enable pgvector for semantic search
create extension if not exists vector;

-- ─── Users ───────────────────────────────────────────────────────────────────
-- Mirrors auth.users — populated via trigger on first sign-in
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
create policy "users: own row" on public.users
  for all using (auth.uid() = id);

-- ─── Areas ───────────────────────────────────────────────────────────────────
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.areas enable row level security;
create policy "areas: own rows" on public.areas
  for all using (auth.uid() = user_id);

-- ─── Routines ────────────────────────────────────────────────────────────────
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  cadence jsonb not null default '{}',
  -- { frequency: 'daily'|'weekdays'|'weekly'|'monthly', days?: string[] }
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.routines enable row level security;
create policy "routines: own rows" on public.routines
  for all using (auth.uid() = user_id);

-- ─── Projects ────────────────────────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed')),
  due_date date,
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;
create policy "projects: own rows" on public.projects
  for all using (auth.uid() = user_id);

-- ─── Actions ─────────────────────────────────────────────────────────────────
create table public.actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  parent_id uuid,           -- nullable: points to routine | project | action
  parent_type text check (parent_type in ('routine', 'project', 'action')),
  area_id uuid references public.areas(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  type text not null default 'task' check (type in ('task', 'event')),
  status text not null default 'open' check (status in ('open', 'done')),
  due_at timestamptz,         -- tasks
  scheduled_at timestamptz,   -- events
  duration_minutes int,       -- events
  resource_tags text[] not null default '{}',
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.actions enable row level security;
create policy "actions: own rows" on public.actions
  for all using (auth.uid() = user_id);

-- ─── Documents ───────────────────────────────────────────────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  node_id uuid,             -- nullable = free-floating
  node_type text check (node_type in ('area', 'routine', 'project', 'action')),
  title text not null default 'Untitled',
  blocks jsonb not null default '[]',
  embedding vector(1536),   -- OpenAI text-embedding-3-small
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;
create policy "documents: own rows" on public.documents
  for all using (auth.uid() = user_id);

-- Vector similarity index for semantic search
create index on public.documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ─── Conversations ───────────────────────────────────────────────────────────
-- One row = one session. No node_id — conversation is session-scoped.
-- Context switches are recorded as events inside the transcript jsonb.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  transcript jsonb not null default '[]',
  -- array of:
  --   { role: 'user'|'assistant', content: string, created_at: string }
  --   { role: 'system', event: 'context_switch', node_id: string|null,
  --     node_type: string|null, node_title: string,
  --     context_snapshot: object, created_at: string }
  created_at timestamptz not null default now(),
  dissolved_at timestamptz   -- null = active; set on /handoff, /clear, or 48h idle
);

alter table public.conversations enable row level security;
create policy "conversations: own rows" on public.conversations
  for all using (auth.uid() = user_id);

-- ─── Seed trigger: create user row on auth sign-up ───────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Seed: default areas for new user ────────────────────────────────────────
create or replace function public.seed_default_areas(p_user_id uuid)
returns void language plpgsql as $$
begin
  insert into public.areas (user_id, name, "order") values
    (p_user_id, 'Personal',     0),
    (p_user_id, 'Professional', 1),
    (p_user_id, 'Health',       2),
    (p_user_id, 'Financial',    3),
    (p_user_id, 'Creativity',   4);
end;
$$;
