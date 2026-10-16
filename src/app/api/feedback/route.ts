import { createClient } from '@/lib/supabase/server'
import { buildFeedbackIssue } from '@/lib/feedback/build-issue'
import { createJiraIssue, rankFirstInNowQueue } from '@/lib/feedback/jira-client'
import { checkFeedbackRateLimit } from '@/lib/feedback/rate-limit'

const REQUIRED_ENV = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_KEY', 'OWNER_EMAIL'] as const

interface FeedbackBody {
  text: string
  pageId?: string
  pageTitle?: string
  url: string
}

/** Minimal body-shape guard: null unless `body` carries a non-empty string `text`. */
function parseFeedbackBody(body: unknown): FeedbackBody | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (typeof b.text !== 'string' || b.text.trim() === '') return null
  return {
    text: b.text,
    pageId: typeof b.pageId === 'string' ? b.pageId : undefined,
    pageTitle: typeof b.pageTitle === 'string' ? b.pageTitle : undefined,
    url: typeof b.url === 'string' ? b.url : '',
  }
}

function missingEnv(): boolean {
  return REQUIRED_ENV.some((name) => !process.env[name])
}

/**
 * `report a problem` (KAN-335): files a Jira issue for the signed-in
 * caller's report. An owner report (`user.email` matching `OWNER_EMAIL`,
 * case-insensitive) also gets `now`/`size-S` and is ranked first in the
 * `now` queue — a failed rank still leaves the issue filed (`rankFailed`).
 */
export async function POST(req: Request) {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = parseFeedbackBody(rawBody)
  if (!parsed) {
    return Response.json({ error: 'text is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (missingEnv()) {
    return Response.json({ error: "can't file reports right now" }, { status: 503 })
  }

  if (!checkFeedbackRateLimit(user.id)) {
    return Response.json({ error: 'Too many reports — try again later' }, { status: 429 })
  }

  const isOwner = (user.email ?? '').toLowerCase() === (process.env.OWNER_EMAIL ?? '').toLowerCase()
  const issue = buildFeedbackIssue({
    text: parsed.text,
    pageId: parsed.pageId,
    pageTitle: parsed.pageTitle,
    url: parsed.url,
    reporterEmail: user.email ?? '',
    userAgent: req.headers.get('user-agent') ?? '',
    now: new Date(),
    isOwner,
  })
  const labels = isOwner ? [...issue.labels, 'now', 'size-S'] : issue.labels

  let created
  try {
    created = await createJiraIssue({ ...issue, labels })
  } catch {
    return Response.json({ error: "can't file reports right now" }, { status: 502 })
  }
  if (!isOwner) return Response.json({ key: created.key, url: created.url })

  const ranked = await rankFirstInNowQueue(created.key)
  return Response.json({ key: created.key, url: created.url, rankFailed: !ranked })
}
