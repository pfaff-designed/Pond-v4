/**
 * #96 — the shell reskin onto Make Noise + the pond's name as the rail header.
 *
 * Paper, not frames: the wall and the modules are ONE sheet (#FAF9EF light /
 * #1B1D14 ground + #30312A cards dark), separated by shadow only. The rail is
 * a PAPER card (the card role, no blur) and the breadcrumb and the composer
 * FLOAT over that canvas on the floating-glass recipe (README § Surfaces, read
 * verbatim) — all three inset from the edges, none docked. The breadcrumb and
 * composer are SHELL-level absolutes centred at calc(50% + 13px) (measured in
 * `Pond 05 Shell`), and the composer publishes its real height so the surfaces
 * pad against ONE value. The rail header is the pond's NAME — no switcher, no
 * chevron (ADR 0002 trims C3 to a name; the switcher is M3).
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
  // #234: the root is a page — DocumentPanel reads the home row through the
  // ordinary page read, so the shell's canvas renders a page at the root.
  getPage: jest.fn().mockResolvedValue({
    id: 'home-1',
    parentId: null,
    type: 'home',
    title: 'Life',
    blocks: [],
    props: {},
  }),
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
import { RAIL_WIDTH_PX } from '@/lib/layout/rail-width'
import {
  COMPOSER_CLEARANCE_GAP,
  COMPOSER_CLEARANCE_VAR,
  PROPOSAL_MIN_HEIGHT,
  TERMINAL_COLLAPSED_HEIGHT,
  composerClearancePadding,
  drawerFootprintPx,
} from '@/lib/layout/terminal-height'

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
  'src/components/organisms/ShellCommands.tsx',
  'src/components/molecules/Breadcrumb.tsx',
  'src/components/molecules/TerminalDrawer.tsx',
  'src/components/molecules/ContentWidthHandle.tsx',
  'src/components/atoms/PondMark.tsx',
  'src/lib/layout/breadcrumb-slot.tsx',
  'src/lib/layout/terminal-height.ts',
  'src/lib/layout/rail-width.ts',
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
      '--mn-glass-bg:linear-gradient(160deg,rgba(72,73,64,.86),rgba(48,49,42,.66));'
    )
  })
})

// ── AC5 / AC6: no off-scale type, no Press/Clearing ─────────────────────────

describe('touched files — type scale and supersession guards (AC5, AC6)', () => {
  it.each(TOUCHED)('%s carries no press-* token', (file) => {
    expect(read(file)).not.toMatch(/press-/)
  })

  // Bracket type is correct and deliberately NOT asserted against: ADR 0003's
  // 2026-10-01 amendment superseded the "snap to the 8-step scale" ruling, and
  // ADR 0004 ruling 12 records why this guard was narrowed. The named-size ban
  // is the half that survives — `text-sm`/`text-lg` appear in no board.
  it.each(TOUCHED.filter((f) => f.endsWith('.tsx')))(
    '%s uses no Tailwind named type size (board values go in as bracket notation)',
    (file) => {
      expect(read(file)).not.toMatch(/\btext-(xs|sm|base|lg|xl|\dxl)\b/)
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
      canDrop={() => true}
      onMove={jest.fn()}
      {...over}
    />
  )
  return utils
}

describe('RailView — the pond name header (AC3)', () => {
  it('renders the pond name, outside the ARIA tree', () => {
    const { container } = renderRail({ pondName: 'Red door guys' })
    const name = container.querySelector<HTMLElement>('[data-part="pond-name"]')!
    expect(name).toHaveTextContent('Red door guys')
    expect(name.closest('[role="tree"]')).toBeNull()
  })

  it('has no switcher button and no chevron without ponds; the bell is a decorative mark', () => {
    const { container } = renderRail()
    const head = container.querySelector<HTMLElement>('[data-part="rail-head"]')!
    expect(head.querySelector('button')).toBeNull()
    // The only svg is the bell's — a chevron would be a second one.
    const bell = head.querySelector<HTMLElement>('[data-part="reminders-bell"]')!
    expect(head.querySelectorAll('svg')).toHaveLength(1)
    expect(bell.querySelector('svg')).not.toBeNull()
    expect(bell).toHaveAttribute('aria-hidden', 'true')
    expect(bell.closest('[role="tree"]')).toBeNull()
    expect(head).not.toHaveTextContent('Pond')
  })

  it('the head is padded 0 16px 12px, name left and bell right, centred, gap 8 (PondRail head)', () => {
    const { container } = renderRail()
    const head = container.querySelector<HTMLElement>('[data-part="rail-head"]')!
    expect(head.className).toMatch(/\bpx-4\b/)
    expect(head.className).toMatch(/\bpb-3\b/)
    expect(head.className).toMatch(/\bgap-2\b/)
    expect(head.className).toMatch(/\bjustify-between\b/)
    expect(head.className).toMatch(/\bitems-center\b/)
    expect(head.className).not.toMatch(/\bitems-baseline\b/)
  })

  it('the rail is a floating PAPER card (the card role, no glass), not a docked column', () => {
    // `PondRail` / `Pond 05 Shell`, measured: background = the card paper,
    // box-shadow = the card shadow, radius 20, no backdrop-filter. Light is
    // one paper so it reads by shadow alone; dark flips --mn-card to #30312A.
    const { container } = renderRail()
    const aside = container.querySelector<HTMLElement>('aside')!
    expect(aside.className).toMatch(/\bbg-mn-card\b/)
    expect(aside.className).toMatch(/\bshadow-mn-card\b/)
    expect(aside.className).toMatch(/\brounded-mn-card\b/)
    expect(aside.className).not.toMatch(/\bmn-glass\b/)
    expect(aside.className).not.toMatch(/\bfixed\b/)
    expect(aside.className).not.toMatch(/\bborder-r\b/)
    // 206 wide, from the one shared constant (not a second hardcoded 206).
    expect(aside.style.width).toBe(`${RAIL_WIDTH_PX}px`)
    expect(RAIL_WIDTH_PX).toBe(206)
  })

  it("the head is the pond's 13px glyph and its name at 13.5 / 500, full ink (PondRail head)", () => {
    const { container } = renderRail()
    const head = container.querySelector<HTMLElement>('[data-part="rail-head"]')!
    const name = container.querySelector<HTMLElement>('[data-part="pond-name"]')!
    expect(name.className).toMatch(/text-\[13\.5px\]/)
    expect(name.className).toMatch(/\bfont-medium\b/)
    expect(name.className).toMatch(/\btruncate\b/)
    expect(name.className).toMatch(/\btext-mn-text\b/)
    expect(name.className).not.toMatch(/\b(uppercase|tracking-)/)
    // The pond's own mark (a plain mask, no area hue), 13px; `waves-02` until the
    // pond names a glyph of its own.
    const glyph = head.querySelector<HTMLElement>(`[data-icon="${LIFE_GLYPH}"]`)!
    expect(glyph.style.width).toBe('13px')
    expect(glyph.closest('[data-pond-mark]')).not.toBeNull()
    expect(head.querySelector('[data-area-mark]')).toBeNull()
  })

  it('the foot is databases and settings — no "＋ new page"', () => {
    renderRail()
    expect(screen.queryByRole('button', { name: 'New page' })).toBeNull()
    expect(screen.queryByText(/＋ new page$/)).toBeNull()
    expect(screen.getByRole('button', { name: 'settings' })).toBeInTheDocument()
  })

  it('settings raises onOpenSettings; with no handler it is aria-disabled and inert', () => {
    const onOpenSettings = jest.fn()
    const { unmount } = renderRail({ onOpenSettings })
    const live = screen.getByRole('button', { name: 'settings' })
    expect(live).not.toHaveAttribute('aria-disabled')
    fireEvent.click(live)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    unmount()

    renderRail()
    const dead = screen.getByRole('button', { name: 'settings' })
    expect(dead).toHaveAttribute('aria-disabled', 'true')
    expect(() => fireEvent.click(dead)).not.toThrow()
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
      'no pages yet. ＋ new page, or ask pond to start one.'
    )
  })
})

// ── AC2: the breadcrumb pill ────────────────────────────────────────────────

describe('Breadcrumb — a floating glass pill with the ⌘K affordance (2t)', () => {
  const crumbs = [{ id: 'health', type: 'page', title: 'Health' }]

  it('is glass, pill-shaped, 40px tall, and leads with the pond mark at 12', () => {
    const { container } = render(
      <Breadcrumb crumbs={crumbs} onNavigate={jest.fn()} current="Sleep" />
    )
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.className).toMatch(/\bmn-glass\b/)
    expect(nav.className).toMatch(/\brounded-mn-pill\b/)
    // `Pond 05 Shell`, measured: height 40, padding 8px 8px 8px 14px, gap 10.
    expect(nav.className).toMatch(/\bh-10\b/)
    expect(nav.className).toMatch(/\bpy-2\b/)
    expect(nav.className).toMatch(/\bpr-2\b/)
    expect(nav.className).toMatch(/\bpl-3\.5\b/)
    expect(nav.className).toMatch(/\bgap-2\.5\b/)
    // The pond's mark is the shared PondMark (plain mask in currentColor), not
    // an AREA mark — #134's lead mark stays the only one.
    const glyph = container.querySelector<HTMLElement>(`[data-icon="${LIFE_GLYPH}"]`)!
    expect(glyph).toBeInTheDocument()
    expect(glyph.style.width).toBe('12px')
    expect(glyph.closest('[data-pond-mark]')).not.toBeNull()
    expect(glyph.closest('[data-area-mark]')).toBeNull()
  })

  it("positions nothing itself — where the pill sits is the shell slot's job", () => {
    render(<Breadcrumb crumbs={crumbs} onNavigate={jest.fn()} current="Sleep" />)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.className).not.toMatch(/\b(absolute|fixed|sticky)\b/)
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

  // #101 review: `Pond 06.10`'s pill reads "life › creativity › recipes › …" —
  // every segment lowercase, the root included, and no segment title-cased by the
  // pill itself (a crumb is its page title verbatim).
  it('the root crumb reads lowercase "life", and no segment is title-cased', () => {
    render(<Breadcrumb crumbs={crumbs} onNavigate={jest.fn()} current="Sleep" />)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('life')).toBeInTheDocument()
    expect(within(nav).queryByText('Life')).toBeNull()
    expect(nav.className).not.toMatch(/\b(capitalize|uppercase|lowercase)\b/)
    // The crumbs keep their pages' own casing — the pill never restyles them.
    expect(within(nav).getByText('Health')).toBeInTheDocument()
  })

  // 3c's two roots are peers, so a page under databases must not read as if it
  // were inside life; the root crumb is the real page, so a click opens it.
  it('starts at the databases root when given one, with no life ahead of it', () => {
    const onNavigate = jest.fn()
    const root = { id: 'root-db', type: 'page', title: 'databases' }
    render(<Breadcrumb crumbs={[]} root={root} onNavigate={onNavigate} current="ingredients" />)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).queryByText('life')).toBeNull()
    fireEvent.click(within(nav).getByText('databases'))
    expect(onNavigate).toHaveBeenCalledWith(root)
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

function renderDrawer(over: Partial<React.ComponentProps<typeof TerminalDrawer>> = {}) {
  return render(
    <TerminalDrawer
      contextLabel="Life"
      height={TERMINAL_DEFAULT_HEIGHT}
      collapsed={false}
      onToggleCollapsed={jest.fn()}
      onHeightChange={jest.fn()}
      onClear={jest.fn()}
      footer={<div>footer</div>}
      {...over}
    >
      <div>body</div>
    </TerminalDrawer>
  )
}

describe('TerminalDrawer — the composer is floating glass, not a docked band', () => {
  it('overlays the bottom of the shell and lets the flanks click through', () => {
    const { container } = renderDrawer()
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

  it('is centred on the WHOLE shell at calc(50% + 13px), 534 wide, 24px off the bottom (measured)', () => {
    const { container } = renderDrawer()
    const column = container.querySelector<HTMLElement>('[data-part="composer-column"]')!
    expect(column.className).toMatch(/\babsolute\b/)
    expect(column.className).toMatch(/\bleft-\[calc\(50%_\+_13px\)\]/)
    expect(column.className.split(' ')).toContain('-translate-x-1/2')
    expect(column.className).toMatch(/\bw-\[534px\]/)
    // the card fills the column — no second centring, no max-w-2xl
    const card = container.querySelector<HTMLElement>('[data-part="composer-card"]')!
    expect(card.className).toMatch(/\bw-full\b/)
    expect(card.className).not.toMatch(/max-w-2xl|mx-auto/)
    // 24px off the bottom: the card's wrapper carries pb-6
    expect(card.parentElement!.className).toMatch(/\bpb-6\b/)
    // the handle is confined to the column too — it never reaches over the rail
    expect(
      screen
        .getByRole('separator', { name: 'Resize terminal' })
        .closest('[data-part="composer-column"]')
    ).toBe(column)
  })
})

// ── One source for the composer's clearance ─────────────────────────────────

describe('composer clearance — the drawer publishes its real height, the surfaces pad against it', () => {
  it('the padding reads the published variable, falling back to the default drawer, plus 24px of air', () => {
    expect(COMPOSER_CLEARANCE_GAP).toBe(24)
    expect(composerClearancePadding()).toBe(
      `calc(var(${COMPOSER_CLEARANCE_VAR}, ${TERMINAL_DEFAULT_HEIGHT + TERMINAL_COLLAPSED_HEIGHT}px) + 24px)`
    )
    expect(drawerFootprintPx(500, true)).toBe(TERMINAL_COLLAPSED_HEIGHT)
    expect(drawerFootprintPx(500, false)).toBe(540)
  })

  function renderInShell(over: Partial<React.ComponentProps<typeof TerminalDrawer>> = {}) {
    const shell = document.createElement('div')
    shell.setAttribute('data-part', 'shell')
    document.body.appendChild(shell)
    const utils = render(
      <TerminalDrawer
        contextLabel="Life"
        height={TERMINAL_DEFAULT_HEIGHT}
        collapsed={false}
        onToggleCollapsed={jest.fn()}
        onHeightChange={jest.fn()}
        onClear={jest.fn()}
        footer={<div>footer</div>}
        {...over}
      >
        <div>body</div>
      </TerminalDrawer>,
      { container: shell }
    )
    const read = () => shell.style.getPropertyValue(COMPOSER_CLEARANCE_VAR)
    return { ...utils, shell, read }
  }

  it('tracks the drawer: collapsed → the strip alone; a proposal open → its floor + the strip', () => {
    const { read, rerender, unmount } = renderInShell({ collapsed: true })
    expect(read()).toBe(`${TERMINAL_COLLAPSED_HEIGHT}px`)

    // AITerminal auto-grows the drawer to PROPOSAL_MIN_HEIGHT while a diff needs
    // review (the accept/reject gesture) — the clearance must follow, so that
    // gesture is never pinned behind the glass with no scroll room.
    rerender(
      <TerminalDrawer
        contextLabel="Life"
        height={PROPOSAL_MIN_HEIGHT}
        collapsed={false}
        onToggleCollapsed={jest.fn()}
        onHeightChange={jest.fn()}
        onClear={jest.fn()}
        footer={<div>footer</div>}
      >
        <div>body</div>
      </TerminalDrawer>
    )
    expect(read()).toBe(`${PROPOSAL_MIN_HEIGHT + TERMINAL_COLLAPSED_HEIGHT}px`)
    expect(PROPOSAL_MIN_HEIGHT + TERMINAL_COLLAPSED_HEIGHT).toBe(540)

    // the drawer's own box is sized from the very same value
    expect(screen.getByRole('region', { name: 'Pond terminal' }).style.height).toBe('540px')

    // gone with the drawer — no stale clearance left on the shell
    unmount()
    expect(read()).toBe('')
  })

  it('a user drag publishes the dragged height', () => {
    const { read } = renderInShell({ height: 160 })
    expect(read()).toBe(`${160 + TERMINAL_COLLAPSED_HEIGHT}px`)
  })
})

// ── The pond's name ─────────────────────────────────────────────────────────

describe('defaultPondName — the M1 seam for the pond name', () => {
  // #101 review: lowercase. The rail's source copy is lowercase throughout (life,
  // personal, journal, notes) and the head applies no text-transform, so the data
  // is what the head shows.
  it('names the first pond, lowercase', () => {
    expect(defaultPondName()).toBe('life')
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

  it('rail = paper card with the pond name; ⌘K lives in the breadcrumb, settings in the rail foot', async () => {
    const { container } = renderShell()
    const aside = await screen.findByRole('complementary')
    expect(aside.className).toMatch(/\bbg-mn-card\b/)
    expect(aside.className).not.toMatch(/\bmn-glass\b/)
    expect(container.querySelector('[data-part="pond-name"]')).toHaveTextContent('life')

    // One ⌘K affordance, inside the breadcrumb pill — the top-right cluster is gone.
    const kButtons = await screen.findAllByRole('button', { name: 'Command palette (⌘K)' })
    expect(kButtons).toHaveLength(1)
    expect(kButtons[0].closest('nav[aria-label="Breadcrumb"]')).not.toBeNull()
    expect(container.querySelector('.fixed')).toBeNull()

    // The rail foot is databases and settings; no "New page" button anywhere.
    expect(screen.queryByRole('button', { name: 'New page' })).toBeNull()
    expect(aside.contains(screen.getByRole('button', { name: 'settings' }))).toBe(true)
  })

  it('the breadcrumb and the composer are SHELL-level absolutes, not column children (measured)', async () => {
    const { container } = renderShell()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    const shell = container.querySelector<HTMLElement>('[data-part="shell"]')!
    const main = container.querySelector<HTMLElement>('main')!

    // The pill portals into the shell's slot: top 20, left calc(50% + 13px),
    // translateX(-50%) — relative to the WHOLE shell, not the content column.
    const slot = nav.closest<HTMLElement>('[data-part="breadcrumb-slot"]')!
    expect(slot).not.toBeNull()
    expect(slot.parentElement).toBe(shell)
    expect(slot.className).toMatch(/\babsolute\b/)
    expect(slot.className).toMatch(/\btop-5\b/)
    expect(slot.className).toMatch(/\bleft-\[calc\(50%_\+_13px\)\]/)
    expect(slot.className.split(' ')).toContain('-translate-x-1/2')
    expect(main.contains(nav)).toBe(false)
    // …and no sticky breadcrumb is left behind in the column. (#234: the root is
    // an ordinary page, so the column carries the #58 width handle, whose grip is
    // the one legitimate sticky inside it — the guard is against a pill, not that.)
    expect(main.querySelector('.sticky nav, nav.sticky')).toBeNull()

    // The composer is the shell's child too — its calc(50% + 13px) is against the shell.
    const terminal = screen.getByRole('region', { name: 'Pond terminal' })
    expect(terminal.parentElement).toBe(shell)
    expect(main.contains(terminal)).toBe(false)

    // No fixed 288px stand-in anywhere: <main> carries no bottom padding, and the
    // surface pads against the composer's published clearance instead, starting
    // 76px down (under the pill — the mockup's 20px inset + 56px padding).
    expect(main.className).not.toMatch(/\bpb-/)
    expect(shell.querySelectorAll('.pb-72')).toHaveLength(0)
    const column = main.querySelector<HTMLElement>('.mx-auto.px-8')!
    expect(column.className).toMatch(/\bpt-\[76px\]/)
    expect(column.getAttribute('style')).toContain(COMPOSER_CLEARANCE_VAR)
  })

  it('the breadcrumb ⌘K opens the palette', async () => {
    renderShell()
    const k = (await screen.findAllByRole('button', { name: 'Command palette (⌘K)' }))[0]
    await act(async () => {
      fireEvent.click(k)
    })
    // #279: a floating glass with a combobox, not a dialog.
    expect(await screen.findByRole('combobox', { name: 'command palette' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'esc' }))
  })
})
