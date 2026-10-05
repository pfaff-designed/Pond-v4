/**
 * `templateSummary` — `6i` frame 3's "what this template will contain" line.
 *
 * The board writes one example of it, so that exact string is the headline test:
 * if the page it describes produces it, the naming rule is right.
 */

import { templateSummary, blockWord } from '@/lib/templates/summary'
import type { Block } from '@/lib/modules/content'

const text = (content: string, label?: string) =>
  ({ id: `t-${content.slice(0, 6)}`, type: 'text', content, ...(label ? { label } : {}) }) as Block

describe('templateSummary — the board’s own line', () => {
  /**
   * `6i` frame 3 draws, for the recipe page it is saving:
   *
   *     6 blocks — big number, list, checklist, heading, text, entry log
   *
   * The page: a big-number view (`25m`), an `ingredients` list, a `method`
   * checklist, then the heading and the line about wine that frame 1 adds by
   * hand, and an entry log.
   */
  it('reproduces it exactly from the page the board is saving', () => {
    const page: Block[] = [
      { id: 'b1', type: 'view', mode: 'big-number', collectionId: 'c1' } as Block,
      { id: 'b2', type: 'todo', label: 'ingredients', marker: 'dot', items: [] } as Block,
      { id: 'b3', type: 'todo', label: 'method', marker: 'check', items: [] } as Block,
      text('## with this, drink'),
      text('a chilled white, nothing oaked'),
      { id: 'b6', type: 'entries', label: 'log', entries: [] } as Block,
    ]
    expect(templateSummary(page)).toBe(
      '6 blocks — big number, list, checklist, heading, text, entry log'
    )
  })
})

describe('blockWord — each block’s name', () => {
  // The two frame kinds the board writes differently from their slug, and the
  // bare-prose split that `modules/palette.ts` already rules.
  it.each([
    [
      'a big-number view is “big number”, not “number”',
      { id: 'v', type: 'view', mode: 'big-number' },
      'big number',
    ],
    [
      'an entries block is “entry log”, not “log”',
      { id: 'e', type: 'entries', entries: [] },
      'entry log',
    ],
    [
      'a table is already its own word',
      { id: 't', type: 'table', columns: ['a'], rows: [] },
      'table',
    ],
    [
      'a board takes no card, so it is named by its mode',
      { id: 'b', type: 'view', mode: 'board' },
      'board',
    ],
    [
      'a gallery view is already its own word',
      { id: 'g', type: 'view', mode: 'gallery' },
      'gallery',
    ],
  ])('%s', (_name, block, word) => {
    expect(blockWord(block as Block)).toBe(word)
  })

  it.each([
    ['## a line that names what follows', 'heading'],
    ['# top level still counts', 'heading'],
    ['###### and the sixth', 'heading'],
    ['a chilled white, nothing oaked', 'text'],
    ['#hashtag is not a heading — no space', 'text'],
    ['  ## indented still opens on one', 'heading'],
  ])('bare prose %j → %s', (content, word) => {
    expect(blockWord(text(content))).toBe(word)
  })

  it('a view whose mode is not a real ViewMode still gets a word, never undefined', () => {
    // `blockFrame` returns a shaped-but-kindless frame for an unknown mode. The
    // line falls back to the block's type rather than rendering `undefined`.
    expect(blockWord({ id: 'x', type: 'view', mode: 'nonsense' } as unknown as Block)).toBe('view')
  })

  it('a LABELLED text block is a card, not bare prose, so it takes its frame kind', () => {
    // `bare = k === 'text' && !label` — with a label the block is the list card,
    // so it is named by the frame rather than by its prose.
    expect(blockWord(text('## still a heading inside', 'goal'))).toBe('list')
  })
})

describe('templateSummary — the line still draws on the edges', () => {
  it('says so for an empty page rather than trailing an em dash', () => {
    expect(templateSummary([])).toBe('no blocks yet')
  })

  it('is singular at one block', () => {
    expect(templateSummary([text('just the one')])).toBe('1 block — text')
  })

  it('keeps page order and repeats a kind as many times as it appears', () => {
    const page = [text('# a'), text('b'), text('# c')]
    expect(templateSummary(page)).toBe('3 blocks — heading, text, heading')
  })
})
