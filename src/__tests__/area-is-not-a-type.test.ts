/**
 * #108 — "area" is not a type.
 *
 * Design law (`wayfinder/design_handoff_pond/Pond 03 Concepts.dc.html`, data model
 * draft 3): "area — a page with pages inside it. It has NO TECHNICAL MEANING; it is
 * how a person thinks about their pond." So the AI surface must not offer an area
 * type, and must still be able to make one the only way there is: a page with pages
 * nested under it.
 *
 * These pin the AI-facing half of the change (the tool enum + the routing coaching);
 * the migration is proven in `drop-area-type.pglite.test.ts`, the counting rule in
 * `overview-model.test.ts`, and the rail/surface rules in `rail-tree.test.ts` /
 * `document-panel-blocks.test.tsx`.
 */

import { createPageTool } from '@/app/api/chat/tools'
import { SYSTEM_PROMPT } from '@/app/api/chat/prompt'
import { parseActionCard } from '@/lib/nodes/create'

const parse = (input: unknown) => createPageTool.inputSchema.safeParse(input)

const base = { title: 'Travel', blocks: [] as unknown[] }

describe('create_page no longer accepts an area type', () => {
  it('rejects type: "area"', () => {
    expect(parse({ ...base, type: 'area' }).success).toBe(false)
  })

  it('accepts every surviving kind tag', () => {
    for (const type of ['page', 'project', 'routine', 'action']) {
      expect(parse({ ...base, type }).success).toBe(true)
    }
  })

  it('never offers "area" in the enum the model sees', () => {
    const shape = createPageTool.inputSchema.safeParse({ ...base, type: 'area' })
    expect(shape.success).toBe(false)
    expect(JSON.stringify(createPageTool.inputSchema.shape.type)).not.toContain('"area"')
  })

  it('still lets the model create a NESTED page — the only way an area is made', () => {
    const nested = parse({
      ...base,
      type: 'page',
      title: 'Kyoto trip',
      parentTitle: 'Travel',
    })
    expect(nested.success).toBe(true)
    expect(nested.success && nested.data.parentTitle).toBe('Travel')
  })

  it('still carries a human page-kind label alongside the coarse type', () => {
    const withKind = parse({ ...base, type: 'page', title: 'Lasagna', kind: 'recipe' })
    expect(withKind.success).toBe(true)
    expect(withKind.success && withKind.data.kind).toBe('recipe')
  })
})

describe('the model is re-coached that area-ness is emergent', () => {
  it('the create_page tool description says an area is a page with pages inside it', () => {
    expect(createPageTool.description).toContain('page that has pages inside it')
  })

  it('the system prompt forbids reaching for an area type', () => {
    expect(SYSTEM_PROMPT).toContain("There is NO 'area' type")
  })
})

describe('the save-extract action card drops its area shape', () => {
  it('parses a page card and refuses an area card', () => {
    expect(parseActionCard(JSON.stringify({ type: 'page', name: 'Travel' }))).toEqual({
      type: 'page',
      name: 'Travel',
    })
    expect(parseActionCard(JSON.stringify({ type: 'area', name: 'Travel' }))).toBeNull()
  })
})
