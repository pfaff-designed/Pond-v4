/**
 * Recording proposals into the change log — spec #110 criterion 2.
 *
 * "Creating a proposal inserts a `proposed` record capturing the full
 * before/after snapshot at propose time — not just a decision."
 *
 * Seam under test: `src/lib/change-log/propose.ts`, the function the chat route
 * hands its emitted tool calls to. The proposal tools are client-resolved (no
 * `execute`), so the record cannot be written from a tool body; the route logs
 * the call as it is emitted, server-side, where the authenticated client lives
 * and where a record gets written even if the browser never renders the card.
 *
 * The store itself is proved in change-log-store.test.ts and the database
 * contract in change-log.pglite.test.ts. What is proved HERE is the wiring: the
 * right tools produce a record, the non-proposal tools produce none, and a
 * propose_changes record carries a real before AND a real after.
 */

import { recordProposedToolCalls } from '@/lib/change-log/propose'

const USER = 'user-1'
const PAGE = 'page-1'

type Insert = Record<string, unknown>

/** A supabase double that knows two tables: `pages` reads, `change_log` writes. */
function makeSupabase(opts: { blocks?: unknown[] | null } = {}) {
  const inserts: Insert[] = []
  const api = {
    from(table: string) {
      if (table === 'pages') {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: opts.blocks === null ? null : { blocks: opts.blocks ?? [] },
            error: null,
          }),
        }
        return chain
      }
      const chain: Record<string, unknown> = {
        insert: (row: Insert) => {
          inserts.push(row)
          return chain
        },
        select: () => chain,
        single: async () => ({
          data: { ...inserts[inserts.length - 1], id: 'rec-1' },
          error: null,
        }),
      }
      return chain
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: api as any, inserts }
}

const BEFORE_BLOCKS = [{ id: 'b1', type: 'text', content: 'the old line' }]

function proposeChangesCall(input?: unknown) {
  return {
    toolCallId: 'call-1',
    toolName: 'propose_changes',
    input: input ?? {
      changes: [{ op: 'edit', blockId: 'b1', data: { type: 'text', content: 'the new line' } }],
    },
  }
}

describe('recordProposedToolCalls — criterion 2', () => {
  it('writes one `proposed` record for a propose_changes call, with a real before AND after', async () => {
    const { supabase, inserts } = makeSupabase({ blocks: BEFORE_BLOCKS })

    const written = await recordProposedToolCalls(supabase, {
      userId: USER,
      workspace: 'main',
      openPageId: PAGE,
      toolCalls: [proposeChangesCall()],
    })

    expect(written).toBe(1)
    expect(inserts).toHaveLength(1)
    const rec = inserts[0]
    expect(rec.status).toBe('proposed')
    expect(rec.action).toBe('edit')
    expect(rec.actor).toBe('pond')
    expect(rec.user_id).toBe(USER)
    expect(rec.target_page_id).toBe(PAGE)
    expect(rec.tool_call_id).toBe('call-1')

    // The whole point of the criterion: the DIFF is persisted, not a decision.
    expect(rec.before).not.toBeNull()
    expect(rec.after).not.toBeNull()
    // `before` is the page as it stood at propose time…
    expect(rec.before).toEqual(BEFORE_BLOCKS)
    // …and `after` is what the page WOULD read, not a copy of the tool arguments.
    expect(JSON.stringify(rec.after)).toContain('the new line')
    expect(JSON.stringify(rec.after)).not.toContain('the old line')
  })

  it('files a cross-page proposal against the page it named, not the open one', async () => {
    const { supabase, inserts } = makeSupabase({ blocks: BEFORE_BLOCKS })

    await recordProposedToolCalls(supabase, {
      userId: USER,
      workspace: 'main',
      openPageId: 'the-open-page',
      toolCalls: [
        proposeChangesCall({
          targetPageId: 'another-page',
          changes: [{ op: 'edit', blockId: 'b1', data: { type: 'text', content: 'the new line' } }],
        }),
      ],
    })

    expect(inserts[0].target_page_id).toBe('another-page')
  })

  it('carries the pond scope, so a sandbox proposal is never logged into main', async () => {
    const { supabase, inserts } = makeSupabase({ blocks: BEFORE_BLOCKS })

    await recordProposedToolCalls(supabase, {
      userId: USER,
      workspace: 'sandbox',
      openPageId: PAGE,
      toolCalls: [proposeChangesCall()],
    })

    expect(inserts[0].workspace).toBe('sandbox')
  })

  it('records the other proposal tools under their own action', async () => {
    const { supabase, inserts } = makeSupabase({ blocks: [] })

    await recordProposedToolCalls(supabase, {
      userId: USER,
      workspace: 'main',
      openPageId: PAGE,
      toolCalls: [
        { toolCallId: 'c1', toolName: 'create_page', input: { title: 'New' } },
        { toolCallId: 'c2', toolName: 'define_schema', input: { pageId: PAGE, properties: [] } },
        { toolCallId: 'c3', toolName: 'add_row', input: { pageId: PAGE, values: {} } },
        { toolCallId: 'c4', toolName: 'configure_view', input: { pageId: PAGE, mode: 'table' } },
      ],
    })

    expect(inserts.map((r) => r.action)).toEqual([
      'create_page',
      'define_schema',
      'add_row',
      'configure_view',
    ])
    // A create has no before — the page does not exist yet.
    expect(inserts[0].before).toBeNull()
    expect(inserts[0].after).not.toBeNull()
  })

  it('logs nothing for tools that are not proposals', async () => {
    const { supabase, inserts } = makeSupabase({ blocks: BEFORE_BLOCKS })

    const written = await recordProposedToolCalls(supabase, {
      userId: USER,
      workspace: 'main',
      openPageId: PAGE,
      toolCalls: [
        { toolCallId: 'r1', toolName: 'read_page', input: { pageId: PAGE } },
        { toolCallId: 'r2', toolName: 'fetch_context', input: { query: 'sleep' } },
        { toolCallId: 'r3', toolName: 'web_search', input: { query: 'sleep' } },
        { toolCallId: 'r4', toolName: 'ask_question', input: { question: 'which?' } },
        { toolCallId: 'r5', toolName: 'suggest_followups', input: { chips: [] } },
      ],
    })

    expect(written).toBe(0)
    expect(inserts).toHaveLength(0)
  })

  it('skips a block proposal with nowhere to write rather than logging a homeless record', async () => {
    const { supabase, inserts } = makeSupabase({ blocks: BEFORE_BLOCKS })

    const written = await recordProposedToolCalls(supabase, {
      userId: USER,
      workspace: 'main',
      openPageId: null,
      toolCalls: [proposeChangesCall()],
    })

    expect(written).toBe(0)
    expect(inserts).toHaveLength(0)
  })

  it('never lets a logging failure take the reply down with it', async () => {
    const supabase = {
      from: () => {
        throw new Error('database on fire')
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    // The log is a side-record of the turn. If it cannot be written the user
    // still gets their answer — a dropped record is a bug, a 500 is a worse one.
    await expect(
      recordProposedToolCalls(supabase, {
        userId: USER,
        workspace: 'main',
        openPageId: PAGE,
        toolCalls: [proposeChangesCall()],
      })
    ).resolves.toBe(0)
  })
})
