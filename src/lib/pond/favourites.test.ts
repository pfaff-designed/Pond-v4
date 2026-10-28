import { reorderFavouriteIds, toggleFavouritePageId } from './favourites'

const PAGE_A = 'a'
const PAGE_B = 'b'
const PAGE_C = 'c'

describe('toggleFavouritePageId', () => {
  const cases: Array<[string, string[] | null | undefined, string, string[]]> = [
    ['null → adds as the only favourite', null, PAGE_A, [PAGE_A]],
    ['undefined → adds as the only favourite', undefined, PAGE_A, [PAGE_A]],
    ['empty → adds as the only favourite', [], PAGE_A, [PAGE_A]],
    ['present → removed, order of the rest kept', [PAGE_A, PAGE_B, PAGE_C], PAGE_B, [PAGE_A, PAGE_C]],
    ['absent with others present → appended at the end', [PAGE_A, PAGE_B], PAGE_C, [PAGE_A, PAGE_B, PAGE_C]],
    ['a duplicate id → every occurrence removed', [PAGE_A, PAGE_B, PAGE_A], PAGE_A, [PAGE_B]],
  ]

  it.each(cases)('%s', (_name, ids, pageId, expected) => {
    expect(toggleFavouritePageId(ids, pageId)).toEqual(expected)
  })
})

describe('reorderFavouriteIds', () => {
  const cases: Array<[string, string[], string, string, 'before' | 'after', string[]]> = [
    ['move up: drag last to before first', [PAGE_A, PAGE_B, PAGE_C], PAGE_C, PAGE_A, 'before', [PAGE_C, PAGE_A, PAGE_B]],
    ['move down: drag first to after last', [PAGE_A, PAGE_B, PAGE_C], PAGE_A, PAGE_C, 'after', [PAGE_B, PAGE_C, PAGE_A]],
    ['no-op: drop on self', [PAGE_A, PAGE_B, PAGE_C], PAGE_B, PAGE_B, 'before', [PAGE_A, PAGE_B, PAGE_C]],
    ['no-op: dragged id absent from ids', [PAGE_A, PAGE_B], 'missing', PAGE_A, 'before', [PAGE_A, PAGE_B]],
    ['no-op: target id absent from ids', [PAGE_A, PAGE_B], PAGE_A, 'missing', 'after', [PAGE_A, PAGE_B]],
    ['single-item list: dragging the only item onto itself is a no-op', [PAGE_A], PAGE_A, PAGE_A, 'after', [PAGE_A]],
  ]

  it.each(cases)('%s', (_name, ids, draggedId, targetId, zone, expected) => {
    expect(reorderFavouriteIds(ids, draggedId, targetId, zone)).toEqual(expected)
  })
})
