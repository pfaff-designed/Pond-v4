import type { Block } from '../content'
import { splitStoredText } from './split-stored'

type StoredTextBlock = Extract<Block, { type: 'text' }>

const textBlock = (
  id: string,
  content: string,
  extra: Partial<Omit<StoredTextBlock, 'id' | 'type' | 'content'>> = {}
): Block => ({
  id,
  type: 'text',
  content,
  ...extra,
})

describe('splitStoredText — a stored block, one handle per top-level markdown node', () => {
  it('plain paragraphs become one block each', () => {
    const blocks = [textBlock('a', 'alpha\n\nbeta')]
    expect(splitStoredText(blocks)).toEqual([
      { id: 'a', type: 'text', content: 'alpha' },
      { id: 'a-2', type: 'text', content: 'beta' },
    ])
  })

  it('a paragraph and a heading each get their own block', () => {
    const blocks = [textBlock('a', 'alpha\n\n## heading')]
    expect(splitStoredText(blocks)).toEqual([
      { id: 'a', type: 'text', content: 'alpha' },
      { id: 'a-2', type: 'text', content: '## heading' },
    ])
  })

  it('a list is one top-level node: it stays one block, alongside a paragraph', () => {
    const blocks = [textBlock('a', 'alpha\n\n- one\n- two')]
    expect(splitStoredText(blocks)).toEqual([
      { id: 'a', type: 'text', content: 'alpha' },
      { id: 'a-2', type: 'text', content: '- one\n- two' },
    ])
  })

  it('a code fence is one top-level node: it stays one block, alongside a paragraph', () => {
    const blocks = [textBlock('a', 'alpha\n\n```\nconst a = 1\n```')]
    expect(splitStoredText(blocks)).toEqual([
      { id: 'a', type: 'text', content: 'alpha' },
      { id: 'a-2', type: 'text', content: '```\nconst a = 1\n```' },
    ])
  })

  it('a divider gets its own block', () => {
    const blocks = [textBlock('a', 'alpha\n\n---')]
    expect(splitStoredText(blocks)).toEqual([
      { id: 'a', type: 'text', content: 'alpha' },
      { id: 'a-2', type: 'text', content: '---' },
    ])
  })

  it('empty lines between paragraphs make no empty blocks', () => {
    const blocks = [textBlock('a', 'alpha\n\n\n\nbeta')]
    expect(splitStoredText(blocks)).toEqual([
      { id: 'a', type: 'text', content: 'alpha' },
      { id: 'a-2', type: 'text', content: 'beta' },
    ])
  })

  it('an already-single block is returned as the SAME object', () => {
    const block = textBlock('a', 'alpha')
    expect(splitStoredText([block])).toEqual([block])
    expect(splitStoredText([block])[0]).toBe(block)
  })

  it('a labelled, half-width, row-start block keeps those fields only on the first part', () => {
    const block = textBlock('a', 'alpha\n\nbeta', {
      label: 'notes',
      width: '1/2',
      rowStart: true,
    })
    expect(splitStoredText([block])).toEqual([
      { id: 'a', type: 'text', content: 'alpha', label: 'notes', width: '1/2', rowStart: true },
      { id: 'a-2', type: 'text', content: 'beta' },
    ])
  })

  it('a legacy multi-line quote is one top-level node: it stays one block', () => {
    const block = textBlock('a', '> one\n>\n> two')
    expect(splitStoredText([block])).toEqual([block])
    expect(splitStoredText([block])[0]).toBe(block)
  })

  it('a hard break inside a paragraph stays inside it, alongside the next paragraph', () => {
    const blocks = [textBlock('a', 'alpha\nbreak\n\nbeta')]
    expect(splitStoredText(blocks)).toEqual([
      { id: 'a', type: 'text', content: 'alpha\nbreak' },
      { id: 'a-2', type: 'text', content: 'beta' },
    ])
  })

  it('a non-text block passes through unchanged, same object', () => {
    const block = { id: 'a', type: 'todo', content: 'alpha', done: false } as unknown as Block
    expect(splitStoredText([block])).toEqual([block])
    expect(splitStoredText([block])[0]).toBe(block)
  })

  it('a fully-empty block is returned as the SAME object', () => {
    const block = textBlock('a', '')
    expect(splitStoredText([block])).toEqual([block])
    expect(splitStoredText([block])[0]).toBe(block)
  })

  it('ids are deterministic across two calls', () => {
    const blocks = [textBlock('a', 'alpha\n\nbeta\n\ngamma')]
    const first = splitStoredText(blocks).map((b) => b.id)
    const second = splitStoredText(blocks).map((b) => b.id)
    expect(first).toEqual(['a', 'a-2', 'a-3'])
    expect(second).toEqual(first)
  })

  it('a derived id that would collide with a stored id skips to the next free one', () => {
    const blocks = [textBlock('x', 'a\n\nb'), textBlock('x-2', 'c')]
    expect(splitStoredText(blocks).map((b) => b.id)).toEqual(['x', 'x-3', 'x-2'])
  })

  it('two splittable blocks never mint the same derived id as each other', () => {
    const blocks = [textBlock('x', 'a\n\nb\n\nc'), textBlock('x-2', 'd\n\ne')]
    const ids = splitStoredText(blocks).map((b) => b.id)
    expect(ids).toEqual(['x', 'x-3', 'x-4', 'x-2', 'x-2-2'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a non-string content is passed through unchanged in production, never thrown', () => {
    const previousEnv = process.env.NODE_ENV
    // @ts-expect-error — test-only override of a readonly env var
    process.env.NODE_ENV = 'production'
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const block = textBlock('a', null as unknown as string)
      expect(() => splitStoredText([block])).not.toThrow()
      expect(splitStoredText([block])).toEqual([block])
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      // @ts-expect-error — test-only override of a readonly env var
      process.env.NODE_ENV = previousEnv
      errorSpy.mockRestore()
    }
  })

  it('a non-string content throws in development', () => {
    const previousEnv = process.env.NODE_ENV
    // @ts-expect-error — test-only override of a readonly env var
    process.env.NODE_ENV = 'development'
    try {
      const block = textBlock('a', null as unknown as string)
      expect(() => splitStoredText([block])).toThrow()
    } finally {
      // @ts-expect-error — test-only override of a readonly env var
      process.env.NODE_ENV = previousEnv
    }
  })
})
