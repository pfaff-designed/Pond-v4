import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { HEADING_PREFIX } from '@/lib/modules/palette'
import { parseMarkdown, serializeMarkdown } from './markdown'

const roundTrip = (markdown: string): string => serializeMarkdown(parseMarkdown(markdown))

/** Adds unformatted `typed` at the very end of the last textblock. */
const typeAtEnd = (markdown: string, typed: string): string => {
  const state = EditorState.create({ doc: parseMarkdown(markdown) })
  const end = TextSelection.atEnd(state.doc).from
  return serializeMarkdown(state.tr.insert(end, state.schema.text(typed)).doc)
}

const childTypes = (node: ProseNode): string[] => {
  const types: string[] = []
  node.forEach((child) => types.push(child.type.name))
  return types
}

const marksOf = (doc: ProseNode, text: string): string[] => {
  let found: string[] = []
  doc.descendants((node) => {
    if (node.isText && node.text === text) found = node.marks.map((m) => m.type.name)
  })
  return found
}

/**
 * Every text-block body the repo already writes or renders: the block stories, the
 * panel/canvas tests, the premade templates and the page sample. Each is already in
 * the serializer's normal form, so it must come back byte-for-byte.
 */
const CANONICAL = [
  'Notes on the workbench build',
  'Consistency beats intensity',
  'Welcome to my life',
  '## Warm-up\n\nStart with **light cardio**, then reach for the `foam roller`.',
  'See [the plans](https://example.com/plans) before cutting.',
  'Out of the flat by the 14th, with every box labelled by room.',
  'A shelf above the desk for the radio. Ask about the allotment waiting list.',
  'electrician — provisional, w/c 29 sep',
  'type, or / for blocks and templates',
  'anything, in any order',
  'Base build week — hold easy pace on the long run.',
  'chickpeas, harissa',
  '# Website Redesign',
  // A single newline is a line, not a soft wrap.
  'milk\neggs\nbread',
  '- chickpeas\n- harissa\n- lemon',
  '1. soak\n2. simmer\n3. season',
  '- rooms\n  - kitchen\n  - back room',
  '> Needs more salt than you think.',
  '*slowly* and **then all at once**',
  '~~provisional~~ confirmed',
  'before\n\n---\n\nafter',
  '```ts\nconst kcal = 1040\n```',
  'see https://example.com/plans for the drawings',
  '### Sunday\n\nSlept badly.\n\n#### notes\n\n##### small\n\n###### eyebrow',
]

describe('text block markdown — the editor round-trip', () => {
  it.each(CANONICAL)('markdown in → markdown out is byte-stable: %j', (markdown) => {
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it.each(CANONICAL.filter((md) => !md.startsWith('```') && !md.endsWith('---')))(
    'markdown in → edit → markdown out changes only the edit: %j',
    (markdown) => {
      expect(typeAtEnd(markdown, ' Go.')).toBe(`${markdown} Go.`)
    }
  )

  it('the slash a person types is the query, never escaped', () => {
    expect(roundTrip('/')).toBe('/')
    expect(roundTrip('/check')).toBe('/check')
    expect(typeAtEnd('', '/')).toBe('/')
  })

  it('an empty block is the empty string, and a minted heading keeps its marker', () => {
    expect(roundTrip('')).toBe('')
    expect(roundTrip(HEADING_PREFIX)).toBe(HEADING_PREFIX)
    const doc = parseMarkdown(HEADING_PREFIX)
    expect(childTypes(doc)).toEqual(['heading'])
    expect(doc.firstChild?.attrs.level).toBe(2)
    expect(typeAtEnd(HEADING_PREFIX, 'warm-up')).toBe('## warm-up')
  })

  /**
   * Source that is not in normal form settles on the first pass and never moves
   * again, so a block's content only changes when the person edits it.
   */
  it.each([
    ['# Lasagna\nA hearty weeknight classic.', '# Lasagna\n\nA hearty weeknight classic.'],
    ['_soaked_ overnight', '*soaked* overnight'],
    ['* one\n* two', '* one\n* two'],
    ['- one\n\n- two', '- one\n\n- two'],
    ['line one  \nline two', 'line one\nline two'],
    ['a\n\n\n\nb', 'a\n\nb'],
    ['<https://example.com>', 'https://example.com'],
    // A text block has no image node: the `!` is escaped so it stays a `!` beside a link.
    ['![plan](https://example.com/p.png)', '\\![plan](https://example.com/p.png)'],
  ])('normalises %j once, then holds', (markdown, settled) => {
    expect(roundTrip(markdown)).toBe(settled)
    expect(roundTrip(settled)).toBe(settled)
  })

  it('headings, lists, bold, italic and links become structure, not syntax', () => {
    const doc = parseMarkdown(
      '## Warm-up\n\n- **light** cardio\n- *slow* stretch\n\n1. [plans](https://example.com)'
    )
    expect(childTypes(doc)).toEqual(['heading', 'bulletList', 'orderedList'])
    expect(doc.textContent).not.toMatch(/[#*[\]]/)
    expect(marksOf(doc, 'light')).toEqual(['bold'])
    expect(marksOf(doc, 'slow')).toEqual(['italic'])
    expect(marksOf(doc, 'plans')).toEqual(['link'])
  })

  it('a bare web address or email reads as a link and writes back bare', () => {
    const doc = parseMarkdown('https://example.com/a_b or ana@example.com')
    expect(marksOf(doc, 'https://example.com/a_b')).toEqual(['link'])
    expect(marksOf(doc, 'ana@example.com')).toEqual(['link'])
    expect(serializeMarkdown(doc)).toBe('https://example.com/a_b or ana@example.com')
  })

  it('an address without its scheme is not guessed at — a file name stays text', () => {
    expect(marksOf(parseMarkdown('see notes.md'), 'see notes.md')).toEqual([])
    expect(roundTrip('see notes.md')).toBe('see notes.md')
  })

  it('syntax a text block has no structure for survives as its own text', () => {
    // Pipe tables are refused at the authoring gate; raw HTML is never markup.
    // Both keep their characters rather than silently dropping content.
    expect(roundTrip('| a | b |\n| --- | --- |')).toBe('| a | b |\n| --- | --- |')
    expect(roundTrip('<b>bold</b>')).toBe('<b>bold</b>')
  })

  it('literal markdown characters typed as text are escaped, so they stay text', () => {
    const state = EditorState.create({ doc: parseMarkdown('') })
    const doc = state.tr.insertText('2 * 3 = 6, not **bold**').doc
    const markdown = serializeMarkdown(doc)
    expect(markdown).toBe('2 \\* 3 = 6, not \\*\\*bold\\*\\*')
    expect(parseMarkdown(markdown).textContent).toBe('2 * 3 = 6, not **bold**')
  })
})
