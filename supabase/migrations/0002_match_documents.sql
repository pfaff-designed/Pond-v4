-- Track D — semantic search: cross-space document retrieval on an explicit query.
--
-- Cosine similarity over documents.embedding (text-embedding-3-small, 1536-dim).
-- Filtered to the caller's own documents. SECURITY INVOKER (default) so RLS on
-- public.documents still applies when called via the authenticated client; the
-- explicit user_id filter also scopes the service-role path used in smoke tests.

create or replace function public.match_documents(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  node_id uuid,
  node_type text,
  title text,
  blocks jsonb,
  similarity float
)
language sql
stable
as $$
  select
    d.id,
    d.node_id,
    d.node_type,
    d.title,
    d.blocks,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where d.user_id = match_user_id
    and d.embedding is not null
  order by d.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- PostgREST exposes this to the authenticated role for @-mention / NL retrieval.
grant execute on function public.match_documents(vector, uuid, int) to authenticated;
