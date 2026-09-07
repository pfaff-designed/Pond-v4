/**
 * SMS capture (F24, #14) — pure, framework-agnostic parsing and validation for
 * inbound Twilio webhooks. No Next.js imports; the route in
 * `src/app/api/twilio/sms/route.ts` wires these to I/O (service client, createPage).
 *
 * Posture: v1 is one-way durable *capture-anywhere*. A text from the owner's phone
 * becomes a page directly (bypassing the model for zero latency + cost). Everything
 * here is deterministic and unit-testable against a signed mock payload — no network.
 */

import crypto from 'node:crypto'
import { z } from 'zod'
import type { CreatePageInput } from '@/lib/pages/client'
import type { WorkspaceScope } from '@/lib/workspace/context'

/** props key that carries the capture provenance + Twilio MessageSid (dedupe anchor). */
export const SMS_PROP_KEY = 'sms'

/** Title is the first line of the body, truncated to keep the tree readable. */
const TITLE_MAX = 80

// ── Signature verification (mandatory; the endpoint is public) ───────────────

/**
 * Validate an `X-Twilio-Signature`. Twilio builds the signature by taking the full
 * request URL, then appending each POST param — sorted alphabetically by key — as
 * `key + value` with no separators, then HMAC-SHA1 (keyed by the account auth token)
 * and base64. We recompute and compare in constant time.
 *
 * Returns false (never throws) on a missing/malformed signature so the caller can
 * answer a clean 403.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null | undefined,
  authToken: string
): boolean {
  if (!signature) return false

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(payload, 'utf-8'))
    .digest('base64')

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ── Allowlist ────────────────────────────────────────────────────────────────

/**
 * True when `from` is in the comma-separated E.164 allowlist. Single-owner app:
 * any other sender is silently ignored (the route still 200s so Twilio doesn't retry).
 */
export function isAllowedSender(from: string, allowlist: string): boolean {
  const set = allowlist
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return set.includes(from.trim())
}

// ── Parse ────────────────────────────────────────────────────────────────────

const TwilioSmsSchema = z.object({
  From: z.string().min(1),
  MessageSid: z.string().min(1),
  Body: z.string().default(''),
  NumMedia: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number.parseInt(v ?? '0', 10)
      return Number.isFinite(n) && n > 0 ? n : 0
    }),
})

export interface TwilioSms {
  from: string
  messageSid: string
  body: string
  numMedia: number
}

/**
 * Parse raw Twilio form params into a validated capture. Returns null when the
 * required fields (`From`, `MessageSid`) are absent — the route treats that as a
 * no-op 200 rather than an error, since a well-formed Twilio request always carries them.
 */
export function parseTwilioSms(params: Record<string, string>): TwilioSms | null {
  const result = TwilioSmsSchema.safeParse(params)
  if (!result.success) return null
  const { From, MessageSid, Body, NumMedia } = result.data
  return { from: From, messageSid: MessageSid, body: Body, numMedia: NumMedia }
}

// ── Build the page ───────────────────────────────────────────────────────────

/** First line of the body, trimmed and truncated with an ellipsis when long. */
export function deriveTitle(body: string): string {
  const firstLine = body.split('\n')[0]?.trim() ?? ''
  if (!firstLine) return '(text message)'
  return firstLine.length > TITLE_MAX
    ? firstLine.slice(0, TITLE_MAX - 1).trimEnd() + '…'
    : firstLine
}

/** Body text with an appended "(N media omitted)" note when the MMS carried media (v1 stores no media). */
export function bodyWithMediaNote(body: string, numMedia: number): string {
  if (numMedia <= 0) return body
  const note = `(${numMedia} media omitted)`
  return body.trim() ? `${body}\n\n${note}` : note
}

/**
 * Turn a validated SMS into `createPage` input: a `page` under the Inbox parent, its
 * title the first line, its single text block the full body (+ media note). The
 * `sms` prop carries the MessageSid so a re-delivered webhook dedupes (see the route).
 */
export function buildCapturePageInput(
  sms: TwilioSms,
  opts: { parentId: string | null; workspace: WorkspaceScope; mintId: () => string }
): CreatePageInput {
  const content = bodyWithMediaNote(sms.body, sms.numMedia)
  return {
    parentId: opts.parentId,
    type: 'page',
    title: deriveTitle(sms.body),
    blocks: [{ id: opts.mintId(), type: 'text', content }],
    props: {
      source: 'sms',
      [SMS_PROP_KEY]: { messageSid: sms.messageSid, from: sms.from },
    },
    workspace: opts.workspace,
  }
}

/** Read the MessageSid a page was captured from, if any. Used by the dedupe check. */
export function messageSidOf(props: Record<string, unknown> | null | undefined): string | null {
  const sms = props?.[SMS_PROP_KEY]
  if (sms && typeof sms === 'object' && 'messageSid' in sms) {
    const sid = (sms as { messageSid?: unknown }).messageSid
    return typeof sid === 'string' ? sid : null
  }
  return null
}
