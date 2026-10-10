import type { Node as ProseNode } from '@tiptap/pm/model'
import { proseSchema } from './document'
import { parseMarkdown } from './markdown'
import { opensSlashLine, slashLineAt, splitAtSlashLine, type SlashLine } from './slash-line'
import type { Block } from '../content'
import type { TextBlock } from './schema'

/** A position inside the doc's top-level child at `index`. */
const inside = (doc: ProseNode, index: number): number => {
  let at = -1
  doc.forEach((_node, offset, i) => {
    if (i === index) at = offset + 1
  })
  return at
}

describe('slashLineAt — the `/` line under the caret', () => {
  it('reports the line, its query and the markdown on either side', () => {
    const doc = parseMarkdown('## method\n\n/check\n\nsoak overnight')
    expect(slashLineAt(doc, inside(doc, 1))).toEqual({
      before: '## method',
      markdown: '/check',
      after: 'soak overnight',
      query: 'check',
    })
  })

  it('a line at the top or the foot has nothing on that side', () => {
    const top = parseMarkdown('/\n\nsoak overnight')
    expect(slashLineAt(top, inside(top, 0))).toMatchObject({ before: '', after: 'soak overnight' })
    const foot = parseMarkdown('soak overnight\n\n/ta')
    expect(slashLineAt(foot, inside(foot, 1))).toMatchObject({
      before: 'soak overnight',
      after: '',
      query: 'ta',
    })
  })

  it('a block that is only the `/` line is not a split: the empty-block path owns it', () => {
    const doc = parseMarkdown('/')
    expect(slashLineAt(doc, inside(doc, 0))).toBeNull()
  })

  it('reports nothing where the caret’s line does not start with `/`', () => {
    const doc = parseMarkdown('soak overnight\n\nsimmer / stir')
    expect(slashLineAt(doc, inside(doc, 1))).toBeNull()
  })

  it('reports nothing inside a list or a heading: only a plain line splits the block', () => {
    const list = parseMarkdown('intro\n\n- /item')
    // Inside the list item's paragraph.
    expect(slashLineAt(list, inside(list, 1) + 2)).toBeNull()
    const heading = parseMarkdown('intro\n\n## /title')
    expect(slashLineAt(heading, inside(heading, 1))).toBeNull()
  })
})

describe('opensSlashLine — `/` typed at the start of an empty line', () => {
  /** Empty lines included: markdown has no way to write one, the editor does. */
  const docOf = (lines: (string | null)[]): ProseNode =>
    proseSchema.node(
      'doc',
      null,
      lines.map((text) => proseSchema.node('paragraph', null, text ? [proseSchema.text(text)] : []))
    )

  it('opens when the line was empty and is now exactly `/`', () => {
    const was = docOf(['soak overnight', null])
    const now = docOf(['soak overnight', '/'])
    expect(opensSlashLine(was, now, inside(now, 1))).toBe(true)
  })

  it('does not open on a `/` typed before existing text', () => {
    const was = docOf(['soak overnight', 'stir'])
    const now = docOf(['soak overnight', '/stir'])
    expect(opensSlashLine(was, now, inside(now, 1))).toBe(false)
  })

  it('does not open while the query is typed after the slash', () => {
    const was = docOf(['soak overnight', '/'])
    const now = docOf(['soak overnight', '/c'])
    expect(opensSlashLine(was, now, inside(now, 1))).toBe(false)
  })

  it('does not open on a block that is only the `/` line', () => {
    expect(opensSlashLine(docOf([null]), docOf(['/']), 1)).toBe(false)
  })
})

describe('splitAtSlashLine — the block around the line, with the pick in its place', () => {
  const block: TextBlock = {
    id: 'b-text',
    type: 'text',
    content: '## method\n\n/check\n\nsoak overnight',
    label: 'notes',
  }
  const line: SlashLine = {
    before: '## method',
    markdown: '/check',
    after: 'soak overnight',
    query: 'check',
  }
  const picked: Block = { id: 'todo-1', type: 'todo', items: [] }
  const ids = () => {
    let n = 0
    return () => `new-${++n}`
  }

  it('middle: the prose above keeps the block’s id and label; the pick and the prose below are new', () => {
    const { blocks, inserted } = splitAtSlashLine(block, line, picked, ids())
    expect(blocks).toEqual([
      { id: 'b-text', type: 'text', content: '## method', label: 'notes' },
      picked,
      { id: 'new-1', type: 'text', content: 'soak overnight' },
    ])
    expect(inserted).toBe(picked)
  })

  it('nothing above: the prose below takes the block’s id and label', () => {
    const { blocks } = splitAtSlashLine(block, { ...line, before: '' }, picked, ids())
    expect(blocks).toEqual([
      picked,
      { id: 'b-text', type: 'text', content: 'soak overnight', label: 'notes' },
    ])
  })

  it('nothing below: no empty block is made', () => {
    const { blocks } = splitAtSlashLine(block, { ...line, after: '' }, picked, ids())
    expect(blocks).toEqual([
      { id: 'b-text', type: 'text', content: '## method', label: 'notes' },
      picked,
    ])
  })

  it('nothing either side: the pick replaces the block, taking its id and label', () => {
    const { blocks, inserted } = splitAtSlashLine(
      block,
      { ...line, before: '', after: '' },
      picked,
      ids()
    )
    const replacing = { ...picked, id: 'b-text', label: 'notes' }
    expect(blocks).toEqual([replacing])
    expect(inserted).toEqual(replacing)
  })

  it('with nothing to insert, only the `/` line goes', () => {
    expect(splitAtSlashLine(block, line, null, ids()).blocks).toEqual([
      { id: 'b-text', type: 'text', content: '## method', label: 'notes' },
      { id: 'new-1', type: 'text', content: 'soak overnight' },
    ])
    expect(splitAtSlashLine(block, { ...line, before: '', after: '' }, null, ids()).blocks).toEqual(
      []
    )
  })
})
