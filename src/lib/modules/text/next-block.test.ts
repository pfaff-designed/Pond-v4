import { EditorState, NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import type { Node as ProseNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { proseSchema } from './document'
import { parseMarkdown } from './markdown'
import { enterSplit, leavesUpToTitle } from './next-block'

/** A position inside the doc's top-level child at `index`, offset by `into` characters from its start. */
const inside = (doc: ProseNode, index: number, into = 0): number => {
  let at = -1
  doc.forEach((_node, offset, i) => {
    if (i === index) at = offset + 1 + into
  })
  return at
}

/** The state Enter sees: `doc` with the caret (or selection `from`..`to`) at a position. */
const stateAt = (doc: ProseNode, from: number, to = from): EditorState =>
  EditorState.create({ doc, selection: TextSelection.create(doc, from, to) })

/** The state Enter sees with the caret at the deepest valid position at the end of `doc`. */
const stateAtEnd = (doc: ProseNode): EditorState =>
  EditorState.create({ doc, selection: Selection.atEnd(doc) })

describe('enterSplit — what a plain Enter does to a text block’s doc at the caret', () => {
  it('end of a paragraph: everything stays before, nothing after', () => {
    const doc = parseMarkdown('alpha beta')
    expect(enterSplit(stateAt(doc, inside(doc, 0, 'alpha beta'.length)))).toEqual({
      before: 'alpha beta',
      after: '',
    })
  })

  it('middle of a paragraph: splits at the caret', () => {
    const doc = parseMarkdown('alpha beta')
    expect(enterSplit(stateAt(doc, inside(doc, 0, 'alpha'.length)))).toEqual({
      before: 'alpha',
      after: ' beta',
    })
  })

  it('start of a non-empty paragraph: nothing before, everything after', () => {
    const doc = parseMarkdown('alpha beta')
    expect(enterSplit(stateAt(doc, inside(doc, 0)))).toEqual({
      before: '',
      after: 'alpha beta',
    })
  })

  it('end of a heading: everything stays before, nothing after', () => {
    const doc = parseMarkdown('## method')
    expect(enterSplit(stateAt(doc, inside(doc, 0, 'method'.length)))).toEqual({
      before: '## method',
      after: '',
    })
  })

  it('middle of a heading: the rest stays a heading, what a doc cut produces', () => {
    const doc = parseMarkdown('## method')
    expect(enterSplit(stateAt(doc, inside(doc, 0, 'met'.length)))).toEqual({
      before: '## met',
      after: '## hod',
    })
  })

  it('a non-empty list item: `own`, let ProseMirror add the next item', () => {
    const doc = parseMarkdown('- one\n- two')
    expect(enterSplit(stateAtEnd(doc))).toBe('own')
  })

  it('an empty last list item: the list ends before it, nothing after', () => {
    const doc = proseSchema.node('doc', null, [
      proseSchema.node('bulletList', { tight: true, bullet: '-' }, [
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('one')]),
        ]),
        proseSchema.node('listItem', null, [proseSchema.node('paragraph', null, [])]),
      ]),
    ])
    expect(enterSplit(stateAtEnd(doc))).toEqual({
      before: '- one',
      after: '',
    })
  })

  it('a code block: `own`, let ProseMirror insert a newline', () => {
    const doc = parseMarkdown('```\nconst a = 1\n```')
    expect(enterSplit(stateAt(doc, inside(doc, 0, 'const a = 1'.length)))).toBe('own')
  })

  it('an empty doc: `stay`, there is nothing to split', () => {
    const doc = parseMarkdown('')
    expect(enterSplit(stateAt(doc, inside(doc, 0)))).toBe('stay')
  })

  it('a doc with only one empty bullet item: `lift`, back to plain prose', () => {
    const doc = proseSchema.node('doc', null, [
      proseSchema.node('bulletList', { tight: true, bullet: '-' }, [
        proseSchema.node('listItem', null, [proseSchema.node('paragraph', null, [])]),
      ]),
    ])
    expect(enterSplit(stateAtEnd(doc))).toBe('lift')
  })

  it('a doc with only one empty ordered item: `lift`, back to plain prose', () => {
    const doc = proseSchema.node('doc', null, [
      proseSchema.node('orderedList', { tight: true, start: 1 }, [
        proseSchema.node('listItem', null, [proseSchema.node('paragraph', null, [])]),
      ]),
    ])
    expect(enterSplit(stateAtEnd(doc))).toBe('lift')
  })

  it('an empty blockquote: `lift`, back to plain prose', () => {
    const doc = parseMarkdown('> ')
    expect(enterSplit(stateAt(doc, 2))).toBe('lift')
  })

  it('two paragraphs, caret at the end of the first: after is the second paragraph', () => {
    const doc = parseMarkdown('alpha\n\nbeta')
    expect(enterSplit(stateAt(doc, inside(doc, 0, 'alpha'.length)))).toEqual({
      before: 'alpha',
      after: 'beta',
    })
  })

  it('a NodeSelection on a horizontal rule: `own`, let ProseMirror handle it', () => {
    const doc = parseMarkdown('alpha\n\n---\n\n---')
    const hrPositions: number[] = []
    doc.forEach((node, offset) => {
      if (node.type.name === 'horizontalRule') hrPositions.push(offset)
    })
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, hrPositions[1]),
    })
    expect(enterSplit(state)).toBe('own')
  })

  it('a doc ending in a horizontal rule, caret before it: the rule is not a cut artifact', () => {
    const doc = parseMarkdown('alpha\n\n---')
    expect(enterSplit(stateAt(doc, inside(doc, 0, 'alpha'.length)))).toEqual({
      before: 'alpha',
      after: '---',
    })
  })

  it('start of a blockquote: nothing before, everything after', () => {
    const doc = parseMarkdown('> alpha beta')
    expect(enterSplit(stateAt(doc, 2))).toEqual({
      before: '',
      after: '> alpha beta',
    })
  })

  it('middle of a blockquote: splits at the caret, the rest stays quoted', () => {
    const doc = parseMarkdown('> alpha beta')
    expect(enterSplit(stateAt(doc, 2 + 'alpha'.length))).toEqual({
      before: '> alpha',
      after: '>  beta',
    })
  })

  it('end of a blockquote: everything stays before, nothing after', () => {
    const doc = parseMarkdown('> alpha beta')
    expect(enterSplit(stateAt(doc, 2 + 'alpha beta'.length))).toEqual({
      before: '> alpha beta',
      after: '',
    })
  })

  it('an empty heading: `stay`, a labelled empty block stays too', () => {
    const doc = parseMarkdown('## ')
    expect(enterSplit(stateAt(doc, inside(doc, 0)))).toBe('stay')
  })

  it('a selection range spanning two paragraphs: the selected text is gone', () => {
    const doc = parseMarkdown('alpha\n\nbeta')
    const from = inside(doc, 0, 'al'.length)
    const to = inside(doc, 1, 'be'.length)
    expect(enterSplit(stateAt(doc, from, to))).toEqual({
      before: 'al',
      after: 'ta',
    })
  })

  it('an empty first list item: the list before it is empty, nothing lost after', () => {
    const doc = proseSchema.node('doc', null, [
      proseSchema.node('bulletList', { tight: true, bullet: '-' }, [
        proseSchema.node('listItem', null, [proseSchema.node('paragraph', null, [])]),
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('two')]),
        ]),
      ]),
    ])
    expect(enterSplit(EditorState.create({ doc, selection: Selection.atStart(doc) }))).toEqual({
      before: '',
      after: '- two',
    })
  })

  it('an empty middle list item: the items either side both survive', () => {
    const doc = proseSchema.node('doc', null, [
      proseSchema.node('bulletList', { tight: true, bullet: '-' }, [
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('one')]),
        ]),
        proseSchema.node('listItem', null, [proseSchema.node('paragraph', null, [])]),
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('three')]),
        ]),
      ]),
    ])
    let middlePos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.content.size === 0) middlePos = pos + 1
    })
    expect(enterSplit(stateAt(doc, middlePos))).toEqual({
      before: '- one',
      after: '- three',
    })
  })
})

/** A stand-in `EditorView`: real state, `endOfTextblock('up')` stubbed since jsdom has no layout. */
const viewAt = (doc: ProseNode, from: number, atTopVisualLine: boolean): EditorView =>
  ({
    state: stateAt(doc, from),
    endOfTextblock: (dir: string) => dir === 'up' && atTopVisualLine,
  }) as unknown as EditorView

describe('leavesUpToTitle — whether ArrowUp at the caret leaves the block for the title', () => {
  it('top of the first paragraph, nothing above it in the view: leaves', () => {
    const doc = parseMarkdown('alpha')
    expect(leavesUpToTitle(viewAt(doc, inside(doc, 0), true))).toBe(true)
  })

  it('a wrapped second visual line of the first paragraph: stays, even in index 0', () => {
    const doc = parseMarkdown('alpha')
    expect(leavesUpToTitle(viewAt(doc, inside(doc, 0, 'alpha'.length), false))).toBe(false)
  })

  it('the second paragraph, even if the view reports no line above it: stays', () => {
    const doc = parseMarkdown('alpha\n\nbeta')
    expect(leavesUpToTitle(viewAt(doc, inside(doc, 1), true))).toBe(false)
  })

  it('bullet list, item 2 start: stays, even though it shares top-level index 0', () => {
    const doc = proseSchema.node('doc', null, [
      proseSchema.node('bulletList', { tight: true, bullet: '-' }, [
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('a')]),
        ]),
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('b')]),
        ]),
      ]),
    ])
    let itemTwoStart = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'b') itemTwoStart = pos + 1
    })
    expect(leavesUpToTitle(viewAt(doc, itemTwoStart, true))).toBe(false)
  })

  it('ordered list, item 2 start: stays', () => {
    const doc = proseSchema.node('doc', null, [
      proseSchema.node('orderedList', { tight: true, start: 1 }, [
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('a')]),
        ]),
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('b')]),
        ]),
      ]),
    ])
    let itemTwoStart = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'b') itemTwoStart = pos + 1
    })
    expect(leavesUpToTitle(viewAt(doc, itemTwoStart, true))).toBe(false)
  })

  it('blockquote, second paragraph: stays', () => {
    const doc = proseSchema.node('doc', null, [
      proseSchema.node('blockquote', null, [
        proseSchema.node('paragraph', null, [proseSchema.text('alpha')]),
        proseSchema.node('paragraph', null, [proseSchema.text('beta')]),
      ]),
    ])
    let secondParagraphStart = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'beta') secondParagraphStart = pos + 1
    })
    expect(leavesUpToTitle(viewAt(doc, secondParagraphStart, true))).toBe(false)
  })

  it('bullet list, item 1 start, top visual line: leaves — it is the doc’s first textblock', () => {
    const doc = proseSchema.node('doc', null, [
      proseSchema.node('bulletList', { tight: true, bullet: '-' }, [
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('a')]),
        ]),
        proseSchema.node('listItem', null, [
          proseSchema.node('paragraph', null, [proseSchema.text('b')]),
        ]),
      ]),
    ])
    let itemOneStart = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'a') itemOneStart = pos + 1
    })
    expect(leavesUpToTitle(viewAt(doc, itemOneStart, true))).toBe(true)
  })

  it('a non-empty selection: stays, never leaves on a range', () => {
    const doc = parseMarkdown('alpha')
    const view = {
      state: stateAt(doc, inside(doc, 0), inside(doc, 0, 'alpha'.length)),
      endOfTextblock: (dir: string) => dir === 'up',
    } as unknown as EditorView
    expect(leavesUpToTitle(view)).toBe(false)
  })
})
