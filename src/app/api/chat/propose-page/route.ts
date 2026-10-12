import { createClient } from '@/lib/supabase/server'
import { listPages, type PondPage } from '@/lib/pages/client'

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
 * The ids the placement model may pick from: every `read` id that resolves to a
 * real page in this pond, the open page if it resolves, and every top-level page
 * (an area) — deduped. `pages` is already pond-confined (`listPages`, #312), so a
 * page from another pond is never a candidate even if `read` names its id.
 */
export function buildCandidatePageIds(
  pages: PondPage[],
  read: string[],
  openPageId: string | null
): string[] {
  const ids = new Set<string>()
  for (const id of read) {
    if (pages.some((p) => p.id === id)) ids.add(id)
  }
  if (openPageId && pages.some((p) => p.id === openPageId)) ids.add(openPageId)
  for (const page of pages) {
    if (page.parentId === null) ids.add(page.id)
  }
  return [...ids]
}

/**
 * Pond's name and parent for a proposed page (KAN-172). Scaffold: authenticates
 * and builds the candidate list the model will pick from, but makes no model
 * call yet — always the fallback shape, which `AITerminal.tsx`'s `proposePage`
 * uses exactly as its current heuristic result (AUDIT G1: make-this-a-page never
 * blocks on this route).
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
  // Wired into the model prompt by the next item; computed here so this item's
  // own candidate-membership rules (and their tests) land before the model call does.
  buildCandidatePageIds(pages, parsed.read, parsed.openPageId)

  return Response.json({ name: null, parentId: null, mentioned: [] })
}
