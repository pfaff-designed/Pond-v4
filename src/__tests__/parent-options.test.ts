/**
 * Tests for the save-picker destination labels (parent-options).
 *
 * toParentOptions disambiguates duplicate page titles for the create_page
 * proposal card's destination picker (see module doc in
 * src/lib/pages/parent-options.ts):
 *   1. unique titles stay as-is
 *   2. duplicated titles get their ancestor path appended
 *   3. labels still colliding get the page type appended
 * Pure function — the AITerminal feeds it the listPages rows.
 */

import { toParentOptions, type ParentPageRow } from '@/lib/pages/parent-options'
import type { NodeType } from '@/lib/supabase/types'

function row(
  id: string,
  title: string,
  parentId: string | null = null,
  type: NodeType = 'page'
): ParentPageRow {
  return { id, parentId, type, title }
}

describe('toParentOptions', () => {
  it('returns an empty array for an empty workspace', () => {
    expect(toParentOptions([])).toEqual([])
  })

  it('leaves unique titles unchanged and preserves order and ids', () => {
    const options = toParentOptions([
      row('a', 'Creativity'),
      row('b', 'Health'),
      row('c', 'Finances'),
    ])
    expect(options).toEqual([
      { id: 'a', title: 'Creativity' },
      { id: 'b', title: 'Health' },
      { id: 'c', title: 'Finances' },
    ])
  })

  it('appends the ancestor path to duplicated titles', () => {
    const options = toParentOptions([
      row('creativity', 'Creativity'),
      row('personal', 'Personal'),
      row('projects', 'Projects', 'personal'),
      row('wood-1', 'Woodworking', 'creativity'),
      row('wood-2', 'Woodworking', 'projects'),
    ])
    expect(options.find((o) => o.id === 'wood-1')?.title).toBe('Woodworking (Creativity)')
    expect(options.find((o) => o.id === 'wood-2')?.title).toBe('Woodworking (Personal › Projects)')
  })

  it('labels top-level duplicates as "(top level)"', () => {
    const options = toParentOptions([
      row('creativity', 'Creativity'),
      row('wood-1', 'Woodworking'),
      row('wood-2', 'Woodworking', 'creativity'),
    ])
    expect(options.find((o) => o.id === 'wood-1')?.title).toBe('Woodworking (top level)')
    expect(options.find((o) => o.id === 'wood-2')?.title).toBe('Woodworking (Creativity)')
  })

  it('appends the page type when title AND placement still collide', () => {
    const options = toParentOptions([
      row('creativity', 'Creativity'),
      row('wood-area', 'Woodworking', 'creativity', 'area'),
      row('wood-project', 'Woodworking', 'creativity', 'project'),
    ])
    expect(options.find((o) => o.id === 'wood-area')?.title).toBe('Woodworking (Creativity) · area')
    expect(options.find((o) => o.id === 'wood-project')?.title).toBe(
      'Woodworking (Creativity) · project'
    )
  })

  it('leaves pages identical in title, placement, and type with identical labels', () => {
    const options = toParentOptions([
      row('creativity', 'Creativity'),
      row('wood-1', 'Woodworking', 'creativity', 'page'),
      row('wood-2', 'Woodworking', 'creativity', 'page'),
    ])
    expect(options.find((o) => o.id === 'wood-1')?.title).toBe('Woodworking (Creativity) · page')
    expect(options.find((o) => o.id === 'wood-2')?.title).toBe('Woodworking (Creativity) · page')
  })

  it('stops the ancestor path at a dangling parentId', () => {
    const options = toParentOptions([
      row('wood-1', 'Woodworking', 'missing-parent'),
      row('wood-2', 'Woodworking'),
    ])
    // No reachable ancestors → same path label as the top-level duplicate,
    // so both fall through to the type-suffix tier.
    expect(options.find((o) => o.id === 'wood-1')?.title).toBe('Woodworking (top level) · page')
    expect(options.find((o) => o.id === 'wood-2')?.title).toBe('Woodworking (top level) · page')
  })

  it('terminates on a parent cycle in bad data', () => {
    const options = toParentOptions([
      row('a', 'Woodworking', 'b'),
      row('b', 'Shop', 'a'),
      row('c', 'Woodworking'),
    ])
    expect(options.find((o) => o.id === 'a')?.title).toBe('Woodworking (Shop)')
    expect(options.find((o) => o.id === 'c')?.title).toBe('Woodworking (top level)')
  })
})
