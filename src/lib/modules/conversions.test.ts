import type { Block } from './content'
import { moveIntoPagePrep } from './conversions'

describe('moveIntoPagePrep', () => {
  it('a text block: titled from its first plain line, rowStart dropped, width kept', () => {
    const block: Block = {
      id: 'b-1',
      type: 'text',
      content: '## walk the dog',
      width: '1/2',
      rowStart: true,
    }
    expect(moveIntoPagePrep(block, 'host-1')).toEqual({
      block: { id: 'b-1', type: 'text', content: '## walk the dog', width: '1/2' },
      title: 'walk the dog',
    })
  })

  it('a checklist (todo): titled from its label, rowStart dropped', () => {
    const block: Block = {
      id: 'b-2',
      type: 'todo',
      marker: 'check',
      label: 'shopping',
      items: [{ id: 'i1', label: '2 eggs', checked: false }],
      rowStart: true,
    }
    expect(moveIntoPagePrep(block, 'host-1')).toEqual({
      block: { ...block, rowStart: undefined },
      title: 'shopping',
    })
  })

  it('a checklist with no label: titled ""', () => {
    const block: Block = {
      id: 'b-3',
      type: 'todo',
      marker: 'check',
      items: [{ id: 'i1', label: '2 eggs', checked: false }],
    }
    expect(moveIntoPagePrep(block, 'host-1')).toEqual({ block, title: '' })
  })

  it("a table: titled from its own title field, never a non-existent label", () => {
    const block: Block = {
      id: 'b-4',
      type: 'table',
      title: 'tools',
      columns: ['Tool'],
      rows: [{ id: 'r1', cells: ['Saw'] }],
    }
    expect(moveIntoPagePrep(block, 'host-1')).toEqual({ block, title: 'tools' })
  })

  it('a chart view with its own collectionId: keeps it, titled from its label', () => {
    const block: Block = {
      id: 'b-5',
      type: 'view',
      mode: 'chart',
      label: 'revenue',
      collectionId: 'db-1',
    }
    expect(moveIntoPagePrep(block, 'host-1')).toEqual({ block, title: 'revenue' })
  })

  it('a chart view with no collectionId of its own: stamped with the host page so it keeps drawing the same rows', () => {
    const block: Block = { id: 'b-6', type: 'view', mode: 'chart' }
    expect(moveIntoPagePrep(block, 'host-1')).toEqual({
      block: { ...block, collectionId: 'host-1' },
      title: '',
    })
  })

  it('a page-link: nothing to move', () => {
    const block: Block = { id: 'b-7', type: 'page-link', pageId: 'child-1' }
    expect(moveIntoPagePrep(block, 'host-1')).toBeNull()
  })
})
