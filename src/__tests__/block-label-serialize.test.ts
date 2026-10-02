/**
 * A block's LABEL must reach the model (#258).
 *
 * `ModuleDescriptor.serialize`'s contract (`types.ts`) is that a block the model
 * cannot read there is **silently destroyed on the next wholesale `edit`** — the
 * model re-emits what it can see. `labelledBlockFields` rides both AI emit unions
 * and its `.describe()` reaches the derived tool JSON schema, so the model can
 * WRITE a label from this commit; without this it could not READ one back, and the
 * next wholesale edit would drop it — turning a labelled `text` block into bare
 * prose, losing its card and its eyebrow.
 *
 * The label is emitted ONCE, in `resolveDescriptor`, rather than in each module's
 * `serialize`: it is a cross-type field (one mixin over five schemas), and
 * `resolveDescriptor` is the single seam both model-facing readers go through
 * (`blocksToText` and `blockPreview`, `context/assemble.ts`) and the one the
 * embeddings reuse (`embeddings/documents.ts`, `retrieve.ts` both call
 * `blocksToText` so retrieval and prompt text cannot diverge). A per-module prefix
 * would be five copies of one rule plus a standing obligation on every future
 * module — the work item ADR 0006 warns is forgotten.
 *
 * The precedent in this family runs the same way twice: `entries`' serialize carries
 * its `serif` flag ("so a journal stays a journal") and `table`'s carries `title`.
 */
import { blocksToText } from '@/lib/context/assemble'
import { moduleDescriptors, resolveDescriptor } from '@/lib/modules/registry'
import { blockLabel, trimmedOrNone } from '@/lib/modules/types'
import type { Block } from '@/lib/documents/types'

const text = (label?: string, content = 'Out of the flat by the 14th.'): Block =>
  ({ id: 'b1', type: 'text', content, ...(label === undefined ? {} : { label }) }) as Block

describe('trimmedOrNone / blockLabel — one reader for the one field', () => {
  it('trims a non-empty string and rejects everything else', () => {
    expect(trimmedOrNone('  goal  ')).toBe('goal')
    for (const v of ['', '   ', 3, null, undefined, {}, ['goal']]) {
      expect(trimmedOrNone(v)).toBeUndefined()
    }
  })

  it("reads `label` off a block, and treats '' / whitespace as NO label", () => {
    expect(blockLabel({ label: 'goal' })).toBe('goal')
    expect(blockLabel({ label: '  goal  ' })).toBe('goal')
    for (const v of [{ label: '' }, { label: '   ' }, { label: 7 }, {}, null, undefined, 'goal']) {
      expect(blockLabel(v)).toBeUndefined()
    }
  })
})

describe('the label reaches the model', () => {
  it('leads the serialized body — a label is an eyebrow over the block', () => {
    expect(blocksToText([text('goal')])).toBe('goal:\nOut of the flat by the 14th.')
  })

  it('leaves an UNLABELLED block byte-identical, so no prompt or eval output moves', () => {
    expect(blocksToText([text()])).toBe('Out of the flat by the 14th.')
    expect(blocksToText([text(undefined, 'Hello world')])).toBe('Hello world')
  })

  it('surfaces a labelled block with empty content as its label alone', () => {
    // `blocksToText` drops empty lines, so otherwise a block the person had named
    // would be invisible to the model and deleted by the next wholesale re-emit.
    expect(blocksToText([text('goal', '')])).toBe('goal:')
  })

  it('still drops an UNLABELLED empty block, exactly as before', () => {
    expect(blocksToText([text(undefined, '')])).toBe('')
  })

  it('separates the one-line preview inline, not with a newline', () => {
    const preview = resolveDescriptor('text').preview(text('goal'))
    expect(preview).toBe('goal — Out of the flat by the 14th.')
    expect(preview).not.toContain('\n')
  })

  it('leaves an unregistered type serializing to the empty string', () => {
    // `NULL_DESCRIPTOR` is returned before the wrapper, so the tolerate-never-throw
    // policy for a stale persisted type is untouched.
    expect(resolveDescriptor('no-such-type').serialize({ label: 'goal' })).toBe('')
    expect(resolveDescriptor('no-such-type').preview({ label: 'goal' })).toBe('')
  })
})

describe('every labelled type is covered, so a sixth is covered for free', () => {
  /** One sample per type the registry says carries the shared field. */
  const samples: Record<string, Block> = {
    text: text('goal'),
    highlight: {
      id: 'b2',
      type: 'highlight',
      label: 'kept',
      content: 'Three books at once is one too many.',
    } as Block,
    todo: {
      id: 'b3',
      type: 'todo',
      label: 'actions',
      items: [{ id: 't1', label: 'Sam — final copy', checked: false }],
    } as Block,
    view: { id: 'b4', type: 'view', label: 'tasks — board', mode: 'board' } as Block,
    entries: {
      id: 'b5',
      type: 'entries',
      label: 'updates',
      entries: [{ id: 'e1', date: '28 oct', text: 'Van booked for the 14th.' }],
    } as Block,
  }

  const labelledTypes = Object.entries(moduleDescriptors)
    .filter(([, d]) => 'label' in (d.schema as unknown as { shape: Record<string, unknown> }).shape)
    .map(([type]) => type)

  it('has a sample for every labelled type in the registry', () => {
    expect([...labelledTypes].sort()).toEqual([...Object.keys(samples)].sort())
  })

  it.each(labelledTypes)('%s emits its label through resolveDescriptor', (type) => {
    const block = samples[type]
    const label = blockLabel(block)
    expect(label).toBeDefined()
    expect(resolveDescriptor(type).serialize(block).startsWith(`${label}:`)).toBe(true)
    expect(resolveDescriptor(type).preview(block).startsWith(`${label} — `)).toBe(true)
  })
})

describe('`table` is the exception and keeps its own shape', () => {
  const table = {
    id: 'b1',
    type: 'table',
    title: 'log',
    columns: ['date', 'distance'],
    rows: [{ id: 'r1', cells: ['24 oct', '5.2 km'] }],
  } as Block

  it('serializes `title` itself and gains no label prefix', () => {
    const out = resolveDescriptor('table').serialize(table)
    expect(out.startsWith('log:')).toBe(false)
    expect(out).toContain('log — ')
  })
})
