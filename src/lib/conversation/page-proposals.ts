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
}

/** Keyed by proposal id. */
export type PageProposals = Record<string, PageProposal>

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
    }
  }
  return out
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

/**
 * The pages the answer mentioned — the person's pages whose title appears in the
 * prose (case-insensitive, whole words, titles of three characters or more so
 * "a" never matches). Order of first appearance, one entry per page. This is
 * the "mentioned" list Pond adds to the made page (6a frame 5) — derived from
 * the words, never invented.
 */
export function mentionedPages(prose: string, pages: MentionablePage[]): MentionablePage[] {
  const text = prose.toLowerCase()
  const hits: { page: MentionablePage; at: number }[] = []
  const seenTitles = new Set<string>()
  for (const page of pages) {
    const title = page.title.trim()
    if (title.length < 3) continue
    const key = title.toLowerCase()
    if (seenTitles.has(key)) continue
    const at = wholeWordIndex(text, key)
    if (at === -1) continue
    seenTitles.add(key)
    hits.push({ page, at })
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.page)
}

function wholeWordIndex(text: string, needle: string): number {
  let from = 0
  while (from <= text.length) {
    const at = text.indexOf(needle, from)
    if (at === -1) return -1
    const before = at === 0 ? ' ' : text[at - 1]
    const after = at + needle.length >= text.length ? ' ' : text[at + needle.length]
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return at
    from = at + 1
  }
  return -1
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
export function proposalBlocks(prose: string, mintId: () => string): Block[] {
  return [{ id: mintId(), type: 'text', content: prose }]
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
 * them — no exceptions). The page the question was asked from always leads
 * (6a frame 1: "the page you are on goes with the question"), then each
 * `read_page` call in the answer, resolved to its title; one chip per page.
 * With no context and no reads the row still renders — the pond's root.
 */
export function readChips(opts: {
  contextLabel: string
  parts: ReadPartLike[]
  resolvePageName: (id: string) => string | undefined
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
  push(opts.contextLabel)
  for (const part of opts.parts) {
    if (part.type !== 'tool-read_page' || part.state === 'input-streaming') continue
    const id = part.input?.pageId
    if (!id) continue
    push(opts.resolvePageName(id) ?? id)
  }
  return out
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
