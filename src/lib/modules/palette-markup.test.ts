import type { Node as ProseNode } from '@tiptap/pm/model'
import { TEXT_MARKUP } from './text/markup'
import { parseMarkdown, serializeMarkdown } from './text/markdown'

const childTypes = (node: ProseNode): string[] => {
  const types: string[] = []
  node.forEach((child) => types.push(child.type.name))
  return types
}

describe('TEXT_MARKUP — each /-row markdown string opens its node empty', () => {
  it.each([
    ['numbered-list', ['orderedList']],
    ['quote', ['blockquote']],
    ['code', ['codeBlock']],
    ['divider', ['horizontalRule']],
  ] as const)('%s parses to %j, as the doc\'s leading nodes, empty', (id, types) => {
    const doc = parseMarkdown(TEXT_MARKUP[id])
    expect(childTypes(doc)).toEqual(types)
    expect(doc.textContent).toBe('')
  })

  it('the quote and numbered-list markup opens on a nested, empty paragraph', () => {
    const quoteDoc = parseMarkdown(TEXT_MARKUP.quote)
    expect(childTypes(quoteDoc.firstChild as ProseNode)).toEqual(['paragraph'])

    const listDoc = parseMarkdown(TEXT_MARKUP['numbered-list'])
    expect(childTypes(listDoc.firstChild as ProseNode)).toEqual(['listItem'])
    expect(childTypes(listDoc.firstChild?.firstChild as ProseNode)).toEqual(['paragraph'])
  })

  it.each((['numbered-list', 'quote', 'code', 'divider'] as const))(
    '%s round-trips: a reload writes nothing new',
    (id) => {
      const markdown = TEXT_MARKUP[id]
      expect(serializeMarkdown(parseMarkdown(markdown))).toBe(markdown)
    }
  )
})
