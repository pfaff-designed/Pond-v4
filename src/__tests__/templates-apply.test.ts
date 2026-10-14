/**
 * `applyTemplate` (KAN-124): the pure builder that turns a template pick into the
 * page it becomes — reusing `instantiateTemplate` / `templateBlocksFrom` for the
 * blocks and `applyKindLabel` + `stampProvenance` for the `props` neither origin
 * wrote before this ticket (BlockCanvas's own comment said as much).
 */

import { applyTemplate } from '@/lib/templates/apply'
import { readProvenance } from '@/lib/templates/provenance'
import type { PondTemplate } from '@/lib/templates/types'
import type { Block } from '@/lib/modules/content'

/** Deterministic ids, so minted values are assertable. */
function counter() {
  let n = 0
  return () => `id${++n}`
}

describe('applyTemplate — premade, prose (no schema)', () => {
  it('instantiates the shape and stamps props with the kind and provenance', () => {
    const out = applyTemplate({ origin: 'premade', kind: 'notes' }, counter())

    expect(out.title).toBe('notes')
    expect(out.schema).toBeUndefined()
    expect(out.blocks).toHaveLength(1)
    expect(out.blocks[0]).toMatchObject({ type: 'text', content: '' })

    expect(out.props.kind).toBe('notes')
    expect(readProvenance(out.props)).toEqual({
      templateId: 'premade:notes',
      name: 'notes',
      at: expect.any(String),
    })
  })
})

describe('applyTemplate — premade, a collection (schema present)', () => {
  it('carries the minted schema and stamps the same way', () => {
    const out = applyTemplate({ origin: 'premade', kind: 'tracker' }, counter())

    expect(out.title).toBe('tracker')
    expect(out.schema).toBeDefined()
    expect(out.schema!.map((p) => p.name)).toEqual(['date', 'value'])

    expect(out.props.kind).toBe('tracker')
    expect(readProvenance(out.props)?.templateId).toBe('premade:tracker')
    expect(readProvenance(out.props)?.name).toBe('tracker')
  })
})

describe('applyTemplate — yours', () => {
  const TEMPLATE: PondTemplate = {
    id: 'tpl-9',
    name: 'weekly review',
    kind: 'meeting notes',
    blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
    origin: 'yours',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  }

  it('keeps content, mints fresh ids, and stamps the NAME as the kind', () => {
    const out = applyTemplate({ origin: 'yours', template: TEMPLATE }, counter())

    expect(out.title).toBe('weekly review')
    expect(out.schema).toBeUndefined()
    expect(out.blocks).toHaveLength(1)
    expect(out.blocks[0]).toMatchObject({ content: 'already written' })
    expect(out.blocks[0].id).not.toBe('orig-1')

    // The yours-template's free-text NAME is the kind label, not its fixed `kind`.
    expect(out.props.kind).toBe('weekly review')
    expect(readProvenance(out.props)).toEqual({
      templateId: 'tpl-9',
      name: 'weekly review',
      at: expect.any(String),
    })
  })
})
