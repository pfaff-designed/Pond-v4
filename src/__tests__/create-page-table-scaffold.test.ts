/**
 * Issue #63 — "AI doesn't actually create the table it says it needs".
 *
 * Live repro (captured 2026-09-10 against the production prompt + tools,
 * claude-sonnet-4-6, from the Home view with no matching page in the outline):
 *
 *   "set up a tracker for my house maintenance tasks — each one has a status,
 *    a cost estimate, and a deadline"
 *   "start a workout log for me — I want to record date, exercise, sets, and weight"
 *
 * Both produced a create_page whose PROSE references the table ("Add a row per
 * task…", "one row per exercise", reason: "A collection to track…") but whose
 * `blocks` carried NO table block and no other structure — a prose-only shell.
 * Root cause: ROUTING defaults record-like tabular data to define_schema, but
 * define_schema can only target a page that ALREADY EXISTS in the [Workspace
 * outline]. For a brand-new tracker there is no target id, and create_page is
 * client-resolved (no execute) so the turn ends at the call — the model can
 * never follow up with the schema, and nothing told it to carry the structure
 * NOW. The table it says it needs never materializes.
 *
 * The fix teaches the missing branch in BOTH routing surfaces (system prompt +
 * create_page tool description): when the record-like data's home page does not
 * exist yet, create_page must scaffold a real `table` block with the named
 * fields as columns — promotable to a collection later (promote_table /
 * define_schema once the page exists). These tests pin the rule strings (the
 * routing eval pins the live behaviour — see the #63 scenarios in
 * scripts/eval-routing.impl.mts) and prove the deterministic half: a
 * repro-shaped proposal that DOES carry its table block persists it intact.
 */

import { SYSTEM_PROMPT, PROMPT_SECTIONS } from '@/app/api/chat/prompt'
import { createPageTool } from '@/app/api/chat/tools'
import { hydrateProposalBlocks, createPageFromProposal } from '@/lib/pages/create-page'
import type { CreatePageBlock } from '@/lib/modules/ai-composition'

// ── the routing rule: a brand-new tracker carries its table NOW ─────────────

describe('#63 ROUTING: record-like data on a page that does not exist yet', () => {
  it('teaches that define_schema can only target a page that already exists', () => {
    expect(PROMPT_SECTIONS.ROUTING).toContain(
      'define_schema can ONLY target a page that ALREADY EXISTS'
    )
  })

  it('routes a brand-new tracker/log to create_page WITH the structure scaffolded now', () => {
    expect(PROMPT_SECTIONS.ROUTING).toContain('scaffold the structure NOW')
    expect(PROMPT_SECTIONS.ROUTING).toContain('real `table` block')
  })

  it('bans the prose-only shell that references a table its blocks do not contain', () => {
    expect(PROMPT_SECTIONS.ROUTING).toContain('NEVER create a prose-only shell')
  })

  it('the composed SYSTEM_PROMPT carries the whole rule (section is actually included)', () => {
    expect(SYSTEM_PROMPT).toContain('define_schema can ONLY target a page that ALREADY EXISTS')
    expect(SYSTEM_PROMPT).toContain('NEVER create a prose-only shell')
  })

  it('does not disturb the #28 default for pages that DO exist', () => {
    // The incumbent rule stays: record-like tabular data on an EXISTING page
    // still defaults to define_schema (eval-pinned).
    expect(PROMPT_SECTIONS.ROUTING).toContain('RECORD-LIKE TABULAR DATA DEFAULTS HERE')
  })
})

describe('#63 create_page tool description carries the same instruction', () => {
  it('requires a real table block when the new page starts a tracker/log/collection', () => {
    expect(createPageTool.description).toContain('MUST include a real `table` block')
    expect(createPageTool.description).toContain('define_schema cannot target a page')
  })
})

// ── the deterministic half: a proposal that carries its table persists it ───

/** The repro-A proposal AS IT SHOULD BE emitted post-fix: the tracker page born
 *  with its table block, columns = the fields the user named. */
const REPRO_BLOCKS: CreatePageBlock[] = [
  {
    type: 'text',
    content: 'Track every maintenance task around the house — one row per task.',
  },
  {
    type: 'table',
    title: 'Maintenance tasks',
    columns: ['Task', 'Status', 'Cost estimate', 'Deadline'],
    rows: [
      { cells: ['Clean the gutters', 'Not started', '$150', '2026-10-01'] },
      { cells: ['Service the furnace', 'Scheduled', '$220', '2026-11-15'] },
    ],
    sumColumn: 2,
  },
]

describe('#63 accept path: the scaffolded table block materializes and persists', () => {
  let n: number
  const mint = () => `id-${++n}`
  beforeEach(() => {
    n = 0
  })

  it('hydrates the table block with minted block + row ids, preserving every cell', () => {
    const blocks = hydrateProposalBlocks(REPRO_BLOCKS, mint)
    expect(blocks.map((b) => b.type)).toEqual(['text', 'table'])
    const table = blocks[1] as {
      id: string
      columns: string[]
      rows: Array<{ id: string; cells: string[] }>
      sumColumn?: number
    }
    expect(table.id).toBe('id-2')
    expect(table.columns).toEqual(['Task', 'Status', 'Cost estimate', 'Deadline'])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toEqual({
      id: 'id-3',
      cells: ['Clean the gutters', 'Not started', '$150', '2026-10-01'],
    })
    expect(table.rows[1].id).toBe('id-4')
    expect(table.sumColumn).toBe(2)
  })

  it('writes the table into the page row (the persisted JSONB a reload reads back)', async () => {
    const chain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'tracker-1' }, error: null }),
    }
    const sb = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: jest.fn().mockReturnValue(chain),
    }

    const result = await createPageFromProposal(
      sb as never,
      {
        type: 'page',
        kind: 'tracker',
        title: 'Home Maintenance Tracker',
        parentRef: null,
        blocks: REPRO_BLOCKS,
      },
      mint,
      'main',
      null
    )

    expect(result.id).toBe('tracker-1')
    const insert = chain.insert.mock.calls[0][0]
    // The table is IN the inserted row — persistence is the pages row itself, so
    // what a reload reads back is exactly this JSONB.
    const table = insert.blocks.find((b: { type: string }) => b.type === 'table')
    expect(table).toBeDefined()
    expect(table.columns).toEqual(['Task', 'Status', 'Cost estimate', 'Deadline'])
    expect(table.rows).toHaveLength(2)
    expect(table.rows.every((r: { id?: string }) => typeof r.id === 'string')).toBe(true)
  })
})
