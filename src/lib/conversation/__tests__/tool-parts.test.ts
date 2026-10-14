/**
 * `tool-parts.ts` imports `ai` type-only (erased at compile time), so this
 * runs under the default jsdom environment — no Web-stream polyfills needed.
 */

import type { UIMessage } from 'ai'
import { hasVisibleAssistantContent } from '@/lib/conversation/tool-parts'

type Part = UIMessage['parts'][number]

describe('hasVisibleAssistantContent', () => {
  it('is false for an empty parts list', () => {
    expect(hasVisibleAssistantContent([])).toBe(false)
  })

  it('is false for step-start only', () => {
    const parts = [{ type: 'step-start' }] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(false)
  })

  it('is true for non-empty text', () => {
    const parts = [{ type: 'text', text: 'hello' }] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(true)
  })

  it('is false for whitespace-only text', () => {
    const parts = [{ type: 'text', text: '   \n\t  ' }] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(false)
  })

  it('is true for a source-url part', () => {
    const parts = [
      { type: 'source-url', sourceId: 's1', url: 'https://example.com' },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(true)
  })

  it('is false for a read_page-only turn — read chips only ever render nested inside a text or sources block', () => {
    const parts = [
      { type: 'step-start' },
      {
        type: 'tool-read_page',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { pageId: 'p1' },
        output: { title: 'Areas' },
      },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(false)
  })

  it('is false for a fetch_context-only turn', () => {
    const parts = [
      {
        type: 'tool-fetch_context',
        toolCallId: 'tc1',
        state: 'output-available',
        input: {},
        output: {},
      },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(false)
  })

  it('is false for suggest_followups with an empty suggestions list', () => {
    const parts = [
      {
        type: 'tool-suggest_followups',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { suggestions: [] },
      },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(false)
  })

  it('is true for suggest_followups with at least one suggestion', () => {
    const parts = [
      {
        type: 'tool-suggest_followups',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { suggestions: ['tell me more'] },
      },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(true)
  })

  it('is false for a card whose input fails its render guard (create_page missing title/type)', () => {
    const parts = [
      {
        type: 'tool-create_page',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { reason: 'thinking about it' },
      },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(false)
  })

  it('is true for a create_page card whose input clears the render guard', () => {
    const parts = [
      {
        type: 'tool-create_page',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { title: 'Areas', type: 'page' },
      },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(true)
  })

  it('is false for a tool part still input-streaming, even one that would otherwise be visible', () => {
    const parts = [
      {
        type: 'tool-create_page',
        toolCallId: 'tc1',
        state: 'input-streaming',
        input: { title: 'Areas', type: 'page' },
      },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(false)
  })

  it('is false for reasoning, file, and data-* parts', () => {
    const parts = [
      { type: 'reasoning', text: 'thinking' },
      { type: 'file', url: 'https://example.com/a.png', mediaType: 'image/png' },
      { type: 'data-custom', data: { foo: 'bar' } },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(false)
  })

  it('is true for a propose_changes part past input-streaming regardless of its change count', () => {
    const parts = [
      {
        type: 'tool-propose_changes',
        toolCallId: 'tc1',
        state: 'input-available',
        input: { changes: [] },
      },
    ] as unknown as Part[]
    expect(hasVisibleAssistantContent(parts)).toBe(true)
  })
})
