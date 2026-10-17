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
 *
 * ── DEMOTED (#102, spec #110) ────────────────────────────────────────────────
 * This envelope is no longer the durable record of what changed. The durable,
 * only-grows change log — `public.change_log`, written through
 * `src/lib/change-log/store.ts` — is: one record per action, holding the full
 * before/after snapshot and one of eight statuses, scoped per pond.
 *
 * What lives here is now a SESSION-SCOPED UI CACHE, and only that: it keeps
 * proposal cards inert across a reload and feeds `applyResolutions` so the model
 * still sees settled results (the ticket-19 SDK gotcha). It stores a binary
 * `accepted | rejected` DECISION and no diff content, which is exactly why it
 * cannot be the source of truth. The link between the two is `sourceThreadId` +
 * `toolCallId`, both stamped on every change-log record, so resolved-card state
 * is re-derivable from the log.
 *
 * Nothing is removed — rollback of #102 leaves this working as it does today.
 *
 * Ticket-39 (THE SPINE) folds two more facts into the SAME envelope, so the
 * lifecycle and question cards persist and re-seed exactly like proposal cards:
 *   - `lifecycle` — the project phase (grill → wayfinding → build-out), so a
 *     returning session resumes mid-arc.
 *   - `questions` — branch-pause question-card answers, so an answered card
 *     renders inert after reload and its answer rides the chat body.
 */
import type { UIMessage } from 'ai'
import { parseQuestionResolutions, type QuestionResolutions } from './parts'
import { parseLifecycle, isLifecycleActive, type LifecycleState } from './lifecycle'
import { parsePageProposals, type PageProposals } from './page-proposals'
import { isChangeLogStatus, type ChangeLogStatus } from '@/lib/change-log/types'

/**
 * A card's settled decision — every change-log status except `proposed`, which
 * is the card's `pending` (#98). The DB and the state machine carried all eight
 * from migration 0011; until #98 the envelope admitted only accepted/rejected,
 * so outdated, changes requested, withdrawn, undone and reverted had no way to
 * reach the card. `changes_requested` and `outdated` are the two a person
 * produces or meets in M1; the other three ride through from the log.
 */
export type ProposalDecision = Exclude<ChangeLogStatus, 'proposed'>

export function isProposalDecision(x: unknown): x is ProposalDecision {
  return isChangeLogStatus(x) && x !== 'proposed'
}

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
  /** define_schema decisions, keyed by toolCallId (#17 slice 5). */
  schemas: Record<string, ProposalDecision>
  /** add_row decisions, keyed by toolCallId (#18). */
  rows: Record<string, ProposalDecision>
  /** promote_table decisions, keyed by toolCallId (#29). */
  promotions: Record<string, ProposalDecision>
  /** configure_view decisions, keyed by toolCallId (#19 slice 5). */
  views: Record<string, ProposalDecision>
  /** link_records decisions, keyed by toolCallId (#40). */
  links: Record<string, ProposalDecision>
  /** Accepted changes skipped by the accept-time re-validation gate, by toolCallId. */
  skipped: Record<string, number>
  /**
   * #52 fix 1 — per accepted define_schema, the NAMES of proposed rollups whose relation
   * did NOT resolve to a local relation (reverse/backlink count). Additive & optional:
   * absent ⇒ the old flat "schema was defined" note. The model reads this and states
   * plainly that those rollups couldn't be linked instead of claiming they compute.
   */
  schemaInertRollups?: Record<string, string[]>
  /**
   * #52 fix 2 — per accepted configure_view, whether it REPLACED an existing view (a
   * collection shows one active view). Additive & optional: absent ⇒ the old flat "view
   * was configured" note. The model reads this and says the active view was switched
   * rather than claiming the two views coexist.
   */
  viewReplaced?: Record<string, boolean>
  /** Proposal-time target page per propose_changes batch, by toolCallId. */
  targets: Record<string, ProposalTarget>
  /** Branch-pause question-card answers, by toolCallId (ticket-39). */
  questions: QuestionResolutions
  /** The project lifecycle phase, so a returning session resumes mid-arc
   *  (ticket-39). Optional in persisted rows: absent ⇒ ordinary chat (idle). */
  lifecycle?: LifecycleState
  /**
   * make-this-a-page proposals (#97), keyed by proposal id. Additive & optional:
   * absent ⇒ none. Unlike tool-card decisions, a `proposed` entry IS persisted —
   * closing Pond with the card open leaves it pending in the thread (6d).
   */
  pageProposals?: PageProposals
  /**
   * #98 — the request-changes note per propose_changes batch, by toolCallId.
   * Additive & optional: absent ⇒ none. Shown under the card after reload and
   * stamped into the tool result so Pond reads what to revise.
   */
  changeNotes?: Record<string, string>
  /**
   * #98 — revised batch → the batch it answers (toolCallId → toolCallId), so a
   * revised card is labelled as one across reload. Additive & optional.
   */
  revisions?: Record<string, string>
}

export function emptyResolutions(): ConversationResolutions {
  return {
    changes: {},
    creates: {},
    schemas: {},
    rows: {},
    promotions: {},
    views: {},
    links: {},
    skipped: {},
    targets: {},
    questions: {},
  }
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
  const isDecision = isProposalDecision
  const isString = (x: unknown): x is string => typeof x === 'string' && x.length > 0
  const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  const isStringArray = (x: unknown): x is string[] =>
    Array.isArray(x) && x.every((s) => typeof s === 'string')
  const isBool = (x: unknown): x is boolean => typeof x === 'boolean'
  const isTarget = (x: unknown): x is ProposalTarget =>
    typeof x === 'object' &&
    x !== null &&
    typeof (x as ProposalTarget).nodeId === 'string' &&
    typeof (x as ProposalTarget).nodeName === 'string'
  const lifecycle = parseLifecycle(v.lifecycle)
  // #52 — additive honesty maps; only carried when non-empty (an absent map is the old
  // flat note, so a legacy transcript stays byte-clean).
  const schemaInertRollups = pick('schemaInertRollups', isStringArray)
  const viewReplaced = pick('viewReplaced', isBool)
  // #97 — page proposals ride the envelope only when there are any, so an
  // ordinary transcript row stays byte-identical to before.
  const pageProposals = parsePageProposals(v.pageProposals)
  // #98 — notes + revision links, carried only when non-empty for the same reason.
  const changeNotes = pick('changeNotes', isString)
  const revisions = pick('revisions', isString)
  return {
    changes: pick('changes', isDecision),
    creates: pick('creates', isDecision),
    schemas: pick('schemas', isDecision),
    rows: pick('rows', isDecision),
    promotions: pick('promotions', isDecision),
    views: pick('views', isDecision),
    links: pick('links', isDecision),
    skipped: pick('skipped', isCount),
    targets: pick('targets', isTarget),
    ...(Object.keys(schemaInertRollups).length > 0 ? { schemaInertRollups } : {}),
    ...(Object.keys(viewReplaced).length > 0 ? { viewReplaced } : {}),
    // Question-card answers + lifecycle ride the same envelope (ticket-39),
    // parsed by their own owning modules so the record shapes stay one home.
    questions: parseQuestionResolutions(v.questions),
    // Only carry the lifecycle when a project is actually in flight — an idle
    // state is the default and stays off ordinary-chat rows.
    ...(isLifecycleActive(lifecycle) ? { lifecycle } : {}),
    ...(Object.keys(pageProposals).length > 0 ? { pageProposals } : {}),
    ...(Object.keys(changeNotes).length > 0 ? { changeNotes } : {}),
    ...(Object.keys(revisions).length > 0 ? { revisions } : {}),
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
 *   - `targetPageId` equal to the open page's own id → stamp the open page
 *     (with its live name), even when that id is absent from `pages` — the
 *     home page is stripped from `pages` (KAN-341), so a model naming the
 *     open root page by id must not read as a deleted/hallucinated target.
 *   - `targetPageId` present, pages loaded, id absent and not the open page →
 *     stamp `missing: true` (deleted page / hallucinated id): the card shows
 *     a notice and Accept skips. Never falls back to the open page.
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
    if (targetPageId === openNodeId && openNodeName) {
      return { nodeId: openNodeId, nodeName: openNodeName }
    }
    return { nodeId: targetPageId, nodeName: '', missing: true }
  }
  if (openNodeId && openNodeName) return { nodeId: openNodeId, nodeName: openNodeName }
  return null
}

type ToolPartLike = {
  type: string
  toolCallId: string
  state: string
  input?: { changes?: unknown[]; question?: string }
}

/**
 * Stamp user decisions onto resolved proposal tool parts as synthetic tool
 * results (`output-available`), so `toModelMessages` preserves them and the
 * model sees what was actioned. Parts with no recorded decision are returned
 * untouched. Pure — input messages are not mutated.
 *
 * Ticket-39: an ANSWERED question card is stamped the same way — the model sees
 * the user's branch decision (which chip / free answer) and stops re-asking,
 * exactly as it stops re-proposing an actioned card.
 */
export function applyResolutions(
  messages: UIMessage[],
  resolutions: ConversationResolutions
): UIMessage[] {
  if (
    Object.keys(resolutions.changes).length === 0 &&
    Object.keys(resolutions.creates).length === 0 &&
    Object.keys(resolutions.schemas).length === 0 &&
    Object.keys(resolutions.rows).length === 0 &&
    Object.keys(resolutions.promotions).length === 0 &&
    Object.keys(resolutions.views).length === 0 &&
    Object.keys(resolutions.links).length === 0 &&
    Object.keys(resolutions.questions).length === 0
  ) {
    return messages
  }
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => resolvePart(part as ToolPartLike, resolutions)),
  })) as UIMessage[]
}

/**
 * #98 — what the model reads on a propose_changes card that settled on one of
 * the five statuses beyond accept/reject. `changes_requested` carries the note:
 * the user is addressing Pond (M1's only proposer), and the reply must be a
 * REVISED diff, not the original again and not a human handoff.
 */
const OTHER_STATUS_NOTES: Partial<Record<ProposalDecision, (note?: string) => string>> = {
  changes_requested: (note) =>
    `The user REQUESTED CHANGES to this proposal${note ? ` with the note: "${note}"` : ''}. Nothing was written. Reply with a REVISED propose_changes batch for the same page that addresses the note — do not re-propose the original unchanged, and do not claim anything landed.`,
  outdated: () =>
    'This proposal went OUTDATED: its target page was edited after it was proposed, so the diff no longer applies to the page as it stands. Nothing was written. Do not apply or re-propose it as-is; if the user asks you to revise it, read the page again and propose anew.',
  withdrawn: () =>
    'This proposal was WITHDRAWN by its proposer. Nothing was written. Do not re-propose it unless asked.',
  undone: () =>
    'This change was accepted and then UNDONE in the session. The page no longer carries it. Do not re-propose it unless asked.',
  reverted: () =>
    'This change was accepted and later REVERTED from the change log. The page no longer carries it. Do not re-propose it unless asked.',
}

function resolvePart(part: ToolPartLike, resolutions: ConversationResolutions): ToolPartLike {
  if (part.state !== 'input-available') return part

  if (part.type === 'tool-ask_question') {
    const answer = resolutions.questions[part.toolCallId]
    if (!answer) return part
    return {
      ...part,
      state: 'output-available',
      output: {
        answer: answer.answer,
        via: answer.via,
        note: 'The user answered this question. Apply this branch and do not ask it again.',
      },
    } as ToolPartLike
  }

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
    const requestedChanges = resolutions.changeNotes?.[part.toolCallId]
    // #98 — the five statuses beyond accept/reject each need their own honest
    // note, or the model reads any stamp as "this landed" (the BUG 2 lesson).
    const settled = decisions.find((d) => d !== 'pending')
    const statusNote = settled ? OTHER_STATUS_NOTES[settled] : undefined
    const note = statusNote
      ? statusNote(requestedChanges)
      : skipped > 0
        ? // An accepted-but-skipped change never reached its page. The note must
          // say so explicitly, or the model reads the acceptance stamp as success
          // and claims the dropped change landed (blank-slate findings BUG 2).
          `User decision per change, in order. Do not re-propose accepted or rejected changes. IMPORTANT: ${skipped} accepted change${skipped > 1 ? 's' : ''} could NOT be written and ${skipped > 1 ? 'were' : 'was'} NOT applied — do not claim ${skipped > 1 ? 'they' : 'it'} happened. Offer to re-propose when the user has the right page open.`
        : "User decision per change, in order. Do not re-propose accepted or rejected changes. The page may have changed since: if the open page's current text is attached to the latest message, quote and target that, not this proposal."
    return {
      ...part,
      state: 'output-available',
      output: {
        note,
        decisions,
        ...(skipped > 0 ? { skippedOnApply: skipped } : {}),
        ...(settled === 'changes_requested' && requestedChanges ? { requestedChanges } : {}),
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

  if (part.type === 'tool-define_schema') {
    const decision = resolutions.schemas[part.toolCallId]
    if (!decision) return part
    // #52 fix 1 — an accepted schema whose rollup(s) couldn't be linked to a local
    // relation must be reported honestly, mirroring the propose_changes skip-count
    // precedent: the model reads the acceptance stamp and would otherwise claim the
    // rollups compute. Name them and say they render "—" until a local relation exists.
    const inert = resolutions.schemaInertRollups?.[part.toolCallId] ?? []
    const acceptedNote =
      inert.length > 0
        ? `User accepted; the schema was defined. Do not propose it again. IMPORTANT: ${inert.length} rollup${inert.length > 1 ? 's' : ''} (${inert.join(', ')}) could NOT be linked — ${inert.length > 1 ? 'their' : 'its'} relation is not a relation on this collection (a reverse/backlink count is unsupported), so ${inert.length > 1 ? 'they render' : 'it renders'} "—". Do not claim ${inert.length > 1 ? 'they compute' : 'it computes'} a value.`
        : 'User accepted; the schema was defined. Do not propose it again.'
    return {
      ...part,
      state: 'output-available',
      output: {
        decision,
        note:
          decision === 'accepted'
            ? acceptedNote
            : 'User dismissed this proposal. Do not propose it again unless asked.',
        ...(decision === 'accepted' && inert.length > 0 ? { inertRollups: inert } : {}),
      },
    } as ToolPartLike
  }

  if (part.type === 'tool-add_row') {
    const decision = resolutions.rows[part.toolCallId]
    if (!decision) return part
    return {
      ...part,
      state: 'output-available',
      output: {
        decision,
        note:
          decision === 'accepted'
            ? 'User accepted; the row was added. Do not propose it again.'
            : 'User dismissed this proposal. Do not propose it again unless asked.',
      },
    } as ToolPartLike
  }

  if (part.type === 'tool-promote_table') {
    const decision = resolutions.promotions[part.toolCallId]
    if (!decision) return part
    return {
      ...part,
      state: 'output-available',
      output: {
        decision,
        note:
          decision === 'accepted'
            ? 'User accepted; the table was converted to a collection. Do not propose it again.'
            : 'User dismissed this proposal. Do not propose it again unless asked.',
      },
    } as ToolPartLike
  }

  if (part.type === 'tool-configure_view') {
    const decision = resolutions.views[part.toolCallId]
    if (!decision) return part
    // #52 fix 2 — a collection shows ONE active view, so an accepted configure_view that
    // REPLACED an existing view SWITCHED the active view. Say so, or the model claims the
    // new view coexists with the old one.
    const replaced = resolutions.viewReplaced?.[part.toolCallId] === true
    const acceptedNote = replaced
      ? 'User accepted; the active view was SWITCHED — it replaced the previous view (a collection shows one active view at a time). Do not claim both views now coexist. Do not propose it again.'
      : 'User accepted; the view was configured. Do not propose it again.'
    return {
      ...part,
      state: 'output-available',
      output: {
        decision,
        note:
          decision === 'accepted'
            ? acceptedNote
            : 'User dismissed this proposal. Do not propose it again unless asked.',
        ...(decision === 'accepted' && replaced ? { replacedActiveView: true } : {}),
      },
    } as ToolPartLike
  }

  if (part.type === 'tool-link_records') {
    const decision = resolutions.links[part.toolCallId]
    if (!decision) return part
    return {
      ...part,
      state: 'output-available',
      output: {
        decision,
        note:
          decision === 'accepted'
            ? 'User accepted; the records were linked. Do not propose it again.'
            : 'User dismissed this proposal. Do not propose it again unless asked.',
      },
    } as ToolPartLike
  }

  return part
}
