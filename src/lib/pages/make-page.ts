/**
 * make page — the write behind the `new page — proposed` card (issue #97).
 *
 * The person pressed make this a page, read the card, and pressed make page.
 * Only now does anything touch a page. This module owns that write and the
 * change-log records around it, framework-agnostic (a SupabaseClient in, no
 * Next.js, no React), so the terminal stays a thin adapter and jest can prove
 * the result (6a): a new page record carrying the prose word for word, the
 * "mentioned" list in its props, a change-log record, and — through `createPage`
 * landing in the pond's page tree — a rail entry.
 *
 * Carried audit items (6a gaps):
 *   - the parent was deleted between proposal and make page → `ParentGoneError`
 *     before any write, so the card can ask for another place;
 *   - a very long proposed name → `clampPageName` on the way in;
 *   - double send → the caller settles the card before awaiting, and this write
 *     is a single insert; see the terminal's in-flight guard.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { appendProposal } from '@/lib/change-log/store'
import {
  clampPageName,
  mentionedPages,
  proposalBlocks,
  type MentionablePage,
  type PageProposal,
} from '@/lib/conversation/page-proposals'
import { createPage, getPage } from './client'
import { stampMadeFrom } from './made-from'
import { stampMentioned } from './mentioned'

/** The chosen parent no longer exists — raised BEFORE any write. */
export class ParentGoneError extends Error {
  constructor() {
    super('that place was deleted — pick another')
    this.name = 'ParentGoneError'
  }
}

export interface MakePageInput {
  proposal: PageProposal
  /** The conversation the answer came from — the made-from chip links back to it. */
  threadId: string | null
  /** The pond's pages, for the "mentioned" list. Rows only; nothing is written to them. */
  pages: MentionablePage[]
  workspace?: WorkspaceScope
}

export interface MadePage {
  id: string
  title: string
}

/**
 * Write the page a proposal describes. Throws `ParentGoneError` when the chosen
 * parent is gone, and whatever `createPage` throws otherwise — the card reverts
 * to pending on either, so nothing is half-made.
 */
export async function makePageFromAnswer(
  supabase: SupabaseClient<Database>,
  input: MakePageInput,
  mintId: () => string
): Promise<MadePage> {
  const { proposal, threadId, pages } = input
  const workspace = input.workspace ?? 'main'

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (proposal.parentId) {
    const parent = await getPage(supabase, proposal.parentId)
    if (!parent) throw new ParentGoneError()
  }

  const title = clampPageName(proposal.name) || 'untitled'
  // The prose, word for word, is the page's only block. What the answer mentioned
  // is a card, not prose, so it rides in props beside the made-from stamp (6a
  // frame 5). Notes are Pond's own characterisation and are not written yet.
  const blocks = proposalBlocks(proposal.prose, mintId)
  const kind = proposal.kind.trim() || 'page'
  const props = stampMentioned(
    stampMadeFrom(
      { kind },
      {
        threadId,
        messageId: proposal.messageId,
        question: proposal.question,
        askedAt: proposal.askedAt,
      }
    ),
    mentionedPages(proposal.prose, pages).map((m) => ({ pageId: m.id, title: m.title }))
  )

  const page = await createPage(supabase, user.id, {
    parentId: proposal.parentId,
    type: 'page',
    title,
    blocks,
    props,
    workspace,
  })
  return { id: page.id, title: page.title }
}

/**
 * The record the proposal is born as — `proposed`, in the change log, the
 * moment the card opens (6d closing: a pending proposal is "in the proposed
 * view"). Keyed by the proposal id as `tool_call_id`, so make page / cancel
 * advance it exactly the way a tool card's record is advanced. `read` carries
 * the chips under the answer.
 *
 * Never throws: the log is a side-record; a dropped record is a bug worth
 * finding in the logs, a dead card in its place is a worse one.
 */
export async function recordPageProposal(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    workspace?: WorkspaceScope
    threadId: string | null
    proposal: PageProposal
  }
): Promise<boolean> {
  const { proposal } = input
  try {
    await appendProposal(supabase, {
      userId: input.userId,
      workspace: input.workspace ?? 'main',
      action: 'create_page',
      // The person asked for it; Pond proposed the name, place and kind.
      actor: 'pond',
      targetPageId: null,
      before: null,
      after: {
        title: proposal.name,
        parentId: proposal.parentId,
        kind: proposal.kind,
        prose: proposal.prose,
        madeFromMessageId: proposal.messageId,
      },
      sourceThreadId: input.threadId,
      toolCallId: proposal.id,
      read: proposal.read,
    })
    return true
  } catch (err) {
    console.error('[change-log] failed to record page proposal', proposal.id, err)
    return false
  }
}
