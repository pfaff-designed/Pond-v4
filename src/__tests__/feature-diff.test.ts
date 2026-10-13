/**
 * @jest-environment node
 *
 * FEATURE — the diff model, end to end (`Pond 06.03 Propose and accept`,
 * `Pond 06.15 Change log`).
 *
 * "Anything Pond, an agent, or another person wants to change arrives as a
 * proposed diff (a record in the change log: before/after + status)." This file
 * walks the whole sequence a PERSON goes through — Pond proposes, the person
 * answers, the page and the log move together — and asserts only what is
 * user-visible at the end of each path: what the page now holds, what the log
 * now says, and what the surface may offer next.
 *
 * It drives the REAL path modules (`propose.ts` → `accept.ts` → `resolve.ts` →
 * `own-edit.ts` → `revert.ts`) against one in-memory `pages` + `change_log`
 * double whose two tables and three RPCs behave like migrations 0011/0013. The
 * existing `helpers/fake-supabase.ts` covers the pages table only (no `rpc`, no
 * second table, no `update`), so the log half is modelled here; everything the
 * ENGINE owns — the append-only trigger, the transaction boundaries inside the
 * RPCs — is proved against real Postgres in `change-log.pglite.test.ts` and
 * `change-log-revert.pglite.test.ts` and is deliberately not re-proved here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import { emptyResolutions } from '@/lib/conversation/resolutions'
import { recordProposedToolCalls } from '@/lib/change-log/propose'
import { resolveChangeLogRecord } from '@/lib/change-log/resolve'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import { commitBlocks } from '@/lib/pages/commit'
import { acceptRevert, proposeRevert } from '@/lib/change-log/revert'
import { buildPageChanges } from '@/lib/change-log/page-changes'
import {
  countProposed,
  listRecords,
  listRevisionsOf,
  mapChangeLogRow,
} from '@/lib/change-log/store'
import { canAccept, canRevise } from '@/lib/change-log/status'
import type { ChangeLogRecord, ChangeLogRow, ChangeLogStatus } from '@/lib/change-log/types'

// ── The world ────────────────────────────────────────────────────────────────

const USER = 'user-1'
const POND = 'pond-1'
const PAGE = 'page-1'

/** The page as it stands before Pond proposes anything. */
const ORIGINAL: Block[] = [{ id: 'b1', type: 'text', content: 'wiring quote' } as unknown as Block]

/** Pond's proposal: append one line to the page. */
const PROPOSED: ModuleChange[] = [
  { op: 'create', data: { type: 'text', content: 'electrician booked' } } as ModuleChange,
]

type Row = Record<string, unknown>

/** jsonb round-trip: what goes into a column is a copy, not the caller's object. */
function jsonb<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

/** Key-order-independent compare, the way `is distinct from` reads jsonb. */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon)
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>
    return Object.keys(src)
      .sort()
      .reduce<Record<string, unknown>>((out, k) => {
        out[k] = canon(src[k])
        return out
      }, {})
  }
  return value
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b))
}

interface PgError {
  code: string
  message: string
  details?: string
}

interface Builder {
  select(cols?: string, opts?: { count?: string; head?: boolean }): Builder
  insert(payload: Row): Builder
  update(payload: Row): Builder
  eq(col: string, val: unknown): Builder
  in(col: string, vals: unknown[]): Builder
  order(col: string, opts?: { ascending?: boolean }): Builder
  limit(n: number): Builder
  single(): Promise<{ data: Row | null; error: PgError | null }>
  maybeSingle(): Promise<{ data: Row | null; error: PgError | null }>
  then(
    resolve: (v: { data: Row[] | null; error: PgError | null; count: number }) => unknown
  ): Promise<unknown>
}

function makeWorld() {
  const tables: Record<string, Row[]> = {
    pages: [
      { id: PAGE, user_id: USER, pond_id: POND, title: 'Garage', blocks: jsonb(ORIGINAL) },
      // A second page, so a cross-page write would be visible rather than silent.
      { id: 'page-2', user_id: USER, pond_id: POND, title: 'Kitchen', blocks: [] },
    ],
    change_log: [],
  }
  let ids = 0
  let ticks = 0
  const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`
  const stamp = () => `2026-01-01T00:00:${String(++ticks).padStart(2, '0')}.000Z`

  const rpcCalls: string[] = []
  /** Writes issued through the PostgREST builder, i.e. NOT through an RPC. */
  const tableUpdates: string[] = []

  /** `links->>revert_of` is a real filter in `listRevertsOf`; everything else is a column. */
  const cell = (row: Row, col: string): unknown => {
    if (col === 'links->>revert_of') {
      const links = (row.links ?? {}) as Record<string, unknown>
      return links.revert_of ?? null
    }
    return row[col] ?? null
  }

  function from(table: string): Builder {
    let op: 'select' | 'insert' | 'update' | null = null
    let payload: Row = {}
    let head = false
    const filters: Array<(r: Row) => boolean> = []
    let sort: { col: string; asc: boolean } | null = null
    let cap: number | null = null

    const matching = (): Row[] => {
      let rows = tables[table].filter((r) => filters.every((f) => f(r)))
      if (sort) {
        const { col, asc } = sort
        rows = [...rows].sort((a, b) =>
          String(cell(a, col)) < String(cell(b, col)) ? (asc ? -1 : 1) : asc ? 1 : -1
        )
      }
      return cap === null ? rows : rows.slice(0, cap)
    }

    const applyUpdate = (): Row[] => {
      const rows = matching()
      for (const row of rows) Object.assign(row, jsonb(payload))
      return rows
    }

    const applyInsert = (): Row => {
      const row: Row = {
        id: nextId(),
        pond_id: null,
        created_at: stamp(),
        status_at: stamp(),
        ...jsonb(payload),
      }
      tables[table].push(row)
      return row
    }

    const builder: Builder = {
      select(_cols, opts) {
        if (op === null) op = 'select'
        head = Boolean(opts?.head)
        return builder
      },
      insert(p) {
        op = 'insert'
        payload = p
        return builder
      },
      update(p) {
        op = 'update'
        payload = p
        tableUpdates.push(table)
        return builder
      },
      eq(col, val) {
        filters.push((r) => cell(r, col) === val)
        return builder
      },
      in(col, vals) {
        filters.push((r) => vals.includes(cell(r, col)))
        return builder
      },
      order(col, opts) {
        sort = { col, asc: opts?.ascending !== false }
        return builder
      },
      limit(n) {
        cap = n
        return builder
      },
      async single() {
        if (op === 'insert') return { data: jsonb(applyInsert()), error: null }
        if (op === 'update') return { data: jsonb(applyUpdate()[0] ?? null), error: null }
        return { data: jsonb(matching()[0] ?? null), error: null }
      },
      async maybeSingle() {
        if (op === 'update') return { data: jsonb(applyUpdate()[0] ?? null), error: null }
        return { data: jsonb(matching()[0] ?? null), error: null }
      },
      then(resolve) {
        if (op === 'update') {
          const rows = applyUpdate()
          return Promise.resolve(resolve({ data: null, error: null, count: rows.length }))
        }
        const rows = matching()
        return Promise.resolve(
          resolve({ data: head ? null : jsonb(rows), error: null, count: rows.length })
        )
      },
    }
    return builder
  }

  const fail = (code: string, message: string, details?: string) => ({
    data: null,
    error: { code, message, details },
  })
  const record = (id: unknown) => tables.change_log.find((r) => r.id === id)
  const page = (id: unknown, userId: unknown) =>
    tables.pages.find((p) => p.id === id && p.user_id === userId)

  const advance = (row: Row, to: ChangeLogStatus, actor: unknown) => {
    const at = stamp()
    row.status = to
    row.status_at = at
    row.transitions = [...(row.transitions as unknown[]), { status: to, at, actor }]
  }

  /** The three functions migrations 0011/0013 install, with their own guards. */
  async function rpc(name: string, args: Record<string, unknown>) {
    rpcCalls.push(name)

    if (name === 'advance_change_log_record') {
      const row = record(args.p_record_id)
      if (!row) return fail('no_data_found', 'record not found')
      if (row.status !== args.p_from)
        return fail(
          'P0001',
          `record is ${String(row.status)}, not ${String(args.p_from)}`,
          'record-changed'
        )
      advance(row, args.p_to as ChangeLogStatus, args.p_actor)
      return { data: jsonb(row), error: null }
    }

    if (name === 'accept_change_log_record') {
      const row = record(args.p_record_id)
      if (!row) return fail('no_data_found', 'record not found')
      if (row.status !== 'proposed')
        return fail('invalid_parameter_value', `record is ${String(row.status)}`)
      if (row.target_page_id === null) return fail('invalid_parameter_value', 'no target page')
      const target = page(row.target_page_id, row.user_id)
      if (!target) return fail('no_data_found', 'target page no longer exists')
      target.blocks = jsonb(args.p_blocks)
      advance(row, 'accepted', args.p_actor)
      return { data: jsonb(row), error: null }
    }

    if (name === 'accept_revert_record') {
      const row = record(args.p_record_id)
      if (!row) return fail('no_data_found', 'record not found')
      if (row.action !== 'revert') return fail('invalid_parameter_value', 'not a revert')
      if (row.status !== 'proposed')
        return fail('invalid_parameter_value', `revert is ${String(row.status)}`)
      const link = ((row.links ?? {}) as Record<string, unknown>).revert_of
      if (typeof link !== 'string') return fail('invalid_parameter_value', 'no revert_of link')
      const original = record(link)
      if (!original) return fail('no_data_found', 'the record it reverts is gone')
      if (original.user_id !== row.user_id || original.pond_id !== row.pond_id)
        return fail('invalid_parameter_value', 'the record it reverts is in another pond')
      if (original.status !== 'accepted')
        return fail(
          'invalid_parameter_value',
          `the record it reverts is ${String(original.status)}`
        )
      const target = page(row.target_page_id, row.user_id)
      if (!target) return fail('no_data_found', 'target page no longer exists')
      // The page compare-and-swap: a page that moved underneath the plan raises.
      if (!sameJson(target.blocks, args.p_expected))
        return fail('P0001', 'page changed underneath the revert', 'page-changed')
      target.blocks = jsonb(args.p_blocks)
      advance(row, 'accepted', args.p_actor)
      advance(original, 'reverted', args.p_actor)
      return { data: jsonb(row), error: null }
    }

    throw new Error(`unmodelled rpc: ${name}`)
  }

  const supabase = {
    from: jest.fn(from),
    rpc: jest.fn(rpc),
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
  } as unknown as SupabaseClient<Database>

  const queryClient = { invalidateQueries: jest.fn(async () => {}) } as unknown as QueryClient

  return {
    supabase,
    queryClient,
    /** The whole log, in app shape, oldest first. */
    log: (): ChangeLogRecord[] =>
      tables.change_log.map((r) => mapChangeLogRow(jsonb(r) as unknown as ChangeLogRow)),
    at: (id: string): ChangeLogRecord =>
      tables.change_log
        .map((r) => mapChangeLogRow(jsonb(r) as unknown as ChangeLogRow))
        .find((r) => r.id === id)!,
    pageBlocks: (id = PAGE): Block[] =>
      jsonb((tables.pages.find((p) => p.id === id)?.blocks ?? []) as Block[]),
    rpcCalls,
    tableUpdates,
  }
}

type World = ReturnType<typeof makeWorld>

// ── The three things a person does ───────────────────────────────────────────

/** Pond emits a propose_changes call; the route logs it at propose time. */
function pondProposes(
  world: World,
  changes: ModuleChange[],
  opts: { toolCallId?: string; revisesToolCallId?: string } = {}
) {
  return recordProposedToolCalls(world.supabase, {
    userId: USER,
    pondId: POND,
    openPageId: PAGE,
    sourceThreadId: 'thread-1',
    revisesToolCallId: opts.revisesToolCallId ?? null,
    toolCalls: [
      {
        toolCallId: opts.toolCallId ?? 'pc1',
        toolName: 'propose_changes',
        input: { changes },
      },
    ],
  })
}

/** The person clicks accept on that card. */
function clickAccept(world: World, changes: ModuleChange[], toolCallId = 'pc1') {
  return writeAcceptedChanges({
    supabase: world.supabase,
    queryClient: world.queryClient,
    userId: USER,
    pondId: POND,
    resolutions: {
      ...emptyResolutions(),
      targets: { [toolCallId]: { nodeId: PAGE, nodeName: 'Garage' } },
    },
    toolCallId,
    openNodeId: PAGE,
    changes,
  })
}

/** The person answers the card any other way. */
function clickDecision(world: World, decision: ChangeLogStatus, toolCallId = 'pc1') {
  return resolveChangeLogRecord(world.supabase, {
    userId: USER,
    pondId: POND,
    toolCallId,
    decision: decision as Exclude<ChangeLogStatus, 'proposed'>,
  })
}

const pageLog = (world: World) =>
  listRecords(world.supabase, { userId: USER, pondId: POND, targetPageId: PAGE })

let world: World

beforeEach(() => {
  world = makeWorld()
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
})

// ── 1 · accept ───────────────────────────────────────────────────────────────

describe('propose and accept', () => {
  it('writes the page and logs accepted together, through the one atomic call', async () => {
    await pondProposes(world, PROPOSED)
    expect(world.log()).toMatchObject([{ status: 'proposed', action: 'edit', actor: 'pond' }])
    expect(await countProposed(world.supabase, USER, POND)).toBe(1)

    const receipt = await clickAccept(world, PROPOSED)

    // What the person sees next: the line is on the page.
    expect(receipt).toMatchObject({ applied: 1, skipped: 0, targetId: PAGE })
    expect(world.pageBlocks().map((b) => (b as unknown as { content: string }).content)).toEqual([
      'wiring quote',
      'electrician booked',
    ])

    // And the log says so, on the SAME record — it only grows.
    const [after] = world.log()
    expect(after.status).toBe('accepted')
    expect(after.transitions.map((t) => t.status)).toEqual(['proposed', 'accepted'])
    expect(after.transitions[1].actor).toBe('you')
    expect(await countProposed(world.supabase, USER, POND)).toBe(0)

    // Never one without the other: BOTH writes ride inside the single accept
    // RPC, so no separate update is issued against either table — not a bare
    // status write on change_log, and not a second `saveBlocks` on pages.
    expect(world.rpcCalls.filter((n) => n === 'accept_change_log_record')).toHaveLength(1)
    expect(world.tableUpdates).toEqual([])
  })

  // The silent half of criterion 3. An all-skipped accept leaves the page exactly
  // as it was; stamping `accepted` on it would be a log that permanently claims a
  // change nobody can see, with no error anywhere and no way to take it back.
  it('does not stamp accepted when nothing could be applied', async () => {
    const ghost: ModuleChange[] = [{ op: 'remove', blockId: 'never-existed' } as ModuleChange]
    await pondProposes(world, ghost)

    const receipt = await clickAccept(world, ghost)

    expect(receipt).toMatchObject({ applied: 0, skipped: 1 })
    expect(world.pageBlocks()).toEqual(ORIGINAL)
    expect(world.log()[0].status).toBe('proposed')
    expect(world.rpcCalls).toEqual([])
  })
})

// ── 2 · the answers that write nothing ───────────────────────────────────────

describe('answering a diff without taking it', () => {
  // reject, request-changes and withdraw differ only by the status they land on:
  // each takes the record out of `proposed` and leaves the page untouched.
  it.each(['rejected', 'changes_requested', 'withdrawn'] as const)(
    '%s leaves the page byte-identical and settles the record',
    async (decision) => {
      await pondProposes(world, PROPOSED)
      const before = JSON.stringify(world.pageBlocks())

      const answered = await clickDecision(world, decision)

      expect(answered?.status).toBe(decision)
      expect(JSON.stringify(world.pageBlocks())).toBe(before)
      expect(world.log()).toHaveLength(1)
      expect(world.log()[0].transitions.map((t) => t.status)).toEqual(['proposed', decision])
      expect(await countProposed(world.supabase, USER, POND)).toBe(0)
    }
  )

  it('answers a request-changes note with a NEW diff linked to the original', async () => {
    await pondProposes(world, PROPOSED)
    const original = world.log()[0]
    await clickDecision(world, 'changes_requested')

    // Pond's next propose_changes IS the revision.
    const revised: ModuleChange[] = [
      { op: 'create', data: { type: 'text', content: 'electrician — w/c 6 oct' } } as ModuleChange,
    ]
    await pondProposes(world, revised, { toolCallId: 'pc2', revisesToolCallId: 'pc1' })

    const log = world.log()
    expect(log).toHaveLength(2)
    const revision = log.find((r) => r.toolCallId === 'pc2')
    expect(revision).toMatchObject({ status: 'proposed', links: { revisedFrom: original.id } })
    // The original is not rewritten — it stays as the record the person answered.
    expect(world.at(original.id)).toMatchObject({
      status: 'changes_requested',
      before: original.before,
      after: original.after,
    })
    expect(
      await listRevisionsOf(world.supabase, { userId: USER, pondId: POND, recordId: original.id })
    ).toMatchObject([{ id: revision?.id }])

    // And the revision accepts like any other diff.
    await clickAccept(world, revised, 'pc2')
    expect(world.pageBlocks().map((b) => (b as unknown as { content: string }).content)).toEqual([
      'wiring quote',
      'electrician — w/c 6 oct',
    ])
    expect(world.at(revision!.id).status).toBe('accepted')
  })
})

// ── 3 · the person's own edit while a diff is pending ────────────────────────

describe('a pending diff and the person’s own edit', () => {
  const TYPED: Block[] = [
    ...ORIGINAL,
    { id: 'b2', type: 'text', content: 'rang the sparky' } as unknown as Block,
  ]

  // Two saves reach the same sweep. One is an edit, the other is a rename —
  // the editor's debounced save commits the whole page, title included. Getting
  // the second wrong is silent and one-way: `outdated` drops accept, so a diff
  // would vanish because somebody touched the title field.
  it.each([
    { when: 'the person types a new line', saved: TYPED, lands: 'outdated' as const },
    {
      when: 'only the title changed, so the blocks are identical',
      saved: ORIGINAL,
      lands: 'proposed' as const,
    },
  ])('$when → the pending diff is $lands', async ({ saved, lands }) => {
    await pondProposes(world, PROPOSED)

    await commitBlocks(world.supabase, world.queryClient, PAGE, saved, {
      ownEdit: true,
      before: ORIGINAL,
      pondId: POND,
    })

    const pending = world.log()[0]
    expect(pending.status).toBe(lands)
    // What the card may offer: accept is withdrawn from an outdated diff and
    // revise is offered in its place.
    expect(canAccept(pending.status)).toBe(lands === 'proposed')
    expect(canRevise(pending.status)).toBe(lands === 'outdated')

    const receipt = await clickAccept(world, PROPOSED)
    if (lands === 'outdated') {
      expect(receipt).toMatchObject({ applied: 0, skipped: 1, targetId: null })
      expect(receipt.skippedReasons).toEqual([
        'this proposal is out of date — ask Pond to revise it',
      ])
      // The person's own words are still the page, untouched by the stale diff.
      expect(world.pageBlocks()).toEqual(saved)
      expect(world.log()[0].status).toBe('outdated')
    } else {
      expect(receipt.applied).toBe(1)
      expect(world.log()[0].status).toBe('accepted')
    }
  })
})

// ── 4 · the change log, and revert ───────────────────────────────────────────

describe('the change log', () => {
  it('lists the page’s records, and a revert is a NEW diff that restores the blocks', async () => {
    await pondProposes(world, PROPOSED)
    await clickAccept(world, PROPOSED)
    const edit = world.log()[0]
    expect(edit.status).toBe('accepted')
    expect(world.pageBlocks()).toHaveLength(2)

    // The log lists it, and offers to set it back.
    expect(buildPageChanges(await pageLog(world))).toMatchObject([
      { record: { id: edit.id }, label: 'wrote 1 paragraph', revertable: true },
    ])

    // Revert raises a NEW record — the log only grows, the original is untouched.
    const revert = await proposeRevert(world.supabase, {
      userId: USER,
      pondId: POND,
      record: edit,
      current: world.pageBlocks(),
    })
    expect(revert).toMatchObject({
      status: 'proposed',
      action: 'revert',
      actor: 'you',
      links: { revertOf: edit.id },
    })
    expect(world.log()).toHaveLength(2)
    expect(world.at(edit.id).status).toBe('accepted')
    // With one waiting, the row stops offering a second.
    const rows = buildPageChanges(await pageLog(world))
    expect(rows.find((r) => r.record.id === edit.id)).toMatchObject({
      revertable: false,
      revertBlockedBy: 'waiting',
    })
    expect(rows.find((r) => r.record.id === revert.id)).toMatchObject({
      label: expect.stringMatching(/^revert of \d{2}:\d{2}$/),
      reverts: { id: edit.id },
    })

    // Accepting the revert restores the earlier blocks and marks the original.
    const outcome = await acceptRevert(world.supabase, {
      userId: USER,
      pondId: POND,
      revert,
      current: world.pageBlocks(),
    })
    expect(outcome.kind).toBe('accepted')
    expect(world.pageBlocks()).toEqual(ORIGINAL)
    expect(world.at(revert.id).status).toBe('accepted')
    expect(world.at(edit.id).status).toBe('reverted')
    // Still two records: nothing was rewritten and nothing was removed.
    expect(world.log()).toHaveLength(2)
  })
})

// ── 5 · your own edits ───────────────────────────────────────────────────────

describe('your own edits', () => {
  const WROTE: Block[] = [
    {
      id: 'b1',
      type: 'text',
      content: 'wiring quote\n\nrang the sparky\n\nhe can come on the 6th\n\nbook the skip',
    } as unknown as Block,
  ]

  /** The editor's debounced save — one pause — and the record it writes behind it. */
  const typeAndPause = async (before: Block[], after: Block[]) => {
    await commitBlocks(world.supabase, world.queryClient, PAGE, after, {
      ownEdit: true,
      before,
      pondId: POND,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('are accepted as you make them, and the page’s changes read "wrote 3 paragraphs · you"', async () => {
    await typeAndPause(ORIGINAL, WROTE)

    expect(world.pageBlocks()).toEqual(WROTE)
    expect(world.log()).toMatchObject([
      {
        status: 'accepted',
        action: 'edit',
        actor: 'you',
        pondId: POND,
        targetPageId: PAGE,
        before: ORIGINAL,
        after: WROTE,
      },
    ])
    // Born accepted: it never sat as a proposal.
    expect(world.log()[0].transitions.map((t) => t.status)).toEqual(['accepted'])
    expect(await countProposed(world.supabase, USER, POND)).toBe(0)

    const [row] = buildPageChanges(await pageLog(world))
    expect(`${row.label} · ${row.record.actor}`).toBe('wrote 3 paragraphs · you')
  })

  it('an unchanged re-save logs nothing', async () => {
    await typeAndPause(ORIGINAL, ORIGINAL)
    expect(world.log()).toEqual([])
  })

  it('accepting a diff is one record — Pond’s, accepted — and no own edit beside it', async () => {
    await pondProposes(world, PROPOSED)
    await clickAccept(world, PROPOSED)

    expect(world.log()).toHaveLength(1)
    expect(world.log()[0]).toMatchObject({ actor: 'pond', status: 'accepted' })
  })

  it('reverting your own edit adds the revert and nothing else', async () => {
    await typeAndPause(ORIGINAL, WROTE)
    const [edit] = buildPageChanges(await pageLog(world))
    expect(edit.revertable).toBe(true)

    const revert = await proposeRevert(world.supabase, {
      userId: USER,
      pondId: POND,
      record: edit.record,
      current: world.pageBlocks(),
    })
    const outcome = await acceptRevert(world.supabase, {
      userId: USER,
      pondId: POND,
      revert,
      current: world.pageBlocks(),
    })

    expect(outcome.kind).toBe('accepted')
    expect(world.pageBlocks()).toEqual(ORIGINAL)
    expect(world.log()).toHaveLength(2)
    expect(world.at(edit.record.id).status).toBe('reverted')
  })
})
