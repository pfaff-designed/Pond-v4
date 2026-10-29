import { createClient } from '@/lib/supabase/server'
import { buildFeedbackIssue } from '@/lib/feedback/build-issue'
import { addIssueComment, createJiraIssue, rankFirstInNowQueue } from '@/lib/feedback/jira-client'
import { buildOwnerEmailFields, sendOwnerEmail } from '@/lib/feedback/owner-email'
import { checkFeedbackRateLimit } from '@/lib/feedback/rate-limit'
import {
  filingKey,
  priorFiling,
  rememberFiling,
  type FiledReport,
} from '@/lib/feedback/idempotency'

const REQUIRED_ENV = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_KEY', 'OWNER_EMAIL'] as const

interface FeedbackBody {
  text: string
  /** KAN-572: the composer card's edited one-line summary. Absent ⇒ text's first line. */
  summary?: string
  /** KAN-572: one issue per key (the card's tool call id), G9. */
  idempotencyKey?: string
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
    summary: typeof b.summary === 'string' && b.summary.trim() !== '' ? b.summary : undefined,
    idempotencyKey:
      typeof b.idempotencyKey === 'string' && b.idempotencyKey !== ''
        ? b.idempotencyKey
        : undefined,
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
 *
 * The composer's `file_report` card (KAN-572) files through this same route,
 * adding an edited `summary` and an `idempotencyKey`: a repeat request with the
 * key gets the first filing's answer instead of a second issue.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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

  if (missingEnv()) {
    return Response.json({ error: "can't file reports right now" }, { status: 503 })
  }

  const dedupeKey = parsed.idempotencyKey ? filingKey(user.id, parsed.idempotencyKey) : null
  const prior = dedupeKey ? priorFiling(dedupeKey) : undefined
  if (prior) {
    const filed = await prior
    if (filed) return Response.json(filed)
  }

  if (!checkFeedbackRateLimit(user.id)) {
    return Response.json({ error: 'Too many reports — try again later' }, { status: 429 })
  }

  const filing = fileIssue(req, user, parsed)
  if (dedupeKey) {
    rememberFiling(
      dedupeKey,
      filing.then(
        (r) => (r.status === 200 ? (r.body as FiledReport) : null),
        () => null
      )
    )
  }
  const { status, body } = await filing
  return Response.json(body, { status })
}

interface FilingResult {
  status: number
  body: Record<string, unknown>
}

async function fileIssue(
  req: Request,
  user: { email?: string },
  parsed: FeedbackBody
): Promise<FilingResult> {
  const isOwner = (user.email ?? '').toLowerCase() === (process.env.OWNER_EMAIL ?? '').toLowerCase()
  const now = new Date()
  const issue = buildFeedbackIssue({
    text: parsed.text,
    summary: parsed.summary,
    pageId: parsed.pageId,
    pageTitle: parsed.pageTitle,
    url: parsed.url,
    reporterEmail: user.email ?? '',
    userAgent: req.headers.get('user-agent') ?? '',
    now,
    isOwner,
  })
  const labels = isOwner ? [...issue.labels, 'now', 'size-S'] : issue.labels

  let created
  try {
    created = await createJiraIssue({ ...issue, labels })
  } catch {
    return { status: 502, body: { error: "can't file reports right now" } }
  }
  if (!isOwner) {
    const fields = buildOwnerEmailFields({
      reporterEmail: user.email ?? '',
      text: parsed.text,
      pageTitle: parsed.pageTitle,
      url: parsed.url,
      now,
      jiraUrl: created.url,
    })
    try {
      const { id } = await sendOwnerEmail(fields)
      console.log(`owner email sent: ${id}`)
      return { status: 200, body: { key: created.key, url: created.url, emailId: id } }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`owner email failed: ${reason}`)
      await addIssueComment(created.key, `owner email failed: ${reason}`)
      return { status: 200, body: { key: created.key, url: created.url, emailFailed: true } }
    }
  }

  const ranked = await rankFirstInNowQueue(created.key)
  return { status: 200, body: { key: created.key, url: created.url, rankFailed: !ranked } }
}
