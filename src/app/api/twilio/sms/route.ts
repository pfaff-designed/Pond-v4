import { createServiceClient } from '@/lib/supabase/server'
import { createPage } from '@/lib/pages/client'
import { resolveParentId } from '@/lib/nodes/create'
import {
  verifyTwilioSignature,
  isAllowedSender,
  parseTwilioSms,
  buildCapturePageInput,
  SMS_PROP_KEY,
} from '@/lib/capture/sms'

/**
 * Inbound SMS capture (F24, #14). A text from the owner's phone lands as a durable
 * page under the "Inbox" area with zero model latency — a raw capture, triaged later
 * in-app. One-way in v1: no outbound/confirmation SMS, no live Pond turn.
 *
 * This is a public, server-to-server endpoint (no cookies): it authenticates the
 * request by validating Twilio's HMAC signature, then the sender against an allowlist,
 * and writes via the service client (RLS-bypassing) as the configured owner. Parsing
 * and validation are the pure helpers in `@/lib/capture/sms`.
 */
export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const ownerUserId = process.env.TWILIO_OWNER_USER_ID
  const allowlist = process.env.TWILIO_ALLOWED_FROM
  if (!authToken || !ownerUserId || !allowlist) {
    return new Response('SMS capture not configured', { status: 500 })
  }

  // Read the raw form body once — the signature is computed over these exact params.
  const raw = await req.text()
  const params = Object.fromEntries(new URLSearchParams(raw))

  // 1) Signature (mandatory). The URL must match the one Twilio POSTed to; behind a
  //    proxy (ngrok/Vercel) req.url is the internal URL, so prefer an explicit override.
  const url = webhookUrl(req)
  if (!verifyTwilioSignature(url, params, req.headers.get('x-twilio-signature'), authToken)) {
    return new Response('invalid signature', { status: 403 })
  }

  const sms = parseTwilioSms(params)
  if (!sms) return twiml() // malformed but signed → no-op 200 (don't make Twilio retry)

  // 2) Allowlist. Non-owner senders are silently ignored (200, no write).
  if (!isAllowedSender(sms.from, allowlist)) return twiml()

  const supabase = createServiceClient()

  // 3) Idempotency. A re-delivered webhook carries the same MessageSid — skip the write.
  if (await hasMessageSid(supabase, ownerUserId, sms.messageSid)) return twiml()

  // 4) Land it under Inbox (create the area on first capture).
  const parentId = await resolveInbox(supabase, ownerUserId)
  const input = buildCapturePageInput(sms, {
    parentId,
    workspace: 'main',
    mintId: () => crypto.randomUUID(),
  })
  await createPage(supabase, ownerUserId, input)

  return twiml()
}

/** Empty TwiML acknowledgement — no auto-reply in v1. */
function twiml(): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

/**
 * The public URL Twilio signed. Prefer `TWILIO_WEBHOOK_URL` (set it to the exact
 * configured webhook URL when running behind a proxy); otherwise reconstruct from the
 * forwarded host/proto headers, falling back to req.url.
 */
function webhookUrl(req: Request): string {
  const explicit = process.env.TWILIO_WEBHOOK_URL
  if (explicit) return explicit
  const proto = req.headers.get('x-forwarded-proto')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (proto && host) return `${proto}://${host}${new URL(req.url).pathname}`
  return req.url
}

/** True when a page already carries this Twilio MessageSid (idempotency guard). */
async function hasMessageSid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  messageSid: string
): Promise<boolean> {
  const { data } = await supabase
    .from('pages')
    .select('id')
    .eq('user_id', userId)
    .eq('workspace', 'main')
    .eq(`props->${SMS_PROP_KEY}->>messageSid`, messageSid)
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

/** Resolve the "Inbox" area, creating it on first capture. */
async function resolveInbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<string> {
  try {
    return await resolveParentId(supabase, userId, 'Inbox', 'main')
  } catch {
    const inbox = await createPage(supabase, userId, {
      title: 'Inbox',
      type: 'area',
      workspace: 'main',
    })
    return inbox.id
  }
}
