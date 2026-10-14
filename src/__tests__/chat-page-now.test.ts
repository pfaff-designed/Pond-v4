/**
 * KAN-309: the open page's current state rides next to the question.
 *
 * `withOpenPageNow` attaches the open page as it reads NOW — title + one
 * `[blockId] (type) preview` line per block — as a text part on the LAST user
 * model message, labelled so the model prefers it over an earlier
 * `propose_changes` call's (possibly stale) input still in the message
 * history. See SPEC "The fix" 1 and 3a.
 */

import type { ModelMessage } from 'ai'
import { formatOpenPageNow, withOpenPageNow } from '@/app/api/chat/page-now'
import type { NodeContextData } from '@/lib/context/assemble'

const kiwiPage: NodeContextData = {
  type: 'page',
  title: 'kan309 probe',
  documents: [
    {
      title: 'kan309 probe',
      blocks: [{ id: 'b1', type: 'text', content: 'Hello kiwi' }],
    },
  ],
  children: [],
}

describe('formatOpenPageNow', () => {
  it('renders the title and a [blockId] (type) preview line per block', () => {
    const text = formatOpenPageNow(kiwiPage)
    expect(text).toContain('Title: kan309 probe')
    expect(text).toContain('[b1] (text) Hello kiwi')
  })

  it('labels the block as what the page reads now, not an earlier proposal', () => {
    const text = formatOpenPageNow(kiwiPage)
    expect(text).toMatch(/reads RIGHT NOW/)
    expect(text).toMatch(/earlier propose_changes call.*what the page read AT THE TIME/)
  })
})

describe('withOpenPageNow', () => {
  it('appends the open page now as a text part on the last user message', () => {
    const messages: ModelMessage[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      { role: 'user', content: 'change kiwi to fig' },
    ]

    const result = withOpenPageNow(messages, kiwiPage)
    const lastMessage = result.at(-1)

    expect(lastMessage?.role).toBe('user')
    expect(Array.isArray(lastMessage?.content)).toBe(true)
    const parts = lastMessage?.content as Array<{ type: string; text?: string }>
    expect(parts[0]).toEqual({ type: 'text', text: 'change kiwi to fig' })
    expect(parts[1].type).toBe('text')
    expect(parts[1].text).toContain('[b1] (text) Hello kiwi')
  })

  it('targets the LAST user message when a user message follows an assistant turn', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'change world to moon' },
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      { role: 'user', content: 'change kiwi to fig' },
    ]

    const result = withOpenPageNow(messages, kiwiPage)

    const firstUser = result[0]
    expect(firstUser.content).toBe('change world to moon')

    const lastUser = result.at(-1)
    const parts = lastUser?.content as Array<{ type: string; text?: string }>
    expect(parts.at(-1)?.text).toContain('[b1] (text) Hello kiwi')
  })

  it('appends to an existing array-content user message without dropping its parts', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'change kiwi to fig' }] },
    ]

    const result = withOpenPageNow(messages, kiwiPage)
    const parts = result[0].content as Array<{ type: string; text?: string }>

    expect(parts).toHaveLength(2)
    expect(parts[0]).toEqual({ type: 'text', text: 'change kiwi to fig' })
    expect(parts[1].text).toContain('[b1] (text) Hello kiwi')
  })

  it('leaves messages unchanged when there is no open-page data', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: 'change kiwi to fig' }]

    expect(withOpenPageNow(messages, null)).toBe(messages)
  })

  it('leaves messages unchanged when there is no user message', () => {
    const messages: ModelMessage[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    ]

    expect(withOpenPageNow(messages, kiwiPage)).toBe(messages)
  })
})
