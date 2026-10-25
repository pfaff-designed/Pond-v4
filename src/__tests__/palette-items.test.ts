/**
 * `import a page` — board `Pond 06.25 Import a page.dc.html` frame 1's fourth
 * door, a standing action beside `new page` / `ask pond`. Unconditional: there
 * is always a file chooser to open, unlike the page-scoped `save-as-template`.
 */

import { paletteEntries } from '@/components/molecules/palette-entries'
import {
  ASK_POND_ACTION,
  DEEP_RESEARCH_ACTION,
  DUPLICATE_PAGE_ACTION,
  IMPORT_A_PAGE_ACTION,
  modeItems,
  MOVE_PAGE_ACTION,
  paletteItems,
  REPORT_A_PROBLEM_ACTION,
  SAVE_AS_TEMPLATE_ACTION,
  ZEN_ACTION,
} from '@/lib/pages/palette-items'

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

afterEach(() => jest.restoreAllMocks())

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

describe('DUPLICATE_PAGE_ACTION', () => {
  it('is an action row in Pond’s own words', () => {
    expect(DUPLICATE_PAGE_ACTION).toMatchObject({
      id: 'action:duplicate-page',
      label: 'duplicate page',
      kind: 'action',
      action: 'duplicate-page',
    })
  })
})

const ordinaryPage = {
  id: 'some-page',
  parent_id: null,
  type: 'page',
  title: 'Recipes',
  order: 0,
  updated_at: '',
}

describe('paletteItems — duplicate page', () => {
  it('lists only when a page is open, like save page as template', () => {
    const withoutOpenPage = paletteItems([], [])
    const withOpenPage = paletteItems([ordinaryPage], [], 'some-page')

    expect(withoutOpenPage).not.toContainEqual(DUPLICATE_PAGE_ACTION)
    expect(withoutOpenPage).not.toContainEqual(SAVE_AS_TEMPLATE_ACTION)
    expect(withOpenPage).toContainEqual(DUPLICATE_PAGE_ACTION)
    expect(withOpenPage).toContainEqual(SAVE_AS_TEMPLATE_ACTION)
  })

  // KAN-468: the RPC refuses the pond root and the databases root
  // (`not-duplicable`); the palette entry must agree rather than offer an
  // action that always fails — `isDuplicablePageRow`, the same rule Rail's
  // own ⌘D capability reads.
  it('does not list for the home page, even though save-as-template still does', () => {
    const home = { ...ordinaryPage, id: 'home-id', type: 'home', title: 'life' }
    const withHomeOpen = paletteItems([home], [], 'home-id')

    expect(withHomeOpen).not.toContainEqual(DUPLICATE_PAGE_ACTION)
    expect(withHomeOpen).toContainEqual(SAVE_AS_TEMPLATE_ACTION)
  })

  it('does not list for the databases root', () => {
    const databasesRoot = { ...ordinaryPage, id: 'databases-id', title: 'databases' }
    const withDatabasesRootOpen = paletteItems([databasesRoot], [], 'databases-id')

    expect(withDatabasesRootOpen).not.toContainEqual(DUPLICATE_PAGE_ACTION)
    expect(withDatabasesRootOpen).toContainEqual(SAVE_AS_TEMPLATE_ACTION)
  })

  it('does not list when the open id resolves to no row at all', () => {
    const withUnknownOpen = paletteItems([ordinaryPage], [], 'no-such-page')

    expect(withUnknownOpen).not.toContainEqual(DUPLICATE_PAGE_ACTION)
  })
})

describe('MOVE_PAGE_ACTION', () => {
  it('is an action row in Pond’s own words, carrying the ⌘⇧P chord', () => {
    expect(MOVE_PAGE_ACTION).toMatchObject({
      id: 'action:move-page',
      label: 'move page to…',
      kind: 'action',
      action: 'move-page',
    })
    expect(MOVE_PAGE_ACTION.key).toBeTruthy()
  })
})

describe('paletteItems — move page', () => {
  it('lists only when a page is open, like duplicate page, and sits right beside it', () => {
    const withoutOpenPage = paletteItems([], [])
    const withOpenPage = paletteItems([ordinaryPage], [], 'some-page')

    expect(withoutOpenPage).not.toContainEqual(MOVE_PAGE_ACTION)
    expect(withOpenPage).toContainEqual(MOVE_PAGE_ACTION)

    const duplicateIndex = withOpenPage.findIndex((i) => i === DUPLICATE_PAGE_ACTION)
    const moveIndex = withOpenPage.findIndex((i) => i === MOVE_PAGE_ACTION)
    expect(moveIndex).toBe(duplicateIndex + 1)
  })

  it('does not list for the home page', () => {
    const home = { ...ordinaryPage, id: 'home-id', type: 'home', title: 'life' }
    const withHomeOpen = paletteItems([home], [], 'home-id')

    expect(withHomeOpen).not.toContainEqual(MOVE_PAGE_ACTION)
  })

  it('does not list for the databases root', () => {
    const databasesRoot = { ...ordinaryPage, id: 'databases-id', title: 'databases' }
    const withDatabasesRootOpen = paletteItems([databasesRoot], [], 'databases-id')

    expect(withDatabasesRootOpen).not.toContainEqual(MOVE_PAGE_ACTION)
  })

  it('does not list when no page is open at all', () => {
    const withNoOpenPage = paletteItems([ordinaryPage], [])

    expect(withNoOpenPage).not.toContainEqual(MOVE_PAGE_ACTION)
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

describe('modeItems — zen’s key reads the platform at call time', () => {
  it('shows the Apple glyph on a Mac', () => {
    onPlatform('MacIntel')
    const zen = modeItems(false).find((item) => item.id === ZEN_ACTION.id)
    expect(zen?.key).toBe('⌘.')
  })

  it('shows the Ctrl word off a Mac', () => {
    onPlatform('Win32')
    const zen = modeItems(false).find((item) => item.id === ZEN_ACTION.id)
    expect(zen?.key).toBe('Ctrl .')
  })
})

describe('modeItems — the out-of-zen array is stable across calls', () => {
  it('returns the same reference on the same platform', () => {
    onPlatform('MacIntel')
    expect(modeItems(false)).toBe(modeItems(false))
  })

  it('returns a new reference, with the new key, after a platform change', () => {
    onPlatform('MacIntel')
    const onMac = modeItems(false)
    onPlatform('Win32')
    const onWindows = modeItems(false)
    expect(onWindows).not.toBe(onMac)
    expect(onWindows.find((item) => item.id === ZEN_ACTION.id)?.key).toBe('Ctrl .')
  })
})

describe('paletteItems — ask pond’s key matches the composer’s own ⌘J', () => {
  it('shows the Apple glyph on a Mac', () => {
    onPlatform('MacIntel')
    const askPond = paletteItems([], []).find((item) => item.id === ASK_POND_ACTION.id)
    expect(askPond?.key).toBe('⌘J')
  })

  it('shows the Ctrl word off a Mac', () => {
    onPlatform('Win32')
    const askPond = paletteItems([], []).find((item) => item.id === ASK_POND_ACTION.id)
    expect(askPond?.key).toBe('Ctrl J')
  })
})
