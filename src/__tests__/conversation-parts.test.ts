/**
 * Model-emitted correspondence parts (ticket-39, THE SPINE) — chips + question cards.
 *
 * Pins: the tool INPUT schemas accept/reject the right shapes (chip round-trip,
 * 2-4 options on a question), the question-resolution persist/parse round-trip
 * (answered cards survive reload, malformed input degrades to unanswered), and
 * the render helpers (open-branch ids, Brief open-question mirroring).
 */

import {
  chipSchema,
  suggestFollowupsSchema,
  askQuestionSchema,
  parseQuestionResolutions,
  openQuestionIds,
  briefOpenQuestions,
  isRenderableQuestion,
  ASK_QUESTION_TYPE,
  type QuestionResolutions,
  type QuestionPartLike,
} from '@/lib/conversation/parts'

describe('chipSchema', () => {
  it('accepts a short phrase', () => {
    expect(chipSchema.safeParse('turn this into the plan').success).toBe(true)
  })
  it('rejects empty and absurdly long chips', () => {
    expect(chipSchema.safeParse('').success).toBe(false)
    expect(chipSchema.safeParse('x'.repeat(200)).success).toBe(false)
  })
})

describe('suggestFollowupsSchema (chips)', () => {
  it('accepts 1-4 chips', () => {
    expect(suggestFollowupsSchema.safeParse({ suggestions: ['a'] }).success).toBe(true)
    expect(suggestFollowupsSchema.safeParse({ suggestions: ['a', 'b', 'c', 'd'] }).success).toBe(
      true
    )
  })
  it('rejects zero or more than four chips', () => {
    expect(suggestFollowupsSchema.safeParse({ suggestions: [] }).success).toBe(false)
    expect(
      suggestFollowupsSchema.safeParse({ suggestions: ['a', 'b', 'c', 'd', 'e'] }).success
    ).toBe(false)
  })
  it('round-trips a valid chip set', () => {
    const input = { suggestions: ['grill me harder', 'just build it'] }
    expect(suggestFollowupsSchema.parse(input)).toEqual(input)
  })
})

describe('askQuestionSchema (branch-pause question card)', () => {
  it('accepts a question with 2-4 options + a branch label', () => {
    const q = {
      question: 'What kind of kiln?',
      options: ['Electric', 'Gas', 'Wood-fired'],
      branch: 'kiln type',
    }
    expect(askQuestionSchema.parse(q)).toEqual(q)
  })
  it('rejects fewer than two or more than four options', () => {
    expect(
      askQuestionSchema.safeParse({ question: 'q', options: ['only one'], branch: 'b' }).success
    ).toBe(false)
    expect(
      askQuestionSchema.safeParse({
        question: 'q',
        options: ['a', 'b', 'c', 'd', 'e'],
        branch: 'b',
      }).success
    ).toBe(false)
  })
  it('requires a branch label (so the Brief mirror + card have a name)', () => {
    expect(askQuestionSchema.safeParse({ question: 'q', options: ['a', 'b'] }).success).toBe(false)
  })
})

describe('parseQuestionResolutions — persist round-trip', () => {
  it('round-trips answered cards through JSON', () => {
    const answered: QuestionResolutions = {
      q1: { answer: 'Wood-fired', via: 'option' },
      q2: { answer: 'around $3k', via: 'free' },
    }
    expect(parseQuestionResolutions(JSON.parse(JSON.stringify(answered)))).toEqual(answered)
  })
  it('defaults an unknown via to free', () => {
    const parsed = parseQuestionResolutions({ q1: { answer: 'x', via: 'nonsense' } })
    expect(parsed.q1.via).toBe('free')
  })
  it.each([
    [undefined],
    [null],
    ['nope'],
    [42],
    [{ q1: 'not-an-object' }],
    [{ q1: { via: 'option' } }],
  ])('degrades malformed %p to an empty/partial map without throwing', (bad) => {
    expect(() => parseQuestionResolutions(bad)).not.toThrow()
    // A card with no answer string is dropped.
    const parsed = parseQuestionResolutions(bad)
    expect(Object.values(parsed).every((r) => typeof r.answer === 'string')).toBe(true)
  })
})

// ── Render helpers ───────────────────────────────────────────────────────────

function questionMessage(id: string, toolCallId: string, question: string, branch: string) {
  return {
    id,
    parts: [
      {
        type: ASK_QUESTION_TYPE,
        toolCallId,
        state: 'input-available',
        input: { question, options: ['a', 'b'], branch },
      } as QuestionPartLike,
    ],
  }
}

describe('isRenderableQuestion', () => {
  it('is false while the input is still streaming', () => {
    expect(
      isRenderableQuestion({
        type: ASK_QUESTION_TYPE,
        toolCallId: 'q1',
        state: 'input-streaming',
        input: {},
      })
    ).toBe(false)
  })
  it('is true once question + options are parsed', () => {
    expect(
      isRenderableQuestion({
        type: ASK_QUESTION_TYPE,
        toolCallId: 'q1',
        state: 'input-available',
        input: { question: 'q', options: ['a', 'b'], branch: 'b' },
      })
    ).toBe(true)
  })
})

describe('openQuestionIds — the still-open branches', () => {
  const messages = [
    questionMessage('m1', 'q1', 'What kiln?', 'kiln type'),
    questionMessage('m2', 'q2', 'What budget?', 'budget'),
  ]

  it('lists cards with no recorded answer', () => {
    expect(openQuestionIds(messages, {})).toEqual(['q1', 'q2'])
  })
  it('drops answered cards', () => {
    expect(openQuestionIds(messages, { q1: { answer: 'gas', via: 'option' } })).toEqual(['q2'])
  })
  it('excludes prior-session cards so they never read as forever-open', () => {
    expect(openQuestionIds(messages, {}, new Set(['m1']))).toEqual(['q2'])
  })
})

describe('briefOpenQuestions — mirror to the Brief on dissolve', () => {
  const messages = [
    questionMessage('m1', 'q1', 'What kind of kiln?', 'kiln type'),
    questionMessage('m2', 'q2', 'What budget tier?', 'budget'),
  ]

  it('emits one branch-labelled line per UNANSWERED card', () => {
    expect(briefOpenQuestions(messages, {})).toEqual([
      'kiln type: What kind of kiln?',
      'budget: What budget tier?',
    ])
  })
  it('omits answered branches', () => {
    expect(briefOpenQuestions(messages, { q1: { answer: 'gas', via: 'option' } })).toEqual([
      'budget: What budget tier?',
    ])
  })
})
