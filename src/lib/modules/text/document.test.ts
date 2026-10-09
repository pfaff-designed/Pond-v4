import { getSchema } from '@tiptap/core'
import type { MarkSpec, NodeSpec, Schema } from '@tiptap/pm/model'
import { proseSchema } from './document'
import { proseExtensions } from './extensions'

/** A spec as data: what it declares, not how it renders or reads the DOM. */
const declared = (spec: NodeSpec | MarkSpec): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(spec).filter(
      ([key, value]) => typeof value !== 'function' && key !== 'parseDOM' && key !== 'toDOM'
    )
  )

const specsOf = (schema: Schema) => {
  const nodes: [string, Record<string, unknown>][] = []
  const marks: [string, Record<string, unknown>][] = []
  schema.spec.nodes.forEach((name, spec) => nodes.push([name, declared(spec)]))
  schema.spec.marks.forEach((name, spec) => marks.push([name, declared(spec)]))
  return { nodes, marks }
}

describe('the text block document schema', () => {
  it('is the editor’s schema exactly — same nodes, marks, attributes and order', () => {
    expect(specsOf(proseSchema)).toEqual(specsOf(getSchema(proseExtensions)))
  })
})
