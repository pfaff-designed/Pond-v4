import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { listPages, type PondPage } from '@/lib/pages/client'
import { AI_MODELS } from '@/lib/ai/models'
import type { PlacementResult } from '@/lib/conversation/page-proposals'

/** The propose-page request body, parsed. */
interface ProposePageBody {
  question: string
  prose: string
  openPageId: string | null
  read: string[]
  pondId: string | null
}

/** Minimal body-shape guard: null unless `body` carries string `question`/`prose`. */
function parseProposePageBody(body: unknown): ProposePageBody | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (typeof b.question !== 'string' || typeof b.prose !== 'string') return null
  return {
    question: b.question,
    prose: b.prose,
    openPageId: typeof b.openPageId === 'string' ? b.openPageId : null,
    read: Array.isArray(b.read) ? b.read.filter((id): id is string => typeof id === 'string') : [],
    pondId: typeof b.pondId === 'string' ? b.pondId : null,
  }
}

/**
 * The ids the placement model may pick from: every `read` entry that
 * resolves to a real page in this pond — by id (`AITerminal.tsx`'s
 * `proposePage` sends `read` as page ids, not the read-chip display titles,
 * since a title can collide with an unrelated page of the same name) — the
 * open page if it resolves, and every top-level page (an area) — deduped.
 * `pages` is already pond-confined (`listPages`, #312), so a page from
 * another pond is never a candidate even if `read` names its id.
 */
export function buildCandidatePageIds(
  pages: PondPage[],
  read: string[],
  openPageId: string | null
): string[] {
  const ids = new Set<string>()
  const pageIds = new Set(pages.map((p) => p.id))
  for (const entry of read) {
    if (pageIds.has(entry)) ids.add(entry)
  }
  if (openPageId && pages.some((p) => p.id === openPageId)) ids.add(openPageId)
  for (const page of pages) {
    if (page.parentId === null) ids.add(page.id)
  }
  return [...ids]
}

const FALLBACK: PlacementResult = { name: null, parentId: null, mentioned: [], leadIn: '', signOff: '' }

/** The model's raw (unvalidated) output — `parentId`/`mentioned[].ref` may name
 *  an id outside the candidate list; {@link validatePlacement} is the gate. */
const PlacementSchema = z.object({
  name: z.string(),
  parentId: z.string().nullable(),
  mentioned: z.array(
    z.object({
      title: z.string(),
      ref: z.string().nullable(),
      note: z.string(),
    })
  ),
  leadIn: z.string(),
  signOff: z.string(),
})

const MODEL_TIMEOUT_MS = 9000

/** `{id, title}` for every candidate, in the order the model should see them. */
function describeCandidates(
  pages: PondPage[],
  ids: string[]
): { id: string; title: string }[] {
  const byId = new Map(pages.map((p) => [p.id, p.title]))
  return ids.map((id) => ({ id, title: byId.get(id) ?? id }))
}

const PLACEMENT_RULE =
  'Placement rule, in order: the page the answer was about (the read page the answer leans on most, falling back to the open page if it was read), else the area the answer fits best, else top level.'

/** The prompt handed to the placement model — states the rule verbatim and
 *  lists candidates by id so the model picks an id, never free text. */
function buildPlacementPrompt(opts: {
  question: string
  prose: string
  openPageId: string | null
  read: string[]
  candidates: { id: string; title: string }[]
}): string {
  const candidateLines = opts.candidates.map((c) => `- ${c.id}: "${c.title}"`).join('\n')
  return [
    'You are Pond, naming and placing a page proposed from an answer in a conversation.',
    PLACEMENT_RULE,
    'Pick parentId from one of these candidate page ids, or null for top level. Never invent an id.',
    candidateLines || '(no candidates — use null)',
    `The open page id (if any): ${opts.openPageId ?? 'none'}`,
    `The pages read while answering (if any): ${opts.read.join(', ') || 'none'}`,
    `Question: ${opts.question}`,
    `Answer: ${opts.prose}`,
    'Name the page the way Pond would: short, specific, not the question repeated verbatim.',
    'List what the answer mentioned as `mentioned`: for each, a `title`, a `ref` that is one of the candidate ids above if it resolves to one of them (otherwise null), and a short lowercase `note`.',
    'Name the exact conversational lead-in substring the answer opens with (addressed to the person, e.g. "Sure — here\'s…") as `leadIn`, and the exact sign-off/offer substring it closes with (e.g. "Want me to…?") as `signOff` — copy them verbatim from the answer, or return "" for either if none is present.',
  ].join('\n')
}

/** Clamps the model's raw output to the candidate list: a `parentId` or
 *  `mentioned[].ref` naming an id outside `candidateIds` becomes null rather
 *  than trusting the model's free-text guess. */
export function validatePlacement(
  result: z.infer<typeof PlacementSchema>,
  candidateIds: string[]
): PlacementResult {
  const candidateSet = new Set(candidateIds)
  return {
    name: result.name,
    parentId: result.parentId !== null && candidateSet.has(result.parentId) ? result.parentId : null,
    mentioned: result.mentioned.map((m) => ({
      title: m.title,
      ref: m.ref !== null && candidateSet.has(m.ref) ? m.ref : null,
      note: m.note,
    })),
    leadIn: result.leadIn,
    signOff: result.signOff,
  }
}

/**
 * Pond's name and parent for a proposed page (KAN-172): authenticates, builds
 * the candidate list, then asks the placement model to pick a name and a
 * candidate id. A thrown, timed-out, or schema-invalid model call — and a
 * validated response otherwise — both return a 200; this route never 500s on
 * the model, so make-this-a-page never blocks (AUDIT G1). `AITerminal.tsx`'s
 * `proposePage` keeps its own fallback standing until this resolves. A model
 * failure is logged (message only, never the prompt/prose) so a silent
 * fallback is diagnosable; the model call also aborts if the incoming
 * request itself is aborted (the client gave up first).
 */
export async function POST(req: Request) {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = parseProposePageBody(rawBody)
  if (!parsed) {
    return Response.json(
      { error: 'Request body must include question and prose strings' },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const pages = await listPages(supabase, user.id, parsed.pondId)
  const candidateIds = buildCandidatePageIds(pages, parsed.read, parsed.openPageId)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)
  const onReqAbort = () => controller.abort()
  if (req.signal.aborted) controller.abort()
  else req.signal.addEventListener('abort', onReqAbort)
  try {
    const { object } = await generateObject({
      model: anthropic(AI_MODELS.quick),
      schema: PlacementSchema,
      abortSignal: controller.signal,
      prompt: buildPlacementPrompt({
        question: parsed.question,
        prose: parsed.prose,
        openPageId: parsed.openPageId,
        read: parsed.read,
        candidates: describeCandidates(pages, candidateIds),
      }),
    })
    return Response.json(validatePlacement(object, candidateIds))
  } catch (err) {
    console.error('propose-page: placement model failed', err instanceof Error ? err.message : err)
    return Response.json(FALLBACK)
  } finally {
    clearTimeout(timeout)
    req.signal.removeEventListener('abort', onReqAbort)
  }
}
