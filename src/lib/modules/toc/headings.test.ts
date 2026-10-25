import { getHeadings } from './headings'
import type { Block } from '../content'

const text = (id: string, content: string): Block => ({ id, type: 'text', content })

describe('getHeadings', () => {
  it('reads levels 1-6', () => {
    const blocks: Block[] = [
      text('h1', '# one'),
      text('h2', '## two'),
      text('h3', '### three'),
      text('h4', '#### four'),
      text('h5', '##### five'),
      text('h6', '###### six'),
    ]
    expect(getHeadings(blocks)).toEqual([
      { id: 'h1', level: 1, text: 'one' },
      { id: 'h2', level: 2, text: 'two' },
      { id: 'h3', level: 3, text: 'three' },
      { id: 'h4', level: 4, text: 'four' },
      { id: 'h5', level: 5, text: 'five' },
      { id: 'h6', level: 6, text: 'six' },
    ])
  })

  it('ignores a `#` run with no space', () => {
    expect(getHeadings([text('a', '#nospace')])).toEqual([])
  })

  it('ignores a heading line that is only spaces after the hashes', () => {
    expect(getHeadings([text('a', '##   ')])).toEqual([])
  })

  it('strips inline emphasis to plain words', () => {
    const blocks: Block[] = [
      text('a', '# **bold** and *italic* and `code` and __under__ and _em_ and ~~gone~~'),
    ]
    expect(getHeadings(blocks)).toEqual([
      { id: 'a', level: 1, text: 'bold and italic and code and under and em and gone' },
    ])
  })

  it('ignores non-text blocks', () => {
    const blocks: Block[] = [
      text('a', '# kept'),
      { id: 'b', type: 'image', url: '' },
      { id: 'c', type: 'todo', items: [] },
    ]
    expect(getHeadings(blocks)).toEqual([{ id: 'a', level: 1, text: 'kept' }])
  })

  it('keeps document order', () => {
    const blocks: Block[] = [text('a', '# first'), text('b', 'plain prose'), text('c', '## second')]
    expect(getHeadings(blocks)).toEqual([
      { id: 'a', level: 1, text: 'first' },
      { id: 'c', level: 2, text: 'second' },
    ])
  })

  it('returns [] for an empty page', () => {
    expect(getHeadings([])).toEqual([])
  })

  it('only reads the first line of a multi-line text block', () => {
    expect(getHeadings([text('a', '# title\nmore prose below')])).toEqual([
      { id: 'a', level: 1, text: 'title' },
    ])
  })
})
