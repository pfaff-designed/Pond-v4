import { toggleFavouritePageId } from './favourites'

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
