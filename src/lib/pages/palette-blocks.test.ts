import { ancestorPathLabel, type ParentPageRow } from './parent-options'
import { BLOCK_MIN_QUERY, blockPageLabel, snippetRuns } from './palette-blocks'
import { RECORD_MIN_QUERY } from './palette-records'

describe('BLOCK_MIN_QUERY', () => {
  it('is the same gate as records, not a second constant', () => {
    expect(BLOCK_MIN_QUERY).toBe(RECORD_MIN_QUERY)
  })
})

describe('blockPageLabel', () => {
  it('reuses ancestorPathLabel rather than building a second path', () => {
    expect(blockPageLabel).toBe(ancestorPathLabel)
  })

  it('builds the row label from a page tree', () => {
    const pages: ParentPageRow[] = [
      { id: 'area', parentId: null, type: 'home', title: 'kitchen' },
      { id: 'page', parentId: 'area', type: 'page', title: 'electrician' },
    ]
    expect(blockPageLabel(pages, 'page')).toBe('kitchen › electrician')
  })
})

describe('snippetRuns (KAN-473)', () => {
  it('underlines a single match', () => {
    expect(snippetRuns('call the electrician for the second fix', 'second fix')).toEqual([
      { text: 'call the electrician for the ', hit: false },
      { text: 'second fix', hit: true },
    ])
  })

  it('underlines every occurrence, not just the first', () => {
    expect(snippetRuns('second fix: sockets. second fix: switches.', 'second fix')).toEqual([
      { text: 'second fix', hit: true },
      { text: ': sockets. ', hit: false },
      { text: 'second fix', hit: true },
      { text: ': switches.', hit: false },
    ])
  })

  it('underlines a match at the snippet start', () => {
    expect(snippetRuns('second fix tomorrow', 'second fix')).toEqual([
      { text: 'second fix', hit: true },
      { text: ' tomorrow', hit: false },
    ])
  })

  it('underlines a match at the snippet end', () => {
    expect(snippetRuns('tomorrow is second fix', 'second fix')).toEqual([
      { text: 'tomorrow is ', hit: false },
      { text: 'second fix', hit: true },
    ])
  })

  it('matches case-insensitively, and an accent matches its base letter', () => {
    expect(snippetRuns('the Café reopens', 'cafe')).toEqual([
      { text: 'the ', hit: false },
      { text: 'Café', hit: true },
      { text: ' reopens', hit: false },
    ])
  })

  it('an empty query is one unmatched run, as matchRuns does', () => {
    expect(snippetRuns('second fix', '')).toEqual([{ text: 'second fix', hit: false }])
  })

  it('no match is one unmatched run', () => {
    expect(snippetRuns('first fix only', 'second fix')).toEqual([
      { text: 'first fix only', hit: false },
    ])
  })
})
