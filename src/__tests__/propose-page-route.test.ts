/**
 * @jest-environment node
 *
 * KAN-172: POST /api/chat/propose-page authenticates like /api/chat, 400s on
 * a malformed body, confines its candidate list to the caller's pond, and
 * wraps the placement model call so a throw/timeout/malformed-output/
 * out-of-candidate response never 500s or escapes validation (AUDIT G1).
 * The model call is mocked — no network in tests.
 */

let mockUser: { id: string } | null = { id: 'user-1' }
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  })),
}))

const mockListPages = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  listPages: (...args: unknown[]) => mockListPages(...args),
}))

jest.mock('@ai-sdk/anthropic', () => ({ anthropic: () => ({}) }))
const mockGenerateObject = jest.fn()
jest.mock('ai', () => ({ generateObject: (...args: unknown[]) => mockGenerateObject(...args) }))

import {
  POST,
  buildCandidatePageIds,
  validatePlacement,
} from '@/app/api/chat/propose-page/route'
import type { PondPage } from '@/lib/pages/client'

function page(overrides: Partial<PondPage>): PondPage {
  return {
    id: 'p1',
    parentId: null,
    type: 'page',
    title: 'Untitled',
    blocks: [],
    order: 0,
    props: {},
    ...overrides,
  }
}

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/chat/propose-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockListPages.mockReset()
  mockListPages.mockResolvedValue([])
  mockGenerateObject.mockReset()
})

describe('POST /api/chat/propose-page', () => {
  it('returns 401 when there is no user', async () => {
    mockUser = null
    const res = await post({ question: 'q', prose: 'p' })
    expect(res.status).toBe(401)
  })

  it('returns 400 on invalid JSON instead of 500', async () => {
    const res = await post('not json{')
    expect(res.status).toBe(400)
  })

  it('returns 400 when question/prose are missing or not strings', async () => {
    expect((await post({ prose: 'p' })).status).toBe(400)
    expect((await post({ question: 1, prose: 'p' })).status).toBe(400)
    expect((await post({ question: 'q', prose: ['nope'] })).status).toBe(400)
  })

  it('returns the fallback shape when the model call throws, and logs once', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockGenerateObject.mockRejectedValue(new Error('model unavailable'))
    const res = await post({ question: 'q', prose: 'p' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: null, parentId: null, mentioned: [] })
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('propose-page: placement model failed', 'model unavailable')
    consoleErrorSpy.mockRestore()
  })

  it('returns the fallback shape on malformed model output', async () => {
    mockGenerateObject.mockRejectedValue(new Error('response did not match schema'))
    const res = await post({ question: 'q', prose: 'p' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: null, parentId: null, mentioned: [] })
  })

  it('nulls a hallucinated parentId outside the candidates', async () => {
    mockListPages.mockResolvedValue([page({ id: 'area-1', parentId: null, title: 'creativity' })])
    mockGenerateObject.mockResolvedValue({
      object: { name: 'renovation blockers', parentId: 'made-up-id', mentioned: [] },
    })
    const res = await post({ question: 'q', prose: 'p' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      name: 'renovation blockers',
      parentId: null,
      mentioned: [],
    })
  })

  it('passes through a well-formed, validated response', async () => {
    mockListPages.mockResolvedValue([page({ id: 'area-1', parentId: null, title: 'creativity' })])
    mockGenerateObject.mockResolvedValue({
      object: {
        name: 'renovation blockers',
        parentId: 'area-1',
        mentioned: [{ title: 'kitchen renovation', ref: 'area-1', note: 'the one everything waits on' }],
      },
    })
    // The real caller (AITerminal.tsx's proposePage) sends `read` as page ids.
    const res = await post({ question: 'q', prose: 'p', read: ['area-1'] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      name: 'renovation blockers',
      parentId: 'area-1',
      mentioned: [{ title: 'kitchen renovation', ref: 'area-1', note: 'the one everything waits on' }],
    })
  })

  it('makes a read page a valid parentId when it is given by id (the real caller sends ids)', async () => {
    const area = page({ id: 'area-1', parentId: null, title: 'creativity' })
    const readPage = page({ id: 'kr-1', parentId: 'area-1', title: 'Kitchen renovation' })
    mockListPages.mockResolvedValue([area, readPage])
    mockGenerateObject.mockResolvedValue({
      object: { name: 'renovation blockers', parentId: 'kr-1', mentioned: [] },
    })
    const res = await post({
      question: 'q',
      prose: 'p',
      openPageId: 'area-1',
      read: ['kr-1'],
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      name: 'renovation blockers',
      parentId: 'kr-1',
      mentioned: [],
    })
  })
})

describe('validatePlacement', () => {
  it('nulls a parentId not in the candidate list', () => {
    const result = validatePlacement(
      { name: 'n', parentId: 'outside', mentioned: [] },
      ['area-1']
    )
    expect(result.parentId).toBeNull()
  })

  it('nulls a mentioned ref not in the candidate list while keeping title/note', () => {
    const result = validatePlacement(
      { name: 'n', parentId: null, mentioned: [{ title: 't', ref: 'outside', note: 'note' }] },
      ['area-1']
    )
    expect(result.mentioned).toEqual([{ title: 't', ref: null, note: 'note' }])
  })

  it('passes through a parentId and ref that are in the candidate list', () => {
    const result = validatePlacement(
      { name: 'n', parentId: 'area-1', mentioned: [{ title: 't', ref: 'area-1', note: 'note' }] },
      ['area-1']
    )
    expect(result.parentId).toBe('area-1')
    expect(result.mentioned).toEqual([{ title: 't', ref: 'area-1', note: 'note' }])
  })
})

describe('buildCandidatePageIds', () => {
  it('excludes a page from a different pond (not present in the pond-confined list)', () => {
    // listPages (#312) already confines `pages` to the caller's pond — a
    // DIFFERENT pond's page id named in `read` never resolves against it.
    const pages = [page({ id: 'same-pond-page', parentId: 'area-1' })]
    const ids = buildCandidatePageIds(pages, ['same-pond-page', 'other-pond-page'], null)
    expect(ids).toContain('same-pond-page')
    expect(ids).not.toContain('other-pond-page')
  })

  it('includes a resolving openPageId and every top-level page as an area, deduped', () => {
    const area = page({ id: 'area-1', parentId: null })
    const child = page({ id: 'child-1', parentId: 'area-1' })
    const ids = buildCandidatePageIds([area, child], ['child-1'], 'area-1')
    expect(ids.sort()).toEqual(['area-1', 'child-1'])
  })

  it('drops an openPageId that does not resolve to a real page', () => {
    const ids = buildCandidatePageIds([], [], 'missing')
    expect(ids).toEqual([])
  })

  it('drops a `read` entry that does not resolve to a real page id (a chip title is not a valid entry)', () => {
    const area = page({ id: 'area-1', parentId: null, title: 'Creativity' })
    const readPage = page({ id: 'kr-1', parentId: 'area-1', title: 'Kitchen renovation' })
    const ids = buildCandidatePageIds([area, readPage], ['Kitchen renovation'], null)
    expect(ids).not.toContain('kr-1')
  })
})
