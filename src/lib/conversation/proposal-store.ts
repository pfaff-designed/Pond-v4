/**
 * The terminal's proposal client-state, as ONE deep, pure, jest-pinnable core
 * (Deep Proposal Store, `/improve-codebase-architecture` Candidate 1).
 *
 * Why this exists: a single proposal concept was fanned across ~20 flat React
 * `useState` maps in AITerminal.tsx, so adding one proposal type meant ~7
 * scattered, un-exhaustiveness-checked edits (declare / reset / re-seed / the
 * 13-dep projection memo / accept / reject). This module concentrates that state
 * behind one reducer with a single internal switch — the ONE enumeration home
 * for per-type placement — and one `projectResolutions` that replaces the memo.
 *
 * Locality + testability, NOT behaviour change. The persisted `ConversationResolutions`
 * envelope shape stays byte-identical (legacy transcripts + `parseResolutions`
 * are load-bearing): `projectResolutions` reproduces the old memo exactly,
 * including the additive-only maps carried ONLY when non-empty and the lifecycle
 * gated by `isLifecycleActive`.
 *
 * Server-safe: pure data + a pure reducer, no React and no SDK — pinned with
 * jest literals like its `resolutions.ts` / `parts.ts` / `lifecycle.ts` neighbours.
 * The thin `useReducer` hook + the React↔stream stamping adapter stay in the
 * terminal; they just dispatch into here.
 */
import type { ProposalDecision, ProposalTarget, ConversationResolutions } from './resolutions'
import type { QuestionResolution, QuestionResolutions } from './parts'
import type { PageProposal, PageProposals } from './page-proposals'
import { idleLifecycle, isLifecycleActive, type LifecycleState } from './lifecycle'

/** A card's settled decision, or `'pending'` — the reducer stores this; only
 *  settled decisions project (mirrors the terminal's old `settled()` filter and
 *  the ticket-19 contract that 'pending' is never persisted). Structurally the
 *  same union as the atom's `ProposalStatus`, kept here so the store imports no
 *  React. */
export type ProposalStatus = ProposalDecision | 'pending'

/**
 * The proposal families, one per logical group in the envelope (and one client
 * tool each): `changes`←propose_changes, `creates`←create_page,
 * `schemas`←define_schema, `rows`←add_row, `promotions`←promote_table,
 * `views`←configure_view, `links`←link_records. This union is the store's type
 * discriminant — the reducer's switch over it is the single place a new proposal
 * type must be handled.
 */
export type ProposalType =
  'changes' | 'creates' | 'schemas' | 'rows' | 'promotions' | 'views' | 'links'

/**
 * A frozen promote_table preview (session-scoped, never projected). Typed
 * structurally so the store stays React-free: the terminal's richer
 * `{ columns: PromotedColumn[]; ... }` is assignable to this, and the reducer
 * never inspects `columns`, so a read-side cast to `PromotedColumn[]` is safe.
 */
export interface PromotionSnapshot {
  columns: readonly unknown[]
  rowCount: number
  tableTitle?: string
}

/**
 * Per-`resolve` extras, placed by the reducer's switch on the action's `type`.
 * Every field is optional and session-scoped EXCEPT the two additive honesty
 * maps (`inertRollups`, `replaced`) which DO ride the projected envelope. Aux is
 * keyed by the proposal's `toolCallId` (`id`), never per-change.
 */
export interface ResolveAux {
  /** propose_changes: accepted-but-skipped count for the batch. ADDED to any
   *  prior count (a partial accept may skip on more than one click), mirroring
   *  the terminal's `(prev ?? 0) + result.skipped`. Projected via `skipped`. */
  skipped?: number
  /** propose_changes: the per-skip human reasons, APPENDED (session-scoped;
   *  after reload only the count survives via `skipped`). */
  skipReasons?: string[]
  /** define_schema: NAMES of proposed rollups that couldn't link to a local
   *  relation (#52 fix 1). SET only when non-empty. Projected via
   *  `schemaInertRollups` (carried only when the map is non-empty). */
  inertRollups?: string[]
  /** configure_view: whether the accepted view REPLACED the active view (#52
   *  fix 2). Projected via `viewReplaced` (carried only when non-empty). */
  replaced?: boolean
  /** promote_table: the preview frozen at accept time, so the resolved card
   *  keeps its confirmation after the live table is replaced. Session-scoped. */
  snapshot?: PromotionSnapshot
  /** propose_changes (#98): the request-changes note sent to the proposer. SET
   *  when non-blank. Projected via `changeNotes` (carried only when non-empty). */
  note?: string
}

/**
 * The whole proposal client-state. Its persisted-derived fields MIRROR the
 * `ConversationResolutions` logical groups so projection stays a near-identity;
 * the rest is session-scoped aux the envelope does NOT persist (destination
 * pickers, skip reasons, link errors, promotion snapshots, ref-id memory) —
 * these must never leak into the projected envelope. (Same-batch ref-id memory
 * stays a terminal `useRef` — it is mutated in place mid-write across accept
 * clicks and is never rendered/projected/reseeded, so it does not belong here.)
 */
export interface ProposalState {
  // ── persisted-derived (projected) ──────────────────────────────────────────
  /** propose_changes decisions, keyed `${toolCallId}:${changeIndex}` (partial accept). */
  changes: Record<string, ProposalStatus>
  /** create_page decisions, by toolCallId. */
  creates: Record<string, ProposalStatus>
  /** define_schema decisions, by toolCallId. */
  schemas: Record<string, ProposalStatus>
  /** add_row decisions, by toolCallId. */
  rows: Record<string, ProposalStatus>
  /** promote_table decisions, by toolCallId. */
  promotions: Record<string, ProposalStatus>
  /** configure_view decisions, by toolCallId. */
  views: Record<string, ProposalStatus>
  /** link_records decisions, by toolCallId. */
  links: Record<string, ProposalStatus>
  /** Accepted-but-skipped counts per propose_changes batch, by toolCallId. */
  skipped: Record<string, number>
  /** Proposal-time target page per propose_changes batch, by toolCallId (write-once). */
  targets: Record<string, ProposalTarget>
  /** Answered branch-pause question cards, by toolCallId. */
  questions: QuestionResolutions
  /** Per accepted define_schema, the rollup names that couldn't be linked (#52). */
  schemaInertRollups: Record<string, string[]>
  /** Per accepted configure_view, whether it replaced the active view (#52). */
  viewReplaced: Record<string, boolean>
  /** The project lifecycle phase (ticket-39); projected only when active. */
  lifecycle: LifecycleState
  /** make-this-a-page proposals (#97), by proposal id — every status, pending
   *  included, so a card left open comes back after a reload (6d closing).
   *  Projected only when non-empty. */
  pageProposals: PageProposals
  /** #98 — request-changes note per propose_changes batch, by toolCallId.
   *  Projected only when non-empty. */
  changeNotes: Record<string, string>
  /** #98 — revised batch → the batch it answers, by toolCallId (write-once).
   *  Projected only when non-empty. */
  revisions: Record<string, string>

  // ── session-scoped aux (NEVER projected) ────────────────────────────────────
  /** Failed make-page reasons, by proposal id (e.g. the parent was deleted). */
  pageProposalErrors: Record<string, string>
  /** Per-batch human skip reasons for the current session's cards. */
  skipReasons: Record<string, string[]>
  /** Failed link_records accept reasons, by toolCallId. */
  linkErrors: Record<string, string>
  /** Frozen promote_table previews, by toolCallId. */
  promotionSnapshot: Record<string, PromotionSnapshot>
  /** create_page chosen parent, by toolCallId (absent ⇒ AI-proposed parent). */
  createParent: Record<string, string>
  /** define_schema chosen target page, by toolCallId. */
  schemaTarget: Record<string, string>
  /** add_row chosen target collection, by toolCallId. */
  rowTarget: Record<string, string>
  /** configure_view chosen target collection, by toolCallId. */
  viewTarget: Record<string, string>
  /** link_records chosen source collection, by toolCallId. */
  linkTarget: Record<string, string>
  /** promote_table chosen target page, by toolCallId. */
  promotionTarget: Record<string, string>
}

/**
 * The action surface (grilling decision A): one polymorphic `resolve` carrying
 * a `type` discriminant + per-type `aux`, plus distinct verbs for the other
 * writes. The reducer's ONE switch on `resolve`'s `type` is the single home for
 * per-type aux placement.
 */
export type ProposalAction =
  | {
      kind: 'resolve'
      type: ProposalType
      id: string
      /** propose_changes only — the per-change key `${id}:${index}`. When
       *  omitted for `changes`, no decision is written (used to carry batch-level
       *  aux — skip counts, refIds — after the async write). Ignored for other
       *  types (their decision is keyed by `id`). */
      index?: number
      decision: ProposalDecision
      aux?: ResolveAux
    }
  /** Undo an optimistic decision after its async write failed — deletes the
   *  decision key so the card re-arms (mirrors the accept handlers' catch-block
   *  `delete next[id]`). `index` targets one propose_changes key. */
  | { kind: 'revert'; type: ProposalType; id: string; index?: number }
  /** Set (or, with `error` omitted, clear) a link_records failed-accept reason —
   *  the card re-arms with the message. Session-scoped; never projected. */
  | { kind: 'noteLinkError'; id: string; error?: string }
  | { kind: 'answerQuestion'; id: string; answer: string; via: QuestionResolution['via'] }
  | { kind: 'stampTarget'; id: string; target: ProposalTarget }
  /** #98 — mark a freshly streamed propose_changes batch as the revision of the
   *  batch the user sent a request-changes note on. Write-once. */
  | { kind: 'noteRevision'; id: string; revisedFrom: string }
  | { kind: 'pickDestination'; type: ProposalType; id: string; destinationId: string }
  | { kind: 'advanceLifecycle'; lifecycle: LifecycleState }
  /** #97 — open a `new page — proposed` card for an answer. Idempotent per
   *  answer: a second proposal for a message that already has a PENDING one is
   *  ignored (a double press opens one card, never two). */
  | { kind: 'proposePage'; proposal: PageProposal }
  /** Edit the card's name / under / kind in place (pending cards only). */
  | {
      kind: 'editPageProposal'
      id: string
      patch: Partial<Pick<PageProposal, 'name' | 'parentId' | 'kind'>>
    }
  /** make page → accepted (with the made page's id); cancel → rejected. Only a
   *  pending card settles — a second make page on a settled card is a no-op
   *  (G9: a double ↵ must not make two pages). Clears any error. */
  | { kind: 'settlePageProposal'; id: string; status: 'accepted' | 'rejected'; pageId?: string }
  /** The write landed: stamp the made page's id on an accepted card. */
  | { kind: 'notePageMade'; id: string; pageId: string }
  /** The write failed: the card returns to pending, carrying the reason. */
  | { kind: 'revertPageProposal'; id: string; error?: string }
  | { kind: 'reseed'; resolutions: ConversationResolutions }
  | { kind: 'reset' }

/** The empty state: every map cleared, lifecycle idle. Also what `reset`
 *  returns (mirrors the terminal's `resetResolutions`). */
export function initialProposalState(): ProposalState {
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
    schemaInertRollups: {},
    viewReplaced: {},
    lifecycle: idleLifecycle(),
    pageProposals: {},
    changeNotes: {},
    revisions: {},
    pageProposalErrors: {},
    skipReasons: {},
    linkErrors: {},
    promotionSnapshot: {},
    createParent: {},
    schemaTarget: {},
    rowTarget: {},
    viewTarget: {},
    linkTarget: {},
    promotionTarget: {},
  }
}

/** The per-type decision map on the state. */
function decisionMap(state: ProposalState, type: ProposalType): Record<string, ProposalStatus> {
  switch (type) {
    case 'changes':
      return state.changes
    case 'creates':
      return state.creates
    case 'schemas':
      return state.schemas
    case 'rows':
      return state.rows
    case 'promotions':
      return state.promotions
    case 'views':
      return state.views
    case 'links':
      return state.links
  }
}

/** The pure reducer. Returns a new state; never mutates its input. */
export function proposalReducer(state: ProposalState, action: ProposalAction): ProposalState {
  switch (action.kind) {
    case 'resolve': {
      const { type, id, decision, aux } = action
      const next: ProposalState = { ...state }
      // Decision. For `changes` the key is per-change (`${id}:${index}`); an
      // omitted index writes no decision (a batch-level aux-only dispatch). Every
      // other type keys by `id`.
      if (type === 'changes') {
        if (action.index !== undefined) {
          next.changes = { ...state.changes, [`${id}:${action.index}`]: decision }
        }
      } else {
        const key: Exclude<ProposalType, 'changes'> = type
        next[key] = { ...decisionMap(state, key), [id]: decision }
      }
      // Per-type aux placement — the single enumeration home. Each branch keys
      // its aux by the proposal's `id` (toolCallId).
      if (aux) {
        if (type === 'changes') {
          if (aux.skipped !== undefined) {
            next.skipped = { ...state.skipped, [id]: (state.skipped[id] ?? 0) + aux.skipped }
          }
          if (aux.skipReasons) {
            next.skipReasons = {
              ...state.skipReasons,
              [id]: [...(state.skipReasons[id] ?? []), ...aux.skipReasons],
            }
          }
          // #98 — the note rides the envelope so the card shows it after reload
          // and the model reads what to revise. Blank notes are not notes.
          if (aux.note !== undefined && aux.note.trim().length > 0) {
            next.changeNotes = { ...state.changeNotes, [id]: aux.note.trim() }
          }
        } else if (type === 'schemas') {
          // Carried only when non-empty (an absent map is the old flat note, so a
          // legacy transcript stays byte-clean).
          if (aux.inertRollups && aux.inertRollups.length > 0) {
            next.schemaInertRollups = { ...state.schemaInertRollups, [id]: aux.inertRollups }
          }
        } else if (type === 'views') {
          if (aux.replaced !== undefined) {
            next.viewReplaced = { ...state.viewReplaced, [id]: aux.replaced }
          }
        } else if (type === 'promotions') {
          if (aux.snapshot) {
            next.promotionSnapshot = { ...state.promotionSnapshot, [id]: aux.snapshot }
          }
        }
      }
      return next
    }

    case 'revert': {
      const { type, id } = action
      if (type === 'changes') {
        if (action.index === undefined) return state
        const key = `${id}:${action.index}`
        if (!(key in state.changes)) return state
        const changes = { ...state.changes }
        delete changes[key]
        return { ...state, changes }
      }
      if (!(id in decisionMap(state, type))) return state
      const nextMap = { ...decisionMap(state, type) }
      delete nextMap[id]
      return { ...state, [type]: nextMap }
    }

    case 'noteLinkError': {
      if (action.error === undefined) {
        if (!(action.id in state.linkErrors)) return state
        const linkErrors = { ...state.linkErrors }
        delete linkErrors[action.id]
        return { ...state, linkErrors }
      }
      return { ...state, linkErrors: { ...state.linkErrors, [action.id]: action.error } }
    }

    case 'answerQuestion': {
      return {
        ...state,
        questions: {
          ...state.questions,
          [action.id]: { answer: action.answer, via: action.via },
        },
      }
    }

    case 'stampTarget': {
      // Write-once (ticket-30 must-fix 1): a later stamp must NOT overwrite the
      // page recorded when the part first streamed in — including a `missing`
      // stamp, which makes Accept skip and must never fall back to the open page.
      if (state.targets[action.id]) return state
      return { ...state, targets: { ...state.targets, [action.id]: action.target } }
    }

    case 'noteRevision': {
      // Write-once, like the target stamp: the first batch to arrive after the
      // note is the revision; a later stamp must not relabel it.
      if (state.revisions[action.id]) return state
      return { ...state, revisions: { ...state.revisions, [action.id]: action.revisedFrom } }
    }

    case 'pickDestination': {
      const { type, id, destinationId } = action
      switch (type) {
        case 'creates':
          return { ...state, createParent: { ...state.createParent, [id]: destinationId } }
        case 'schemas':
          return { ...state, schemaTarget: { ...state.schemaTarget, [id]: destinationId } }
        case 'rows':
          return { ...state, rowTarget: { ...state.rowTarget, [id]: destinationId } }
        case 'views':
          return { ...state, viewTarget: { ...state.viewTarget, [id]: destinationId } }
        case 'links':
          return { ...state, linkTarget: { ...state.linkTarget, [id]: destinationId } }
        case 'promotions':
          return { ...state, promotionTarget: { ...state.promotionTarget, [id]: destinationId } }
        case 'changes':
          // propose_changes has no destination picker — its target is stamped at
          // stream time (stampTarget), not chosen. No-op.
          return state
      }
    }

    case 'advanceLifecycle': {
      return { ...state, lifecycle: action.lifecycle }
    }

    case 'proposePage': {
      const { proposal } = action
      const duplicate = Object.values(state.pageProposals).some(
        (p) => p.messageId === proposal.messageId && p.status === 'proposed'
      )
      if (duplicate || state.pageProposals[proposal.id]) return state
      return {
        ...state,
        pageProposals: {
          ...state.pageProposals,
          [proposal.id]: { ...proposal, status: 'proposed' },
        },
      }
    }

    case 'editPageProposal': {
      const current = state.pageProposals[action.id]
      if (!current || current.status !== 'proposed') return state
      return {
        ...state,
        pageProposals: {
          ...state.pageProposals,
          [action.id]: { ...current, ...action.patch },
        },
      }
    }

    case 'settlePageProposal': {
      const current = state.pageProposals[action.id]
      if (!current || current.status !== 'proposed') return state
      const settled: PageProposal = {
        ...current,
        status: action.status,
        ...(action.pageId ? { pageId: action.pageId } : {}),
      }
      const pageProposalErrors = { ...state.pageProposalErrors }
      delete pageProposalErrors[action.id]
      return {
        ...state,
        pageProposals: { ...state.pageProposals, [action.id]: settled },
        pageProposalErrors,
      }
    }

    case 'notePageMade': {
      const current = state.pageProposals[action.id]
      if (!current || current.status !== 'accepted') return state
      return {
        ...state,
        pageProposals: {
          ...state.pageProposals,
          [action.id]: { ...current, pageId: action.pageId },
        },
      }
    }

    case 'revertPageProposal': {
      const current = state.pageProposals[action.id]
      if (!current) return state
      const { pageId: _drop, ...rest } = current
      void _drop
      const pageProposalErrors = { ...state.pageProposalErrors }
      if (action.error) pageProposalErrors[action.id] = action.error
      else delete pageProposalErrors[action.id]
      return {
        ...state,
        pageProposals: { ...state.pageProposals, [action.id]: { ...rest, status: 'proposed' } },
        pageProposalErrors,
      }
    }

    case 'reseed': {
      // Restore the persisted-derived fields from a loaded envelope (mirrors the
      // terminal's mount re-seed, AITerminal.tsx 840–855). Session-scoped aux is
      // NOT restored — it never persisted, and a fresh mount starts it empty.
      // Lifecycle is only overwritten when the envelope carries one (an absent
      // lifecycle leaves the current phase, as the terminal's guarded set does).
      const r = action.resolutions
      return {
        ...state,
        changes: r.changes ?? {},
        creates: r.creates ?? {},
        schemas: r.schemas ?? {},
        rows: r.rows ?? {},
        promotions: r.promotions ?? {},
        views: r.views ?? {},
        links: r.links ?? {},
        skipped: r.skipped ?? {},
        targets: r.targets ?? {},
        questions: r.questions ?? {},
        schemaInertRollups: r.schemaInertRollups ?? {},
        viewReplaced: r.viewReplaced ?? {},
        lifecycle: r.lifecycle ?? state.lifecycle,
        pageProposals: r.pageProposals ?? {},
        changeNotes: r.changeNotes ?? {},
        revisions: r.revisions ?? {},
      }
    }

    case 'reset':
      return initialProposalState()
  }
}

/**
 * Project the state to the persisted/sent `ConversationResolutions` envelope —
 * the byte-for-byte replacement for the terminal's 13-dep projection memo
 * (AITerminal.tsx 474–513). MUST stay identical:
 *   - only SETTLED decisions project ('pending' is never persisted, ticket-19);
 *   - the additive honesty maps ride ONLY when non-empty (an absent map is the
 *     old flat note, so a legacy transcript stays byte-clean, #52);
 *   - the lifecycle rides ONLY when active (idle stays off ordinary-chat rows);
 *   - session-scoped aux (skipReasons, linkErrors, promotionSnapshot, pickers,
 *     proposalRefIds) NEVER appears here.
 * Key insertion order matches the old memo so the on-disk envelope is byte-stable.
 */
export function projectResolutions(state: ProposalState): ConversationResolutions {
  const settled = (map: Record<string, ProposalStatus>): Record<string, ProposalDecision> =>
    Object.fromEntries(Object.entries(map).filter(([, v]) => v !== 'pending')) as Record<
      string,
      ProposalDecision
    >
  return {
    changes: settled(state.changes),
    creates: settled(state.creates),
    schemas: settled(state.schemas),
    rows: settled(state.rows),
    promotions: settled(state.promotions),
    views: settled(state.views),
    links: settled(state.links),
    skipped: state.skipped,
    targets: state.targets,
    questions: state.questions,
    ...(Object.keys(state.schemaInertRollups).length > 0
      ? { schemaInertRollups: state.schemaInertRollups }
      : {}),
    ...(Object.keys(state.viewReplaced).length > 0 ? { viewReplaced: state.viewReplaced } : {}),
    ...(isLifecycleActive(state.lifecycle) ? { lifecycle: state.lifecycle } : {}),
    // #97 — every page proposal, PENDING INCLUDED (6d closing), only when any.
    ...(Object.keys(state.pageProposals).length > 0 ? { pageProposals: state.pageProposals } : {}),
    // #98 — notes + revision links, only when any.
    ...(Object.keys(state.changeNotes).length > 0 ? { changeNotes: state.changeNotes } : {}),
    ...(Object.keys(state.revisions).length > 0 ? { revisions: state.revisions } : {}),
  }
}
