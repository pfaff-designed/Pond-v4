-- ─── ⌘K can search a page's body, not just its title (KAN-473) ─────────────
--
-- `pages.blocks` is jsonb (0001) — PostgREST cannot `ilike` into a jsonb array,
-- so the client-side palette (`src/lib/pages/palette-records.ts`'s title/field
-- search) has no equivalent reach into block text. This migration adds the one
-- RPC the palette's new `in pages` group calls: for a query, the live pages of
-- one pond whose blocks contain a match, each page once, at its first match in
-- document order, newest-updated first, with a ready-to-render snippet. Scoped
-- to the same pages the `['pages']` tree holds (`tree.ts`'s `fetchPages`) —
-- the reserved Life home row and a collection's `row` children are excluded
-- there too, since neither can be labelled by a path the tree never builds
-- for them; records already carry their own ⌘K search over `row` pages.
--
-- `security invoker` (never `security definer` — least privilege, AGENTS.md):
-- the caller's own RLS governs what it can see, same as an ordinary PostgREST
-- select. The function ALSO filters `p.user_id = auth.uid()` itself, belt and
-- braces with 0027's "pages: select own live rows" policy, the same double
-- cover every other per-user RPC here already has (`trash_page`, 0027). There
-- is no pond-sharing or membership table yet (0018's ponds are owned, not
-- shared), so "another user's page" is simply a page with a different
-- `user_id` — there is no broader sharing model to get right or wrong here.
--
-- Escaping: mirrors `escapeLike` (`src/lib/pages/palette-records.ts`) exactly
-- for the three characters LIKE/ILIKE itself treats specially — `\` escaped
-- first, then `%` and `_` — so a literal `%`, `_` or `\` in what someone typed
-- matches literally rather than as a wildcard. The escaping lives here, in the
-- function, not the client: `escapeLike` additionally neutralises `*` to `_`,
-- but that rule exists only because PostgREST rewrites `*` to `%` in a
-- querystring filter value — this function's `p_query` arrives as an ordinary
-- RPC argument (a POST body value), never a filter string PostgREST rewrites,
-- so that half of `escapeLike` does not apply and is not reproduced. One home
-- for the escaping that DOES apply here: this function; the client sends the
-- raw, untouched query.
--
-- Matched text, per the ticket's list, and nothing else — never a block's
-- `id`, `href` or `type`:
--   text.content, toggle.content, toggle.body, highlight.content,
--   entries[].text, todo.items[].label
-- `table`, `view`, `image`, `page-link` and `toc` blocks carry no field this
-- list names, so a block of one of those kinds simply contributes no segment
-- and is never matched — not an oversight, there is nothing of theirs to read.
--
-- One row per page, at its FIRST matching block in document order (the
-- `blocks` array's own order), and — within a block that has more than one
-- piece of text (`toggle`'s content then body; `entries`/`todo`'s array
-- entries) — the first matching piece in that same within-block order. Ties
-- across pages break on `updated_at desc`, then `p_limit` caps the result;
-- the caller asks for cap+1 to learn whether there is "more in pages…" to
-- show (a later, separate ticket owns that row).
--
-- Markdown is stripped ONCE, before matching, not after cropping — the same
-- stripped text both `ilike` and the snippet crop read, so a match and what
-- the row underlines always agree. An image (`![alt](url)`) is dropped
-- whole; a link (`[text](url)`) collapses to its own text, never its href —
-- so a query that only hits a link's URL finds nothing, matching the "never
-- a block's href" rule, and a query that hits a link's visible text finds it
-- even through the `**`/`_`/`` ` ``/`#`/`>` marks around it. The snippet is
-- then just a ~80-character crop of that already-stripped text, centred on
-- the match, with an ellipsis on whichever side was cut.
--
-- Reversible: `drop function if exists public.search_page_blocks(uuid, text, int);`

begin;

create or replace function public.search_page_blocks(
  p_pond_id uuid,
  p_query text,
  p_limit int default 7
)
returns table (page_id uuid, block_id text, snippet text)
language sql
security invoker
stable
set search_path = public
as $$
  with escaped as (
    -- Backslash first, so escaping `%`/`_` below can never itself be re-escaped.
    select replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') as pattern
  ),
  segments as (
    -- One row per piece of user-visible text in the pond's live pages, each
    -- tagged with WHERE it sits: the page, the block's position in `blocks`
    -- (`block_ord`), and, inside a block with more than one piece of text, that
    -- piece's own position (`sub_ord`). A block whose type names none of these
    -- branches (table/view/image/page-link/toc) contributes no row at all — the
    -- `cross join lateral` here drops it, rather than carrying it through null.
    select
      p.id as page_id,
      p.updated_at,
      blk.val ->> 'id' as block_id,
      blk.ord as block_ord,
      seg.sub_ord,
      seg.text
    from public.pages p
    cross join lateral jsonb_array_elements(coalesce(p.blocks, '[]'::jsonb))
      with ordinality as blk (val, ord)
    cross join lateral (
      select 0 as sub_ord, blk.val ->> 'content' as text
       where blk.val ->> 'type' in ('text', 'highlight')
      union all
      select 0, blk.val ->> 'content'
       where blk.val ->> 'type' = 'toggle'
      union all
      select 1, blk.val ->> 'body'
       where blk.val ->> 'type' = 'toggle' and blk.val ->> 'body' is not null
      union all
      select (e.ord - 1)::int, e.val ->> 'text'
        from jsonb_array_elements(coalesce(blk.val -> 'entries', '[]'::jsonb))
          with ordinality as e (val, ord)
       where blk.val ->> 'type' = 'entries'
      union all
      select (i.ord - 1)::int, i.val ->> 'label'
        from jsonb_array_elements(coalesce(blk.val -> 'items', '[]'::jsonb))
          with ordinality as i (val, ord)
       where blk.val ->> 'type' = 'todo'
    ) as seg (sub_ord, text)
    where p.pond_id = p_pond_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
      -- The ['pages'] tree the palette labels rows from (`tree.ts`'s
      -- `fetchPages`) excludes the reserved Life home row (`type='home'`)
      -- and a collection's schema-bound `row` children — neither is ever a
      -- rail/breadcrumb node, so neither can be labelled. Matching into them
      -- here produced a blank-label row the palette's ↵ silently ignored
      -- while it still spent one of the group's 6 slots. Records already
      -- run their own ⌘K search over `row` pages; this RPC owns only what
      -- the tree can label.
      and p.type not in ('home', 'row')
      and seg.text is not null
  ),
  stripped as (
    -- Strip markdown ONCE, before matching OR cropping: an image is dropped
    -- whole (alt text included — there is no href left to show for it
    -- either way), a link collapses to its own text, `__x__`/`_x_` emphasis
    -- collapses to `x`, the remaining `*`` `#>` marks go to spaces, and the
    -- runs of whitespace that leaves behind collapse to one. The emphasis
    -- underscore is only ever stripped in a PAIR (`_..._`) — a lone `_`,
    -- like the one in `snake_case`, is untouched, so it stays literal both
    -- for matching and for what the row underlines.
    select
      s.page_id,
      s.updated_at,
      s.block_id,
      s.block_ord,
      s.sub_ord,
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(s.text, '!\[[^\]]*\]\([^)]*\)', '', 'g'),
                '\[([^\]]*)\]\([^)]*\)', '\1', 'g'
              ),
              '__([^_]+)__', '\1', 'g'
            ),
            '_([^_]+)_', '\1', 'g'
          ),
          '[*`#>]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      ) as text
    from segments s
  ),
  matches as (
    select st.page_id, st.updated_at, st.block_id, st.block_ord, st.sub_ord, st.text
    from stripped st, escaped
    where st.text ilike '%' || escaped.pattern || '%'
  ),
  -- One row per page: its earliest match by document order, then within-block order.
  first_per_page as (
    select distinct on (matches.page_id)
      matches.page_id, matches.updated_at, matches.block_id, matches.text
    from matches
    order by matches.page_id, matches.block_ord, matches.sub_ord
  ),
  cropped as (
    select
      fp.page_id,
      fp.updated_at,
      fp.block_id,
      -- A literal substring search for the crop centre: ILIKE's own escaping
      -- above is only to stop `%`/`_`/`\` acting as wildcards during matching,
      -- it changes nothing about where the literal query sits in the text —
      -- which is already the stripped text `matches` searched, so a hit here
      -- can never land inside markdown syntax the snippet would then have to
      -- cut around.
      position(lower(p_query) in lower(fp.text)) as match_at,
      fp.text
    from first_per_page fp
  ),
  windowed as (
    select
      c.page_id,
      c.updated_at,
      c.block_id,
      greatest(1, c.match_at - 40) as win_start,
      least(char_length(c.text), c.match_at + char_length(p_query) - 1 + 40) as win_end,
      c.text
    from cropped c
  )
  select
    w.page_id,
    w.block_id,
    -- `w.text` is already the stripped text `stripped` built above — a plain
    -- crop needs no further markdown stripping here.
    (case when w.win_start > 1 then '…' else '' end)
      || btrim(substring(w.text from w.win_start for (w.win_end - w.win_start + 1)))
      || (case when w.win_end < char_length(w.text) then '…' else '' end)
      as snippet
  from windowed w
  order by w.updated_at desc
  limit p_limit
$$;

revoke all on function public.search_page_blocks(uuid, text, int) from public;
grant execute on function public.search_page_blocks(uuid, text, int) to authenticated;

commit;
