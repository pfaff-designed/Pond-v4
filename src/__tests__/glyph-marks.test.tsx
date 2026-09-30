/**
 * The Make Noise glyph mark system (#91) — rendering primitives + the
 * fixed default area→glyph wiring. These tests defend the acceptance criteria:
 * the `Icon` atom fetches `/icons/<name>.png` ONCE per name (module-level
 * cache), applies it as a data-URI CSS mask over `background: currentColor`
 * (so the glyph inherits colour like text — colour via `color`, never `fill`),
 * stays SSR-safe (an empty sized `<span>` until painted) and quiet on a miss;
 * `KindDot` is the extracted page-kind mark (muted 7×7, 2px-radius rounded
 * square in an area colour) that PondMolecule now renders through; the
 * `AREA_GLYPH` map resolves the six fixed defaults (Life→ring, Personal→house,
 * Professional→star-01, Health→leaf-01, Finances→stairs-01,
 * Creativity→flower-05); and the wiring holds — the Rail's Life root and every
 * mapped area row lead with their glyph in the area hue (page-kind marks stay
 * KindDot, unmapped areas keep the dot), the area-overview kicker carries the
 * glyph, and an area crumb in the Breadcrumb shows its mark.
 */
import React from 'react'
import { render, waitFor, act } from '@testing-library/react'
import { Icon, loadIcon } from '@/components/atoms/Icon'
import { KindDot } from '@/components/atoms/KindDot'
import { LIFE_GLYPH, areaGlyph } from '@/lib/rail/area-glyph'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { RailView, type RailNode } from '@/components/organisms/Rail'
import { Breadcrumb } from '@/components/molecules/Breadcrumb'
import { OverviewSurface } from '@/components/organisms/OverviewSurface'
import { AreaOverviewPanel } from '@/components/organisms/OverviewSurface'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { pageAccent } from '@/lib/pages/accent'
import type { OverviewModel } from '@/lib/pages/overview'
import type { PageRow } from '@/lib/pages/tree'

// The container tests (AreaOverviewPanel) reach useRouter through the crumb
// navigation hook; the presentational RailView / Breadcrumb never touch it.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
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
    expect(LIFE_GLYPH).toBe('ring')
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

// ── AC4: wiring — Rail, area overview, Breadcrumb ───────────────────────────

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

function renderRail() {
  return render(
    <RailView
      tree={TREE}
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
  it('the Life root leads with the ring glyph in the area colour (LifeMark retired)', () => {
    const { getByRole } = renderRail()
    const life = getByRole('treeitem', { name: /Life/ })
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
    // The glyph inherits the SAME hue the dot used, via currentColor on the slot.
    const slot = glyph.closest<HTMLElement>('[data-area-mark]')!
    expect(slot.style.color).toBeTruthy()
    expect(slot.style.color).toBe(hexToRgb(pageAccent('health')))
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

describe('Breadcrumb — an area crumb shows its mark', () => {
  it('renders the glyph inside a mapped area crumb, tinted by the area accent', () => {
    const { getByRole } = render(
      <Breadcrumb
        crumbs={[
          { id: 'health', type: 'page', title: 'Health' },
          { id: 'sleep', type: 'page', title: 'Sleep' },
        ]}
        onNavigate={jest.fn()}
        current="Dreams"
      />
    )
    const health = getByRole('button', { name: /Health/ })
    const glyph = health.querySelector<HTMLElement>('[data-icon="leaf-01"]')!
    expect(glyph).toBeInTheDocument()
    const slot = glyph.closest<HTMLElement>('[data-area-mark]')!
    expect(slot.style.color).toBe(hexToRgb(pageAccent('health')))
    // A page crumb shows no mark.
    expect(getByRole('button', { name: /Sleep/ }).querySelector('[data-icon]')).toBeNull()
  })
})

describe('OverviewSurface — the kicker mark', () => {
  const MODEL: OverviewModel = { focal: '7', focalCaption: '7 pages within.', cards: [] }

  it('a mapped area leads its kicker with the glyph in the area hue (dot retired)', () => {
    const { container } = render(
      <OverviewSurface
        kicker="Health"
        accent="#5f7355"
        glyph="leaf-01"
        model={MODEL}
        closing="That’s Health at a glance."
        onOpenCard={jest.fn()}
      />
    )
    const glyph = container.querySelector<HTMLElement>('[data-icon="leaf-01"]')!
    expect(glyph).toBeInTheDocument()
    const slot = glyph.closest<HTMLElement>('[data-area-mark]')!
    expect(slot.style.color).toBe('rgb(95, 115, 85)')
    expect(container.querySelector('[data-part="kicker-dot"]')).toBeNull()
  })

  it('without a glyph the accent square stays exactly as before', () => {
    const { container } = render(
      <OverviewSurface
        kicker="Food"
        accent="#5f7355"
        model={MODEL}
        closing="That’s Food at a glance."
        onOpenCard={jest.fn()}
      />
    )
    expect(container.querySelector('[data-icon]')).toBeNull()
    const square = container.querySelector<HTMLElement>('[data-part="kicker-dot"]')!
    expect(square.style.background).toBe('rgb(95, 115, 85)')
  })
})

// ── AC4 (integration): the containers pass the glyph through ────────────────

describe('AreaOverviewPanel — the container resolves the glyph from the title', () => {
  const at = '2026-01-01T00:00:00Z'
  const ROWS: PageRow[] = [
    { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: at },
    { id: 'personal', parent_id: null, type: 'page', title: 'Personal', order: 1, updated_at: at },
    { id: 'food', parent_id: 'personal', type: 'page', title: 'Food', order: 0, updated_at: at },
  ]

  /** Seed ['pages'] so the panel renders from data without a fetch (envless). */
  function renderPanel(areaId: string, title: string) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(['pages', 'main'], ROWS)
    return render(
      <QueryClientProvider client={client}>
        <AreaOverviewPanel areaId={areaId} title={title} />
      </QueryClientProvider>
    )
  }

  it('a mapped area leads its kicker with the glyph in the area hue', () => {
    const { container } = renderPanel('health', 'Health')
    const glyph = container.querySelector<HTMLElement>('[data-icon="leaf-01"]')!
    expect(glyph).toBeInTheDocument()
    const slot = glyph.closest<HTMLElement>('[data-area-mark]')!
    expect(slot.style.color).toBe(hexToRgb(pageAccent('health')))
    expect(container.querySelector('[data-part="kicker-dot"]')).toBeNull()
  })

  it('an unmapped nested area keeps the accent square; its area crumb shows the parent mark', () => {
    const { container, getByRole } = renderPanel('food', 'Food')
    const square = container.querySelector<HTMLElement>('[data-part="kicker-dot"]')!
    expect(square).toBeInTheDocument()
    // Coloured by the top-level ancestor, as before (#91 changes no hue).
    expect(square.style.background).toBe(hexToRgb(pageAccent('personal')))
    // The trail's Personal crumb carries the house glyph; nothing else does.
    const crumb = getByRole('button', { name: /Personal/ })
    expect(crumb.querySelector('[data-icon="house"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-icon]')).toHaveLength(1)
  })
})

describe('Rail — the seed title resolves too', () => {
  it("an area titled 'Financial' (what pre-#108 seeds wrote) leads with stairs-01", () => {
    const { getByRole } = render(
      <RailView
        tree={[node('fin', 'page', 'Financial')]}
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

/** '#5f7355' → 'rgb(95, 115, 85)' — jsdom normalises inline colours to rgb(). */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
