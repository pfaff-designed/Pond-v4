/**
 * Proposal-card resolution state (ticket-19).
 *
 * Accept/Dismiss on a proposal card used to be client-only React state, which
 * opened a data-loss path: after a reload every historical card re-armed with
 * live buttons (one click from a duplicate page, or from re-applying a stale
 * wholesale table edit over newer manual edits). And because replay drops
 * un-resulted tool calls (`ignoreIncompleteToolCalls` in transcript.ts), the
 * model never saw its own proposals — so it re-proposed already-actioned cards.
 *
 * One record fixes both. The terminal persists these maps with the transcript
 * (see the envelope in conversation/client.ts) and sends them with each chat
 * request; `applyResolutions` stamps the user's decision onto the matching tool
 * part as a synthetic tool RESULT, so replay keeps the call and the model reads
 * the outcome. Unresolved proposals stay `input-available` and are dropped from
 * replay exactly as before.
 *
 * Server-safe: pure data, no React.
 */
import type { UIMessage } from 'ai'

export type ProposalDecision = 'accepted' | 'rejected'

/** The page a propose_changes batch was made against, recorded when the part
 *  streams in — so Accept commits there, not to wherever the user is now.
 *  `missing: true` (ticket-30 review) marks a cross-page target id that was NOT
 *  found among the user's pages (deleted, or a hallucinated id): the card shows
 *  a "target page not found" notice and Accept skips every change — it must
 *  NEVER fall back to writing the open page (a create op would land there). */
export interface ProposalTarget {
  nodeId: string
  nodeName: string
  missing?: boolean
}

export interface ConversationResolutions {
  /** propose_changes decisions, keyed `${toolCallId}:${changeIndex}` (partial accept). */
  changes: Record<string, ProposalDecision>
  /** create_page decisions, keyed by toolCallId. */
  creates: Record<string, ProposalDecision>
  /** Accepted changes skipped by the accept-time re-validation gate, by toolCallId. */
  skipped: Record<string, number>
  /** Proposal-time target page per propose_changes batch, by toolCallId. */
  targets: Record<string, ProposalTarget>
}

export function emptyResolutions(): ConversationResolutions {
  return { changes: {}, creates: {}, skipped: {}, targets: {} }
}

/** Tolerant parse of a persisted/sent resolutions value — never throws, drops
 *  anything malformed so a bad row or request body degrades to "unresolved". */
export function parseResolutions(value: unknown): ConversationResolutions {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const pick = <T>(field: string, ok: (x: unknown) => x is T): Record<string, T> => {
    const raw = v[field]
    if (typeof raw !== 'object' || raw === null) return {}
    const out: Record<string, T> = {}
    for (const [key, val] of Object.entries(raw)) {
      if (ok(val)) out[key] = val
    }
    return out
  }
  const isDecision = (x: unknown): x is ProposalDecision => x === 'accepted' || x === 'rejected'
  const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  const isTarget = (x: unknown): x is ProposalTarget =>
    typeof x === 'object' &&
    x !== null &&
    typeof (x as ProposalTarget).nodeId === 'string' &&
    typeof (x as ProposalTarget).nodeName === 'string'
  return {
    changes: pick('changes', isDecision),
    creates: pick('creates', isDecision),
    skipped: pick('skipped', isCount),
    targets: pick('targets', isTarget),
  }
}

/**
 * The page an Accept should commit to: the target stamped at proposal time,
 * else (legacy unstamped card) the currently-open node, else null — meaning
 * there is nowhere safe to write and every change must count as skipped.
 *
 * A stamp marked `missing` returns null: the batch named a page that does not
 * exist, so there is no safe target — falling back to the open page here would
 * append the batch's create ops to whatever the user happens to have open
 * (ticket-30 review, must-fix 1).
 */
export function resolveAcceptTarget(
  resolutions: ConversationResolutions,
  toolCallId: string,
  openNodeId: string | null
): string | null {
  const stamped = resolutions.targets[toolCallId]
  if (stamped) return stamped.missing ? null : stamped.nodeId
  return openNodeId
}

// ── Stamp-time target resolution (ticket-30) ─────────────────────────────────

/** A page row as the stamping path needs it — id + title only. */
export interface StampPageRef {
  id: string
  title: string
}

/**
 * Resolve the target to stamp onto a freshly streamed propose_changes part.
 * Pure — the terminal's stamping effect calls this per part.
 *
 *   - `targetPageId` present and found in `pages` (BY ID, never fuzzy title) →
 *     stamp that page.
 *   - `targetPageId` present but the pages list has not loaded yet → `'defer'`:
 *     do NOT stamp — a write-once stamp taken against an in-flight list would
 *     silently mis-resolve to the open page. The effect re-runs when the list
 *     resolves and stamps then (ticket-30 review, must-fix 1).
 *   - `targetPageId` present, pages loaded, id absent → stamp `missing: true`
 *     (deleted page / hallucinated id): the card shows a notice and Accept
 *     skips. Never falls back to the open page.
 *   - no `targetPageId` → the open page when one is open (with its name — an
 *     empty name would mislabel the card), else `null` (leave unstamped;
 *     Accept then has nowhere safe to write and skips).
 */
export function resolveStampTarget(opts: {
  targetPageId?: string
  pages: readonly StampPageRef[]
  pagesLoaded: boolean
  openNodeId: string | null
  openNodeName: string | null
}): ProposalTarget | 'defer' | null {
  const { targetPageId, pages, pagesLoaded, openNodeId, openNodeName } = opts
  if (targetPageId) {
    if (!pagesLoaded) return 'defer'
    const page = pages.find((p) => p.id === targetPageId)
    if (page) return { nodeId: page.id, nodeName: page.title }
    return { nodeId: targetPageId, nodeName: '', missing: true }
  }
  if (openNodeId && openNodeName) return { nodeId: openNodeId, nodeName: openNodeName }
  return null
}

type ToolPartLike = {
  type: string
  toolCallId: string
  state: string
  input?: { changes?: unknown[] }
}

/**
 * Stamp user decisions onto resolved proposal tool parts as synthetic tool
 * results (`output-available`), so `toModelMessages` preserves them and the
 * model sees what was actioned. Parts with no recorded decision are returned
 * untouched. Pure — input messages are not mutated.
 */
export function applyResolutions(
  messages: UIMessage[],
  resolutions: ConversationResolutions
): UIMessage[] {
  if (
    Object.keys(resolutions.changes).length === 0 &&
    Object.keys(resolutions.creates).length === 0
  ) {
    return messages
  }
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => resolvePart(part as ToolPartLike, resolutions)),
  })) as UIMessage[]
}

function resolvePart(part: ToolPartLike, resolutions: ConversationResolutions): ToolPartLike {
  if (part.state !== 'input-available') return part

  if (part.type === 'tool-propose_changes') {
    const changeCount = part.input?.changes?.length ?? 0
    const decisions: (ProposalDecision | 'pending')[] = Array.from(
      { length: changeCount },
      (_, i) =>
        (resolutions.changes[`${part.toolCallId}:${i}`] as ProposalDecision | undefined) ??
        'pending'
    )
    if (!decisions.some((d) => d !== 'pending')) return part
    const skipped = resolutions.skipped[part.toolCallId] ?? 0
    // An accepted-but-skipped change never reached its page. The note must say
    // so explicitly, or the model reads the acceptance stamp as success and
    // claims the dropped change landed (blank-slate findings BUG 2).
    const note =
      skipped > 0
        ? `User decision per change, in order. Do not re-propose accepted or rejected changes. IMPORTANT: ${skipped} accepted change${skipped > 1 ? 's' : ''} could NOT be written and ${skipped > 1 ? 'were' : 'was'} NOT applied — do not claim ${skipped > 1 ? 'they' : 'it'} happened. Offer to re-propose when the user has the right page open.`
        : 'User decision per change, in order. Do not re-propose accepted or rejected changes.'
    return {
      ...part,
      state: 'output-available',
      output: {
        note,
        decisions,
        ...(skipped > 0 ? { skippedOnApply: skipped } : {}),
      },
    } as ToolPartLike
  }

  if (part.type === 'tool-create_page') {
    const decision = resolutions.creates[part.toolCallId]
    if (!decision) return part
    return {
      ...part,
      state: 'output-available',
      output: {
        decision,
        note:
          decision === 'accepted'
            ? 'User accepted; the page was created. Do not propose it again.'
            : 'User dismissed this proposal. Do not propose it again unless asked.',
      },
    } as ToolPartLike
  }

  return part
}
