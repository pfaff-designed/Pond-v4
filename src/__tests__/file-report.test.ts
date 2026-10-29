/**
 * KAN-572 — the composer's `file_report` tool: its contract, the card's
 * outcome riding the resolutions envelope, and the client filer's idempotency
 * (a double press sends one request).
 */
import { fileReportTool } from '@/app/api/chat/tools'
import {
  applyResolutions,
  emptyResolutions,
  parseResolutions,
} from '@/lib/conversation/resolutions'
import {
  initialProposalState,
  projectResolutions,
  proposalReducer,
} from '@/lib/conversation/proposal-store'
import {
  hasVisibleAssistantContent,
  isFileReportPart,
  FILE_REPORT_TYPE,
} from '@/lib/conversation/tool-parts'
import { createReportFiler } from '@/lib/feedback/file-report'
import type { UIMessage } from 'ai'

describe('file_report contract', () => {
  const parse = (input: unknown) => fileReportTool.inputSchema.safeParse(input)

  it('accepts a summary and text, trimmed', () => {
    const r = parse({ summary: '  calendar opens on the wrong month ', text: ' it shows june ' })
    expect(r.success && r.data).toEqual({
      summary: 'calendar opens on the wrong month',
      text: 'it shows june',
    })
  })

  it.each([
    ['no summary', { text: 'x' }],
    ['no text', { summary: 'x' }],
    ['blank summary', { summary: '   ', text: 'x' }],
    ['blank text', { summary: 'x', text: '  ' }],
    ['summary over 80 characters', { summary: 'a'.repeat(81), text: 'x' }],
  ])('refuses %s', (_label, input) => {
    expect(parse(input).success).toBe(false)
  })

  it('is client-resolved: no execute, so nothing files until the person presses file it', () => {
    expect('execute' in fileReportTool).toBe(false)
  })

  it('tells the model a content change is a diff, never a report', () => {
    expect(fileReportTool.description).toMatch(/POND ITSELF/)
    expect(fileReportTool.description).toMatch(/propose_changes/)
    expect(fileReportTool.description).toMatch(/add_row/)
    expect(fileReportTool.description).toMatch(/NEVER a report/)
  })
})

describe('a report card is visible content', () => {
  const part = (input: unknown) =>
    ({ type: FILE_REPORT_TYPE, toolCallId: 'r1', state: 'input-available', input }) as never

  it('draws when the draft has a summary or text', () => {
    expect(isFileReportPart({ type: FILE_REPORT_TYPE })).toBe(true)
    expect(hasVisibleAssistantContent([part({ summary: 'x', text: '' })])).toBe(true)
  })

  it('draws nothing for an empty draft', () => {
    expect(hasVisibleAssistantContent([part({ summary: ' ', text: '' })])).toBe(false)
  })

  it('draws nothing for a draft the contract refused', () => {
    const refused = {
      type: FILE_REPORT_TYPE,
      toolCallId: 'r1',
      state: 'output-error',
      input: { summary: 'a'.repeat(81), text: 'x' },
    } as never
    expect(hasVisibleAssistantContent([refused])).toBe(false)
  })
})

describe('report outcomes ride the resolutions envelope', () => {
  const filed = { status: 'filed', key: 'KAN-900', url: 'https://x/browse/KAN-900' } as const

  it('settles once: a later settle never relabels a filed card', () => {
    let s = proposalReducer(initialProposalState(), {
      kind: 'settleReport',
      id: 'r1',
      resolution: filed,
    })
    s = proposalReducer(s, { kind: 'settleReport', id: 'r1', resolution: { status: 'cancelled' } })
    expect(s.reports.r1).toEqual(filed)
  })

  it('projects only when there are reports, and reseeds from a saved envelope', () => {
    expect(projectResolutions(initialProposalState())).not.toHaveProperty('reports')
    const s = proposalReducer(initialProposalState(), {
      kind: 'settleReport',
      id: 'r1',
      resolution: filed,
    })
    const saved = parseResolutions(JSON.parse(JSON.stringify(projectResolutions(s))))
    expect(saved.reports).toEqual({ r1: filed })
    const reseeded = proposalReducer(initialProposalState(), { kind: 'reseed', resolutions: saved })
    expect(reseeded.reports).toEqual({ r1: filed })
  })

  it('drops malformed entries', () => {
    const r = parseResolutions({
      reports: { a: { status: 'filed' }, b: { status: 'lost' }, c: { status: 'cancelled' } },
    })
    expect(r.reports).toEqual({ c: { status: 'cancelled' } })
  })

  it('stamps the outcome as the tool result, so the model does not draft it again', () => {
    const messages = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-file_report',
            toolCallId: 'r1',
            state: 'input-available',
            input: { summary: 's', text: 't' },
          },
          {
            type: 'tool-file_report',
            toolCallId: 'r2',
            state: 'input-available',
            input: { summary: 's', text: 't' },
          },
          {
            type: 'tool-file_report',
            toolCallId: 'r3',
            state: 'input-available',
            input: { summary: 's', text: 't' },
          },
        ],
      },
    ] as unknown as UIMessage[]
    const out = applyResolutions(messages, {
      ...emptyResolutions(),
      reports: { r1: filed, r2: { status: 'cancelled' } },
    })
    const [one, two, three] = out[0].parts as Array<{ state: string; output?: { filed: unknown } }>
    expect(one).toMatchObject({ state: 'output-available', output: { filed: 'KAN-900' } })
    expect(two).toMatchObject({ state: 'output-available', output: { filed: null } })
    // An unsettled card stays un-resulted, and replay drops it as before.
    expect(three.state).toBe('input-available')
  })
})

describe('createReportFiler', () => {
  const draft = {
    toolCallId: 'call-1',
    summary: 'calendar opens on the wrong month',
    text: 'it opens on june',
    pageId: 'page-1',
    pageTitle: 'kitchen reno',
    url: 'https://pond.local/p',
  }
  // jsdom has no fetch Response — the filer reads only `ok` and `json()`.
  const response = (status: number, body: unknown) =>
    ({ ok: status < 400, status, json: async () => body }) as Response
  const ok = () => response(200, { key: 'KAN-900', url: 'https://x/browse/KAN-900' })

  it('files to /api/feedback with the draft, the open page and the call id as idempotency key', async () => {
    const fetchImpl = jest.fn(async () => ok())
    const file = createReportFiler(fetchImpl)
    await expect(file(draft)).resolves.toEqual({ key: 'KAN-900', url: 'https://x/browse/KAN-900' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/feedback')
    expect(JSON.parse(init.body as string)).toEqual({
      summary: draft.summary,
      text: draft.text,
      pageId: 'page-1',
      pageTitle: 'kitchen reno',
      url: draft.url,
      idempotencyKey: 'call-1',
    })
  })

  it('a double press while filing sends one request', async () => {
    let release: (r: Response) => void = () => {}
    const fetchImpl = jest.fn(() => new Promise<Response>((r) => (release = r)))
    const file = createReportFiler(fetchImpl)
    const first = file(draft)
    const second = file(draft)
    expect(second).toBe(first)
    release(ok())
    await Promise.all([first, second])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("a refused filing carries the route's own reason", async () => {
    const fetchImpl = jest.fn(async () =>
      response(429, { error: 'Too many reports — try again later' })
    )
    const file = createReportFiler(fetchImpl)
    await expect(file(draft)).rejects.toThrow('Too many reports — try again later')
  })

  it('a failed filing can be retried', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(response(502, {})).mockResolvedValueOnce(ok())
    const file = createReportFiler(fetchImpl)
    await expect(file(draft)).rejects.toThrow()
    await expect(file(draft)).resolves.toMatchObject({ key: 'KAN-900' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
