/**
 * resolveDescriptor (arch review Candidate 3) — the total accessor over the
 * server-safe module registry. It wraps `descriptorFor` to resolve the optional
 * facets (`preview` -> `serialize`, `nestedIdPaths` -> `[]`) and to absorb the
 * unknown-type case (a callable no-op), so no server-side reader coalesces.
 *
 * `descriptorFor` is the REFERENCE implementation here: these tests prove the
 * WRAPPER forwards and defaults correctly, not the per-module serialize output
 * (that is covered independently in module-serialize.test.ts / module-nested-ids
 * .test.ts — left as oracles on purpose).
 */
import { descriptorFor, resolveDescriptor } from '@/lib/modules/registry'
import type { Block } from '@/lib/documents/types'

const text: Block = { id: 'b1', type: 'text', content: 'Hello world' }
const todo: Block = {
  id: 'b1',
  type: 'todo',
  items: [
    { id: 't1', label: 'Buy wood', checked: false },
    { id: 't2', label: 'Sand it', checked: true },
  ],
}

describe('resolveDescriptor', () => {
  it('forwards serialize and nestedIdPaths for a known type', () => {
    const resolved = resolveDescriptor('todo')
    const underlying = descriptorFor('todo')!
    expect(resolved.serialize(todo)).toBe(underlying.serialize(todo))
    expect(resolved.nestedIdPaths).toEqual(underlying.nestedIdPaths)
  })

  it('falls back to serialize when the descriptor declares no preview', () => {
    // `text` declares no preview facet.
    expect(descriptorFor('text')!.preview).toBeUndefined()
    const resolved = resolveDescriptor('text')
    expect(resolved.preview(text)).toBe(descriptorFor('text')!.serialize(text))
  })

  it('uses the descriptor preview when one is declared', () => {
    // `todo` declares its own preview, distinct from serialize.
    const resolved = resolveDescriptor('todo')
    expect(resolved.preview(todo)).toBe(descriptorFor('todo')!.preview!(todo))
  })

  it('defaults nestedIdPaths to [] for a type that declares none', () => {
    expect(descriptorFor('text')!.nestedIdPaths).toBeUndefined()
    expect(resolveDescriptor('text').nestedIdPaths).toEqual([])
  })

  it('returns a callable no-op for an unknown type', () => {
    const resolved = resolveDescriptor('does-not-exist')
    expect(resolved.serialize({ type: 'does-not-exist' })).toBe('')
    expect(resolved.preview({ type: 'does-not-exist' })).toBe('')
    expect(resolved.nestedIdPaths).toEqual([])
  })
})
