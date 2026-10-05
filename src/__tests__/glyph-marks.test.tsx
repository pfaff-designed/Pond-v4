/**
 * The Make Noise glyph mark system (#91) — rendering primitives + the
 * fixed default area→glyph wiring. These tests defend the acceptance criteria:
 * the `Icon` atom fetches `/icons/<name>.png` ONCE per name (module-level
 * cache), applies it as a data-URI CSS mask over `background: currentColor`
 * (so the glyph inherits colour like text — colour via `color`, never `fill`),
 * stays SSR-safe (an empty sized `<span>` until painted) and quiet on a miss;
 * `KindDot` is the one page-kind mark (muted 7×7, 2px-radius rounded square in an
 * area colour), housed in `PondAtom` beside the `dot` kind that wears it, and
 * rendered through by PondMolecule and the mark button; the
 * `AREA_GLYPH` map resolves the six fixed defaults (Life→waves-02, Personal→house,
 * Professional→star-01, Health→leaf-01, Finances→stairs-01,
 * Creativity→flower-05); and the wiring holds — the Rail's Life root and every
 * mapped area row lead with their glyph in the area hue (page-kind marks stay
 * KindDot, unmapped areas keep the dot), and the path the page surface publishes
 * for `PondCommand` leads with its area's mark.
 */
import React from 'react'
import { render, waitFor, act } from '@testing-library/react'
import { Icon, loadIcon } from '@/components/atoms/Icon'
import { KindDot } from '@/components/atoms/PondAtom'
import { LIFE_GLYPH, areaGlyph } from '@/lib/rail/area-glyph'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { RailView, type RailNode } from '@/components/organisms/Rail'
import type { MarkSource } from '@/lib/pages/mark'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PageRow } from '@/lib/pages/tree'
import { withPathProbe } from './helpers/command-path-probe'

// The page-surface tests (DocumentPanel) reach useRouter and read the open page
// from the URL; the presentational RailView never touches either.
let currentNodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? currentNodeId : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
const PAGES: Record<string, Record<string, unknown>> = {}
jest.mock('@/lib/pages/client', () => ({
  getPage: (_sb: unknown, id: string) => Promise.resolve(PAGES[id] ?? null),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: () => Promise.resolve({ id: 'home-1', title: 'life', blocks: [] }),
}))

// ── fetch → data-URI harness ────────────────────────────────────────────────
// A tiny PNG-ish payload; FileReader turns it into a stable data-URI in jsdom.

function mockFetchOk() {
  return jest.fn().mockImplementation(async () => ({
    ok: true,
    blob: async () => new Blob(['png-bytes'], { type: 'image/png' }),
  }))
}

let fetchMock: jest.Mock

beforeEach(() => {
  fetchMock = mockFetchOk()
  global.fetch = fetchMock as unknown as typeof fetch
})

/** Wait until the span carries the data-URI mask (the async paint landed). */
async function waitForMask(el: HTMLElement) {
  await waitFor(() => expect(el.style.mask).toContain('data:'))
}

// ── AC1: the Icon atom ──────────────────────────────────────────────────────

describe('Icon — data-URI mask over currentColor', () => {
  it('renders an empty sized span before the glyph paints (SSR-safe)', () => {
    const { container } = render(<Icon name="ac1-placeholder" size={13} />)
    const el = container.querySelector<HTMLElement>('[data-icon="ac1-placeholder"]')!
    expect(el).toBeInTheDocument()
    expect(el.style.width).toBe('13px')
    expect(el.style.height).toBe('13px')
    // Until the data-URI lands there is NO background — a bare currentColor
    // square (mask missing) must never flash.
    expect(el.style.background).toBe('')
    expect(el.textContent).toBe('')
  })

  it('is aria-hidden by default (a mark, not content)', () => {
    const { container } = render(<Icon name="ac1-hidden" />)
    expect(container.querySelector('[data-icon="ac1-hidden"]')!.getAttribute('aria-hidden')).toBe(
      'true'
    )
  })

  it('fetches /icons/<name>.png and applies it as a data-URI mask over currentColor', async () => {
    const { container } = render(<Icon name="ac1-mask" />)
    const el = container.querySelector<HTMLElement>('[data-icon="ac1-mask"]')!
    expect(fetchMock).toHaveBeenCalledWith('/icons/ac1-mask.png')
    await waitForMask(el)
    expect(el.style.mask).toMatch(/^url\("data:.*"\) no-repeat center \/ contain$/)
    // (-webkit-mask is set too, but jsdom's cssstyle drops vendor-prefixed
    // properties — the Icon story test asserts it in a real chromium.)
    // The glyph inherits colour like text: background currentColor, never fill.
    expect(el.style.background).toBe('currentcolor')
  })

  it('fetches each name ONCE — the module-level cache is shared across mounts', async () => {
    const a = render(<Icon name="ac1-cache" />)
    const b = render(<Icon name="ac1-cache" />)
    await waitForMask(a.container.querySelector<HTMLElement>('[data-icon="ac1-cache"]')!)
    await waitForMask(b.container.querySelector<HTMLElement>('[data-icon="ac1-cache"]')!)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/icons/ac1-cache.png')).toHaveLength(1)
    // The shared loader resolves from the same cache entry.
    await expect(loadIcon('ac1-cache')).resolves.toContain('data:')
    expect(fetchMock.mock.calls.filter(([url]) => url === '/icons/ac1-cache.png')).toHaveLength(1)
  })

  it('a missing glyph stays unpainted (warn, never throw, no solid square)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockImplementation(async () => ({ ok: false }))
    const { container } = render(<Icon name="ac1-missing" />)
    const el = container.querySelector<HTMLElement>('[data-icon="ac1-missing"]')!
    await act(async () => {
      await loadIcon('ac1-missing')
    })
    expect(el.style.mask).toBe('')
    expect(el.style.background).toBe('')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('merges a caller className onto the span', () => {
    const { container } = render(<Icon name="ac1-cls" className="text-mn-area-a" />)
    expect(container.querySelector('[data-icon="ac1-cls"]')!.className).toContain('text-mn-area-a')
  })
})

// ── AC2: the KindDot atom (extracted page-kind mark) ────────────────────────

describe('KindDot — the page-kind mark', () => {
  it('renders the muted 7×7 2px-radius rounded square', () => {
    const { container } = render(<KindDot />)
    const el = container.querySelector<HTMLElement>('[data-part="dot"]')!
    expect(el.className).toContain('size-[7px]')
    expect(el.className).toContain('rounded-mn-hair') // --mn-radius-hair: 2px
    expect(el.className).toContain('bg-mn-text/50')
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })

  it('carries a raw area accent as an inline style (marks only)', () => {
    const { container } = render(<KindDot accent="#5f7355" />)
    const el = container.querySelector<HTMLElement>('[data-part="dot"]')!
    expect(el.style.background).toBe('rgb(95, 115, 85)')
    expect(el.className).not.toContain('bg-mn-text/50')
  })

  it('PondMolecule renders its list-row dot through KindDot, behaviour identical', () => {
    const { container } = render(<PondMolecule kind="list-row" accent="#5f7355" meta="" />)
    const dot = container.querySelector<HTMLElement>('[data-part="dot"]')!
    expect(dot.style.background).toBe('rgb(95, 115, 85)')
    expect(dot.className).toContain('size-[7px]')
    expect(dot.className).toContain('rounded-mn-hair')
  })
})

// ── AC3: the fixed default area→glyph map ───────────────────────────────────

describe('AREA_GLYPH — the fixed defaults', () => {
  it('maps the five default areas and the Life root', () => {
    expect(LIFE_GLYPH).toBe('waves-02')
    expect(areaGlyph('Personal')).toBe('house')
    expect(areaGlyph('Professional')).toBe('star-01')
    expect(areaGlyph('Health')).toBe('leaf-01')
    expect(areaGlyph('Finances')).toBe('stairs-01')
    expect(areaGlyph('Creativity')).toBe('flower-05')
  })

  it("also maps the legacy 'Financial' title (pre-#108 seeds wrote it)", () => {
    expect(areaGlyph('Financial')).toBe('stairs-01')
  })

  it('is case- and whitespace-insensitive; unmapped areas resolve to nothing', () => {
    expect(areaGlyph('  health ')).toBe('leaf-01')
    expect(areaGlyph('PERSONAL')).toBe('house')
    expect(areaGlyph('Food')).toBeUndefined()
    expect(areaGlyph('')).toBeUndefined()
  })
})

// ── AC4: wiring — Rail, area overview, the command path ─────────────────────

const node = (
  id: string,
  type: string,
  title: string,
  children: RailNode[] = [],
  order = 0,
  parentId: string | null = null
): RailNode => ({ id, parentId, type, title, order, children })

const TREE: RailNode[] = [
  node('health', 'page', 'Health', [node('sleep', 'page', 'Sleep', [], 0, 'health')]),
  node('personal', 'page', 'Personal', [node('food', 'page', 'Food', [], 0, 'personal')], 1),
  node('scratch', 'page', 'Scratchpad', [], 2),
]

function renderRail(marks?: ReadonlyMap<string, MarkSource>) {
  return render(
    <RailView
      tree={TREE}
      pondName="life"
      marks={marks}
      selectedId={null}
      expanded={new Set(['health', 'personal'])}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onSelect={jest.fn()}
      onToggle={jest.fn()}
      onAddChild={jest.fn()}
      onDelete={jest.fn()}
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      canDrop={() => true}
      onMove={jest.fn()}
    />
  )
}

describe('Rail — area marks ride the glyph system', () => {
  it('the Life root leads with the waves-02 glyph', () => {
    const { getByRole } = renderRail()
    const life = getByRole('treeitem', { name: /life/ })
    const glyph = life.querySelector<HTMLElement>(`[data-icon="${LIFE_GLYPH}"]`)!
    expect(glyph).toBeInTheDocument()
    // No hand-drawn half-disc left.
    expect(life.querySelector('circle')).toBeNull()
  })

  it('a mapped area row leads with its glyph in the area hue; its dot retires', () => {
    const { getByRole } = renderRail()
    const health = getByRole('treeitem', { name: /Health/ })
    const glyph = health.querySelector<HTMLElement>('[data-icon="leaf-01"]')!
    expect(glyph).toBeInTheDocument()
    // The glyph inherits the hue via currentColor on the slot — and since #134
    // that hue is a theme ROLE, so the rail agrees with the breadcrumb and the
    // kicker about the same page instead of hashing its own Press accent.
    const slot = glyph.closest<HTMLElement>('[data-area-mark]')!
    expect(slot.style.color).toMatch(/^var\(--mn-area-[abc]\)$/)
    expect(health.querySelector('[data-part="dot"]')).toBeNull()
  })

  // #108: the area voice (accent dot / glyph) rides TOP-LEVEL rows, since there is
  // no `type = 'area'` left to test and the fixed glyph defaults are written for
  // the seeded top-level areas. Per-page glyph/colour is #91's own work.
  it('an unmapped top-level area keeps the KindDot mark; nested pages carry neither', () => {
    const { getByRole } = renderRail()
    const scratch = getByRole('treeitem', { name: /Scratchpad/ })
    expect(scratch.querySelector('[data-icon]')).toBeNull()
    expect(scratch.querySelector('[data-part="dot"]')).toBeInTheDocument()
    const food = getByRole('treeitem', { name: /Food/ })
    expect(food.querySelector('[data-icon]')).toBeNull()
    expect(food.querySelector('[data-part="dot"]')).toBeNull()
    const sleep = getByRole('treeitem', { name: /Sleep/ })
    expect(sleep.querySelector('[data-icon]')).toBeNull()
    expect(sleep.querySelector('[data-part="dot"]')).toBeNull()
  })
})

// ── AC4 (integration): the page surface passes the glyph through ────────────

describe('DocumentPanel — the path it publishes leads with the area’s mark', () => {
  const at = '2026-01-01T00:00:00Z'
  const ROWS: PageRow[] = [
    { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: at },
    { id: 'personal', parent_id: null, type: 'page', title: 'Personal', order: 1, updated_at: at },
    { id: 'food', parent_id: 'personal', type: 'page', title: 'Food', order: 0, updated_at: at },
  ]
  for (const r of ROWS) {
    PAGES[r.id] = {
      id: r.id,
      parentId: r.parent_id,
      type: r.type,
      title: r.title,
      blocks: [],
      props: {},
    }
  }

  /** Seed ['pages'] so the panel renders from data without a fetch (envless). */
  function renderPanel(
    nodeId: string,
    markOn?: { id: string; glyph?: string | null; area_role?: string | null }
  ) {
    currentNodeId = nodeId
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(
      ['pages'],
      markOn ? ROWS.map((r) => (r.id === markOn.id ? { ...r, ...markOn } : r)) : ROWS
    )
    return render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>{withPathProbe(<DocumentPanel />)}</DeletionUndoProvider>
      </QueryClientProvider>
    )
  }

  const publishedGlyph = async (findByTestId: (id: string) => Promise<HTMLElement>) => {
    const probe = await findByTestId('command-path')
    return probe.getAttribute('data-glyph')
  }

  // `PondCommand.dc.html`: `GLYPH[path[1]] || GLYPH[path[0]]`, drawn in ink — the
  // mark names the area, and the pill is chrome, so it carries no area role.
  it('a page inside a mapped area leads its path with that area’s glyph', async () => {
    const { findByTestId } = renderPanel('food')
    await waitFor(async () => expect(await publishedGlyph(findByTestId)).toBe('house'))
  })

  it('a glyph the person chose beats the title-derived one (#134)', async () => {
    const { findByTestId } = renderPanel('food', {
      id: 'personal',
      glyph: 'tulip-01',
      area_role: 'area-c',
    })
    await waitFor(async () => expect(await publishedGlyph(findByTestId)).toBe('tulip-01'))
  })

  it('a top-level page is its own area, so the path leads with its own mark', async () => {
    const { findByTestId } = renderPanel('health')
    await waitFor(async () =>
      expect(await publishedGlyph(findByTestId)).toBe(areaGlyph('Health'))
    )
  })
})

describe('Rail — an explicit mark reaches the rail (#134)', () => {
  // Round two's trap: every other rail assertion runs the empty-map fallback, so
  // the conversion had no test. Round three then showed the FIRST version of these
  // tests did not bite either — destroying `resolveMark`'s ancestor walk left them
  // all green, because each one set the role on the row it asserted. They now
  // resolve a role the row does NOT carry, so the walk is load-bearing.
  function railMarks(entries: MarkSource[]): Map<string, MarkSource> {
    return new Map(entries.map((e) => [e.id, e]))
  }
  const HEALTH = { id: 'health', parentId: null, title: 'Health' }
  const SLEEP = { id: 'sleep', parentId: 'health', title: 'Sleep' }

  it('prefers a top-level row’s chosen glyph over its title-derived one', () => {
    const { getByRole } = renderRail(
      railMarks([{ ...HEALTH, glyph: 'tulip-01', areaRole: 'area-c' }, SLEEP])
    )
    const health = getByRole('treeitem', { name: /Health/ })
    expect(health.querySelector('[data-icon="tulip-01"]')).toBeInTheDocument()
    expect(health.querySelector('[data-icon="leaf-01"]')).toBeNull()
    expect(health.querySelector<HTMLElement>('[data-area-mark]')!.style.color).toBe(
      'var(--mn-area-c)'
    )
  })

  it('tints a nested row’s chosen glyph with the role INHERITED from its area', () => {
    // `sleep` carries a glyph and NO role; `health` carries the role. Break the
    // ancestor walk and this is the test that fails.
    const { getByRole } = renderRail(
      railMarks([
        { ...HEALTH, areaRole: 'area-c' },
        { ...SLEEP, glyph: 'moon' },
      ])
    )
    const sleep = getByRole('treeitem', { name: /Sleep/ })
    expect(sleep.querySelector('[data-icon="moon"]')).toBeInTheDocument()
    expect(sleep.querySelector<HTMLElement>('[data-area-mark]')!.style.color).toBe(
      'var(--mn-area-c)'
    )
  })

  it('paints a nested row’s dot when only a COLOUR was chosen', () => {
    // Round three: this was unreachable. The dot was gated on `isArea` as well as
    // on `accent`, so a hue set on a nested page showed in the breadcrumb and the
    // kicker and nowhere in the rail.
    const { getByRole } = renderRail(railMarks([HEALTH, { ...SLEEP, areaRole: 'area-b' }]))
    const sleep = getByRole('treeitem', { name: /Sleep/ })
    const dot = sleep.querySelector<HTMLElement>('[data-part="dot"]')!
    expect(dot).toBeInTheDocument()
    expect(dot.style.background).toBe('var(--mn-area-b)')
  })

  it('leaves an untouched nested row with no mark at all', () => {
    const { getByRole } = renderRail(railMarks([{ ...HEALTH, areaRole: 'area-c' }, SLEEP]))
    const sleep = getByRole('treeitem', { name: /Sleep/ })
    expect(sleep.querySelector('[data-icon]')).toBeNull()
    // Asserted as ABSENCE of the element — the earlier version read a style off a
    // node that was never there, so it could not have failed.
    expect(sleep.querySelector('[data-part="dot"]')).toBeNull()
  })
})

describe('Rail — the seed title resolves too', () => {
  it("an area titled 'Financial' (what pre-#108 seeds wrote) leads with stairs-01", () => {
    const { getByRole } = render(
      <RailView
        tree={[node('fin', 'page', 'Financial')]}
        pondName="life"
        selectedId={null}
        expanded={new Set()}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        onSelect={jest.fn()}
        onToggle={jest.fn()}
        onAddChild={jest.fn()}
        onDelete={jest.fn()}
        onLife={jest.fn()}
        onToggleLife={jest.fn()}
        canDrop={() => true}
        onMove={jest.fn()}
      />
    )
    const fin = getByRole('treeitem', { name: /Financial/ })
    expect(fin.querySelector('[data-icon="stairs-01"]')).toBeInTheDocument()
    expect(fin.querySelector('[data-part="dot"]')).toBeNull()
  })
})

// `hexToRgb` and `pageAccent` are gone from this file on purpose: after #134 no
// mark asserts a raw colour at all, which is what criterion 6 asks for. Every
// mark assertion now matches `var(--mn-area-*)` — a role the theme resolves.
