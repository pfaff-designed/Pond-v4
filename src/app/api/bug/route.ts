import { createClient } from '@/lib/supabase/server'
import { BugSessionError, bugConfigFromEnv, fileBug } from '@/lib/bug/file-bug'

const GAP_MS = 15_000
const lastFiledAt = new Map<string, number>()

export function resetBugRateLimit(): void {
  lastFiledAt.clear()
}

function tooSoon(userId: string): boolean {
  const now = Date.now()
  const previous = lastFiledAt.get(userId) ?? 0
  if (now - previous < GAP_MS) return true
  lastFiledAt.set(userId, now)
  return false
}

function parseReport(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const report = (body as { report?: unknown }).report
  if (typeof report !== 'string' || report.trim() === '') return null
  return report.trim()
}

/**
 * `/bug` in the composer. Files a GitHub issue for the signed-in person and
 * starts the Pond bug cloud agent on it. The keys stay on the server.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const report = parseReport(raw)
  if (!report) return Response.json({ error: 'a report is required' }, { status: 400 })

  const config = bugConfigFromEnv()
  if (!config) return Response.json({ error: "can't file bugs right now" }, { status: 503 })

  if (tooSoon(user.id)) {
    return Response.json({ error: 'wait a moment before filing another bug' }, { status: 429 })
  }

  try {
    const filed = await fileBug(report, config)
    return Response.json(filed)
  } catch (error) {
    lastFiledAt.delete(user.id)
    if (error instanceof BugSessionError) {
      return Response.json({ error: error.message, issueUrl: error.issueUrl }, { status: 502 })
    }
    console.error('bug file failed')
    return Response.json({ error: 'could not open the github issue' }, { status: 502 })
  }
}
