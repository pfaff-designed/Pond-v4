/**
 * Token law — the three token-layer defects of #220 and the leaks of the same class.
 *
 * PROJECT_RULES § Colors: three ink tiers only (100 / 80 small meta / 68); three
 * signals, one job each (burnt orange = the one dated thing, wheat = highlighted
 * passages carrying ink, red = diff removals). README § Type: the machine surface
 * is mono, lowercase, TIGHT letterspacing. `PondBlock.dc.html` / `PondMolecule.dc.html`
 * (read inline): the block eyebrow and the field-row label are both
 * `10.5 / 500 / .1em / uppercase / a(.68)` with no font-family (sans inherited);
 * the done check-row is struck at a(.68); empty text is a(.68) at 13.5; `a(.3)` is
 * used only for MARKS (the empty glyph, a link's underline colour).
 *
 * These tests pin the token layer (globals.css), sweep the source for the retired
 * treatments, and render the named surfaces to check they landed on legal values.
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { buttonVariants } from '@/components/ui/button'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { READING_PROSE_CLASS, TERMINAL_PROSE_CLASS } from '@/components/molecules/Markdown'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'
import { SandboxBanner } from '@/components/molecules/SandboxBanner'
import { ChartCard, KICKER } from '@/lib/modules/chart/card'
import { machineEyebrowClass } from '@/components/atoms/kicker'
import { ModuleDiffCard } from '@/components/molecules/ModuleDiffCard'
import { BlockHandleMenu } from '@/components/molecules/BlockHandleMenu'
import { ProposalActions } from '@/components/molecules/ProposalActions'
import type { ChangePreview } from '@/lib/modules/preview'
import { TodoView } from '@/lib/modules/todo/view'
import { TableView } from '@/lib/modules/table/view'
import { TextView } from '@/lib/modules/text/view'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/sandbox/reset', () => ({ resetSandbox: jest.fn() }))

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

/** Every hand-written source file under src/, minus tests, mocks and stories. */
function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === '__mocks__') continue
        walk(full)
      } else if (/\.(tsx?|css)$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name)) {
        out.push(path.relative(root, full))
      }
    }
  }
  walk(path.join(root, 'src'))
  return out
}

/** Files whose lines match `test`, as `file:line` strings for a readable failure. */
function linesMatching(
  test: RegExp | ((line: string) => boolean),
  files = sourceFiles()
): string[] {
  const matches = typeof test === 'function' ? test : (line: string) => test.test(line)
  const hits: string[] = []
  for (const file of files) {
    read(file)
      .split('\n')
      .forEach((line, i) => {
        if (matches(line)) hits.push(`${file}:${i + 1}`)
      })
  }
  return hits
}

const CSS = 'src/app/globals.css'

// ── Defect 1: the fourth ink tier ───────────────────────────────────────────

describe('globals.css — three ink tiers, and a(.3) is a MARK token', () => {
  const css = read(CSS)

  it('defines no --mn-text-faint and exposes no text-mn-text-faint utility', () => {
    expect(css).not.toMatch(/--mn-text-faint/)
    expect(css).not.toMatch(/--color-mn-text-faint/)
  })

  it('keeps a(.3) for marks only, under a name that cannot read as a text tier', () => {
    expect(css).toMatch(/--mn-mark-faint:\s*rgb\(27 29 20 \/ 0\.3\)/)
    expect(css).toMatch(/--mn-mark-faint:\s*rgb\(250 249 239 \/ 0\.3\)/)
    expect(css).toMatch(/--color-mn-mark-faint:\s*var\(--mn-mark-faint\)/)
  })

  it('the three tiers stand exactly: 100 / .8 / .68 in both themes', () => {
    expect(css).toMatch(/--mn-text-meta:\s*rgb\(27 29 20 \/ 0\.8\)/)
    expect(css).toMatch(/--mn-text-secondary:\s*rgb\(27 29 20 \/ 0\.68\)/)
    expect(css).toMatch(/--mn-text-meta:\s*rgb\(250 249 239 \/ 0\.8\)/)
    expect(css).toMatch(/--mn-text-secondary:\s*rgb\(250 249 239 \/ 0\.68\)/)
  })
})

describe('source sweep — no fourth ink tier is used for type anywhere', () => {
  it('no call site consumes text-mn-text-faint (or any mn-text-faint utility)', () => {
    expect(linesMatching(/mn-text-faint/)).toEqual([])
  })

  it('no type sits at ink /30 — mn-text/30 may only tint a mark', () => {
    // The rail's `all` trailing label and the children-grid label were type at .3.
    expect(linesMatching(/font-(mono|sans|serif)[^"'`]*text-mn-text\/30/)).toEqual([])
    expect(linesMatching(/text-mn-text\/30[^"'`]*font-(mono|sans|serif)/)).toEqual([])
  })

  it('every genuine mark site spells a(.3) as the token, never ad hoc', () => {
    // The token had ONE consumer while the marks it was coined for still wrote
    // `mn-text/30` by hand — which is how a(.3) got mistaken for a text tier in
    // the first place. Each of these is a ring, an underline decoration or a
    // glyph painted through currentColor; none of them is reading type.
    const hits = linesMatching(/mn-mark-faint/)
    for (const hit of hits) {
      expect(hit).toMatch(
        /globals\.css|block-dom\.ts|PondAtom\.tsx|PondMolecule\.tsx|QuoteChip\.tsx|RelationChip\.tsx|Rail\.tsx/
      )
    }
    expect(linesMatching(/-mn-text\/30\b/)).toEqual([])
  })
})

// ── Defect 2: red doing a second job ────────────────────────────────────────

describe('globals.css — red is diff removals only', () => {
  const css = read(CSS)

  it('--destructive no longer reads the red signal', () => {
    expect(css).not.toMatch(/--destructive:\s*var\(--raw-red\)/)
    expect(css).toMatch(/--destructive:\s*var\(--mn-text\)/)
  })

  it('the removal role is still red, in both themes', () => {
    expect(css.match(/--mn-signal-removal:\s*var\(--raw-red\)/g)).toHaveLength(2)
  })
})

describe('source sweep — red appears only where a diff removal is drawn', () => {
  const RED_OWNERS = [
    'src/app/globals.css',
    'src/components/atoms/DiffRow.tsx',
    'src/components/molecules/PondMolecule.tsx',
  ]

  it('raw-red / signal-removal are consumed by the diff surfaces alone', () => {
    const hits = linesMatching(/raw-red|signal-removal/)
    const strays = hits.filter((h) => !RED_OWNERS.some((f) => h.startsWith(f)))
    expect(strays).toEqual([])
  })

  it('no hover or icon borrows the destructive hue', () => {
    // BlockCanvas's delete-block ×, the view-block row/card ×, the rail's page ×,
    // the composer's clear and the mic — all were red-on-hover or red-while-live.
    expect(linesMatching(/hover:text-destructive|focus-visible:text-destructive/)).toEqual([])
    expect(linesMatching(/hover:text-mn-signal-removal|hover:bg-mn-signal-removal/)).toEqual([])
    expect(linesMatching(/text-raw-red|hover:text-raw-red/)).toEqual([])
  })

  it('there is no button destructive variant left to paint', () => {
    // `PondControl.dc.html` draws no destructive variant, and with --destructive
    // reading ink it rendered as a quiet button wearing a scary name. Deleted
    // (#220 review / #221), so no variant can reach for red by accident.
    const source = read('src/components/ui/button.tsx')
    expect(source).not.toMatch(/^\s*destructive:/m)
    expect(linesMatching(/variant="destructive"|variant: 'destructive'/)).toEqual([])
    for (const variant of ['default', 'outline', 'secondary', 'ghost', 'link'] as const) {
      expect(buttonVariants({ variant })).not.toMatch(/raw-red|signal-removal/)
    }
  })
})

// ── Defect 3: mono letterspacing ────────────────────────────────────────────
//
// THE RULE, measured rather than reasoned. The machine surface is not
// untracked — it is tracked *small*:
//
//   | board              | site                          | mono value      |
//   | ------------------ | ----------------------------- | --------------- |
//   | `Pond 06.01` 6a    | the composer's running rows   | 12.5px / .02em  |
//   | `Pond 06.03` 6c f5 | the resolved status line      | 12.5px / .02em  |
//   | `Pond 06.10` 6j f2 | the block menu's group labels | 10.5px / .04em  |
//   | `Pond 06.01` 6a    | the UPPERCASE eyebrow         | 10.5px / .1em   |
//
// So what is banned is not "tracking on mono". It is a wide tracking on mono
// LOWERCASE running text — the `tracking-wider` (.1em) that the token layer was
// leaking into the machine voice. The last row is the carve-out that makes this
// a measurement and not a slogan: `new page — proposed` and the `pond`
// attribution on `Pond 06.01` both sit under a `PP Neue Montreal Mono` ancestor
// at .1em *because they are uppercase eyebrows*, which is exactly what
// `machineEyebrowClass` transcribes. A rule that banned .1em on mono outright
// would "correct" an accurate transcription into an inaccurate one — the error
// ADR 0003's 2026-10-01 amendment exists to stop us repeating.

/** A tracking class at or above .05em: the Tailwind steps, or a wide bracket. */
const WIDE_TRACKING = /\btracking-(wide|wider|widest)\b|\btracking-\[-?0?\.(0[5-9]|[1-9]\d*)em\]/

const classOf = (el: Element) => el.getAttribute('class') ?? ''

/**
 * Resolve an inherited class-driven property the way the cascade would: walk up
 * from the element and take the nearest ancestor that declares one of `decls`.
 */
function resolveInherited(el: Element, decls: RegExp): string | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const match = decls.exec(classOf(node))
    if (match) return match[0]
  }
  return null
}

/**
 * Every rendered element that carries a wide tracking while sitting in a MONO
 * subtree — whether `font-mono` is on the element or on any ancestor. The
 * line-level source sweep below cannot see that inheritance, which is how both
 * of #220's misses (`ModuleDiffCard`'s `inferred` pill, and the false positive
 * on `BlockHandleMenu`'s group label) got through review.
 *
 * Uppercase elements are exempt: that is the board's eyebrow (see the table).
 */
function wideTrackingOnMono(root: HTMLElement): string[] {
  const offenders: string[] = []
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const own = classOf(el)
    if (!WIDE_TRACKING.test(own)) continue
    if (resolveInherited(el, /\b(uppercase|lowercase|normal-case)\b/) === 'uppercase') continue
    if (resolveInherited(el, /\bfont-(mono|sans|serif)\b/) !== 'font-mono') continue
    offenders.push(`<${el.tagName.toLowerCase()} class="${own}">`)
  }
  return offenders
}

describe('globals.css — the mono voice runs tight', () => {
  const css = read(CSS)

  it('the mono voice tracks normal; the eyebrow voice keeps .1em', () => {
    expect(css).toMatch(/--voice-mono-tracking:\s*var\(--tracking-normal\)/)
    expect(css).toMatch(/--voice-label-bold-tracking:\s*var\(--tracking-wider\)/)
    expect(css).toMatch(/--tracking-wider:\s*0\.1em;/)
  })

  it('--tracking-wider no longer claims the machine surface', () => {
    const line = css.split('\n').find((l) => /--tracking-wider:/.test(l)) ?? ''
    expect(line).not.toMatch(/machine/i)
  })
})

describe('the inheritance-aware sweep itself', () => {
  // The guard is only worth its runtime if it catches what the line sweep missed,
  // so it is tested against the shapes directly rather than trusted.
  it('flags a wide tracking under an ancestor that supplies font-mono', () => {
    const { container } = render(
      <div className="font-mono lowercase">
        <div className="flex">
          <span className="rounded-mn-pill tracking-wider">inferred</span>
        </div>
      </div>
    )
    expect(wideTrackingOnMono(container)).toHaveLength(1)
  })

  it('passes the board-measured .04em and .02em on mono', () => {
    const { container } = render(
      <div className="font-mono lowercase">
        <div className="tracking-[0.04em]">turn into</div>
        <div className="tracking-[0.02em]">rejected — nothing changed</div>
      </div>
    )
    expect(wideTrackingOnMono(container)).toEqual([])
  })

  it('passes the board’s mono UPPERCASE eyebrow at .1em', () => {
    const { container } = render(<span className={machineEyebrowClass}>new page — proposed</span>)
    expect(machineEyebrowClass).toMatch(/\bfont-mono\b/)
    expect(machineEyebrowClass).toMatch(/tracking-\[0\.1em\]/)
    expect(wideTrackingOnMono(container)).toEqual([])
  })

  it('ignores a wide tracking that a nearer font-sans takes back out of mono', () => {
    const { container } = render(
      <div className="font-mono">
        <span className="font-sans tracking-wider">MADE FROM</span>
      </div>
    )
    expect(wideTrackingOnMono(container)).toEqual([])
  })
})

describe('rendered machine surfaces carry no wide tracking', () => {
  const diffHandlers = () => ({
    onAccept: jest.fn(),
    onReject: jest.fn(),
    onRequestChanges: jest.fn(),
  })

  /** A change the model inferred — the `inferred` pill is only drawn for this. */
  const inferredChange: ChangePreview = {
    op: 'create',
    before: null,
    after: { id: '__preview__', type: 'text', content: 'worktop template — w/c 13 oct' },
    reason: 'the worktop follows the electrician by a week',
    inferred: true,
  }

  it('the diff card, including the inferred pill (the #220 miss)', () => {
    const { container } = render(
      <ModuleDiffCard changes={[inferredChange]} targetName="schedule" {...diffHandlers()} />
    )
    // The pill is really on screen — otherwise this test would pass vacuously.
    expect(screen.getByText('inferred')).toBeInTheDocument()
    expect(wideTrackingOnMono(container)).toEqual([])
  })

  it('the diff card once it has settled', () => {
    const { container } = render(
      <ModuleDiffCard
        changes={[inferredChange]}
        targetName="schedule"
        status="rejected"
        {...diffHandlers()}
      />
    )
    expect(wideTrackingOnMono(container)).toEqual([])
  })

  it('the proposal actions row, pending and settled', () => {
    for (const status of ['pending', 'accepted'] as const) {
      const { container } = render(
        <ProposalActions status={status} onAccept={jest.fn()} onReject={jest.fn()} />
      )
      expect(wideTrackingOnMono(container)).toEqual([])
    }
  })

  it('the block handle menu — and its group label KEEPS the board’s .04em', () => {
    const { container } = render(
      <BlockHandleMenu
        items={[
          {
            id: 'table',
            group: 'turn into',
            label: 'table',
            preview: '4 rows · 3 columns',
            icon: 'table',
          },
          { id: 'delete', group: 'block', label: 'delete block', icon: 'delete' },
        ]}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    )
    expect(wideTrackingOnMono(container)).toEqual([])
    const label = screen.getByText('turn into')
    expect(label.className).toMatch(/tracking-\[0\.04em\]/)
    expect(label.className).toMatch(/text-\[10\.5px\]/)
  })
})

describe('source sweep — no single line pairs mono with a wide tracking', () => {
  // The cheap half of the guard: it reads text, so it only sees an element that
  // declares `font-mono` and its tracking in ONE class string. The rendered sweep
  // above is the one that resolves inheritance; this one keeps the whole tree in
  // scope rather than only the components a test happens to mount.
  const sameLineMono = (line: string) =>
    /\bfont-mono\b/.test(line) && !/\buppercase\b/.test(line) && WIDE_TRACKING.test(line)

  it('no line pairs lowercase mono with tracking-wide / wider / widest', () => {
    expect(linesMatching((line) => sameLineMono(line))).toEqual([])
  })

  it('a bracket tracking on mono stays at or under the boards’ .04em', () => {
    const tooWide = /\btracking-\[-?0?\.(0[5-9]|[1-9]\d*)em\]/
    expect(
      linesMatching(
        (line) => /\bfont-mono\b/.test(line) && !/\buppercase\b/.test(line) && tooWide.test(line)
      )
    ).toEqual([])
  })
})

// ── Wheat and burnt orange doing extra jobs ────────────────────────────────

describe('source sweep — wheat is highlighted passages, burnt orange the dated thing', () => {
  it('raw-wheat / signal-highlight are consumed only by the highlight atom', () => {
    const hits = linesMatching(/raw-wheat|signal-highlight/)
    const strays = hits.filter(
      (h) =>
        !h.startsWith('src/app/globals.css') && !h.startsWith('src/components/atoms/PondAtom.tsx')
    )
    expect(strays).toEqual([])
  })

  it('raw-burnt-orange / signal-dated are consumed only by the due-dot', () => {
    const hits = linesMatching(/raw-burnt-orange|signal-dated/)
    const owners = [
      'src/app/globals.css',
      'src/components/atoms/PondAtom.tsx',
      'src/components/molecules/PondMolecule.tsx',
    ]
    expect(hits.filter((h) => !owners.some((f) => h.startsWith(f)))).toEqual([])
  })

  it('the sandbox banner is an ink wash, not a wheat band', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SandboxBanner />
      </QueryClientProvider>
    )
    const banner = screen.getByRole('status', { name: 'Sandbox workspace' })
    expect(banner.className).not.toMatch(/raw-wheat/)
    expect(banner.className).toMatch(/bg-mn-wash/)
    expect(banner.className).toMatch(/text-mn-text/)
  })
})

// ── Serif on non-prose: PropertyInspector ───────────────────────────────────

describe('PropertyInspector — sans values, board field-row label', () => {
  const schema = [
    { id: 'kcal', name: 'kcal per serving', type: 'number' as const },
    { id: 'note', name: 'note', type: 'text' as const },
  ]

  it('property values are not serif', () => {
    render(<PropertyInspector schema={schema} values={{ kcal: 520 }} onChange={() => {}} />)
    const num = screen.getByLabelText('kcal per serving value')
    const txt = screen.getByLabelText('note value')
    for (const el of [num, txt]) {
      expect(el.className).not.toMatch(/font-serif/)
      expect(el.className).toMatch(/font-sans/)
      expect(el.className).not.toMatch(/\btext-sm\b/)
      expect(el.className).not.toMatch(/mn-text-faint/)
    }
  })

  it('the field-row label is the page eyebrow — 10.5 / 500 / .1em / uppercase / .68, sans', () => {
    const { container } = render(
      <PropertyInspector schema={schema} values={{}} onChange={() => {}} />
    )
    const dt = container.querySelector('dt')
    expect(dt).not.toBeNull()
    for (const cls of pageEyebrowClass.split(' ')) expect(dt!.className).toContain(cls)
    expect(dt!.className).not.toMatch(/tracking-\[0\.14em\]/)
    expect(dt!.className).not.toMatch(/0\.65rem/)
  })

  it('the empty notice is sans at the board’s 13.5 / .68, not serif', () => {
    render(<PropertyInspector schema={[]} values={{}} onChange={() => {}} />)
    const p = screen.getByText('No properties on this page yet.')
    expect(p.className).not.toMatch(/font-serif/)
    expect(p.className).toMatch(/text-\[13\.5px\]/)
    expect(p.className).toMatch(/text-mn-text-secondary/)
  })
})

// ── Page prose at the meta tier ─────────────────────────────────────────────

describe('Markdown — page prose is full ink', () => {
  it('reading and terminal prose carry text-mn-text, never the small-meta tier', () => {
    for (const cls of [READING_PROSE_CLASS, TERMINAL_PROSE_CLASS]) {
      const tokens = cls.split(' ')
      expect(tokens).toContain('text-mn-text')
      expect(tokens).not.toContain('text-mn-text-meta')
      expect(tokens).toContain('font-serif')
    }
  })

  it('the text block’s empty placeholder sits on the 68 tier', () => {
    render(<TextView data={{ id: 't1', type: 'text', content: '' }} editable onChange={() => {}} />)
    // An empty editable block opens in edit mode; blur it to see the placeholder span.
    fireEvent.blur(screen.getByPlaceholderText('Write something…'))
    const span = screen.getByText('Write something…', { selector: 'span' })
    expect(span.className).toMatch(/text-mn-text-secondary/)
    expect(span.className).not.toMatch(/mn-text-faint/)
  })
})

// ── Block eyebrow in the wrong medium ───────────────────────────────────────

describe('ChartCard — the block eyebrow is the page eyebrow (sans, uppercase)', () => {
  it('KICKER is pageEyebrowClass, not a mono lowercase recipe', () => {
    expect(KICKER).toBe(pageEyebrowClass)
    expect(KICKER).not.toMatch(/font-mono|lowercase|tracking-wider/)
  })

  it('renders the title with the sans eyebrow', () => {
    render(
      <ChartCard title="kcal by week" points={[]} seriesColors={[]}>
        <svg />
      </ChartCard>
    )
    const title = screen.getByText('kcal by week')
    expect(title.className).toMatch(/font-sans/)
    expect(title.className).toMatch(/uppercase/)
    expect(title.className).toMatch(/text-\[10\.5px\]/)
    expect(title.className).toMatch(/tracking-\[0\.1em\]/)
  })
})

// ── The board-specified tiers at the named type sites ───────────────────────

describe('type sites that were on the fourth tier land on the board’s 68', () => {
  it('todo: a done label is struck at .68 (PondMolecule check-row)', () => {
    render(
      <TodoView
        data={{
          id: 'td',
          type: 'todo',
          items: [{ id: 'a', label: 'soak chickpeas', checked: true }],
        }}
        editable={false}
      />
    )
    const label = screen.getByText('soak chickpeas').closest('span')
    expect(label?.className).toMatch(/line-through/)
    expect(label?.className).toMatch(/text-mn-text-secondary/)
    expect(label?.className).not.toMatch(/mn-text-faint/)
  })

  it('table: the view draws no empty row of its own — the frame’s empty line reads at .68 / 13.5 (#239)', () => {
    const { container } = render(
      <TableView
        data={{ id: 'tb', type: 'table', columns: ['date', 'recipe'], rows: [] }}
        editable={false}
      />
    )
    expect(container.textContent).not.toContain('No entries yet')
    render(<PondBlockEmpty kind="table" />)
    const line = screen.getByText('no rows yet')
    expect(line.className).toMatch(/text-mn-text-secondary/)
    expect(line.className).toMatch(/text-\[13\.5px\]/)
    expect(line.className).not.toMatch(/mn-text-faint/)
  })
})
