/**
 * @jest-environment node
 *
 * Integration tests for POST /api/twilio/sms (F24, #14). Exercises the full route
 * against a signed mock Twilio payload (no network): signature gate, allowlist gate,
 * durable Inbox write, and MessageSid idempotency. Server-only deps are mocked with a
 * single in-memory `pages` store so createPage / resolveParentId / the dedupe query all
 * read+write the same fake table — the same shape a real Supabase round-trip would have.
 */

import crypto from 'node:crypto'

// ── In-memory pages store shared by every mocked seam ────────────────────────
interface FakePage {
  id: string
  parentId: string | null
  type: string
  title: string
  blocks: unknown[]
  props: Record<string, unknown>
  user_id: string
  workspace: string
}
const store: { pages: FakePage[] } = { pages: [] }

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(async (_sb: unknown, userId: string, input: Record<string, unknown>) => {
    const page: FakePage = {
      id: `page-${store.pages.length + 1}`,
      parentId: (input.parentId as string | null) ?? null,
      type: (input.type as string) ?? 'page',
      title: (input.title as string) ?? '',
      blocks: (input.blocks as unknown[]) ?? [],
      props: (input.props as Record<string, unknown>) ?? {},
      user_id: userId,
      workspace: (input.workspace as string) ?? 'main',
    }
    store.pages.push(page)
    return page
  }),
}))

jest.mock('@/lib/nodes/create', () => ({
  resolveParentId: jest.fn(async (_sb: unknown, userId: string, idOrName: string) => {
    const match = store.pages.find(
      (p) => p.user_id === userId && p.title.toLowerCase() === idOrName.toLowerCase()
    )
    if (!match) throw new Error(`Page "${idOrName}" not found`)
    return match.id
  }),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from() {
      const filters: Array<[string, unknown]> = []
      const api = {
        select: () => api,
        eq: (col: string, val: unknown) => {
          filters.push([col, val])
          return api
        },
        limit: () => api,
        maybeSingle: async () => {
          const match = store.pages.find((p) =>
            filters.every(([col, val]) => {
              if (col === 'props->sms->>messageSid') {
                const sms = p.props?.sms as { messageSid?: string } | undefined
                return sms?.messageSid === val
              }
              if (col === 'user_id') return p.user_id === val
              if (col === 'workspace') return p.workspace === val
              return true
            })
          )
          return { data: match ? { id: match.id } : null, error: null }
        },
      }
      return api
    },
  }),
}))

import { POST } from '@/app/api/twilio/sms/route'

const TOKEN = 'test-token'
const OWNER = 'owner-1'
const ALLOWED = '+15550001111'
const WEBHOOK = 'https://example.com/api/twilio/sms'

function sign(url: string, params: Record<string, string>, token: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url)
  return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')
}

function makeRequest(params: Record<string, string>, opts: { signature?: string } = {}): Request {
  const signature = opts.signature ?? sign(WEBHOOK, params, TOKEN)
  return new Request('http://internal/api/twilio/sms', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: new URLSearchParams(params).toString(),
  })
}

function captures(): FakePage[] {
  return store.pages.filter((p) => (p.props?.sms as unknown) != null)
}

beforeAll(() => {
  process.env.TWILIO_AUTH_TOKEN = TOKEN
  process.env.TWILIO_OWNER_USER_ID = OWNER
  process.env.TWILIO_ALLOWED_FROM = ALLOWED
  process.env.TWILIO_WEBHOOK_URL = WEBHOOK
})

beforeEach(() => {
  store.pages = []
  jest.clearAllMocks()
})

describe('POST /api/twilio/sms', () => {
  it('AC1: signed + allowlisted → creates a page under Inbox and returns empty TwiML', async () => {
    const res = await POST(
      makeRequest({ From: ALLOWED, MessageSid: 'SM1', Body: 'buy milk\nand eggs', NumMedia: '0' })
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/xml')
    expect(await res.text()).toContain('<Response>')

    const inbox = store.pages.find((p) => p.title === 'Inbox')
    expect(inbox).toMatchObject({ type: 'area', workspace: 'main' })

    const [capture] = captures()
    expect(capture).toMatchObject({
      parentId: inbox!.id,
      type: 'page',
      title: 'buy milk',
      user_id: OWNER,
    })
    expect(capture.blocks[0]).toMatchObject({ type: 'text', content: 'buy milk\nand eggs' })
    expect((capture.props.sms as { messageSid: string }).messageSid).toBe('SM1')
  })

  it('AC2: invalid signature → 403 and no write', async () => {
    const res = await POST(
      makeRequest(
        { From: ALLOWED, MessageSid: 'SM2', Body: 'hi', NumMedia: '0' },
        { signature: 'not-a-valid-signature' }
      )
    )
    expect(res.status).toBe(403)
    expect(store.pages).toHaveLength(0)
  })

  it('AC3: non-allowlisted sender → 200 and no write', async () => {
    const res = await POST(
      makeRequest({ From: '+15559999999', MessageSid: 'SM3', Body: 'hi', NumMedia: '0' })
    )
    expect(res.status).toBe(200)
    expect(store.pages).toHaveLength(0)
  })

  it('AC4: duplicate MessageSid → idempotent (no second capture)', async () => {
    const req = () =>
      makeRequest({ From: ALLOWED, MessageSid: 'SM4', Body: 'dedupe me', NumMedia: '0' })

    await POST(req())
    expect(captures()).toHaveLength(1)

    const res2 = await POST(req())
    expect(res2.status).toBe(200)
    expect(captures()).toHaveLength(1)
  })

  it('AC5: media present → body captured with an omitted-media note', async () => {
    await POST(
      makeRequest({ From: ALLOWED, MessageSid: 'SM5', Body: 'look at this', NumMedia: '2' })
    )
    const [capture] = captures()
    expect(capture.blocks[0]).toMatchObject({
      type: 'text',
      content: 'look at this\n\n(2 media omitted)',
    })
  })

  it('reuses the existing Inbox area across captures', async () => {
    await POST(makeRequest({ From: ALLOWED, MessageSid: 'SMa', Body: 'one', NumMedia: '0' }))
    await POST(makeRequest({ From: ALLOWED, MessageSid: 'SMb', Body: 'two', NumMedia: '0' }))

    const inboxes = store.pages.filter((p) => p.title === 'Inbox')
    expect(inboxes).toHaveLength(1)
    expect(captures()).toHaveLength(2)
  })
})
