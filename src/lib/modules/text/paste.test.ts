import { Slice } from '@tiptap/pm/model'
import { proseSchema } from './document'
import { parseMarkdown } from './markdown'
import { looksLikeMarkdown, parseMarkdownPaste } from './paste'

const paragraphContext = () =>
  proseSchema
    .node('doc', null, [proseSchema.node('paragraph', null, [proseSchema.text('x')])])
    .resolve(1)

const codeBlockContext = () =>
  proseSchema
    .node('doc', null, [proseSchema.node('codeBlock', null, [proseSchema.text('x')])])
    .resolve(1)

describe('looksLikeMarkdown', () => {
  it('detects a heading line', () => {
    expect(looksLikeMarkdown('# Title')).toBe(true)
    expect(looksLikeMarkdown('## Subtitle')).toBe(true)
  })

  it('detects a bullet line', () => {
    expect(looksLikeMarkdown('- one\n- two')).toBe(true)
    expect(looksLikeMarkdown('* one')).toBe(true)
  })

  it('detects an ordered list line', () => {
    expect(looksLikeMarkdown('1. first')).toBe(true)
  })

  it('detects a blockquote line', () => {
    expect(looksLikeMarkdown('> quoted')).toBe(true)
  })

  it('detects a fence', () => {
    expect(looksLikeMarkdown('```\ncode\n```')).toBe(true)
    expect(looksLikeMarkdown('~~~\ncode\n~~~')).toBe(true)
  })

  it('detects bold', () => {
    expect(looksLikeMarkdown('soak **overnight** before cooking')).toBe(true)
  })

  it('detects italic underscores', () => {
    expect(looksLikeMarkdown('soak _overnight_ before cooking')).toBe(true)
  })

  it('detects a link', () => {
    expect(looksLikeMarkdown('see [the doc](https://example.com)')).toBe(true)
  })

  it('does not flag plain prose with none of the signals', () => {
    expect(looksLikeMarkdown('soak the beans overnight before cooking them')).toBe(false)
    expect(looksLikeMarkdown('a snake_case_name is not italic')).toBe(false)
  })

  it('does not flag an empty string', () => {
    expect(looksLikeMarkdown('')).toBe(false)
  })
})

describe('parseMarkdownPaste', () => {
  it('returns undefined when the text does not look like markdown', () => {
    const result = parseMarkdownPaste('just some prose', paragraphContext())
    expect(result).toBeUndefined()
  })

  it('returns undefined inside a code block, even for markdown-looking text', () => {
    const result = parseMarkdownPaste('# Title', codeBlockContext())
    expect(result).toBeUndefined()
  })

  it('returns an open slice built from parseMarkdown for inline markdown that merges into the current line', () => {
    const text = 'soak **overnight** before cooking'
    const result = parseMarkdownPaste(text, paragraphContext())
    expect(result).toBeInstanceOf(Slice)
    expect(result?.eq(Slice.maxOpen(parseMarkdown(text).content))).toBe(true)
  })

  it('returns a start- and end-closed slice for markdown whose first and last blocks are not paragraphs', () => {
    const text = '# Title\n\n- one\n- two'
    const result = parseMarkdownPaste(text, paragraphContext())
    expect(result).toBeInstanceOf(Slice)
    const content = parseMarkdown(text).content
    expect(result?.eq(new Slice(content, 0, 0))).toBe(true)
  })
})
