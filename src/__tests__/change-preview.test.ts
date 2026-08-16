/**
 * Unit tests for previewForChange — the display twin of applyProposedChanges (t16
 * Phase 5). It turns an id-less proposed change into the id-ful { before, after }
 * pair the diff card renders, stamping a placeholder id that is never persisted.
 */

import { previewForChange, PREVIEW_ID, type ChangePreview } from '@/lib/modules/preview'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'

const blocks: Block[] = [
  { id: 'a', type: 'text', content: 'first' },
  { id: 'b', type: 'text', content: 'second' },
  { id: 'c', type: 'todo', items: [{ id: 't1', label: 'x', checked: false }] },
]

describe('previewForChange', () => {
  it('create → no before, after is the proposed block with a placeholder id', () => {
    const change: ModuleChange = { op: 'create', data: { type: 'text', content: 'new note' } }
    const out = previewForChange(change, blocks)
    expect(out).toEqual<ChangePreview>({
      op: 'create',
      before: null,
      after: { id: PREVIEW_ID, type: 'text', content: 'new note' },
    })
  })

  it('edit → before is the existing block, after carries the placeholder id', () => {
    const change: ModuleChange = {
      op: 'edit',
      blockId: 'b',
      data: { type: 'text', content: 'rewritten' },
    }
    const out = previewForChange(change, blocks)
    expect(out.op).toBe('edit')
    expect(out.before).toEqual(blocks[1])
    expect(out.after).toEqual({ id: PREVIEW_ID, type: 'text', content: 'rewritten' })
  })

  it('edit may type-morph — before text block, after a todo preview', () => {
    const change: ModuleChange = {
      op: 'edit',
      blockId: 'a',
      data: { type: 'todo', items: [{ label: 'do it', checked: false }] },
    }
    const out = previewForChange(change, blocks)
    expect(out.before).toEqual(blocks[0])
    expect(out.after).toEqual({
      id: PREVIEW_ID,
      type: 'todo',
      items: [{ id: `${PREVIEW_ID}-0`, label: 'do it', checked: false }],
    })
  })

  it('remove → before is the existing block, no after', () => {
    const change: ModuleChange = { op: 'remove', blockId: 'c' }
    const out = previewForChange(change, blocks)
    expect(out).toEqual<ChangePreview>({ op: 'remove', before: blocks[2], after: null })
  })

  it('mints placeholder ids for every nested todo item', () => {
    const change: ModuleChange = {
      op: 'create',
      data: {
        type: 'todo',
        items: [
          { label: 'one', checked: false },
          { label: 'two', checked: true },
        ],
      },
    }
    const out = previewForChange(change, blocks)
    expect(out.after).toEqual({
      id: PREVIEW_ID,
      type: 'todo',
      items: [
        { id: `${PREVIEW_ID}-0`, label: 'one', checked: false },
        { id: `${PREVIEW_ID}-1`, label: 'two', checked: true },
      ],
    })
  })

  it('before is null when the referenced blockId no longer exists', () => {
    const change: ModuleChange = { op: 'remove', blockId: 'gone' }
    expect(previewForChange(change, blocks).before).toBeNull()
  })

  it('does not mutate the input blocks', () => {
    const change: ModuleChange = { op: 'edit', blockId: 'a', data: { type: 'text', content: 'x' } }
    previewForChange(change, blocks)
    expect(blocks[0]).toEqual({ id: 'a', type: 'text', content: 'first' })
  })
})
