/**
 * Recording proposals into the change log — spec #110 criterion 2.
 *
 * "Creating a proposal inserts a `proposed` record capturing the full
 * before/after snapshot at propose time — not just a decision."
 *
 * WHY THIS LIVES SERVER-SIDE. Every proposal tool is client-resolved: none of
 * them has an `execute`, because the user reviews a card and can correct the
 * target before anything is written. So there is no tool body to log from. The
 * chat route logs each call as it is EMITTED, which is the moment the design
 * calls "propose time" — before the person has decided anything. That also means
 * a proposal is recorded even if the browser never renders the card.
 *
 * WHAT IS RECORDED. `before` is the target page exactly as it stood when the
 * proposal was made; `after` is what that page WOULD read if the batch were
 * accepted, computed with the same `applyProposedChanges` the accept path uses.
 * Storing the tool arguments instead would persist an instruction, not a diff,
 * and #110 asks for snapshots that the registry facets can re-render on a record
 * page long after the call is gone.
 *
 * The ids minted for CREATED blocks here are provisional: the client mints its
 * own on accept, so a created block's id in `after` need not be the id that
 * finally lands. The shape, order and content are what the record is for.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import { applyProposedChanges } from '@/lib/pages/edits'
import { appendProposal } from './store'
import type { ChangeLogAction } from './types'
import type { WorkspaceScope } from '@/lib/workspace/context'

/**
 * Tool name → the action its record is filed under. A tool that is NOT in here
 * is not a proposal — `read_page`, `fetch_context`, `web_search`,
 * `ask_question` and `suggest_followups` change nothing, so they log nothing.
 */
const PROPOSAL_ACTIONS: Readonly<Record<string, ChangeLogAction>> = {
  propose_changes: 'edit',
  create_page: 'create_page',
  define_schema: 'define_schema',
  add_row: 'add_row',
  promote_table: 'promote_table',
  configure_view: 'configure_view',
  link_records: 'link_records',
}

/** The slice of an emitted tool call this module needs. */
export interface ProposalToolCall {
  toolCallId: string
  toolName: string
  input: unknown
}

export interface RecordProposalsInput {
  userId: string
  workspace: WorkspaceScope
  /** The page the person has open — the default target of a block proposal. */
  openNodeId: string | null
  /** The conversation the proposal came from, when the caller knows it. */
  sourceThreadId?: string | null
  toolCalls: ProposalToolCall[]
}

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
}

/** The page a call applies to: the one it named, else the one that is open. */
function targetPageOf(toolName: string, input: unknown, openNodeId: string | null): string | null {
  const args = asRecord(input)
  // propose_changes names a cross-page target as `targetPageId` (ticket-30); the
  // collection tools name theirs `pageId`. A create has no target page yet.
  if (toolName === 'create_page') return null
  for (const key of ['targetPageId', 'pageId']) {
    const v = args[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return openNodeId
}

/** The target page's blocks as they stand right now, or null if unreadable. */
async function loadBlocks(
  supabase: SupabaseClient<Database>,
  pageId: string
): Promise<Block[] | null> {
  const { data } = await supabase.from('pages').select('blocks').eq('id', pageId).maybeSingle()
  const blocks = (data as { blocks?: unknown } | null)?.blocks
  return Array.isArray(blocks) ? (blocks as Block[]) : null
}

/**
 * Insert one `proposed` record per proposal tool call in a step. Returns how
 * many were written.
 *
 * Never throws. The change log is a side-record of the turn: if it cannot be
 * written, the person still gets their reply. A dropped record is a bug worth
 * finding in the logs; a 500 in its place is a worse one.
 */
export async function recordProposedToolCalls(
  supabase: SupabaseClient<Database>,
  input: RecordProposalsInput
): Promise<number> {
  const { userId, workspace, openNodeId, sourceThreadId = null, toolCalls } = input
  let written = 0

  for (const call of toolCalls) {
    const action = PROPOSAL_ACTIONS[call.toolName]
    if (!action) continue

    try {
      const targetPageId = targetPageOf(call.toolName, call.input, openNodeId)
      let before: unknown = null
      let after: unknown = asRecord(call.input)

      if (call.toolName === 'propose_changes') {
        // A block proposal with nowhere to land is not a proposal — the accept
        // path would count every change as skipped. Don't log a homeless record.
        if (!targetPageId) continue
        const blocks = await loadBlocks(supabase, targetPageId)
        if (blocks === null) continue
        const changes = (asRecord(call.input).changes ?? []) as ModuleChange[]
        before = blocks
        after = applyProposedChanges(blocks, changes, () => crypto.randomUUID(), {
          batch: changes,
        }).blocks
      }

      await appendProposal(supabase, {
        userId,
        workspace,
        action,
        targetPageId,
        before,
        after,
        sourceThreadId,
        toolCallId: call.toolCallId,
      })
      written++
    } catch (err) {
      // Deliberately swallowed — see the contract above.
      console.error('[change-log] failed to record proposal', call.toolName, err)
    }
  }

  return written
}
