/**
 * `import a page` — board `Pond 06.25 Import a page.dc.html` frame 1's fourth
 * door, a standing action beside `new page` / `ask pond`. Unconditional: there
 * is always a file chooser to open, unlike the page-scoped `save-as-template`.
 */

import { IMPORT_A_PAGE_ACTION, paletteItems } from '@/lib/pages/palette-items'

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
