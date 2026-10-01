/**
 * #96 — the shell reskin onto Make Noise + the pond's name as the rail header.
 *
 * Paper, not frames: the wall and the modules are ONE sheet (#FAF9EF light /
 * #1B1D14 ground + #30312A cards dark), separated by shadow only. The rail
 * cluster, the breadcrumb and the composer FLOAT over that canvas on the
 * floating-glass recipe (README § Surfaces, read verbatim), rather than docking
 * to an edge. The rail header is the pond's NAME — no switcher, no chevron
 * (ADR 0002 trims C3 to a name; the switcher is M3).
 *
 * Source: wayfinder/design_handoff_pond — `Pond 05 Shell` 5af (the shell
 * frame), `PondRail` (head / loading / empty states), `Pond 02` 2t (the
 * breadcrumb pill). PROJECT_RULES.md and the README override the mockups.
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  usePathname: () => '/workspace',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
}))

const mockAreaRows = [
  {
    id: 'health',
    parent_id: null,
    type: 'page',
    title: 'Health',
    order: 0,
    updated_at: '2026-08-30T09:00:00Z',
  },
  {
    id: 'sleep',
    parent_id: 'health',
    type: 'page',
    title: 'Sleep',
    order: 0,
    updated_at: '2026-08-30T09:00:00Z',
  },
]
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn(() => Promise.resolve(mockAreaRows)),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life', blocks: [] }),
}))
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/client', () => ({
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  deletePage: jest.fn(),
  movePage: jest.fn(),
  getPage: jest.fn(),
  setProperty: jest.fn(),
}))

// The composer's data layer is not what this file is about; its CHROME is
// covered directly through TerminalDrawer below.
jest.mock('@/components/organisms/AITerminal', () => ({
  AITerminal: () => <section aria-label="Pond terminal" />,
}))

import { RailView, type RailNode } from '@/components/organisms/Rail'
import { Breadcrumb } from '@/components/molecules/Breadcrumb'
import { TerminalDrawer, TERMINAL_DEFAULT_HEIGHT } from '@/components/molecules/TerminalDrawer'
import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'
import { defaultPondName } from '@/lib/pond/name'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
/** Whitespace- and leading-zero-insensitive, so prettier's `0.86` matches the README's `.86`. */
const norm = (s: string) => s.replace(/\s+/g, '').replace(/(?<![\d.])0\./g, '.')
const block = (css: string, selector: string) => {
  const m = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!m) throw new Error(`no ${selector} block`)
  return m[1]
}

const TOUCHED = [
  'src/components/organisms/WorkspaceShell.tsx',
  'src/components/organisms/Rail.tsx',
  'src/components/organisms/DocumentPanel.tsx',
  'src/components/organisms/OverviewSurface.tsx',
  'src/components/organisms/ShellCommands.tsx',
  'src/components/molecules/Breadcrumb.tsx',
  'src/components/molecules/TerminalDrawer.tsx',
  'src/app/globals.css',
]

// ── AC1 / AC4: one paper sheet; dark flips roles, never raw values ──────────

describe('globals.css — one sheet, roles not raws (AC1, AC4)', () => {
  const css = read('src/app/globals.css')
  const root = block(css, ':root')
  const dark = block(css, '.dark')

  it('the raw palette carries paper, ink and the dark card exactly once', () => {
    expect(norm(root)).toContain('--raw-paper:#faf9ef;')
    expect(norm(root)).toContain('--raw-ink:#1b1d14;')
    expect(norm(root)).toContain('--raw-card-dark:#30312a;')
    // Raw values never move between themes: the dark block declares none.
    expect(dark).not.toMatch(/--raw-[a-z-]+\s*:/)
  })

  it('light: wall and cards are the SAME paper', () => {
    expect(norm(root)).toContain('--mn-surface:var(--raw-paper);')
    expect(norm(root)).toContain('--mn-card:var(--raw-paper);')
  })

  it('dark: ground flips to ink, cards one ramp step up — by role reassignment only', () => {
    expect(norm(dark)).toContain('--mn-surface:var(--raw-ink);')
    expect(norm(dark)).toContain('--mn-card:var(--raw-card-dark);')
  })

  it('cards: radius 20px and the paper shadow, verbatim', () => {
    expect(norm(root)).toContain('--mn-radius-card:20px;')
    expect(norm(root)).toContain('--mn-shadow-card:01px2pxrgb(403424/.04),08px24pxrgb(403424/.06);')
  })

  it('radii: pills 999, composer/card 20, inner 14, rows 10', () => {
    expect(norm(root)).toContain('--mn-radius-inner:14px;')
    expect(norm(root)).toContain('--mn-radius-row:10px;')
    expect(norm(root)).toContain('--mn-radius-pill:9999px;')
  })

  it('hairlines ink 9% / 5.5%, hover fill ink 7%', () => {
    expect(norm(root)).toContain('--mn-line:rgb(272920/.09);')
    expect(norm(root)).toContain('--mn-hair:rgb(272920/.055);')
    expect(norm(root)).toContain('--mn-hover-fill:rgb(272920/.07);')
  })
})

// ── AC2: the floating-glass recipe, verbatim ────────────────────────────────

describe('globals.css — floating glass (AC2)', () => {
  const css = read('src/app/globals.css')
  const root = block(css, ':root')
  const dark = block(css, '.dark')
  const glass = block(css, '.mn-glass')

  it('light glass is the README recipe, verbatim, as theme roles', () => {
    expect(norm(root)).toContain(
      '--mn-glass-bg:linear-gradient(160deg,rgba(255,255,255,.86),rgba(255,255,255,.64));'
    )
    expect(norm(root)).toContain('--mn-glass-border:1pxsolidrgba(255,255,255,.9);')
    expect(norm(root)).toContain(
      '--mn-glass-shadow:inset01px0rgba(255,255,255,.7),020px54pxrgba(40,34,24,.14);'
    )
  })

  it('.mn-glass reads the roles and keeps blur(24px) saturate(1.3)', () => {
    expect(norm(glass)).toContain('background:var(--mn-glass-bg);')
    expect(norm(glass)).toContain('backdrop-filter:blur(24px)saturate(1.3);')
    expect(norm(glass)).toContain('border:var(--mn-glass-border);')
    expect(norm(glass)).toContain('box-shadow:var(--mn-glass-shadow);')
    // A hand-written -webkit- twin makes Lightning CSS drop the standard
    // declaration, and Chromium never honoured the prefix: the blur vanished.
    expect(glass).not.toMatch(/-webkit-backdrop-filter/)
  })

  it('dark reassigns the glass roles (Pond 05 dark frames) without touching a raw', () => {
    expect(dark).toMatch(/--mn-glass-bg\s*:/)
    expect(dark).toMatch(/--mn-glass-border\s*:/)
    expect(dark).toMatch(/--mn-glass-shadow\s*:/)
    expect(norm(dark)).toContain(
      '--mn-glass-bg:linear-gradient(160deg,rgba(74,73,64,.86),rgba(48,49,42,.66));'
    )
  })
})

// ── AC5 / AC6: no off-scale type, no Press/Clearing ─────────────────────────

describe('touched files — type scale and supersession guards (AC5, AC6)', () => {
  it.each(TOUCHED)('%s carries no press-* token', (file) => {
    expect(read(file)).not.toMatch(/press-/)
  })

  it.each(TOUCHED.filter((f) => f.endsWith('.tsx')))(
    '%s sets no off-scale type size (11/13/16/18/22/28/36/46 only)',
    (file) => {
      const src = read(file)
      expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|\dxl)\b/)
      expect(src).not.toMatch(/text-\[[0-9.]+(px|rem|em)\]/)
    }
  )

  it('globals.css loads only the three PP faces', () => {
    const css = read('src/app/globals.css')
    expect(css).not.toMatch(/Fraunces|Newsreader|Inter\b|Clearing|Press\b/)
  })
})

// ── AC3: the rail header is the pond's name ─────────────────────────────────

function node(
  id: string,
  title: string,
  children: RailNode[] = [],
  parentId: string | null = null
): RailNode {
  return { id, type: 'page', title, order: 0, parentId, children }
}

const TREE: RailNode[] = [node('health', 'Health', [node('sleep', 'Sleep', [], 'health')])]

function renderRail(over: Partial<React.ComponentProps<typeof RailView>> = {}) {
  const onNewPage = jest.fn()
  const utils = render(
    <RailView
      tree={TREE}
      pondName="Life"
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
      onNewPage={onNewPage}
      canDrop={() => true}
      onMove={jest.fn()}
      {...over}
    />
  )
  return { ...utils, onNewPage }
}

describe('RailView — the pond name header (AC3)', () => {
  it('renders the pond name, outside the ARIA tree, with the pond glyph', () => {
    const { container } = renderRail({ pondName: 'Red door guys' })
    const name = container.querySelector<HTMLElement>('[data-part="pond-name"]')!
    expect(name).toHaveTextContent('Red door guys')
    expect(name.closest('[role="tree"]')).toBeNull()
    const head = name.closest<HTMLElement>('[data-part="rail-head"]')!
    expect(head.querySelector(`[data-icon="${LIFE_GLYPH}"]`)).toBeInTheDocument()
  })

  it('has no switcher and no chevron — a name only (ADR 0002)', () => {
    const { container } = renderRail()
    const head = container.querySelector<HTMLElement>('[data-part="rail-head"]')!
    expect(head.querySelector('button')).toBeNull()
    expect(head.querySelector('svg')).toBeNull()
    expect(head).not.toHaveTextContent('Pond')
  })

  it('the rail is a floating glass card, not a docked column', () => {
    const { container } = renderRail()
    const aside = container.querySelector('aside')!
    expect(aside.className).toMatch(/\bmn-glass\b/)
    expect(aside.className).toMatch(/\brounded-mn-card\b/)
    expect(aside.className).not.toMatch(/\bfixed\b/)
    expect(aside.className).not.toMatch(/\bborder-r\b/)
  })

  it('the foot carries "＋ new page" (PondRail foot), raising onNewPage', () => {
    const { onNewPage } = renderRail()
    fireEvent.click(screen.getByRole('button', { name: 'New page' }))
    expect(onNewPage).toHaveBeenCalledTimes(1)
  })
})

describe('RailView — loading and empty states (G6 / 7f)', () => {
  it('loading shows the skeleton bars with an accessible status', () => {
    const { container } = renderRail({ tree: [], isLoading: true })
    expect(container.querySelectorAll('[data-part="rail-skeleton"] > span')).toHaveLength(8)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('empty shows the PondRail hint', () => {
    renderRail({ tree: [], isEmpty: true })
    expect(screen.getByRole('status')).toHaveTextContent(
      'No pages yet. ＋ new page, or ask Pond to start one.'
    )
  })
})

// ── AC2: the breadcrumb pill ────────────────────────────────────────────────

describe('Breadcrumb — a floating glass pill with the ⌘K affordance (2t)', () => {
  const crumbs = [{ id: 'health', type: 'page', title: 'Health' }]

  it('is glass, pill-shaped, and leads with the pond glyph', () => {
    const { container } = render(
      <Breadcrumb crumbs={crumbs} onNavigate={jest.fn()} current="Sleep" />
    )
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.className).toMatch(/\bmn-glass\b/)
    expect(nav.className).toMatch(/\brounded-mn-pill\b/)
    // The pond glyph is not an AREA mark — #134's lead mark stays the only one.
    const glyph = container.querySelector(`[data-icon="${LIFE_GLYPH}"]`)!
    expect(glyph).toBeInTheDocument()
    expect(glyph.closest('[data-area-mark]')).toBeNull()
  })

  it('renders the ⌘K chip only when a handler is given, and raises it', () => {
    const onCommandK = jest.fn()
    const { rerender } = render(
      <Breadcrumb crumbs={crumbs} onNavigate={jest.fn()} onCommandK={onCommandK} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Command palette (⌘K)' }))
    expect(onCommandK).toHaveBeenCalledTimes(1)
    rerender(<Breadcrumb crumbs={crumbs} onNavigate={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Command palette (⌘K)' })).toBeNull()
  })

  it('the tail slot renders inside the pill in place of `current`', () => {
    render(
      <Breadcrumb
        crumbs={crumbs}
        onNavigate={jest.fn()}
        tail={<input aria-label="Rename page" defaultValue="Sleep" />}
      />
    )
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('textbox', { name: 'Rename page' })).toBeInTheDocument()
  })
})

// ── AC2: the composer floats over the canvas ────────────────────────────────

describe('TerminalDrawer — the composer is floating glass, not a docked band', () => {
  it('overlays the bottom of the column and lets the flanks click through', () => {
    const { container } = render(
      <TerminalDrawer
        contextLabel="Life"
        height={TERMINAL_DEFAULT_HEIGHT}
        collapsed={false}
        onToggleCollapsed={jest.fn()}
        onHeightChange={jest.fn()}
        onClear={jest.fn()}
        footer={<div>footer</div>}
      >
        <div>body</div>
      </TerminalDrawer>
    )
    const section = screen.getByRole('region', { name: 'Pond terminal' })
    expect(section.className).toMatch(/\babsolute\b/)
    expect(section.className).toMatch(/\bbottom-0\b/)
    expect(section.className).toMatch(/\bpointer-events-none\b/)
    const card = container.querySelector<HTMLElement>('[data-part="composer-card"]')!
    expect(card.className).toMatch(/\bmn-glass\b/)
    expect(card.className).toMatch(/\brounded-mn-card\b/)
    expect(card.className).toMatch(/\bpointer-events-auto\b/)
    expect(screen.getByRole('separator', { name: 'Resize terminal' }).className).toMatch(
      /\bpointer-events-auto\b/
    )
  })
})

// ── The pond's name ─────────────────────────────────────────────────────────

describe('defaultPondName — the M1 seam for the pond name', () => {
  it('names the main pond and the sandbox', () => {
    expect(defaultPondName('main')).toBe('Life')
    expect(defaultPondName('sandbox')).toBe('Sandbox')
  })
})

// ── Integration: the shell as one surface ───────────────────────────────────

describe('WorkspaceShell — the chrome floats over one canvas', () => {
  function renderShell() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <WorkspaceShell>{null}</WorkspaceShell>
      </QueryClientProvider>
    )
  }

  it('rail = glass card with the pond name; ⌘K lives in the breadcrumb, ＋ in the rail foot', async () => {
    const { container } = renderShell()
    const aside = await screen.findByRole('complementary')
    expect(aside.className).toMatch(/\bmn-glass\b/)
    expect(container.querySelector('[data-part="pond-name"]')).toHaveTextContent('Life')

    // One ⌘K affordance, inside the breadcrumb pill — the top-right cluster is gone.
    const kButtons = await screen.findAllByRole('button', { name: 'Command palette (⌘K)' })
    expect(kButtons).toHaveLength(1)
    expect(kButtons[0].closest('nav[aria-label="Breadcrumb"]')).not.toBeNull()
    expect(container.querySelector('.fixed')).toBeNull()

    // One "New page" affordance, in the rail foot.
    const plus = screen.getAllByRole('button', { name: 'New page' })
    expect(plus).toHaveLength(1)
    expect(aside.contains(plus[0])).toBe(true)
  })

  it('the breadcrumb ⌘K opens the palette; the rail ＋ opens the New page dialog', async () => {
    renderShell()
    const k = (await screen.findAllByRole('button', { name: 'Command palette (⌘K)' }))[0]
    await act(async () => {
      fireEvent.click(k)
    })
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close palette' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New page' }))
    })
    expect(await screen.findByRole('textbox', { name: /page title/i })).toBeInTheDocument()
  })
})
