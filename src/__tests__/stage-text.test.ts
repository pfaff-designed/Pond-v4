/**
 * @jest-environment node
 *
 * Streaming stage text (ticket-32, audit finding 11). Pins the tool-part → human
 * copy mapping so a long generation shows "reading Ceramics Studio Plan…" instead of
 * a bare ellipsis, and so the terminal's WHAT-to-say layer stays a pure, testable
 * data mapping.
 */

import {
  stageTextForPart,
  stageTextForParts,
  hasActiveTool,
  THINKING_STAGE_TEXT,
  type StagePart,
} from '@/lib/conversation/stage-text'

const active = (type: string, extra: Partial<StagePart> = {}): StagePart => ({
  type,
  state: 'input-streaming',
  ...extra,
})

describe('stageTextForPart', () => {
  it('narrates a web search', () => {
    expect(stageTextForPart(active('tool-web_search'))).toBe('searching the web…')
  })

  it('narrates a workspace context lookup', () => {
    expect(stageTextForPart(active('tool-fetch_context'))).toBe('searching your workspace…')
  })

  it('narrates a page read with a resolved title', () => {
    const part = active('tool-read_page', { input: { pageId: 'pg-1' } })
    const line = stageTextForPart(part, {
      resolvePageName: (id) => (id === 'pg-1' ? 'Ceramics Studio Plan' : undefined),
    })
    expect(line).toBe('reading Ceramics Studio Plan…')
  })

  it('falls back to generic copy when the page name is unknown', () => {
    const part = active('tool-read_page', { input: { pageId: 'pg-x' } })
    expect(stageTextForPart(part, { resolvePageName: () => undefined })).toBe('reading your page…')
    // …and when no resolver is supplied at all.
    expect(stageTextForPart(part)).toBe('reading your page…')
  })

  it('narrates a page draft with its title, else generic', () => {
    expect(
      stageTextForPart(active('tool-create_page', { input: { title: 'Trip to Kyoto' } }))
    ).toBe('drafting Trip to Kyoto…')
    expect(stageTextForPart(active('tool-create_page', { input: { title: '  ' } }))).toBe(
      'drafting your page…'
    )
    expect(stageTextForPart(active('tool-create_page'))).toBe('drafting your page…')
  })

  it('narrates a proposed edit batch', () => {
    expect(stageTextForPart(active('tool-propose_changes'))).toBe('proposing changes…')
  })

  it('returns null for a plain text part (not a tool call)', () => {
    expect(stageTextForPart({ type: 'text', state: undefined })).toBeNull()
  })

  it('returns null for a tool part that has not started (no state)', () => {
    expect(stageTextForPart({ type: 'tool-web_search' })).toBeNull()
  })

  it('returns null for an unrecognised tool part', () => {
    expect(stageTextForPart(active('tool-some_future_tool'))).toBeNull()
  })
})

describe('THINKING_STAGE_TEXT', () => {
  it('is the quiet resting line the terminal falls back to', () => {
    expect(THINKING_STAGE_TEXT).toBe('thinking…')
  })
})

describe('stageTextForParts', () => {
  it('is null when there is nothing narratable', () => {
    expect(stageTextForParts([{ type: 'text', state: undefined }])).toBeNull()
    expect(stageTextForParts([])).toBeNull()
  })

  it('the last active tool part wins — search-then-draft reads as drafting', () => {
    const parts: StagePart[] = [
      active('tool-web_search'),
      { type: 'text', state: undefined },
      active('tool-create_page', { input: { title: 'Budget' } }),
    ]
    expect(stageTextForParts(parts)).toBe('drafting Budget…')
  })

  it('resolves a read_page name through the options resolver', () => {
    const parts: StagePart[] = [active('tool-read_page', { input: { pageId: 'p9' } })]
    expect(stageTextForParts(parts, { resolvePageName: () => 'Studio Plan' })).toBe(
      'reading Studio Plan…'
    )
  })
})

describe('hasActiveTool (Fix-5 / F10 gate widening)', () => {
  it('true when any tool part has a state (is active)', () => {
    expect(hasActiveTool([active('tool-web_search')])).toBe(true)
  })

  it('true even when mixed with text parts — the tool is still running', () => {
    const parts: StagePart[] = [
      { type: 'text', state: undefined },
      active('tool-read_page', { input: { pageId: 'p1' } }),
    ]
    expect(hasActiveTool(parts)).toBe(true)
  })

  it('false when only text/no-state parts are present', () => {
    expect(hasActiveTool([{ type: 'text', state: undefined }])).toBe(false)
    expect(hasActiveTool([])).toBe(false)
  })

  it('false when the tool part has no state (not yet begun)', () => {
    expect(hasActiveTool([{ type: 'tool-web_search' }])).toBe(false)
  })
})
