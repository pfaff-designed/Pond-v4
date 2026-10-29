/**
 * The composer's report card files through `/api/feedback` (KAN-572) — the
 * same route `report a problem` uses (KAN-335), never a second Jira client.
 *
 * `createReportFiler` hands back one filing per tool call: a second **file it**
 * while the first request is in flight gets the SAME promise, so a double press
 * sends one request (AUDIT G9). The card's tool call id also rides the body as
 * the route's `idempotencyKey`, so a request the client lost track of (a second
 * tab, a reload mid-send) still files once. A failed filing is forgotten, so
 * the person can press **file it** again.
 */

export interface ReportDraft {
  /** The card's tool call id — the filing's idempotency key. */
  toolCallId: string
  summary: string
  text: string
  pageId?: string | null
  pageTitle?: string
  url: string
}

export interface FiledTicket {
  key: string
  url: string
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>

export function createReportFiler(fetchImpl: Fetch = (input, init) => fetch(input, init)) {
  const inFlight = new Map<string, Promise<FiledTicket>>()

  return function fileReport(draft: ReportDraft): Promise<FiledTicket> {
    const pending = inFlight.get(draft.toolCallId)
    if (pending) return pending
    const filing = fetchImpl('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: draft.summary,
        text: draft.text,
        pageId: draft.pageId ?? undefined,
        pageTitle: draft.pageTitle,
        url: draft.url,
        idempotencyKey: draft.toolCallId,
      }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`feedback ${res.status}`)
      const data = (await res.json()) as Partial<FiledTicket>
      if (typeof data.key !== 'string' || typeof data.url !== 'string') {
        throw new Error('feedback answered without a key')
      }
      return { key: data.key, url: data.url }
    })
    inFlight.set(draft.toolCallId, filing)
    // Settled either way: a landed filing is the card's resolution from here on
    // (it rides the envelope), and a failed one must let the person retry.
    void filing.then(
      () => inFlight.delete(draft.toolCallId),
      () => inFlight.delete(draft.toolCallId)
    )
    return filing
  }
}
