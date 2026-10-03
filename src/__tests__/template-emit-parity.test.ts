/**
 * The emit-vocabulary parity guard (#261, folding in ADR 0007's planned "228f" sweep
 * as a test rather than a one-off pass — a pass can be forgotten, a guard cannot).
 *
 * ADR 0006 names the thing most easily missed: *a block absent from the emit union is
 * a block Pond cannot use.* Two of the three slices before this one shipped a bug in
 * exactly this area (#258 made `label` writable but not readable; #219 nearly lost
 * `marker` on a wholesale re-emit). So the guard asserts BOTH directions:
 *
 *   1. membership — `moduleDescriptors`' keys are exactly `moduleDataSchema`'s types
 *      PLUS the declared, documented exclusions (`NON_EMITTABLE_MODULES`), with no
 *      overlap and no stale entry. A ninth module fails here unless someone declares
 *      it non-emittable and says why — no hand-kept skip list;
 *   2. survival — every field the twelve templates set survives the strip → hydrate
 *      round trip AND reaches the model through `serialize`, so a wholesale re-emit
 *      cannot flatten a template's block back into a plainer one.
 */
import { moduleDescriptors, resolveDescriptor } from '@/lib/modules/registry'
import { moduleDataSchema, NON_EMITTABLE_MODULES } from '@/lib/modules/ai-composition'
import { blockLabel } from '@/lib/modules/types'
import { hydrateBlock } from '@/lib/modules/hydrate'
import { TEMPLATE_KINDS } from '@/lib/templates/types'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { instantiateTemplate } from '@/lib/templates/instantiate'

const registryTypes = Object.keys(moduleDescriptors).sort()
const emitTypes = moduleDataSchema.options.map((o) => o.shape.type.value as string).sort()
const excluded = Object.keys(NON_EMITTABLE_MODULES).sort()

const counter = () => {
  let n = 0
  return () => `m-${++n}`
}

describe('registry ↔ emit union membership', () => {
  it('the registry is exactly the emit union plus the declared exclusions', () => {
    expect([...emitTypes, ...excluded].sort()).toEqual(registryTypes)
  })

  it('no type is both emittable and excluded', () => {
    expect(emitTypes.filter((t) => excluded.includes(t))).toEqual([])
  })

  it('no exclusion is stale — each names a registered module and gives a reason', () => {
    for (const [type, reason] of Object.entries(NON_EMITTABLE_MODULES)) {
      expect(registryTypes).toContain(type)
      expect(typeof reason).toBe('string')
      expect(reason.length).toBeGreaterThan(0)
    }
  })

  it('`page` is the one exclusion today, for the reason ai-composition.ts states', () => {
    expect(excluded).toEqual(['page'])
  })
})

describe('every block type the twelve templates use is registered AND emittable', () => {
  const used = new Set<string>()
  for (const kind of TEMPLATE_KINDS) {
    for (const block of PREMADE_TEMPLATES[kind].blocks) used.add(block.type)
  }

  it('uses a real subset of the vocabulary', () => {
    expect(used.size).toBeGreaterThan(0)
    for (const type of used) {
      expect(registryTypes).toContain(type)
      expect(emitTypes).toContain(type)
      expect(excluded).not.toContain(type)
    }
  })

  it('covers text, todo, table, view, highlight and entries — the twelve exercise six of the seven', () => {
    expect([...used].sort()).toEqual(['entries', 'highlight', 'table', 'text', 'todo', 'view'])
  })
})

describe('every field the twelve set survives strip → hydrate, and reaches the model', () => {
  for (const kind of TEMPLATE_KINDS) {
    const page = instantiateTemplate(PREMADE_TEMPLATES[kind], counter())

    it.each(page.blocks.map((b, i) => [i, b.type, b] as const))(
      `${kind} block %i (%s) round-trips through moduleDataSchema and re-hydrates equal`,
      (_i, _type, block) => {
        // strip: the emit union drops every id and keeps every other field.
        const parsed = moduleDataSchema.safeParse(block)
        expect(parsed.success).toBe(true)
        if (!parsed.success) return
        const stripped = parsed.data as Record<string, unknown>
        expect('id' in stripped).toBe(false)
        // hydrate: minting ids back yields the SAME block, field for field.
        let n = 0
        const again = hydrateBlock(stripped, block.id, () => `re-${n++}`)
        expect(again).not.toBeNull()
        const withoutNestedIds = (b: unknown) =>
          JSON.parse(JSON.stringify(b, (k, v) => (k === 'id' ? undefined : v)))
        expect(withoutNestedIds(again)).toEqual(withoutNestedIds(block))
      }
    )

    it(`${kind}: labels, markers, serif and presentation reach serialize()`, () => {
      for (const block of page.blocks) {
        const text = resolveDescriptor(block.type).serialize(block)
        const label = blockLabel(block)
        if (label) expect(text.startsWith(`${label}:`)).toBe(true)
        if (block.type === 'todo' && block.marker === 'dot') expect(text).toContain('List:')
        if (block.type === 'todo' && block.marker === 'none') expect(text).toContain('(no marker)')
        if (block.type === 'entries' && block.serif) expect(text).toContain('(serif)')
        if (block.type === 'view' && block.chart?.presentation === 'compact') {
          expect(text).toContain('compact')
          expect(text).toContain(block.chart.kind)
        }
        if (block.type === 'table') expect(text).toContain(`${block.title} — `)
      }
    })
  }
})
