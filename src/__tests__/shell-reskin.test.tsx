/**
 * #96 — the shell reskin onto Make Noise + the pond's name as the rail header.
 *
 * Paper, not frames: the wall and the modules are ONE sheet (#FAF9EF light /
 * #1B1D14 ground + #30312A cards dark), separated by shadow only. The rail is
 * a PAPER card (the card role, no blur) and `PondCommand` (the breadcrumb that
 * grows into the palette) and the composer FLOAT over that canvas on the
 * floating-glass recipe (README § Surfaces, read verbatim) — all three inset from
 * the edges, none docked. The pill and the composer are SHELL-level absolutes
 * (the pill at calc(50% + 13px), the composer centred right of the rail at
 * calc(50% + 113px), per `PondComposer`), and the composer publishes its real
 * height so the surfaces pad against ONE value. The rail header is the pond's
 * glyph and name.
 *
 * Source: wayfinder/design_handoff_pond — `Pond 05 Shell` 5af (the shell
 * frame), `PondRail` (head / loading / empty states), `Pond 02` 2g (`PondCommand`,
 * the path at rest). PROJECT_RULES.md and the README override the mockups.
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
jest.mock('@/lib/pages/commit', () => jest.requireActual('./helpers/page-commit-mock').pageCommitMock())
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
  AITerminal: () => <section aria-label="composer" />,
}))

import { RailView, type RailNode } from '@/components/organisms/Rail'
import { commandPath } from '@/lib/pages/command-path'
import { markIndex, resolveMark } from '@/lib/pages/mark'
import type { PageRow } from '@/lib/pages/tree'
import { TerminalDrawer } from '@/components/molecules/TerminalDrawer'
import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'
import { defaultPondName } from '@/lib/pond/name'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { RAIL_WIDTH_PX } from '@/lib/layout/rail-width'
import {
  COMPOSER_BOTTOM_INSET,
  COMPOSER_CLEARANCE_GAP,
  COMPOSER_CLEARANCE_VAR,
  COMPOSER_REST_HEIGHT,
  composerClearancePadding,
  composerFootprintPx,
} from '@/lib/layout/composer-clearance'
import {
  COMPOSER_DEFAULT_HEIGHT,
  COMPOSER_HEIGHT_KEY,
  COMPOSER_MIN_HEIGHT,
  COMPOSER_TOP_CLEARANCE,
  composerMaxHeight,
  readStoredComposerHeight,
} from '@/lib/layout/composer-height'

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
  'src/components/organisms/PondCommand.tsx',
  'src/components/molecules/TerminalDrawer.tsx',
  'src/components/molecules/ContentWidthHandle.tsx',
  'src/components/atoms/PondMark.tsx',
  'src/lib/layout/command-path.tsx',
  'src/lib/layout/composer-clearance.ts',
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
    // `PondComposer` renderVals, ink: the dark card at .92 → .78, hairlined and lit by paper.
    expect(norm(dark)).toContain(
      '--mn-glass-bg:linear-gradient(160deg,rgba(48,49,42,.92),rgba(48,49,42,.78));'
    )
    expect(norm(dark)).toContain('--mn-glass-border:1pxsolidrgba(250,249,239,.09);')
    expect(norm(dark)).toContain(
      '--mn-glass-shadow:inset01px0rgba(250,249,239,.06),020px54pxrgba(0,0,0,.42);'
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
      onRename={jest.fn()}
      onPickGlyph={jest.fn()}
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      onOpenDatabases={jest.fn()}
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

  it('has no switcher button, no chevron and no bell without ponds', () => {
    const { container } = renderRail()
    const head = container.querySelector<HTMLElement>('[data-part="rail-head"]')!
    expect(head.querySelector('button')).toBeNull()
    expect(head.querySelector('[data-part="reminders-bell"]')).toBeNull()
    expect(head.querySelectorAll('svg')).toHaveLength(0)
    expect(head).not.toHaveTextContent('Pond')
  })

  it('the head is padded 0 16px 12px, centred, gap 8', () => {
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
    // Plain text until a settings surface exists — not a button.
    expect(screen.getByText('settings')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'settings' })).toBeNull()
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

  it('empty: the root still makes the first page — its ＋ on hover, and + from the keyboard', () => {
    const onAddChild = jest.fn()
    renderRail({ tree: [], isEmpty: true, onAddChild })
    const root = screen.getByRole('treeitem', { name: /Life/ })
    expect(root).toHaveAttribute('aria-selected', 'false')

    fireEvent.mouseEnter(root)
    fireEvent.click(screen.getByRole('button', { name: 'Add sub-page to Life' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^page/ }))
    expect(onAddChild).toHaveBeenCalledWith('__life__', 'page')

    onAddChild.mockClear()
    root.focus()
    fireEvent.keyDown(root, { key: '+' })
    fireEvent.click(screen.getByRole('menuitem', { name: /^page/ }))
    expect(onAddChild).toHaveBeenCalledWith('__life__', 'page')
  })

  it('empty: the root has no × — a pond is not deleted from the rail', () => {
    renderRail({ tree: [], isEmpty: true })
    fireEvent.mouseEnter(screen.getByRole('treeitem', { name: /Life/ }))
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
  })
})

// ── AC2: the path `PondCommand` shows at rest ─────────────────────────────────

describe('commandPath — the root, the ancestors, then the page; led by its area’s mark (2g)', () => {
  const at = '2026-01-01T00:00:00Z'
  const ROWS: PageRow[] = [
    { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: at },
    { id: 'sleep', parent_id: 'health', type: 'page', title: 'Sleep', order: 0, updated_at: at },
    { id: 'root-db', parent_id: null, type: 'page', title: 'databases', order: 9, updated_at: at },
    {
      id: 'db-1',
      parent_id: 'root-db',
      type: 'page',
      title: 'ingredients',
      order: 0,
      updated_at: at,
    },
  ]
  const opts = (current: string) => ({ rootTitle: 'life', current, pondGlyph: LIFE_GLYPH })

  it('at the root: the root page alone, under the pond’s own mark', () => {
    expect(commandPath(ROWS, null, opts('ignored'))).toEqual({
      glyph: LIFE_GLYPH,
      role: null,
      trail: [],
      current: 'life',
    })
  })

  // `PondCommand.dc.html`: `GLYPH[path[1]] || GLYPH[path[0]]` — the area, else the root.
  it('a page carries its area’s mark — the area itself when it is top-level', () => {
    const healthMark = resolveMark('health', markIndex(ROWS)).glyph
    expect(healthMark).not.toBeNull()
    const area = commandPath(ROWS, 'health', opts('Health'))
    const child = commandPath(ROWS, 'sleep', opts('Sleep'))
    expect(area).toEqual({ glyph: healthMark, role: null, trail: ['life'], current: 'Health' })
    expect(child).toEqual({
      glyph: healthMark,
      role: null,
      trail: ['life', 'Health'],
      current: 'Sleep',
    })
  })

  // #101 review: every segment is the page title verbatim — the root reads
  // lowercase "life", and nothing is title-cased by the pill.
  it('segments are titles verbatim: the root lowercase, the pages in their own case', () => {
    expect(commandPath(ROWS, 'sleep', opts('Sleep')).trail).toEqual(['life', 'Health'])
  })

  // 3c's two roots are peers, so a page under databases must not read as if it
  // were inside life.
  it('starts at the databases root, never inside life; the root page reads simply "databases"', () => {
    expect(commandPath(ROWS, 'db-1', opts('ingredients'))).toMatchObject({
      trail: ['databases'],
      current: 'ingredients',
    })
    expect(commandPath(ROWS, 'root-db', opts('databases'))).toMatchObject({
      trail: [],
      current: 'databases',
    })
  })
})

// ── AC2: the composer floats over the canvas ────────────────────────────────

function renderDrawer(over: Partial<React.ComponentProps<typeof TerminalDrawer>> = {}) {
  return render(
    <TerminalDrawer collapsed={false} onExpand={jest.fn()} footer={<div>footer</div>} {...over}>
      <div>body</div>
    </TerminalDrawer>
  )
}

describe('TerminalDrawer — the PondComposer card: floating glass, 560, 24 off the bottom', () => {
  it('is the glass card itself: 560 wide (360 below md), padding 14, gap 14, radius 20', () => {
    renderDrawer()
    const card = screen.getByRole('region', { name: 'composer' })
    expect(card.getAttribute('data-part')).toBe('composer-card')
    for (const cls of [
      'mn-glass',
      'rounded-mn-card',
      'flex',
      'flex-col',
      'font-mono',
      'p-[14px]',
      'gap-[14px]',
      'w-[360px]',
      'md:w-[560px]',
    ]) {
      expect(card.className.split(' ')).toContain(cls)
    }
    expect(card.className).not.toMatch(/\b534\b|max-w-2xl|mx-auto/)
    expect(card.textContent).toBe('bodyfooter')
  })

  it('is centred on the area right of the rail — calc(50% + 113px) — and 24px off the bottom', () => {
    renderDrawer()
    const card = screen.getByRole('region', { name: 'composer' })
    const classes = card.className.split(' ')
    // The storyboards: left 246 / right 20 in a 1180 frame (rail 20+206+20).
    expect(classes).toContain('md:left-[calc(50%_+_113px)]')
    expect(classes).toContain('-translate-x-1/2')
    expect(classes).toContain('absolute')
    // `bottom` comes from the `--composer-card-bottom` var, not a `bottom-*`
    // class, so a wrapping surface (zen) can override just the one property.
    expect(classes).not.toContain('bottom-6')
    expect(card.style.bottom).toBe('var(--composer-card-bottom)')
    expect(card.style.getPropertyValue('--composer-card-bottom')).toBe(`${COMPOSER_BOTTOM_INSET}px`)
    expect(COMPOSER_BOTTOM_INSET).toBe(24)
  })

  it('draws no header strip or clear control', () => {
    renderDrawer()
    expect(screen.queryByRole('button', { name: /clear conversation/i })).toBeNull()
    expect(screen.queryByText(/context:/)).toBeNull()
  })

  it('collapsed is the tab: 30 high on the bottom edge, a pill with ⌘J, and it brings the card back', () => {
    const platform = jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const onExpand = jest.fn()
    const { container } = renderDrawer({ collapsed: true, onExpand })
    const tab = container.querySelector('[data-part="composer-tab"]')!
    expect(tab.textContent).not.toMatch(/body|footer/)
    const classes = tab.className.split(' ')
    for (const cls of [
      'mn-glass',
      'h-[30px]',
      'bottom-0',
      'border-b-0',
      'rounded-[14px_16px_0_0]',
    ]) {
      expect(classes).toContain(cls)
    }
    expect(classes).not.toContain('bottom-6')
    expect(screen.getByText('⌘J')).toBeInTheDocument()
    expect(screen.queryByText('pond answered')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open composer' }))
    expect(onExpand).toHaveBeenCalledTimes(1)
    platform.mockRestore()
  })

  it('the collapsed tab is its own standalone, always-mounted element, distinct from the card', () => {
    const onExpand = jest.fn()
    const { container, rerender } = renderDrawer({ collapsed: true, onExpand })
    const collapsedTab = container.querySelector('[data-part="composer-tab"]')
    expect(collapsedTab).not.toBeNull()
    expect(collapsedTab!.getAttribute('aria-label')).toBe('Composer tab')
    expect(collapsedTab!.hasAttribute('aria-hidden')).toBe(false)
    const openButton = collapsedTab!.querySelector('button')!
    fireEvent.click(openButton)
    expect(onExpand).toHaveBeenCalledTimes(1)

    // Not collapsed: the tab stays mounted — just hidden — beside the card, and
    // the two don't collide on the card's "composer" region name.
    rerender(
      <TerminalDrawer collapsed={false} onExpand={onExpand} footer={<div>footer</div>}>
        <div>body</div>
      </TerminalDrawer>
    )
    const openTab = container.querySelector('[data-part="composer-tab"]')
    expect(openTab).not.toBeNull()
    expect(openTab!.getAttribute('aria-hidden')).toBe('true')
    expect(openTab!.className.split(' ')).toContain('pointer-events-none')
    expect(screen.queryAllByRole('region', { name: 'composer' })).toHaveLength(1)
    expect(container.querySelector('[data-part="composer-card"]')).not.toBeNull()
  })

  it('landed adds the dot and “pond answered” to the pill — never a count or a badge', () => {
    const { container } = renderDrawer({ collapsed: true, landed: true })
    expect(screen.getByText('pond answered')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pond answered/ })).toBeInTheDocument()
    const tab = container.querySelector('[data-part="composer-tab"]')!
    expect(tab.querySelector('[data-part="landed-dot"]')).not.toBeNull()
  })

  it('maximized fills the canvas beside the rail — ignores height, never COMPOSER_DEFAULT_HEIGHT', () => {
    renderDrawer({ maximized: true, height: 420 })
    const card = screen.getByRole('region', { name: 'composer' })
    expect(card.style.height).toBe('')
    expect(card.style.maxHeight).toBe('')
    expect(card.style.top).toBe(`${COMPOSER_TOP_CLEARANCE}px`)
    // `bottom` reads the `--composer-card-bottom` var (default 24px) rather than
    // the literal, so a wrapping surface can override just the one property.
    expect(card.style.bottom).toBe('var(--composer-card-bottom)')
    expect(card.style.getPropertyValue('--composer-card-bottom')).toBe(`${COMPOSER_BOTTOM_INSET}px`)
    expect(card.style.left).toBe(`${20 + RAIL_WIDTH_PX + 20}px`)
    expect(card.style.right).toBe('20px')
    const classes = card.className.split(' ')
    expect(classes).not.toContain('left-1/2')
    expect(classes).not.toContain('bottom-6')
  })

  it('maximized in zen insets left 20, not the rail\'s 246 — the rail is hidden there', () => {
    renderDrawer({ maximized: true, zen: true, height: 420 })
    const card = screen.getByRole('region', { name: 'composer' })
    expect(card.style.left).toBe('20px')
    expect(card.style.right).toBe('20px')
  })

  it('minimized is the one-line rest composer — the thread stays mounted, just hidden', () => {
    renderDrawer({ minimized: true, height: 420 })
    const card = screen.getByRole('region', { name: 'composer' })
    expect(card.style.height).toBe('')
    expect(card.hasAttribute('data-sized')).toBe(false)
    expect(screen.queryByRole('separator')).toBeNull()
    const thread = card.querySelector('[data-part="composer-thread"]')!
    expect((thread as HTMLElement).hidden).toBe(true)
    expect(thread.textContent).toBe('body')
    expect(screen.getByText('footer')).toBeInTheDocument()
  })

  it('collapsed slides the persistent card off screen instead of unmounting it', () => {
    const { container, rerender } = renderDrawer({ collapsed: true })
    const card = container.querySelector('[data-part="composer-card"]')!
    const classes = card.className.split(' ')
    expect(classes).toContain('motion-resolve')
    // The full height alone leaves the card's 24px inset still inside the
    // shell's bounds — it translates by height + the inset to clear it fully.
    // Driven through `transform`, not `translate` (which `.motion-resolve`
    // does not transition, to avoid an unrelated sideways slide on maximize).
    expect(classes).toContain('[transform:translateY(calc(100%+var(--composer-card-bottom)))]')
    expect(classes).toContain('opacity-0')
    expect(classes).toContain('pointer-events-none')
    expect(card.getAttribute('aria-hidden')).toBe('true')
    // Grip/thread/footer are still mounted under it, not swapped for the tab.
    expect(card.textContent).toBe('bodyfooter')

    rerender(
      <TerminalDrawer collapsed={false} onExpand={jest.fn()} footer={<div>footer</div>}>
        <div>body</div>
      </TerminalDrawer>
    )
    // Same node: the card persisted across the toggle, only its slide classes changed.
    expect(container.querySelector('[data-part="composer-card"]')).toBe(card)
    const restoredClasses = card.className.split(' ')
    expect(restoredClasses).not.toContain(
      '[transform:translateY(calc(100%+var(--composer-card-bottom)))]'
    )
    expect(restoredClasses).not.toContain('opacity-0')
    expect(restoredClasses).not.toContain('pointer-events-none')
    expect(card.hasAttribute('aria-hidden')).toBe(false)
  })
})

// ── The resize handle on the card's top edge ────────────────────────────────

describe('ComposerHandle — the card never grows with the thread; only the person resizes it', () => {
  const pointer = (type: string, clientY: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, { pointerId: 1, clientY })
    return event
  }

  function renderSized(
    over: Partial<React.ComponentProps<typeof TerminalDrawer>> = {},
    body: React.ReactNode = <div>body</div>
  ) {
    const onHeightChange = jest.fn()
    const onHeightCommit = jest.fn()
    render(
      <TerminalDrawer
        collapsed={false}
        onExpand={jest.fn()}
        footer={<div>footer</div>}
        height={null}
        onHeightChange={onHeightChange}
        onHeightCommit={onHeightCommit}
        {...over}
      >
        {body}
      </TerminalDrawer>
    )
    return {
      onHeightChange,
      onHeightCommit,
      card: screen.getByRole('region', { name: 'composer' }),
    }
  }

  afterEach(() => window.localStorage.clear())

  it('hides the grip while maximized — maximized is a state, never a dragged/stored height', () => {
    const onHeightChange = jest.fn()
    const onHeightCommit = jest.fn()
    const { rerender } = render(
      <TerminalDrawer
        collapsed={false}
        onExpand={jest.fn()}
        footer={<div>footer</div>}
        height={300}
        maximized
        onHeightChange={onHeightChange}
        onHeightCommit={onHeightCommit}
      >
        <div>body</div>
      </TerminalDrawer>
    )
    expect(screen.queryByRole('separator', { name: 'Resize composer' })).toBeNull()

    rerender(
      <TerminalDrawer
        collapsed={false}
        onExpand={jest.fn()}
        footer={<div>footer</div>}
        height={300}
        onHeightChange={onHeightChange}
        onHeightCommit={onHeightCommit}
      >
        <div>body</div>
      </TerminalDrawer>
    )
    expect(screen.getByRole('separator', { name: 'Resize composer' })).toBeInTheDocument()
  })

  it('rides the card while there is a thread — not at rest, not without a height owner', () => {
    renderSized({}, null)
    expect(screen.queryByRole('separator')).toBeNull()
    cleanup()
    renderDrawer()
    expect(screen.queryByRole('separator')).toBeNull()
    cleanup()
    renderSized()
    const handle = screen.getByRole('separator', { name: 'Resize composer' })
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal')
    expect(handle.tabIndex).toBe(0)
  })

  it('with a thread it sits at the default, whatever the thread holds — capped below the ⌘K pill', () => {
    const { card } = renderSized()
    expect(COMPOSER_DEFAULT_HEIGHT).toBe(392)
    expect(card.style.height).toBe('392px')
    expect(card.style.maxHeight).toBe(`calc(100% - ${COMPOSER_TOP_CLEARANCE + 24}px)`)
    expect(card.hasAttribute('data-sized')).toBe(true)
    cleanup()
    // No height owner (a bare story) changes nothing: still the default, just no handle.
    expect(
      renderDrawer().container.querySelector<HTMLElement>('[data-part="composer-card"]')!.style
        .height
    ).toBe('392px')
    cleanup()
    const sized = renderSized({ height: 420 }).card
    expect(sized.style.height).toBe('420px')
    expect(sized.style.maxHeight).toBe(`calc(100% - ${COMPOSER_TOP_CLEARANCE + 24}px)`)
    expect(sized.hasAttribute('data-sized')).toBe(true)
    expect(COMPOSER_TOP_CLEARANCE).toBe(72)
  })

  it('at rest the card is the line and toolbar alone — neither the default nor a stored height applies', () => {
    expect(renderSized({}, null).card.style.height).toBe('')
    cleanup()
    const { card } = renderSized({ height: 420 }, null)
    expect(card.style.height).toBe('')
    expect(card.hasAttribute('data-sized')).toBe(false)
  })

  it('dragging up grows the card from its measured height, and commits once on release', () => {
    const height = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300)
    const { onHeightChange, onHeightCommit } = renderSized()
    const handle = screen.getByRole('separator', { name: 'Resize composer' })
    act(() => {
      handle.dispatchEvent(pointer('pointerdown', 500))
      handle.dispatchEvent(pointer('pointermove', 400))
    })
    expect(onHeightChange).toHaveBeenLastCalledWith(400)
    expect(document.body.style.cursor).toBe('ns-resize')
    act(() => {
      handle.dispatchEvent(pointer('pointerup', 400))
    })
    expect(onHeightCommit).toHaveBeenCalledTimes(1)
    expect(onHeightCommit).toHaveBeenCalledWith(400)
    expect(document.body.style.cursor).toBe('')
    height.mockRestore()
  })

  it('clamps a drag between the floor and the room under the pill', () => {
    const { onHeightChange } = renderSized({ height: 300 })
    const handle = screen.getByRole('separator', { name: 'Resize composer' })
    act(() => {
      handle.dispatchEvent(pointer('pointerdown', 500))
      handle.dispatchEvent(pointer('pointermove', 900))
    })
    expect(onHeightChange).toHaveBeenLastCalledWith(COMPOSER_MIN_HEIGHT)
    act(() => {
      handle.dispatchEvent(pointer('pointermove', -5000))
    })
    expect(onHeightChange).toHaveBeenLastCalledWith(composerMaxHeight(window.innerHeight))
    act(() => {
      handle.dispatchEvent(pointer('pointermove', 399.37))
    })
    expect(onHeightChange).toHaveBeenLastCalledWith(401)
  })

  it('↑/↓ nudge by 24, Home/End jump to the bounds, a double-click returns to the default', () => {
    const { onHeightCommit } = renderSized({ height: 300 })
    const handle = screen.getByRole('separator', { name: 'Resize composer' })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(onHeightCommit).toHaveBeenLastCalledWith(324)
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(onHeightCommit).toHaveBeenLastCalledWith(276)
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(onHeightCommit).toHaveBeenLastCalledWith(COMPOSER_MIN_HEIGHT)
    fireEvent.keyDown(handle, { key: 'End' })
    expect(onHeightCommit).toHaveBeenLastCalledWith(composerMaxHeight(window.innerHeight))
    fireEvent.doubleClick(handle)
    expect(onHeightCommit).toHaveBeenLastCalledWith(null)
  })

  it('reads the stored height floored, and the default (null) on missing or garbage storage', () => {
    expect(readStoredComposerHeight()).toBeNull()
    window.localStorage.setItem(COMPOSER_HEIGHT_KEY, 'tall')
    expect(readStoredComposerHeight()).toBeNull()
    window.localStorage.setItem(COMPOSER_HEIGHT_KEY, '40')
    expect(readStoredComposerHeight()).toBe(COMPOSER_MIN_HEIGHT)
    window.localStorage.setItem(COMPOSER_HEIGHT_KEY, '480')
    expect(readStoredComposerHeight()).toBe(480)
  })
})

// ── One source for the composer's clearance ─────────────────────────────────

describe('composer clearance — the card publishes its real footprint, the surfaces pad against it', () => {
  it('the padding reads the published variable, falling back to the card at rest, plus 24px of air', () => {
    expect(COMPOSER_CLEARANCE_GAP).toBe(24)
    expect(COMPOSER_REST_HEIGHT).toBe(101)
    expect(composerFootprintPx(COMPOSER_REST_HEIGHT)).toBe(125)
    expect(composerClearancePadding()).toBe(`calc(var(${COMPOSER_CLEARANCE_VAR}, 125px) + 24px)`)
  })

  function renderInShell(collapsed = false) {
    const shell = document.createElement('div')
    shell.setAttribute('data-part', 'shell')
    document.body.appendChild(shell)
    const utils = render(
      <TerminalDrawer collapsed={collapsed} onExpand={jest.fn()} footer={<div>footer</div>}>
        <div>body</div>
      </TerminalDrawer>,
      { container: shell }
    )
    return { ...utils, shell, read: () => shell.style.getPropertyValue(COMPOSER_CLEARANCE_VAR) }
  }

  it("publishes the card's measured height plus the 24px inset, and removes it with the card", () => {
    const height = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(231)
    const { read, unmount } = renderInShell()
    expect(read()).toBe('255px')

    // gone with the card — no stale clearance left on the shell
    unmount()
    expect(read()).toBe('')
    height.mockRestore()
  })

  it('the collapsed tab sits on the edge, so it publishes its height with no inset', () => {
    const height = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30)
    const { read } = renderInShell(true)
    expect(read()).toBe('30px')
    height.mockRestore()
  })

  it('republishes on a maximized/minimized toggle, not just a collapsed one — so composerBottomBound stays live', () => {
    const height = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
    height.mockReturnValue(231)
    const shell = document.createElement('div')
    shell.setAttribute('data-part', 'shell')
    document.body.appendChild(shell)
    const read = () => shell.style.getPropertyValue(COMPOSER_CLEARANCE_VAR)

    const { rerender } = render(
      <TerminalDrawer collapsed={false} onExpand={jest.fn()} footer={<div>footer</div>}>
        <div>body</div>
      </TerminalDrawer>,
      { container: shell }
    )
    expect(read()).toBe('255px')

    height.mockReturnValue(600)
    rerender(
      <TerminalDrawer collapsed={false} maximized onExpand={jest.fn()} footer={<div>footer</div>}>
        <div>body</div>
      </TerminalDrawer>
    )
    expect(read()).toBe('624px')

    height.mockReturnValue(101)
    rerender(
      <TerminalDrawer collapsed={false} minimized onExpand={jest.fn()} footer={<div>footer</div>}>
        <div>body</div>
      </TerminalDrawer>
    )
    expect(read()).toBe('125px')

    height.mockRestore()
  })
})

// ── The pond's name ─────────────────────────────────────────────────────────

describe('defaultPondName — the M1 seam for the pond name', () => {
  // The head applies no text-transform, so the data's case is what the head shows.
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

  it('rail = paper card with the pond name; ⌘K lives in the command pill, settings in the rail foot', async () => {
    const platform = jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const { container } = renderShell()
    const aside = await screen.findByRole('complementary')
    expect(aside.className).toMatch(/\bbg-mn-card\b/)
    expect(aside.className).not.toMatch(/\bmn-glass\b/)
    expect(container.querySelector('[data-part="pond-name"]')).toHaveTextContent('life')

    // One ⌘K affordance, inside the command pill — the top-right cluster is gone.
    const chips = [...container.querySelectorAll('[data-part="chip"]')]
    expect(chips.map((c) => c.textContent)).toEqual(['⌘K'])
    expect(chips[0].closest('[data-part="command"]')).not.toBeNull()
    expect(container.querySelector('.fixed')).toBeNull()

    // The rail foot is databases and settings; no "New page" button anywhere.
    expect(screen.queryByRole('button', { name: 'New page' })).toBeNull()
    expect(aside.contains(screen.getByText('settings'))).toBe(true)
    platform.mockRestore()
  })

  it('the command pill and the composer are SHELL-level absolutes, not column children (measured)', async () => {
    const { container } = renderShell()
    const shell = container.querySelector<HTMLElement>('[data-part="shell"]')!
    const main = container.querySelector<HTMLElement>('main')!
    const box = container.querySelector<HTMLElement>('[data-part="command"]')!

    // Top 20, left calc(50% + 13px), translateX(-50%) — relative to the WHOLE
    // shell, not the content column; and it reads the open page's path.
    const placed = box.parentElement!
    expect(placed.parentElement).toBe(shell)
    expect(placed.className).toMatch(/\babsolute\b/)
    expect(placed.className).toMatch(/\btop-5\b/)
    expect(placed.className).toMatch(/\bleft-\[calc\(50%_\+_13px\)\]/)
    expect(placed.className.split(' ')).toContain('-translate-x-1/2')
    expect(main.contains(box)).toBe(false)
    expect(
      await screen.findByText('Life', { selector: '[data-part="current"]' })
    ).toBeInTheDocument()

    // The composer is the shell's child too — its calc(50% + 113px) is against the shell.
    // Zen's chrome slot (KAN-91) sits between them unpositioned, so the shell is
    // still the composer's containing block.
    const terminal = screen.getByRole('region', { name: 'composer' })
    const slot = terminal.parentElement!
    expect(slot.dataset.part).toBe('zen-chrome')
    expect(slot.parentElement).toBe(shell)
    expect(slot.className).not.toMatch(/\b(relative|absolute|fixed|sticky)\b/)
    expect(main.contains(terminal)).toBe(false)

    // No fixed 288px stand-in anywhere: <main> carries no bottom padding, and the
    // surface pads against the composer's published clearance instead, starting
    // 76px down (under the pill — the mockup's 20px inset + 56px padding).
    expect(main.className).not.toMatch(/\bpb-/)
    expect(shell.querySelectorAll('.pb-72')).toHaveLength(0)
    const column = main.querySelector<HTMLElement>('[data-testid="page-column"]')!
    expect(column.className).toMatch(/\bpt-\[76px\]/)
    expect(column.getAttribute('style')).toContain(COMPOSER_CLEARANCE_VAR)
  })

  it('a click on the pill grows it into the palette', async () => {
    const { container } = renderShell()
    const opener = container.querySelector<HTMLElement>('[data-part="opener"]')!
    await act(async () => {
      fireEvent.click(opener)
    })
    // #279: a combobox in the same box, not a dialog.
    expect(await screen.findByRole('combobox', { name: 'command palette' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'esc' }))
  })
})
