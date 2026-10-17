/**
 * `import a page` — board `Pond 06.25 Import a page.dc.html` frame 1's fourth
 * door, a standing action beside `new page` / `ask pond`. Unconditional: there
 * is always a file chooser to open, unlike the page-scoped `save-as-template`.
 */

import { paletteEntries } from '@/components/molecules/palette-entries'
import {
  DEEP_RESEARCH_ACTION,
  IMPORT_A_PAGE_ACTION,
  paletteItems,
  REPORT_A_PROBLEM_ACTION,
} from '@/lib/pages/palette-items'

describe('IMPORT_A_PAGE_ACTION', () => {
  it('is an action row in Pond’s own words', () => {
    expect(IMPORT_A_PAGE_ACTION).toMatchObject({
      id: 'action:import-a-page',
      label: 'import a page',
      kind: 'action',
      action: 'import-a-page',
    })
  })
})

describe('paletteItems — import a page', () => {
  it('lists unconditionally, alongside new page and ask pond', () => {
    const withoutOpenPage = paletteItems([], [])
    const withOpenPage = paletteItems([], [], 'some-page')

    for (const items of [withoutOpenPage, withOpenPage]) {
      expect(items).toContainEqual(IMPORT_A_PAGE_ACTION)
      const actions = items.map((i) => i.action)
      expect(actions).toContain('new-page')
      expect(actions).toContain('ask-pond')
    }
  })
})

describe('REPORT_A_PROBLEM_ACTION', () => {
  it('is an action row in Pond’s own words', () => {
    expect(REPORT_A_PROBLEM_ACTION).toMatchObject({
      id: 'action:report-a-problem',
      label: 'report a problem',
      kind: 'action',
      action: 'report-a-problem',
    })
  })
})

describe('paletteItems — report a problem', () => {
  it('lists unconditionally, alongside new page and ask pond', () => {
    const withoutOpenPage = paletteItems([], [])
    const withOpenPage = paletteItems([], [], 'some-page')

    for (const items of [withoutOpenPage, withOpenPage]) {
      expect(items).toContainEqual(REPORT_A_PROBLEM_ACTION)
    }
  })
})

/** 6r frame 1's "or ⌘K — deep research from the palette." */
describe('DEEP_RESEARCH_ACTION', () => {
  it('is an action row in Pond’s own words, beside ask pond', () => {
    expect(DEEP_RESEARCH_ACTION).toMatchObject({
      id: 'action:deep-research',
      label: 'deep research',
      kind: 'action',
      action: 'deep-research',
    })
    expect(paletteItems([], [])).toContainEqual(DEEP_RESEARCH_ACTION)
  })

  it('lists on a `deep` query via the existing action-match path', () => {
    const entries = paletteEntries(paletteItems([], []), 'deep')
    const row = entries.find((e) => e.kind === 'row' && e.item.id === DEEP_RESEARCH_ACTION.id)
    expect(row).toBeDefined()
  })
})
