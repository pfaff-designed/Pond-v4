// Schema tests for 0038_search_page_blocks.sql (KAN-473): ⌘K's `in pages` group.
//
// The function is SECURITY INVOKER with its own `user_id = auth.uid()` filter
// (belt and braces with 0027's RLS policy, same as `trash_page`) — `actAs`
// below gives each test a real `authenticated` connection so that filter, and
// the RLS it backs up, are both genuinely exercised rather than bypassed the
// way the harness's default owner connection would.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER_USER = '22222222-2222-2222-2222-222222222222'

/** Supabase's grants and auth.uid(), which the harness's owner connection lacks. */
const actAs = async (db: PGlite, userId: string) => {
  await db.exec(`
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on schema auth to authenticated;
    create or replace function auth.uid() returns uuid language sql stable as
      $fn$ select nullif(current_setting('test.uid', true), '')::uuid $fn$;
    grant execute on function auth.uid() to authenticated;
  `)
  await db.exec(`set test.uid = '${userId}'; set role authenticated;`)
}

async function lifePondId(db: PGlite, userId: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    'select id from public.ponds where user_id = $1 order by "order" limit 1',
    [userId]
  )
  return res.rows[0].id
}

async function addPond(db: PGlite, userId: string, order: number): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.ponds (user_id, name, glyph, theme, "order")
     values ($1, 'second pond', 'waves-02', 'paper', $2) returning id`,
    [userId, order]
  )
  return res.rows[0].id
}

// `pages_sibling_title_pond_uniq` (0018/0027) requires distinct titles among a
// pond's live siblings — each untitled call needs its own default, not the
// same literal "Untitled" repeated.
let untitledCount = 0

async function addPage(
  db: PGlite,
  userId: string,
  pondId: string,
  opts: { title?: string; type?: string; deletedAt?: string | null; blocks?: unknown[] } = {}
): Promise<string> {
  untitledCount += 1
  const { title = `Untitled ${untitledCount}`, type = 'page', deletedAt = null, blocks = [] } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, deleted_at, blocks)
     values ($1, $2, null, $3, $4, $5, $6) returning id`,
    [userId, pondId, type, title, deletedAt, JSON.stringify(blocks)]
  )
  return res.rows[0].id
}

interface Hit {
  page_id: string
  block_id: string
  snippet: string
}

async function search(
  db: PGlite,
  pondId: string,
  query: string,
  limit = 7
): Promise<Hit[]> {
  const res = await db.query<Hit>('select * from public.search_page_blocks($1, $2, $3)', [
    pondId,
    query,
    limit,
  ])
  return res.rows
}

describe('0038_search_page_blocks', () => {
  it('matches text inside a text block', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const pageId = await addPage(db, USER, pond, {
      title: 'electrician',
      blocks: [{ id: 'b1', type: 'text', content: 'kitchen second fix is booked for friday' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([{ page_id: pageId, block_id: 'b1', snippet: expect.stringContaining('second fix') }])
    await db.close()
  })

  it('matches case-insensitively', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: 'Second Fix booked' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toHaveLength(1)
    await db.close()
  })

  it('returns nothing when no block matches', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: 'first fix is done' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([])
    await db.close()
  })

  it('returns one row per page, its first matching block in document order', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const pageId = await addPage(db, USER, pond, {
      blocks: [
        { id: 'b1', type: 'text', content: 'nothing here' },
        { id: 'b2', type: 'text', content: 'second fix in here' },
        { id: 'b3', type: 'text', content: 'second fix again, later' },
      ],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([{ page_id: pageId, block_id: 'b2', snippet: expect.any(String) }])
    await db.close()
  })

  it.each(['%', '_', '\\'])('matches a literal %s in the query, not as a wildcard', async (char) => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const pageId = await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: `a literal ${char} right here` }],
    })
    // A page whose text would ALSO match if the character were a wildcard, to
    // prove it isn't one: `_` as a wildcard would match "a literal X right
    // here" for any single X, and `%` would match anything at all.
    await addPage(db, USER, pond, {
      blocks: [{ id: 'b2', type: 'text', content: 'a literal X right here' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, `literal ${char} right`)
    expect(hits).toEqual([{ page_id: pageId, block_id: 'b1', snippet: expect.any(String) }])
    await db.close()
  })

  it('excludes a trashed page', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    await addPage(db, USER, pond, {
      deletedAt: new Date().toISOString(),
      blocks: [{ id: 'b1', type: 'text', content: 'second fix' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([])
    await db.close()
  })

  it("excludes another pond's page", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const otherPond = await addPond(db, USER, 1)
    await addPage(db, USER, otherPond, {
      blocks: [{ id: 'b1', type: 'text', content: 'second fix' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([])
    await db.close()
  })

  it("excludes another user's page even when their pond id is passed directly", async () => {
    // The structural case ("a page in MY pond, but not mine") can't happen in
    // this ownership-only schema — a pond has exactly one owner (0018) and
    // there is no membership table yet. The real edge this filter guards is
    // the other direction: USER, authenticated as themselves, naming the
    // OTHER user's own pond id as `p_pond_id` directly.
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER_USER)
    const otherPond = await lifePondId(db, OTHER_USER)
    await addPage(db, OTHER_USER, otherPond, {
      blocks: [{ id: 'b1', type: 'text', content: 'second fix' }],
    })
    await actAs(db, USER)

    const hits = await search(db, otherPond, 'second fix')
    expect(hits).toEqual([])
    await db.close()
  })

  it('honours p_limit', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    for (let i = 0; i < 3; i += 1) {
      await addPage(db, USER, pond, {
        blocks: [{ id: 'b1', type: 'text', content: `second fix page ${i}` }],
      })
    }
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix', 2)
    expect(hits).toHaveLength(2)
    await db.close()
  })

  it("never matches a block's id, href or type — only its text", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    await addPage(db, USER, pond, {
      blocks: [
        {
          id: 'secondfix-block',
          type: 'secondfix',
          content: 'nothing matches here',
          href: 'secondfix://nowhere',
        },
      ],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'secondfix')
    expect(hits).toEqual([])
    await db.close()
  })

  it('matches a toggle block, in content then body order', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const pageId = await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'toggle', content: 'a summary', body: 'second fix is in the body' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([{ page_id: pageId, block_id: 'b1', snippet: expect.any(String) }])
    await db.close()
  })

  it('matches a highlight block', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const pageId = await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'highlight', content: 'second fix, a line worth keeping' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([{ page_id: pageId, block_id: 'b1', snippet: expect.any(String) }])
    await db.close()
  })

  it("matches an entries block's entry text", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const pageId = await addPage(db, USER, pond, {
      blocks: [
        {
          id: 'b1',
          type: 'entries',
          entries: [
            { id: 'e1', date: 'today', text: 'nothing to see' },
            { id: 'e2', date: 'yesterday', text: 'second fix booked' },
          ],
        },
      ],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([{ page_id: pageId, block_id: 'b1', snippet: expect.any(String) }])
    await db.close()
  })

  it("matches a todo item's label", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const pageId = await addPage(db, USER, pond, {
      blocks: [
        {
          id: 'b1',
          type: 'todo',
          items: [
            { id: 't1', label: 'buy paint', checked: false },
            { id: 't2', label: 'second fix electrician', checked: false },
          ],
        },
      ],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([{ page_id: pageId, block_id: 'b1', snippet: expect.any(String) }])
    await db.close()
  })

  it('orders pages by updated_at desc', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const older = await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: 'second fix older page' }],
    })
    await db.query(`update public.pages set updated_at = now() - interval '1 day' where id = $1`, [
      older,
    ])
    const newer = await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: 'second fix newer page' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits.map((h) => h.page_id)).toEqual([newer, older])
    await db.close()
  })

  it('crops a long match to roughly 80 characters, with an ellipsis where cut', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const padding = 'x'.repeat(100)
    await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: `${padding} second fix ${padding}` }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits[0].snippet.startsWith('…')).toBe(true)
    expect(hits[0].snippet.endsWith('…')).toBe(true)
    expect(hits[0].snippet.length).toBeLessThan(100)
    await db.close()
  })

  it('excludes the Life home page and a collection row page — the palette tree can never label either', async () => {
    // Both are excluded from the `['pages']` tree `tree.ts`'s `fetchPages`
    // reads (`.neq('type', HOME_TYPE)` / `.neq('type', ROW_TYPE)`): matching
    // into them here produced a blank-label row the palette's ↵ ignored,
    // spending one of the group's 6 slots for nothing.
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    await addPage(db, USER, pond, {
      type: 'home',
      blocks: [{ id: 'b1', type: 'text', content: 'second fix on the home page' }],
    })
    await addPage(db, USER, pond, {
      type: 'row',
      blocks: [{ id: 'b1', type: 'text', content: 'second fix on a collection row' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([])
    await db.close()
  })

  it('strips markdown syntax enough to read in the snippet', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: 'the **second fix** is [booked](https://example.test)' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits[0].snippet).not.toContain('**')
    expect(hits[0].snippet).not.toContain('(https://example.test)')
    expect(hits[0].snippet).toContain('booked')
    await db.close()
  })

  it('does not match a query found only in a link URL, never its href', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: '[docs](https://acme.dev)' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'acme')
    expect(hits).toEqual([])
    await db.close()
  })

  it("matches 'second fix' against '**second** fix' — markdown strips before matching, not after", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    const pageId = await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: '**second** fix' }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'second fix')
    expect(hits).toEqual([{ page_id: pageId, block_id: 'b1', snippet: expect.stringContaining('second fix') }])
    await db.close()
  })

  it("crops a link block's snippet to its link text, never a raw '[text](ur' fragment of its URL", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db, USER)
    // A URL long enough that cropping the RAW text first (the bug) would cut
    // before the link's closing `)`, leaving an unstripped `[docs](https://…`
    // fragment — stripping markdown before cropping never has that problem,
    // since the whole link already collapsed to "docs" before the crop runs.
    const longUrl = `https://acme.dev/${'x'.repeat(100)}`
    await addPage(db, USER, pond, {
      blocks: [{ id: 'b1', type: 'text', content: `call [docs](${longUrl}) for help` }],
    })
    await actAs(db, USER)

    const hits = await search(db, pond, 'docs')
    expect(hits[0].snippet).toContain('docs')
    expect(hits[0].snippet).not.toContain('https://acme.dev')
    expect(hits[0].snippet).not.toContain('[docs](')
    await db.close()
  })
})
