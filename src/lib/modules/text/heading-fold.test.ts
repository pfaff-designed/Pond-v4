import type { Block } from '../content'
import { hiddenBlockIds } from './heading-fold'

function heading(id: string, level: number, options: { toggle?: boolean; folded?: boolean } = {}): Block {
  return { id, type: 'text', content: `${'#'.repeat(level)} ${id}`, ...options }
}

function paragraph(id: string): Block {
  return { id, type: 'text', content: id }
}

describe('hiddenBlockIds', () => {
  it.each<[string, Block[], string[]]>([
    ['no toggle: nothing is hidden', [heading('h1', 1), paragraph('p1')], []],
    [
      'an unfolded toggle: nothing is hidden',
      [heading('h1', 1, { toggle: true, folded: false }), paragraph('p1')],
      [],
    ],
    [
      'a folded toggle hides until the next same-level heading',
      [heading('h1', 1, { toggle: true, folded: true }), paragraph('p1'), heading('h2', 1)],
      ['p1'],
    ],
    [
      'a folded toggle hides until a higher-level (shallower) heading',
      [heading('h1', 2, { toggle: true, folded: true }), paragraph('p1'), heading('h2', 1)],
      ['p1'],
    ],
    [
      'a folded toggle with no ending heading hides to the end of the page',
      [heading('h1', 1, { toggle: true, folded: true }), paragraph('p1'), paragraph('p2')],
      ['p1', 'p2'],
    ],
    [
      'a folded heading nested inside another folded heading stays hidden both ways',
      [
        heading('outer', 1, { toggle: true, folded: true }),
        heading('inner', 2, { toggle: true, folded: true }),
        paragraph('p1'),
      ],
      ['inner', 'p1'],
    ],
    [
      "an unfolded nested toggle's children stay hidden under the outer fold",
      [
        heading('outer', 1, { toggle: true, folded: true }),
        heading('inner', 2, { toggle: true, folded: false }),
        paragraph('p1'),
      ],
      ['inner', 'p1'],
    ],
  ])('%s', (_description, blocks, expectedHiddenIds) => {
    expect(hiddenBlockIds(blocks)).toEqual(new Set(expectedHiddenIds))
  })

  it("a folded toggle heading's own row is never hidden by its own fold", () => {
    const blocks = [heading('h1', 1, { toggle: true, folded: true }), paragraph('p1')]
    expect(hiddenBlockIds(blocks).has('h1')).toBe(false)
  })
})
