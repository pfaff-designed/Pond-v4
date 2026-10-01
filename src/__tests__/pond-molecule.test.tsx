/**
 * PondMolecule (#95) — the one polymorphic presentational molecule: 11 content
 * kinds × 10 states on the Make Noise role tokens, mirroring
 * `wayfinder/design_handoff_pond/PondMolecule.dc.html`. These tests defend the
 * acceptance criteria head-on: every kind renders at rest (desktop + mobile),
 * the full 110-cell matrix mounts, the source carries zero `press-*` / zero
 * literal hex, the type registers hold (entry serif-never-400, provenance
 * mono-lowercase, numerals tabular), colour roles stay single-job (area tint on
 * marks only, reminder due-dot = burnt-orange, diff removals = red, exactly one
 * dated signal), the interaction states behave per the mockup (dragging honours
 * prefers-reduced-motion, focus draws the mist ring), and the absorb-and-migrate
 * is complete: TreeRow and OverviewCard are gone (Rail / ChildrenGrid now ride
 * PondMolecule) with no dangling imports, and RelationValue's delegator status
 * is documented. The AA contrast block from the atom suite is mirrored in-suite
 * so the palette this molecule renders on can never silently rot.
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { render, fireEvent } from '@testing-library/react'
import {
  PondMolecule,
  POND_MOLECULE_KINDS,
  POND_MOLECULE_STATES,
  type PondMoleculeKind,
  type PondMoleculeState,
} from '@/components/molecules/PondMolecule'
import { ChildrenGrid } from '@/components/molecules/ChildrenGrid'
import { RailView, type RailNode } from '@/components/organisms/Rail'

/** The molecule's root element. */
function root(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-kind]')
  if (!el) throw new Error('PondMolecule rendered no [data-kind] root')
  return el
}

// ── AC1: all 11 kinds render at rest, desktop + mobile ──────────────────────

describe('AC1 — every kind renders at rest', () => {
  it.each(POND_MOLECULE_KINDS.map((k) => [k] as [PondMoleculeKind]))(
    'kind=%s (desktop)',
    (kind) => {
      const { container } = render(<PondMolecule kind={kind} />)
      const el = root(container)
      expect(el.dataset.kind).toBe(kind)
      expect(el.dataset.state).toBe('rest')
    }
  )

  it.each(POND_MOLECULE_KINDS.map((k) => [k] as [PondMoleculeKind]))('kind=%s (mobile)', (kind) => {
    const { container } = render(<PondMolecule kind={kind} size="mobile" />)
    expect(root(container).dataset.kind).toBe(kind)
  })

  it('exposes exactly 11 kinds and 10 states', () => {
    expect(POND_MOLECULE_KINDS).toHaveLength(11)
    expect(POND_MOLECULE_STATES).toHaveLength(10)
  })

  it('renders the mockup fixture copy at rest', () => {
    expect(render(<PondMolecule kind="list-row" />).getByText('cabinet quote')).toBeInTheDocument()
    expect(
      render(<PondMolecule kind="check-row" />).getByText('stir through harissa')
    ).toBeInTheDocument()
    expect(
      render(<PondMolecule kind="entry" />).getByText(
        'Cooked for four. Needs more salt than you think.'
      )
    ).toBeInTheDocument()
    expect(
      render(<PondMolecule kind="notice" />).getByText(
        'cacio e pepe was deleted · 1 row still points at it'
      )
    ).toBeInTheDocument()
    expect(
      render(<PondMolecule kind="provenance" />).getByText('google sheets › kitchen quotes')
    ).toBeInTheDocument()
    expect(
      render(<PondMolecule kind="reminder" />).getByText('cabinet quote is due today')
    ).toBeInTheDocument()
    expect(
      render(<PondMolecule kind="task-card" />).getByText('pack the kitchen')
    ).toBeInTheDocument()
  })
})

// ── AC2: the 110-cell matrix mounts; unused states fall back to rest ────────

describe('AC2 — full kind × state matrix', () => {
  it('renders all 110 cells without throwing', () => {
    for (const kind of POND_MOLECULE_KINDS) {
      for (const state of POND_MOLECULE_STATES) {
        const { container, unmount } = render(<PondMolecule kind={kind} state={state} />)
        expect(root(container).dataset.state).toBe(state)
        unmount()
      }
    }
  })

  it.each([
    ['list-row', 'add an item'],
    ['check-row', 'add a step'],
    ['entry', 'write the first entry'],
    ['record-card', 'untitled'],
    ['task-card', 'new task'],
  ] as [PondMoleculeKind, string][])('empty %s invites: "%s"', (kind, placeholder) => {
    expect(
      render(<PondMolecule kind={kind} state="empty" />).getByText(placeholder)
    ).toBeInTheDocument()
  })
})

// ── AC3: zero press-* and zero literal hex in the molecule source ───────────

describe('AC3 — token hygiene in source', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/components/molecules/PondMolecule.tsx'),
    'utf8'
  )

  it('PondMolecule.tsx carries no press-* classes', () => {
    expect(src).not.toMatch(/press-/)
  })

  it('PondMolecule.tsx carries no literal hex colour', () => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

// ── AC4: type registers ─────────────────────────────────────────────────────

describe('AC4 — type registers', () => {
  it('entry prose is Editorial serif at 200, never 400', () => {
    const { container } = render(<PondMolecule kind="entry" />)
    const text = container.querySelector('[data-part="title"]')!
    expect(text.className).toContain('font-serif')
    expect(text.className).toContain('font-extralight')
    expect(text.className).not.toContain('font-normal')
  })

  it('provenance is machine-surface mono, lowercase', () => {
    const { container } = render(<PondMolecule kind="provenance" />)
    const cls = root(container).className
    expect(cls).toContain('font-mono')
    expect(cls).toContain('lowercase')
  })

  it('diff-line and notice ride the mono machine register', () => {
    expect(root(render(<PondMolecule kind="diff-line" />).container).className).toContain(
      'font-mono'
    )
    const notice = render(<PondMolecule kind="notice" />).container
    expect(notice.querySelector('[data-part="title"]')?.className).toContain('font-mono')
  })

  it('the table-row numeral reads tabular at weight 500', () => {
    const { container } = render(<PondMolecule kind="table-row" />)
    const num = container.querySelector('[data-part="num"]')!
    expect(num.className).toContain('tabular-nums')
    expect(num.className).toContain('font-medium')
  })

  it('the record-card focal numeral reads tabular', () => {
    const { container } = render(<PondMolecule kind="record-card" stat="7" sub="2 pages inside" />)
    expect(container.querySelector('[data-part="stat"]')?.className).toContain('tabular-nums')
  })
})

// ── AC5: colour roles — one job each ────────────────────────────────────────

describe('AC5 — colour roles', () => {
  it('area colour tints the list-row dot mark only (sage → mn-area-a)', () => {
    const { container } = render(<PondMolecule kind="list-row" color="sage" />)
    expect(container.querySelector('[data-part="dot"]')?.className).toContain('bg-mn-area-a')
    expect(container.querySelector('[data-part="title"]')?.className).not.toContain('mn-area')
  })

  it('a raw accent string paints marks only, via style — never text', () => {
    const { container } = render(<PondMolecule kind="list-row" accent="rgb(95, 115, 85)" />)
    const dot = container.querySelector<HTMLElement>('[data-part="dot"]')!
    expect(dot.style.background).toContain('rgb(95, 115, 85)')
    expect(container.querySelector<HTMLElement>('[data-part="title"]')?.style.color).toBe('')
  })

  it('the reminder due-dot is burnt-orange (signal-dated), exactly one', () => {
    const { container } = render(<PondMolecule kind="reminder" />)
    expect(container.querySelectorAll('.bg-mn-signal-dated')).toHaveLength(1)
    expect(container.querySelector('[data-part="due-dot"]')?.className).toContain(
      'bg-mn-signal-dated'
    )
  })

  it('diff-line removals ride the red removal signal: sign + strike', () => {
    const { container } = render(<PondMolecule kind="diff-line" variant="remove" />)
    expect(container.querySelector('[data-part="sign"]')?.textContent).toBe('−')
    expect(container.querySelector('[data-part="sign"]')?.className).toContain(
      'text-mn-signal-removal'
    )
    const text = container.querySelector('[data-part="title"]')!
    expect(text.className).toContain('line-through')
    expect(text.className).toContain('decoration-mn-signal-removal')
  })

  it('diff-line additions carry no removal signal', () => {
    const { container } = render(<PondMolecule kind="diff-line" variant="add" />)
    expect(container.querySelector('[data-part="sign"]')?.textContent).toBe('+')
    expect(container.innerHTML).not.toContain('mn-signal-removal')
  })

  it('exactly one dated signal: the list-row due date dot', () => {
    // meta 'today' auto-marks the due dot (the mockup rule) — exactly one.
    const { container } = render(<PondMolecule kind="list-row" />)
    expect(container.querySelectorAll('.bg-mn-signal-dated')).toHaveLength(1)
  })

  it('an undated task-card shows no dated signal', () => {
    const { container } = render(<PondMolecule kind="task-card" />)
    expect(container.querySelectorAll('.bg-mn-signal-dated')).toHaveLength(0)
  })

  it('a plain check-row carries no signal colour at all', () => {
    const { container } = render(<PondMolecule kind="check-row" />)
    expect(container.innerHTML).not.toMatch(/mn-signal/)
  })
})

// ── AC6: interaction states per the mockup ──────────────────────────────────

describe('AC6 — interaction states', () => {
  it('hover raises the quiet fill', () => {
    const { container } = render(<PondMolecule kind="list-row" state="hover" />)
    expect(root(container).className).toContain('bg-mn-text/5')
  })

  it('selected raises the stronger fill', () => {
    const { container } = render(<PondMolecule kind="list-row" state="selected" />)
    expect(root(container).className).toContain('bg-mn-hover-fill')
  })

  it('focus draws the mist ring (mn-area-b holds mist on every theme)', () => {
    const { container } = render(<PondMolecule kind="list-row" state="focus" />)
    expect(root(container).className).toContain('outline-mn-area-b')
  })

  it('editing draws the inset ink border', () => {
    const { container } = render(<PondMolecule kind="list-row" state="editing" />)
    expect(root(container).className).toContain('ring-mn-text')
  })

  it('dragging lifts — card ground, deep shadow, the -0.6deg tilt — and honours prefers-reduced-motion', () => {
    const { container } = render(<PondMolecule kind="list-row" state="dragging" />)
    const cls = root(container).className
    expect(cls).toContain('shadow-mn-lg')
    expect(cls).toContain('rotate')
    expect(cls).toContain('motion-reduce:transform-none')
  })

  it('the drag handle shows on hover/selected/dragging, hides at rest', () => {
    const rest = render(<PondMolecule kind="list-row" />)
    expect(rest.container.querySelector('[data-part="handle"]')?.className).toContain('opacity-0')
    const hover = render(<PondMolecule kind="list-row" state="hover" />)
    expect(hover.container.querySelector('[data-part="handle"]')?.className).toContain(
      'opacity-100'
    )
  })

  it('loading quiets the whole molecule; disabled dims and goes inert', () => {
    const loading = root(render(<PondMolecule kind="list-row" state="loading" />).container)
    expect(loading.className).toContain('opacity-60')
    const disabled = root(render(<PondMolecule kind="list-row" state="disabled" />).container)
    expect(disabled.className).toContain('opacity-40')
    expect(disabled.className).toContain('pointer-events-none')
  })

  it('a checked check-row strikes its text (and selected implies done, per mockup)', () => {
    const on = render(<PondMolecule kind="check-row" on />)
    expect(on.container.querySelector('[data-part="title"]')?.className).toContain('line-through')
    const sel = render(<PondMolecule kind="check-row" state="selected" />)
    expect(sel.container.querySelector('[data-part="check"]')).toBeInTheDocument()
  })

  it('a table-row in error keeps the struck relation and notes "kept"', () => {
    const { container, getByText } = render(<PondMolecule kind="table-row" state="error" />)
    expect(container.querySelector('[data-kind="relation"]')).toHaveAttribute('data-state', 'error')
    expect(getByText('kept')).toBeInTheDocument()
  })

  it('provenance in error strikes through and quiets', () => {
    const { container } = render(<PondMolecule kind="provenance" state="error" />)
    expect(root(container).className).toContain('line-through')
  })
})

// ── Kind anatomy from the mockup ────────────────────────────────────────────

describe('kind anatomy', () => {
  it('list-row composes a date atom from its meta', () => {
    const { container } = render(<PondMolecule kind="list-row" meta="19 sep" />)
    expect(container.querySelector('[data-kind="date"]')).toBeInTheDocument()
  })

  it('meta="" suppresses the list-row date atom (rail rows)', () => {
    const { container } = render(<PondMolecule kind="list-row" meta="" />)
    expect(container.querySelector('[data-kind="date"]')).not.toBeInTheDocument()
  })

  it('check-row composes a checkbox atom', () => {
    const { container } = render(<PondMolecule kind="check-row" />)
    expect(container.querySelector('[data-kind="checkbox"]')).toBeInTheDocument()
  })

  it('table-row composes a relation atom for its title cell', () => {
    const { container } = render(<PondMolecule kind="table-row" />)
    expect(container.querySelector('[data-kind="relation"]')).toBeInTheDocument()
  })

  it('record-card (mockup mode) composes an image atom + tag', () => {
    const { container } = render(<PondMolecule kind="record-card" />)
    expect(container.querySelector('[data-kind="image"]')).toBeInTheDocument()
    expect(container.querySelector('[data-kind="tag"]')).toBeInTheDocument()
  })

  it('record-card (stat mode — the OverviewCard absorption) leads with the numeral, no image', () => {
    const { container, getByText } = render(
      <PondMolecule kind="record-card" title="Workout Log" stat="2" sub="2 pages inside · 3d ago" />
    )
    expect(getByText('2')).toBeInTheDocument()
    expect(getByText('2 pages inside · 3d ago')).toBeInTheDocument()
    expect(container.querySelector('[data-kind="image"]')).not.toBeInTheDocument()
  })

  it('field-row renders its uppercase label and a value atom of valueKind', () => {
    const { container, getByText } = render(
      <PondMolecule kind="field-row" label="kcal per serving" valueKind="number" value="520" />
    )
    expect(getByText('kcal per serving')).toBeInTheDocument()
    expect(container.querySelector('[data-kind="number"]')).toBeInTheDocument()
    expect(getByText('520')).toBeInTheDocument()
  })

  it('notice offers its action; action="" suppresses it', () => {
    const { getByText } = render(<PondMolecule kind="notice" />)
    expect(getByText('review')).toBeInTheDocument()
    const none = render(<PondMolecule kind="notice" action="" />)
    expect(none.container.querySelector('[data-part="action"]')).not.toBeInTheDocument()
  })

  it('reminder carries title, context meta, and the open affordance', () => {
    const { getByText } = render(<PondMolecule kind="reminder" />)
    expect(getByText('kitchen renovation · 09:00')).toBeInTheDocument()
    expect(getByText('open')).toBeInTheDocument()
  })

  it('task-card shows a due date atom and a steps caption', () => {
    const { container, getByText } = render(
      <PondMolecule kind="task-card" meta="10 nov" value="2 of 5" />
    )
    expect(container.querySelector('[data-kind="date"]')).toBeInTheDocument()
    expect(getByText('2 of 5')).toBeInTheDocument()
  })

  it('a done task-card dims and strikes its title', () => {
    const { container } = render(<PondMolecule kind="task-card" on />)
    expect(root(container).className).toContain('opacity-60')
    expect(container.querySelector('[data-part="title"]')?.className).toContain('line-through')
  })

  it('leading and trailing slots render host affordances on a list-row', () => {
    const { getByText } = render(
      <PondMolecule
        kind="list-row"
        leading={<span>caret</span>}
        trailing={<button type="button">crud</button>}
      />
    )
    expect(getByText('caret')).toBeInTheDocument()
    expect(getByText('crud')).toBeInTheDocument()
  })
})

// ── AC7: absorb-and-migrate complete ────────────────────────────────────────

describe('AC7 — absorb-and-migrate', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

  it('TreeRow and OverviewCard (and their stories) are gone', () => {
    for (const gone of [
      'src/components/molecules/TreeRow.tsx',
      'src/components/molecules/TreeRow.stories.tsx',
      'src/components/molecules/OverviewCard.tsx',
      'src/components/molecules/OverviewCard.stories.tsx',
      'src/components/molecules/RelationValue.stories.tsx',
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), gone))).toBe(false)
    }
  })

  it('no source file still imports the absorbed molecules', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
      })
    for (const file of walk(path.join(process.cwd(), 'src'))) {
      const text = fs.readFileSync(file, 'utf8')
      expect(text).not.toMatch(/from '@\/components\/molecules\/TreeRow'/)
      expect(text).not.toMatch(/from '@\/components\/molecules\/OverviewCard'/)
    }
  })

  it('RelationValue remains only as a documented functional delegator', () => {
    const src = read('src/components/molecules/RelationValue.tsx')
    expect(src).toMatch(/field-row/) // the documented why-not
  })

  it('ChildrenGrid renders record-card molecules and still opens cards', () => {
    const onOpenCard = jest.fn()
    const cards = [
      {
        id: 'log',
        type: 'page',
        title: 'Workout Log',
        stat: '2',
        sub: '2 pages inside · updated 3d ago',
        accent: 'rgb(95, 115, 85)',
      },
    ]
    const { container, getByText } = render(<ChildrenGrid cards={cards} onOpenCard={onOpenCard} />)
    expect(container.querySelector('[data-kind="record-card"]')).toBeInTheDocument()
    fireEvent.click(getByText('Workout Log'))
    expect(onOpenCard).toHaveBeenCalledWith(cards[0])
  })
})

// ── AC7 (integration): the rail rides PondMolecule list-rows ────────────────

describe('AC7 — RailView through PondMolecule', () => {
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
    node('scratch', 'page', 'Scratchpad', [], 1),
  ]

  function renderRail(overrides: Partial<React.ComponentProps<typeof RailView>> = {}) {
    const handlers = {
      onSelect: jest.fn(),
      onToggle: jest.fn(),
      onAddChild: jest.fn(),
      onDelete: jest.fn(),
      onLife: jest.fn(),
      onToggleLife: jest.fn(),
      onNewPage: jest.fn(),
      onMove: jest.fn(),
    }
    const utils = render(
      <RailView
        tree={TREE}
        pondName="Life"
        selectedId={null}
        expanded={new Set(['health'])}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        canDrop={() => true}
        {...handlers}
        {...overrides}
      />
    )
    return { ...utils, handlers }
  }

  it('renders every row as a PondMolecule list-row inside a treeitem', () => {
    const { container, getAllByRole } = renderRail()
    const items = getAllByRole('treeitem')
    expect(items).toHaveLength(4) // Life + Health + Sleep + Scratchpad
    expect(container.querySelectorAll('[data-kind="list-row"]')).toHaveLength(4)
  })

  it('drives a three-tier label voice so the "you are here" trail reads', () => {
    // A page nested under a *page* (not a top-level area) isolates the on-path
    // raise from the area/root raise: selecting the leaf must lift its plain-page
    // ancestor above a plain off-path row. Guards the regression where the TreeRow→
    // PondMolecule absorption flattened every row to one tone (#95 review).
    // #108: the off-path control row must be NESTED — every top-level row now
    // carries the raised area voice, so a top-level "Other" would read raised.
    const trail: RailNode[] = [
      node('proj', 'page', 'Project', [
        node('phase', 'page', 'Phase', [node('task', 'page', 'Task', [], 0, 'phase')], 0, 'proj'),
        node('other', 'page', 'Other', [], 1, 'proj'),
      ]),
    ]
    const { getByRole } = renderRail({
      tree: trail,
      selectedId: 'task',
      expanded: new Set(['proj', 'phase']),
      pathIds: new Set(['proj', 'phase']),
    })
    const voice = (name: RegExp) => getByRole('treeitem', { name }).getAttribute('data-voice')
    expect(voice(/Task/)).toBe('full') // selected
    expect(voice(/Phase/)).toBe('raised') // on-path ancestor (a plain page, not an area)
    expect(voice(/Project/)).toBe('raised') // on-path ancestor
    expect(voice(/Other/)).toBe('muted') // plain, off the selection path
    // the regression guard: an on-path ancestor must NOT read like a plain row
    expect(voice(/Phase/)).not.toBe(voice(/Other/))
  })

  it('label click opens; caret click toggles without opening', () => {
    const { getByRole, handlers } = renderRail()
    const health = getByRole('treeitem', { name: /Health/ })
    fireEvent.click(health.querySelector('svg')!.closest('button')!)
    expect(handlers.onToggle).toHaveBeenCalledWith('health')
    expect(handlers.onSelect).not.toHaveBeenCalled()
    fireEvent.click(getByRole('treeitem', { name: /Sleep/ }))
    expect(handlers.onSelect).toHaveBeenCalledWith('sleep')
  })

  it('keeps the APG tree contract: aria coordinates + one roving tab stop', () => {
    const { getByRole } = renderRail()
    const life = getByRole('treeitem', { name: /Life/ })
    expect(life).toHaveAttribute('aria-level', '1')
    expect(life).toHaveAttribute('tabindex', '0')
    const health = getByRole('treeitem', { name: /Health/ })
    expect(health).toHaveAttribute('aria-level', '2')
    expect(health).toHaveAttribute('tabindex', '-1')
    expect(health).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps the hover-CRUD affordances as real, labelled tab stops', () => {
    const { getByRole, queryByRole, handlers } = renderRail()
    const add = getByRole('button', { name: 'Add sub-page to Health' })
    expect(add).not.toHaveAttribute('tabindex', '-1')
    fireEvent.click(add)
    expect(handlers.onAddChild).toHaveBeenCalledWith('health')
    fireEvent.click(getByRole('button', { name: 'Delete Scratchpad' }))
    expect(handlers.onDelete).toHaveBeenCalledWith('scratch')
    expect(queryByRole('button', { name: /Delete Life/ })).not.toBeInTheDocument()
  })
})

// ── AC8 (in-suite): AA contrast over the globals.css palette ────────────────
// Mirrors the audit-tokens contrast check so the roles this molecule renders
// with can never silently rot: raw palette values parsed from globals.css,
// tiers composited per the --mn-text/-meta/-secondary alphas, checked at AA.

describe('AC8 — ink-tier contrast on paper and dark grounds', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const raw = (name: string): [number, number, number] => {
    const m = css.match(new RegExp(`--raw-${name}:\\s*#([0-9a-fA-F]{6})`))
    if (!m) throw new Error(`--raw-${name} not found in globals.css`)
    const h = m[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const composite = (fg: number[], bg: number[], a: number) =>
    fg.map((c, i) => a * c + (1 - a) * bg[i])
  const luminance = ([r, g, b]: number[]) => {
    const f = (c: number) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const contrast = (fg: number[], bg: number[]) => {
    const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
    return (l1 + 0.05) / (l2 + 0.05)
  }

  const TIERS = [1, 0.8, 0.68] // --mn-text / --mn-text-meta / --mn-text-secondary

  it.each(TIERS.map((t) => [t]))('ink tier %d over paper ≥ 4.5', (tier) => {
    const paper = raw('paper')
    const ink = raw('ink')
    expect(contrast(composite(ink, paper, tier), paper)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(TIERS.map((t) => [t]))('paper tier %d over the dark ground ≥ 4.5', (tier) => {
    const paper = raw('paper')
    const ink = raw('ink')
    expect(contrast(composite(paper, ink, tier), ink)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(TIERS.map((t) => [t]))('paper tier %d over the dark card ≥ 4.5', (tier) => {
    const paper = raw('paper')
    const card = raw('card-dark')
    expect(contrast(composite(paper, card, tier), card)).toBeGreaterThanOrEqual(4.5)
  })

  it('reminder due-dot (burnt-orange) reads as a ≥3:1 non-text mark on paper', () => {
    expect(contrast(raw('burnt-orange'), raw('paper'))).toBeGreaterThanOrEqual(3)
  })
})

// ── Type sanity: states union is exact ──────────────────────────────────────

it('the states include dragging (the +1 over the atom set)', () => {
  const states: readonly PondMoleculeState[] = POND_MOLECULE_STATES
  expect(states).toContain('dragging')
})
