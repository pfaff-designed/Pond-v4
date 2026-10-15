/**
 * make-this-a-page proposals (issue #97, `Pond 06.01` board 6a frames 3–5).
 *
 * An answer lives in the composer thread and never on the page. The ONLY way it
 * reaches a page is the person pressing **make this a page**, which opens a
 * `new page — proposed` card (name · under · kind, each editable; make page /
 * change place / cancel). A page exists only after make page (AUDIT § Decided
 * C2; W4: no keep-as-note and no keep-in-thread — a page is the only destination).
 *
 * This module is the PURE contract: the proposal record that rides the
 * `{messages, resolutions}` transcript envelope (so a proposal left open
 * survives a reload — 6d closing: "pending in the thread and in the proposed
 * view; nothing is made or discarded"), the tolerant parse, the name Pond
 * proposes, the "mentioned" list, and the blocks the made page is born with.
 * No React, no Supabase — jest-pinnable like its `parts.ts` / `resolutions.ts`
 * neighbours.
 *
 * Unlike a tool card's decision (where 'pending' is never persisted), a page
 * proposal's `proposed` status IS persisted: the card is the person's own
 * pending decision, not a model re-proposal, so a reload must bring it back.
 */

import type { UIMessage } from 'ai'
import type { Block } from '@/lib/documents/types'

// ── The record ───────────────────────────────────────────────────────────────

/** Mirrors the change-log statuses this card can land on (W6): born `proposed`,
 *  make page → `accepted`, cancel → `rejected`. */
export type PageProposalStatus = 'proposed' | 'accepted' | 'rejected'

export interface PageProposal {
  /** Minted client-side; doubles as the change-log record's `tool_call_id`, so
   *  the record behind the card is found the same way a tool card's is. */
  id: string
  /** The assistant message (the answer) this proposal was made from. */
  messageId: string
  /** The question the answer replied to, and when it was asked (ISO, if known). */
  question: string
  askedAt: string | null
  /** The answer, verbatim — this is what moves across word for word. */
  prose: string
  /** The read chips under the answer (S8) — provenance for the record's `read`. */
  read: string[]
  /** The three editable fields. `parentId` null = top level (the pond root). */
  name: string
  parentId: string | null
  kind: string
  status: PageProposalStatus
  /** Set once the page is made. */
  pageId?: string
  /** The change-log record's own id (not {@link id}, its toolCallId) — set once
   *  `acceptCreatePageRecord` resolves, so the undo chip can tell whether ITS
   *  step, not just any step, is the one on top of the session's undo stack. */
  recordId?: string
  /** What Pond's placement model found this answer mentioned — `ref` is a
   *  candidate id, or null until it resolves to one. Absent on a proposal
   *  made before this field existed. */
  mentioned?: PageProposalMention[]
  /** The model's own verbatim chat framing (KAN-308) — the lead-in addressed
   *  to the person and the sign-off/offer, each an exact substring of
   *  `prose` when present. `''` means the model looked and found none to
   *  name — a real answer, not a gap. Absent (`undefined`) means no
   *  placement reply has landed yet, or the proposal predates this field;
   *  only then does {@link stripChatFraming}'s deterministic fallback run. */
  leadIn?: string
  signOff?: string
}

export interface PageProposalMention {
  title: string
  ref: string | null
  note: string
}

/** Keyed by proposal id. */
export type PageProposals = Record<string, PageProposal>

/** The fields a pending card can be patched on in place — the reducer's
 *  `editPageProposal` action, the propose-page route's fill, and the
 *  background placement patch all share this one shape rather than each
 *  pinning their own `Pick<PageProposal, …>` copy of the same field list. */
export type PageProposalPatch = Partial<
  Pick<PageProposal, 'name' | 'parentId' | 'kind' | 'mentioned' | 'leadIn' | 'signOff'>
>

/** Every page has a kind — an editable label with no template tie (W5). The
 *  card proposes the plainest one; the person edits it in place. */
export const DEFAULT_PAGE_KIND = 'page'

/** The longest name a proposed page may carry (6a gap: "a very long proposed
 *  name"). Longer input is cut on a word boundary, never written raw. */
export const PAGE_NAME_MAX = 120
/** The length Pond aims for when it proposes a name from the question. */
const PROPOSED_NAME_TARGET = 60

const STATUSES: readonly PageProposalStatus[] = ['proposed', 'accepted', 'rejected']

/**
 * Tolerant parse of persisted page proposals — never throws, drops anything
 * malformed (matches `parseResolutions`'s posture so a bad row degrades to "no
 * proposal" rather than a crash on load).
 */
export function parsePageProposals(value: unknown): PageProposals {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: PageProposals = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || r.id !== key) continue
    if (typeof r.messageId !== 'string' || !r.messageId) continue
    if (typeof r.prose !== 'string') continue
    if (typeof r.name !== 'string') continue
    if (!(STATUSES as readonly unknown[]).includes(r.status)) continue
    out[key] = {
      id: r.id,
      messageId: r.messageId,
      question: typeof r.question === 'string' ? r.question : '',
      askedAt: typeof r.askedAt === 'string' ? r.askedAt : null,
      prose: r.prose,
      read: Array.isArray(r.read) ? r.read.filter((x): x is string => typeof x === 'string') : [],
      name: r.name,
      parentId: typeof r.parentId === 'string' && r.parentId ? r.parentId : null,
      kind: typeof r.kind === 'string' && r.kind ? r.kind : DEFAULT_PAGE_KIND,
      status: r.status as PageProposalStatus,
      ...(typeof r.pageId === 'string' && r.pageId ? { pageId: r.pageId } : {}),
      ...(typeof r.recordId === 'string' && r.recordId ? { recordId: r.recordId } : {}),
      mentioned: parseMentioned(r.mentioned),
      ...(typeof r.leadIn === 'string' ? { leadIn: r.leadIn } : {}),
      ...(typeof r.signOff === 'string' ? { signOff: r.signOff } : {}),
    }
  }
  return out
}

/** Tolerant-parse a proposal's `mentioned` list — drops any entry missing
 *  `title`/`note`, coerces an absent or malformed `ref` to null, coerces an
 *  absent or malformed list itself to `[]`. Never throws. */
function parseMentioned(value: unknown): PageProposalMention[] {
  if (!Array.isArray(value)) return []
  const out: PageProposalMention[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    if (typeof r.title !== 'string' || !r.title) continue
    if (typeof r.note !== 'string') continue
    out.push({
      title: r.title,
      ref: typeof r.ref === 'string' && r.ref ? r.ref : null,
      note: r.note,
    })
  }
  return out
}

/** The propose-page route's response shape (KAN-172) — the fallback
 *  (`{ name: null, parentId: null, mentioned: [] }`) IS a valid response
 *  (AUDIT G1), not an error case. Shared by the route (its own validated
 *  output) and `AITerminal.tsx` (tolerant-parsing that output back out of a
 *  `fetch` response), so the two never drift on what counts as well-formed. */
export interface PlacementResult {
  name: string | null
  parentId: string | null
  mentioned: PageProposalMention[]
  /** The model's own verbatim chat framing (KAN-308) — see {@link PageProposal.leadIn}. */
  leadIn?: string
  signOff?: string
}

/** Tolerant-parse a propose-page route response — same posture as
 *  `parsePageProposals`: a shape slip in `name`/`parentId`/`mentioned` returns
 *  null (treated as "no better answer arrived"), it never throws. `leadIn`/
 *  `signOff` are looser still — a malformed one just drops that field rather
 *  than failing the whole response, since neither is load-bearing for
 *  placement. Reuses {@link parseMentioned} so a mention with no title, or an
 *  empty-string `ref`, is dropped/nulled the same way here as it is on a
 *  persisted proposal. */
export function parsePlacementResponse(value: unknown): PlacementResult | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v.name !== null && typeof v.name !== 'string') return null
  if (v.parentId !== null && typeof v.parentId !== 'string') return null
  if (!Array.isArray(v.mentioned)) return null
  return {
    name: v.name as string | null,
    parentId: v.parentId as string | null,
    mentioned: parseMentioned(v.mentioned),
    ...(typeof v.leadIn === 'string' ? { leadIn: v.leadIn } : {}),
    ...(typeof v.signOff === 'string' ? { signOff: v.signOff } : {}),
  }
}

// ── Naming ───────────────────────────────────────────────────────────────────

/** Collapse whitespace and cut to `max` on a word boundary (no ellipsis — a
 *  title is a title, not a preview). */
function cutOnWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const head = clean.slice(0, max)
  const space = head.lastIndexOf(' ')
  return (space > max / 2 ? head.slice(0, space) : head).trim()
}

/** Normalise a typed name: whitespace collapsed, capped at {@link PAGE_NAME_MAX}. */
export function clampPageName(name: string): string {
  return cutOnWord(name, PAGE_NAME_MAX)
}

/**
 * The name Pond proposes (6a frame 4: "Pond names the page"). Deterministic —
 * the question, minus its trailing question mark and any "@" mention sigils,
 * cut to a title's length; when there is no question, the answer's first
 * sentence; when there is nothing at all, "untitled".
 */
export function derivePageName(question: string, prose: string): string {
  const fromQuestion = question
    .replace(/@/g, '')
    .replace(/[?!.…]+\s*$/, '')
    .trim()
  if (fromQuestion) return cutOnWord(fromQuestion, PROPOSED_NAME_TARGET)
  const firstSentence = prose
    .replace(/[#*_>`]/g, '')
    .split(/(?<=[.!?])\s+/)[0]
    ?.replace(/[?!.…]+\s*$/, '')
    .trim()
  if (firstSentence) return cutOnWord(firstSentence, PROPOSED_NAME_TARGET)
  return 'untitled'
}

// ── Mentioned ────────────────────────────────────────────────────────────────

export interface MentionablePage {
  id: string
  title: string
}

// ── Chat framing ─────────────────────────────────────────────────────────────

/** A leading conversational line the model sometimes opens with, addressed to
 *  the person rather than part of the content ("Sure — here's…:", "Here's…:",
 *  "Good question."). Matched only at the very start of the prose. The
 *  colon-led shapes only match when the colon ends the line (`\n` or
 *  end-of-string) — a colon mid-sentence ("Here's the catch: the permit
 *  lapsed.") is content, not a framing line that introduces what follows on
 *  its own line, so it is left alone. */
const FALLBACK_LEAD_IN =
  /^(?:(?:Sure[\s,—–-]*here['’]s[^:\n]*|Here['’]s[^:\n]*):(?=\n|$)|Good question\.)\s*/i

/**
 * Drops the answer's chat framing — the lead-in addressed to the person at the
 * start, the sign-off/offer at the end — from `prose` so a made page holds
 * the content, not the reply (KAN-308). `proposal.prose` itself is never
 * mutated by this; it rides the record verbatim (convivial stance). Only the
 * text handed to {@link proposalBlocks} at make-page time goes through this.
 *
 * `leadIn`/`signOff`, when given, are dropped ONLY on an exact prefix/suffix
 * match, and only when the match ends at a word boundary (whitespace,
 * punctuation, or the end of the string) — so a `leadIn` of "Sure" never eats
 * the front of "Surely…". `leadIn === ''` means the model looked and found no
 * lead-in to name: that is a real answer, not a gap, so it is kept distinct
 * from `leadIn === undefined` (no placement reply yet, or one that predates
 * this field) and skips the fallback rather than running it. Only when
 * `leadIn` is `undefined` does {@link FALLBACK_LEAD_IN} cover the common
 * shapes instead; there is no such fallback for `signOff` (the spec scopes
 * the deterministic fallback to the lead-in only — a sign-off can trail a
 * list or a code block in ways no narrow regex can safely match).
 */
export function stripChatFraming(prose: string, leadIn?: string, signOff?: string): string {
  const start =
    leadIn === undefined ? fallbackLeadInLength(prose) : leadIn === '' ? 0 : exactPrefixLength(prose, leadIn)
  const end =
    signOff && prose.endsWith(signOff) && prose.length - signOff.length >= start
      ? prose.length - signOff.length
      : prose.length
  if (start === 0 && end === prose.length) return prose
  return prose.slice(start, end).trim()
}

function fallbackLeadInLength(prose: string): number {
  return prose.match(FALLBACK_LEAD_IN)?.[0].length ?? 0
}

/** `prose` starts with `leadIn` AND, if `leadIn` itself ends mid-word (its own
 *  last character is a letter or digit), the character right after it is
 *  not one too — so "Sure" cannot strip the front of "Surely…", but a
 *  `leadIn` that already ends in punctuation or whitespace (the normal
 *  case) needs no such check: it already lands on its own boundary. */
function exactPrefixLength(prose: string, leadIn: string): number {
  if (!prose.startsWith(leadIn)) return 0
  const lastOfLeadIn = leadIn[leadIn.length - 1]
  const leadInEndsMidWord = lastOfLeadIn !== undefined && /[\p{L}\p{N}]/u.test(lastOfLeadIn)
  if (!leadInEndsMidWord) return leadIn.length
  const after = prose[leadIn.length]
  return after === undefined || !/[\p{L}\p{N}]/u.test(after) ? leadIn.length : 0
}

// ── The made page's blocks ───────────────────────────────────────────────────

/**
 * What the new page is born with (6a frame 5): the prose, word for word, as one
 * text block. Nothing else — the "mentioned" list is NOT prose. On the board it is
 * a card of its own (paper, an eyebrow, a row per page with a dot, a title and a
 * note), so it rides in `props.mentioned` and renders as `MentionedCard`; see
 * lib/pages/mentioned.ts. Writing it as a second text block set the eyebrow as
 * 17.5px serif body copy and flattened the rows to bullets.
 */
export function proposalBlocks(
  prose: string,
  mintId: () => string,
  sentAt: string | null = null
): Block[] {
  return [{ id: mintId(), type: 'text', content: prose, ...(sentAt ? { pondStampAt: sentAt } : {}) }]
}

// ── Read chips (S8) ──────────────────────────────────────────────────────────

/** The minimal structural shape of a message part the read-chip walk inspects. */
export interface ReadPartLike {
  type: string
  state?: string
  input?: { pageId?: string }
}

/**
 * What Pond read before answering, as chip labels (S8: every answer shows
 * them — no exceptions, and none it didn't). The page the question was asked
 * from leads (6a frame 1: "the page you are on goes with the question") —
 * UNLESS that turn withheld it (KAN-99's current-page ×, `openPageContext:
 * false`), in which case it never led because its content never reached the
 * model. Next, each whole-page `@`-reference (KAN-99) the turn fenced for
 * the model, by id (never title — KAN-172: a title can collide). Then each
 * `read_page` call in the answer, resolved to its title; one chip per page.
 * With no context and no reads the row still renders — the pond's root.
 */
export function readChips(opts: {
  contextLabel: string
  parts: ReadPartLike[]
  resolvePageName: (id: string) => string | undefined
  openPageContext?: boolean
  wholePageRefIds?: string[]
}): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (label: string | undefined) => {
    const l = label?.trim()
    if (!l) return
    const key = l.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(l)
  }
  if (opts.openPageContext ?? true) push(opts.contextLabel)
  for (const id of opts.wholePageRefIds ?? []) {
    push(opts.resolvePageName(id) ?? id)
  }
  for (const part of opts.parts) {
    if (part.type !== 'tool-read_page' || part.state === 'input-streaming') continue
    const id = part.input?.pageId
    if (!id) continue
    push(opts.resolvePageName(id) ?? id)
  }
  return out
}

/**
 * The page ids `readChips()` resolves to titles, kept raw instead (KAN-172):
 * the placement route matches `read` by id, never by title, since a title
 * chip can collide with an unrelated page of the same name (two pages both
 * titled "Untitled" is the case that broke this). Walks the same
 * `tool-read_page` parts {@link readChips} walks.
 */
export function readPageIds(parts: ReadPartLike[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    if (part.type !== 'tool-read_page' || part.state === 'input-streaming') continue
    const id = part.input?.pageId
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/**
 * The read chips STAMPED onto an assistant message's metadata, or null when that
 * message carries none.
 *
 * S8 provenance has to be a fact about the answer, not about where the person
 * happens to be standing now: computing the chips from live navigation state
 * makes an old answer claim to have read whatever page is open (PROJECT_RULES:
 * "every value that came from somewhere else carries a provenance chip"). So the
 * terminal writes {@link readChips}' result onto the message the moment the
 * answer lands — next to `sentAt`, which already rides there — and renders from
 * the stamp ever after. It persists with the transcript, so a reload keeps it.
 */
export function readStamp(metadata: unknown): string[] | null {
  if (typeof metadata !== 'object' || metadata === null) return null
  const read = (metadata as { read?: unknown }).read
  if (!Array.isArray(read)) return null
  return read.filter((x): x is string => typeof x === 'string')
}

/** Write the chips onto a message's metadata, leaving every other field alone. */
export function withReadStamp<T extends { metadata?: unknown }>(message: T, read: string[]): T {
  const base =
    typeof message.metadata === 'object' && message.metadata !== null ? message.metadata : {}
  return { ...message, metadata: { ...base, read } }
}

/** The nearest user message above `index` — the question a `turnReadContext` belongs to. */
export function precedingUserMessage<T extends { role: string }>(
  messages: readonly T[],
  index: number
): T | undefined {
  for (let i = index - 1; i >= 0; i--) if (messages[i].role === 'user') return messages[i]
  return undefined
}

/**
 * What actually reached the model for a turn (KAN-99: "sources are always
 * shown" — and never a source that wasn't one), read off the question's own
 * metadata, stamped by `sendText` at send time. Never recomputed from live
 * reference/dismissal state: that can move before a streaming answer's read
 * chips render or its stamp effect runs. A question sent before this fix (or
 * re-seeded from a saved transcript) carries neither field — defaults to the
 * pre-KAN-99 behaviour (the open page always shown, no extra fenced pages)
 * rather than hiding a page that genuinely was in context.
 */
export function turnReadContext(message: { metadata?: unknown } | undefined): {
  openPageContext: boolean
  wholePageRefIds: string[]
} {
  const meta = message?.metadata as
    | { openPageContext?: unknown; wholePageRefPageIds?: unknown }
    | undefined
  return {
    openPageContext: typeof meta?.openPageContext === 'boolean' ? meta.openPageContext : true,
    wholePageRefIds: Array.isArray(meta?.wholePageRefPageIds)
      ? meta.wholePageRefPageIds.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

// ── Earlier answers (6a frame 3: ask again replaces in place, the old one folds) ──

/** An answer ask-again replaced — its parts verbatim, plus the stamps the
 *  message already carried (`sentAt`, the S8 read stamp). */
export interface EarlierAnswer {
  parts: UIMessage['parts']
  sentAt: string | null
  read: string[]
}

function isEarlierAnswer(value: unknown): value is EarlierAnswer {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    Array.isArray(e.parts) &&
    (e.sentAt === null || typeof e.sentAt === 'string') &&
    Array.isArray(e.read)
  )
}

/** The answers folded under the current one, oldest first — `[]` once none have
 *  been replaced yet. */
export function earlierAnswers(metadata: unknown): EarlierAnswer[] {
  if (typeof metadata !== 'object' || metadata === null) return []
  const earlier = (metadata as { earlier?: unknown }).earlier
  if (!Array.isArray(earlier)) return []
  return earlier.filter(isEarlierAnswer)
}

/** Append a replaced answer onto a message's stash, leaving every other
 *  metadata field alone. A second ask-again appends, so every earlier answer
 *  survives in the order it was replaced. */
export function withEarlierAnswer<T extends { metadata?: unknown }>(
  message: T,
  entry: EarlierAnswer
): T {
  const base =
    typeof message.metadata === 'object' && message.metadata !== null ? message.metadata : {}
  return { ...message, metadata: { ...base, earlier: [...earlierAnswers(message.metadata), entry] } }
}

// ── Labels ───────────────────────────────────────────────────────────────────

/** The made-from chip's text (6a frame 5): "tuesday 07:12 — “the question”". */
export function madeFromLabel(askedAt: string | null, question: string): string {
  const when = formatThreadMoment(askedAt)
  const q = question.trim()
  if (when && q) return `${when} — “${q}”`
  if (q) return `“${q}”`
  return when || 'the thread'
}

/** "tuesday 07:12" — weekday and time, lowercase, for a thread moment. */
export function formatThreadMoment(iso: string | null, locale = 'en-GB'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const weekday = d.toLocaleDateString(locale, { weekday: 'long' }).toLowerCase()
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${weekday} ${time}`
}

/** "07:12" — the time a line in the thread was sent. Empty when unknown. */
export function formatThreadTime(iso: string | null | undefined, locale = 'en-GB'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Ids of page proposals still awaiting the person, minus those in
 *  `excludeIds` — the proposals re-seeded from a prior session's envelope. The
 *  drawer auto-grows for cards OPENED this session only, exactly as it does for
 *  tool cards (ticket-24): a re-seeded pending card is still in the thread, it
 *  just doesn't pin the drawer open on every mount. (Keyed by proposal id, not
 *  message id — the answer may well be an old one the person just pressed on.) */
export function openPageProposalIds(
  proposals: PageProposals,
  excludeIds: ReadonlySet<string> = new Set()
): string[] {
  return Object.values(proposals)
    .filter((p) => p.status === 'proposed' && !excludeIds.has(p.id))
    .map((p) => p.id)
}
