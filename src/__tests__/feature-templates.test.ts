/**
 * FEATURE — making a page from a template, end to end.
 *
 * The ONE live template path in the product is the `/` menu's `page from template ›
 * ↵ new nested page` (#278): `BlockCanvas.makeNestedPageFromTemplate` reads the kind
 * out of `PREMADE_TEMPLATES`, instantiates it, writes the page with `createPage` and,
 * for a collection template, writes its schema with `defineSchema`. This file drives
 * exactly that sequence against the shared fake Supabase and asserts the OUTCOME the
 * person gets: a nested page carrying the board's title, the board's blocks with ids,
 * and — only for the six collection shapes — a page schema its views actually point
 * at. BlockCanvas's own chrome (the `/…` command block going, the navigate, the
 * optimistic rail insert) is React and belongs to a `.test.tsx` / Storybook.
 *
 * Why these assertions and not more: the failures they catch are SILENT. A premade
 * template that quietly loses a block, or a collection page whose `_schema` never
 * lands, renders a page that looks finished and is empty where it matters — the view
 * blocks reference property ids that exist nowhere. And a prose template that DID
 * write a schema would silently turn `notes` into a collection.
 *
 * NOT covered here, because it is not built (see the report): nothing in production
 * writes the `madeFromTemplate` provenance stamp — `stampProvenance`, `applyKindLabel`
 * and the whole of `templates/client.ts` have zero callers. BlockCanvas says so in
 * its own comment ("the one-way provenance stamp … are #156's").
 */

import { blockSchema, type Block } from '@/lib/modules/content'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { createPage, defineSchema } from '@/lib/pages/client'
import { readSchema } from '@/lib/properties/schema'
import { instantiateTemplate, viewPropertyRefs } from '@/lib/templates/instantiate'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/templates/types'
import { makeFakeSupabase, type Row } from './helpers/fake-supabase'

/** The page the person was on when they typed `/`. */
const HOST: Row = {
  id: 'host',
  user_id: 'user-1',
  pond_id: 'pond-1',
  parent_id: null,
  type: 'page',
  title: 'the week',
  blocks: [],
  props: {},
  order: 0,
}

/**
 * `defineSchema` ends in a read-merge-write (`saveProps` → `update`), and the shared
 * fake covers insert / select / delete. Rather than fork the harness — three other
 * suites assert against it — this teaches the SAME `_pages` map the one missing verb
 * and records every table the path touches.
 */
function makeFake() {
  const sb = makeFakeSupabase([HOST])
  const tables: string[] = []
  const from = (table: string) => {
    tables.push(table)
    // The harness keys nothing off the table name (it holds `pages` alone), so the
    // name is recorded here rather than passed on.
    const builder = sb.from() as Record<string, unknown>
    const update = (patch: Record<string, unknown>) => {
      const ids: string[] = []
      const chain = {
        eq(column: string, value: string) {
          if (column === 'id') ids.push(value)
          return chain
        },
        then<T>(resolve: (v: { data: null; error: null }) => T) {
          for (const id of ids) {
            const row = sb._pages.get(id)
            if (row) sb._pages.set(id, { ...row, ...(patch as Partial<Row>) })
          }
          return Promise.resolve({ data: null, error: null }).then(resolve)
        },
      }
      return chain
    }
    return { ...builder, update }
  }
  return { ...sb, from: jest.fn(from), tables }
}

function counter() {
  let n = 0
  return () => `id-${++n}`
}

/** The production sequence, `BlockCanvas.makeNestedPageFromTemplate`, minus the React. */
async function newNestedPageFrom(sb: ReturnType<typeof makeFake>, kind: TemplateKind) {
  const made = instantiateTemplate(PREMADE_TEMPLATES[kind], counter())
  const created = await createPage(sb as never, 'user-1', {
    parentId: HOST.id,
    type: 'page',
    title: made.title,
    blocks: made.blocks,
    pondId: 'pond-1',
  })
  if (made.schema) await defineSchema(sb as never, created.id, made.schema)
  return sb._pages.get(created.id)!
}

const isView = (b: Block): b is ViewBlock => b.type === 'view'

describe('`/` › page from template › ↵ new nested page', () => {
  it.each(TEMPLATE_KINDS)(
    '%s lands as a nested page: the board’s title, its blocks with ids, and a schema its views point at',
    async (kind) => {
      const sb = makeFake()
      const page = await newNestedPageFrom(sb, kind)
      const template = PREMADE_TEMPLATES[kind]

      // Where it went, and what the person reads at the top of it.
      expect(page.parent_id).toBe(HOST.id)
      expect(page.type).toBe('page')
      expect(page.pond_id).toBe('pond-1')
      expect(page.title).toBe(template.title)

      // The blocks: the board's list, in order, each one persistable and identified.
      const blocks = page.blocks as Block[]
      expect(blocks.map((b) => b.type)).toEqual(template.blocks.map((b) => b.type))
      for (const block of blocks) {
        expect(blockSchema.safeParse(block).success).toBe(true)
        expect(block.id).toBeTruthy()
      }
      expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length)

      // The schema, for the six shapes whose page is a collection — and ONLY those:
      // a `_schema` on a prose template would silently make `notes` a collection.
      const schema = readSchema(page.props)
      if (!template.schema) {
        expect(schema).toBeNull()
      } else {
        expect(schema?.map((p) => p.name)).toEqual(template.schema.map((p) => p.name))
        // Every property a view block points at is one of THIS page's own, freshly
        // minted ids. A missing schema write, or a name the resolver dropped, leaves
        // a view pointing at nothing and drawing an empty frame with no error (#246).
        const own = new Set(schema!.map((p) => p.id))
        for (const ref of blocks.filter(isView).flatMap(viewPropertyRefs)) {
          expect(own.has(ref)).toBe(true)
        }
      }
    }
  )

  it('reads no template row for any of the twelve — they are code constants, not rows', async () => {
    const sb = makeFake()
    for (const kind of TEMPLATE_KINDS) await newNestedPageFrom(sb, kind)

    // A fresh pond has no `templates` rows (migration 0016 seeds none), so a path that
    // looked them up would offer the person nothing and fail silently per #155.
    expect([...new Set(sb.tables)]).toEqual(['pages'])
    expect([...sb._pages.values()].filter((p) => p.parent_id === HOST.id)).toHaveLength(
      TEMPLATE_KINDS.length
    )
  })
})
