/**
 * `tool-parts.ts` imports `ai` type-only (erased at compile time), so this
 * runs under the default jsdom environment — no Web-stream polyfills needed.
 */

import type { UIMessage } from 'ai'
import { answerAboveCard, isOneAssumptionSentence } from '@/lib/conversation/proposal-answer'

type Part = UIMessage['parts'][number]

describe('answerAboveCard', () => {
  it('returns the trimmed assumption from a qualifying proposal part', () => {
    const parts = [
      { type: 'text', text: 'Pushing the electrician out.' },
      {
        type: 'tool-propose_changes',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { changes: [], assumption: '  Taking the current date as the anchor.  ' },
      },
    ] as unknown as Part[]
    expect(answerAboveCard(parts)).toBe('Taking the current date as the anchor.')
  })

  it('returns undefined when the qualifying part has no assumption', () => {
    const parts = [
      {
        type: 'tool-configure_view',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { pageId: 'p1', mode: 'table' },
      },
    ] as unknown as Part[]
    expect(answerAboveCard(parts)).toBeUndefined()
  })

  it('returns undefined when the qualifying part has a blank assumption', () => {
    const parts = [
      {
        type: 'tool-add_row',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { collectionId: 'c1', assumption: '   ' },
      },
    ] as unknown as Part[]
    expect(answerAboveCard(parts)).toBeUndefined()
  })

  it('ignores a create_page part even when its input carries an assumption-shaped field', () => {
    const parts = [
      {
        type: 'tool-create_page',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { title: 'New page', type: 'page', assumption: 'Not a real field here.' },
      },
    ] as unknown as Part[]
    expect(answerAboveCard(parts)).toBeUndefined()
  })

  it('returns undefined when there is no proposal part at all', () => {
    const parts = [{ type: 'text', text: 'Just chatting.' }] as unknown as Part[]
    expect(answerAboveCard(parts)).toBeUndefined()
  })
})

describe('isOneAssumptionSentence', () => {
  it('passes one sentence that names an assumption', () => {
    expect(isOneAssumptionSentence('Taking the current w/c 29 Sep date as the anchor.')).toBe(
      true
    )
  })

  it('fails two sentences', () => {
    expect(
      isOneAssumptionSentence(
        'Taking the current w/c 29 Sep date as the anchor. Updating the electrician date.'
      )
    ).toBe(false)
  })

  it('fails zero sentences', () => {
    expect(isOneAssumptionSentence('   ')).toBe(false)
  })

  it('fails one sentence with no assumption word', () => {
    expect(isOneAssumptionSentence('Updating the electrician date.')).toBe(false)
  })
})
