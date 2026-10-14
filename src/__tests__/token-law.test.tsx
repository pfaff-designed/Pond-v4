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
 *
 * It also holds the repo-hygiene laws rehomed out of the retired `pond-*` jest
 * suites: the laws that read SOURCE TEXT off disk or compute arithmetic over the
 * raw palette. None of them is a component test — a browser story cannot see a
 * file that is absent, a cva variant that was deleted, a second copy of a class
 * literal in a file nobody listed, or a contrast ratio derived from `--raw-*`.
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FOCUS_RING } from '@/components/atoms/focus-ring'
import { POND_CONTROL_VARIANTS } from '@/components/atoms/PondControl'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { TEXT_PROSE_CLASS } from '@/lib/modules/text/prose'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'
import { ChartCard } from '@/lib/modules/chart/card'
import { machineEyebrowClass } from '@/components/atoms/kicker'
import { ModuleDiffCard } from '@/components/molecules/ModuleDiffCard'
import { PondMenu } from '@/components/molecules/PondMenu'
import { ProposalActions } from '@/components/molecules/ProposalActions'
import type { ChangePreview } from '@/lib/modules/preview'
import { TodoView } from '@/lib/modules/todo/view'
import { TableView } from '@/lib/modules/table/view'
import { TextView } from '@/lib/modules/text/view'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

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
        /globals\.css|block-dom\.ts|PondAtom\.tsx|PondMolecule\.tsx|RelationChip\.tsx|Rail\.tsx|record-check\.tsx|text\/prose\.ts|ChangeLogPage\.tsx|ChangeLogRecordPage\.tsx|PageChangesSection\.tsx/
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
  const RED_OWNERS = ['src/app/globals.css', 'src/components/molecules/PondMolecule.tsx']

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
    for (const variant of ['primary', 'secondary', 'ghost', 'quiet'] as const) {
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
 * of the misses behind the line sweep (a wide-tracked pill in the diff card, and the false positive
 * on the old block menu's group label) got through review.
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

  const inferredChange: ChangePreview = {
    op: 'create',
    before: null,
    after: { id: '__preview__', type: 'text', content: 'worktop template — w/c 13 oct' },
    reason: 'the worktop follows the electrician by a week',
    inferred: true,
  }

  it('the diff card, with the reason line an inferred change carries', () => {
    const { container } = render(
      <ModuleDiffCard changes={[inferredChange]} targetName="schedule" {...diffHandlers()} />
    )
    // The reason is really on screen — otherwise this test would pass vacuously.
    expect(screen.getByText('the worktop follows the electrician by a week')).toBeInTheDocument()
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

  it('the block menu — its mono values run tight; its head is the sans UPPERCASE eyebrow', () => {
    render(
      <PondMenu
        kind="block"
        label="block menu"
        groups={[
          {
            id: 'turn-into',
            label: 'turn into',
            heading: true,
            items: [{ id: 'table', label: 'table', value: '3 rows · 2 columns', action: 'table' }],
          },
          {
            id: 'block',
            label: 'block',
            items: [{ id: 'delete', label: 'delete', action: 'delete' }],
          },
        ]}
        open
        onOpenChange={jest.fn()}
        onSelect={jest.fn()}
        trigger={<button type="button">handle</button>}
        placement={{ anchor: { current: null }, align: 'start', top: 40, alignOffset: -8 }}
      />
    )
    // The popup is portaled to the body.
    expect(wideTrackingOnMono(document.body)).toEqual([])
    const head = screen.getByText('turn into')
    expect(head.className).toMatch(/tracking-\[\.1em\]/)
    expect(head.className).toMatch(/\buppercase\b/)
    expect(screen.getByText('3 rows · 2 columns').className).not.toMatch(/tracking-/)
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
  it('raw-wheat / signal-highlight are consumed only by the highlight atom and the highlight block', () => {
    const hits = linesMatching(/raw-wheat|signal-highlight/)
    // Two legitimate owners (#249): the INLINE highlight atom (a marked span inside
    // prose, `PondAtom.dc.html`) and the BLOCK-level kept passage
    // (`PondTemplate.dc.html`). Both are "highlighted passages" — the use the rule
    // exists to permit. Different boards, different measurements, the same tokens.
    const owners = [
      'src/app/globals.css',
      'src/components/atoms/PondAtom.tsx',
      'src/lib/modules/highlight/view.tsx',
    ]
    expect(hits.filter((h) => !owners.some((f) => h.startsWith(f)))).toEqual([])
  })

  it('raw-burnt-orange / signal-dated are consumed only by the due-dot', () => {
    const hits = linesMatching(/raw-burnt-orange|signal-dated/)
    // Three legitimate owners: the due-dot itself (PondAtom/PondMolecule), and the
    // deleted view's "restorable until" row (KAN-97; `Pond 06.15 Change log.dc.html`
    // s6o6 frame 6 sets this span's inline color to #D96629 directly) — the one
    // dated thing on THAT card, same rule, a different screen.
    const owners = [
      'src/app/globals.css',
      'src/components/atoms/PondAtom.tsx',
      'src/components/molecules/PondMolecule.tsx',
      'src/components/organisms/ChangeLogPage.tsx',
    ]
    expect(hits.filter((h) => !owners.some((f) => h.startsWith(f)))).toEqual([])
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
    // #260: the row IS `PondMolecule kind="field-row"`, so the label is the molecule's.
    const { container } = render(
      <PropertyInspector schema={schema} values={{}} onChange={() => {}} />
    )
    const label = container.querySelector('[data-kind="field-row"] [data-part="label"]')
    expect(label).not.toBeNull()
    for (const cls of pageEyebrowClass.split(' ')) expect(label!.className).toContain(cls)
    expect(label!.className).not.toMatch(/tracking-\[0\.14em\]/)
    expect(label!.className).not.toMatch(/0\.65rem/)
  })

  it('an empty schema draws no notice of its own — the properties card’s empty state is the frame’s (#260)', () => {
    const { container } = render(<PropertyInspector schema={[]} values={{}} onChange={() => {}} />)
    expect(container.textContent).toBe('')
  })
})

// ── Page prose at the meta tier ─────────────────────────────────────────────

describe('Page prose is full ink', () => {
  it('text block prose carries text-mn-text, never the small-meta tier', () => {
    const tokens = TEXT_PROSE_CLASS.split(' ')
    expect(tokens).toContain('text-mn-text')
    expect(tokens).not.toContain('text-mn-text-meta')
    expect(tokens).toContain('font-serif')
  })

  it('the text block’s empty placeholder sits on the 68 tier', async () => {
    render(<TextView data={{ id: 't1', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await screen.findByRole('textbox', { name: 'text block' })
    expect(field.querySelector('p')).toHaveAttribute('data-placeholder', 'write something')
    expect(TEXT_PROSE_CLASS).toContain('[&_.is-editor-empty]:before:text-mn-text-secondary')
    expect(TEXT_PROSE_CLASS).not.toMatch(/mn-text-faint/)
  })
})

// ── The chart card's two voices land on the right elements ──────────────────

describe('ChartCard — the title is sans 15/500 at full ink; the mono voice is the type tag (#227)', () => {
  it('the title is neither an eyebrow nor mono; the type tag is mono 10.5 at the .8 tier', () => {
    const { container } = render(
      <ChartCard kind="line" title="kcal by week">
        <svg />
      </ChartCard>
    )
    const title = screen.getByText('kcal by week')
    expect(title.className).toMatch(/text-\[15px\]/)
    expect(title.className).toMatch(/font-medium/)
    expect(title.className).not.toMatch(/font-mono|uppercase|tracking-|text-mn-text-secondary/)
    const tag = container.querySelector<HTMLElement>('[data-part="type"]')!
    expect(tag.textContent).toBe('line')
    expect(tag.className).toMatch(/font-mono/)
    expect(tag.className).toMatch(/text-\[10\.5px\]/)
    expect(tag.className).toMatch(/text-mn-text-meta/)
    // The card inherits the page's sans; no Tailwind named size anywhere on it (#217).
    expect(container.innerHTML).not.toMatch(/text-(xs|sm|base|lg|xl)\b/)
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

  it('emptyBox (#239) keeps desktop sizes at md+ but drops to mobile below it (KAN-292)', () => {
    render(<PondBlockEmpty kind="table" action="add a date field" onAction={() => {}} />)
    const line = screen.getByText('no rows yet')
    expect(line.className).toMatch(/text-\[15px\]/)
    expect(line.className).toMatch(/md:text-\[13\.5px\]/)
    const button = screen.getByRole('button', { name: 'add a date field' })
    expect(button.className).toMatch(/\bh-11\b/)
    expect(button.className).toMatch(/\bpx-5\b/)
    expect(button.className).toMatch(/text-\[14px\]/)
    expect(button.className).toMatch(/md:h-8\b/)
    expect(button.className).toMatch(/md:px-\[14px\]/)
    expect(button.className).toMatch(/md:text-\[12px\]/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Rehomed from the `pond-*` suites: laws about SOURCE TEXT and PURE MATHS.
//
// Everything below reads a file off disk or does arithmetic over the raw
// palette. A Storybook story renders a component, so it can never prove any of
// it: an absence (a deleted cva variant, a file that is gone, a string drawn
// nowhere), a single declaration site, or a WCAG ratio parsed out of the CSS.
// ═══════════════════════════════════════════════════════════════════════════

// ── #92: press-* is gone, and no component spells a colour by hand ──────────

describe('source hygiene — no press-* class, no literal hex (#92)', () => {
  // `press-*` → `color-*` completed in #92; these four files are the surviving
  // absence guard. PondAtom and PondMolecule additionally take every colour from
  // a role token, so a hex literal in either is a token-layer bypass.
  const HYGIENE = [
    { file: 'src/components/atoms/PondAtom.tsx', hex: true },
    { file: 'src/components/atoms/RelationChip.tsx', hex: false },
    { file: 'src/components/molecules/PondMolecule.tsx', hex: true },
  ]

  it.each(HYGIENE)('$file carries no press-* class', ({ file }) => {
    expect(read(file)).not.toMatch(/press-/)
  })

  it.each(HYGIENE.filter((h) => h.hex))('$file carries no literal hex colour', ({ file }) => {
    expect(read(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

// ── Tokens are authoritative: no raw hex colour in production CODE ───────────
//
// #92 (above) banned hex in the two colour-taking atoms. This widens the ban to
// ALL production source so the token layer wins by construction: every colour
// must resolve through a role token (globals.css → `_ds/mn/tokens/`), which makes
// a 6/8-digit hex literal anywhere in code a token-layer bypass — the exact thing
// `PROJECT_RULES § Colors` forbids ("All values are raw palette values … Never
// invent colors").
//
// Doc COMMENTS are exempt on purpose. The house convention is to cite a board's
// measured value inline — `on #1B1D14`, `red #C55347`, `filled … #FFEFAE` — and
// that citation is the design files winning, not a leak. So the sweep reads CODE
// with comments blanked out, and only `globals.css` (the token layer itself) may
// spell raw hex in code.
//
// Scope is 6- and 8-digit hex only: a 3-digit form would collide with the issue
// refs (`#312`) that pepper comments, and the design system has no shorthand
// colours — every palette value is a full `#RRGGBB`.

const TOKEN_LAYER = 'src/app/globals.css'

/**
 * Blank out `//` line and `/* *\/` block comments while PRESERVING newlines and
 * length, so a hit's reported `file:line` stays accurate. Conservative toward
 * passing: stripping only ever removes text, so it can hide a contrived hex but
 * never invent one.
 */
function codeWithoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

/** A full `#RRGGBB` or `#RRGGBBAA` colour literal. */
const HEX_COLOUR = /#[0-9a-fA-F]{6}\b([0-9a-fA-F]{2})?/

describe('tokens are authoritative — no raw hex colour in production code (#92 widened)', () => {
  it('every colour resolves through a role token; only globals.css spells raw hex', () => {
    const offenders = sourceFiles()
      .filter((file) => file !== TOKEN_LAYER)
      .flatMap((file) =>
        codeWithoutComments(read(file))
          .split('\n')
          .flatMap((line, i) => (HEX_COLOUR.test(line) ? [`${file}:${i + 1}`] : []))
      )
    expect(offenders).toEqual([])
  })

  it('the sweep reads CODE, not comments — a cited board value never trips it', () => {
    // The guard is only safe if it leaves the house's inline citations alone, so
    // prove both halves against the shapes directly rather than trusting them.
    const commented = `// board dueDot: 7×7 · #D96629\n/* filled #FFEFAE on #1B1D14 */\nconst x = 1`
    expect(HEX_COLOUR.test(codeWithoutComments(commented))).toBe(false)
    const inCode = `const bad = { color: '#FAF9EF' }`
    expect(HEX_COLOUR.test(codeWithoutComments(inCode))).toBe(true)
  })
})

// ── The cva axes of ui/button.tsx — provable only in source ─────────────────

describe('ui/button.tsx — the cva axes (#221 / #230)', () => {
  // No rendering can prove a variant's ABSENCE: `buttonVariants({ variant:
  // 'destructive' })` on a table that no longer has the key just falls back to
  // the default and returns a perfectly legal string. The cva table is read.
  const source = read('src/components/ui/button.tsx')

  it.each([
    // colour axis — the board's four and nothing else (`PondControl.dc.html`)
    ['destructive', /^\s*destructive:/m, false],
    ['outline', /^\s*outline:/m, false],
    ['link', /^\s*link:/m, false],
    ['default', /^\s*default:/m, false],
    ['primary', /^\s*primary:/m, true],
    ['quiet', /^\s*quiet:/m, true],
    // size axis — sm/xs carry the composer's diff actions and the dialogs (#230)
    ['sm', /^\s*sm:/m, true],
    ['xs', /^\s*xs:/m, true],
    ['mobile', /^\s*mobile:/m, true],
    ['lg', /^\s*lg:/m, false],
    ['icon*', /^\s*icon(-xs|-sm|-lg)?:/m, false],
  ])('the %s key is present=%s in the cva tables', (_key, pattern, present) => {
    expect(pattern.test(source)).toBe(present)
  })

  it('the unargued default IS primary · desktop', () => {
    expect(buttonVariants()).toBe(buttonVariants({ variant: 'primary', size: 'desktop' }))
  })

  it('the mobile size is the board’s h44 · px20 · 14px (AUDIT X1)', () => {
    expect(buttonVariants({ size: 'mobile' })).toMatch(/\bh-11\b.*\bpx-5\b.*\btext-\[14px\]/)
  })

  it.each(POND_CONTROL_VARIANTS.map((v) => [v]))(
    'cn(buttonVariants({ variant: "%s" })) keeps BOTH the size and the colour (#252)',
    (variant) => {
      // tailwind-merge dropped one of the two when a variant's ground and its
      // label colour collided; the regression was invisible until a button went
      // text-less. A pure function over `cn`, not a render.
      const merged = cn(buttonVariants({ variant }))
      expect(merged).toContain('text-[12px]')
      expect(merged).toMatch(/text-mn-text(\/80)?\b|text-raw-paper/)
    }
  )
})

// ── One owner for the mist focus ring ──────────────────────────────────────

describe('FOCUS_RING has exactly one owner (#221 review)', () => {
  const OWNER = 'src/components/atoms/focus-ring.ts'
  const CONSUMERS = [
    'src/components/atoms/PondAtom.tsx',
    'src/components/molecules/PondMolecule.tsx',
    'src/components/atoms/PondControl.tsx',
    'src/components/ui/button.tsx',
  ]

  it('is the mist ring, spelled once', () => {
    expect(FOCUS_RING).toBe('outline-2 outline-offset-2 outline-mn-area-b')
  })

  it.each(CONSUMERS.map((f) => [f]))(
    '%s redeclares no FOCUS_RING and imports the owner',
    (file) => {
      const source = read(file)
      expect(source).not.toMatch(/const FOCUS_RING\s*=/)
      expect(source).toMatch(/from '@\/components\/atoms\/focus-ring'/)
    }
  )

  it('the ring utilities are SPELLED OUT in exactly one file — the owner', () => {
    // The `const FOCUS_RING =` check above passes while the ring is still spelled
    // out somewhere else, which is what the #221 review found in PondMolecule.
    // DERIVED on purpose: the whole value of this sweep is catching a fifth copy
    // in a file nobody thought to list, so it must not take a list.
    const offenders = sourceFiles().filter(
      (f) => f !== OWNER && read(f).includes('outline-offset-2 outline-mn-area-b')
    )
    expect(offenders).toEqual([])
  })
})

// ── One state table, no named type sizes ───────────────────────────────────

describe('PondControl.tsx — one shared state table, no Tailwind named sizes', () => {
  it('the eight states are ONE exhaustive map, not eight per-kind recipes', () => {
    // Exhaustiveness is a TYPE fact: `Record<PondControlState, …>` fails to
    // compile if a state is missed. A render cannot tell one shared map from
    // five hand-written per-kind recipes that happen to agree today.
    const source = read('src/components/atoms/PondControl.tsx')
    expect(source).toMatch(/Record<PondControlState,/)
    expect(source).toMatch(/Record<PondControlKind,/)
  })

  it.each([['src/components/atoms/PondControl.tsx'], ['src/components/ui/button.tsx']])(
    '%s uses no Tailwind named type size (#217)',
    (file) => {
      expect(read(file)).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b/)
    }
  )
})

// ── The bare <input type="checkbox"> sites gave up their inputs ────────────

describe('no production source keeps a bare type="checkbox"', () => {
  it.each([['src/components/molecules/PropertyInspector.tsx'], ['src/lib/modules/view/view.tsx']])(
    '%s draws no bare checkbox input — it takes PondControl kind="checkbox"',
    (file) => {
      expect(read(file)).not.toMatch(/type="checkbox"/)
    }
  )

  it('each surviving checkbox names its board in a comment', () => {
    // Two boards, two checkboxes — unreconciled by design, so each one carries
    // the board it transcribes rather than being silently deduplicated.
    expect(read('src/components/atoms/PondControl.tsx')).toMatch(/PondControl\.dc\.html/)
    expect(read('src/components/atoms/PondAtom.tsx')).toMatch(
      /PondAtom\.dc\.html[^\n]*checkbox|checkbox[^\n]*PondAtom\.dc\.html/
    )
  })
})

// ── The absorbed molecules are gone, not relocated ─────────────────────────

describe('TreeRow and OverviewCard were absorbed into PondMolecule (#95)', () => {
  it.each([
    ['src/components/molecules/TreeRow.tsx'],
    ['src/components/molecules/TreeRow.stories.tsx'],
    ['src/components/molecules/OverviewCard.tsx'],
    ['src/components/molecules/OverviewCard.stories.tsx'],
    ['src/components/molecules/RelationValue.stories.tsx'],
  ])('%s does not exist', (gone) => {
    expect(fs.existsSync(path.join(root, gone))).toBe(false)
  })

  it('no source file still imports the absorbed molecules', () => {
    expect(linesMatching(/from '@\/components\/molecules\/(TreeRow|OverviewCard)'/)).toEqual([])
  })
})

// ── Empty copy: the three ad-hoc sentence-case strings ─────────────────────

describe('source sweep — the three sentence-case empty strings are gone', () => {
  // The frame owns the empty state (`PondBlockEmpty`), so a block view that
  // draws its own notice is a divergence. These are the three that existed.
  it.each([['No entries yet'], ['No rows yet'], ['No data yet']])(
    '“%s” is drawn nowhere under src/',
    (needle) => {
      expect(sourceFiles().filter((f) => read(f).includes(needle))).toEqual([])
    }
  )
})

// ── AA contrast over the raw palette ──────────────────────────────────────
//
// Mirrors the audit-tokens contrast check in-suite so the three ink tiers can
// never silently rot: the `--raw-*` values are parsed out of globals.css, each
// tier composited at its alpha, and the WCAG ratio computed. Pure arithmetic
// over the token layer — nothing is rendered, and nothing can be.

describe('ink-tier contrast on paper and on both dark grounds', () => {
  const css = read(CSS)

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

  /** --mn-text / --mn-text-meta / --mn-text-secondary. There is no fourth. */
  const TIERS = [1, 0.8, 0.68]

  /** label, the ink doing the writing, the ground it sits on. */
  const GROUNDS: Array<[string, string, string]> = [
    ['ink over paper', 'ink', 'paper'],
    ['paper over the dark ground', 'paper', 'ink'],
    ['paper over the dark card', 'paper', 'card-dark'],
  ]

  const CASES = GROUNDS.flatMap(([label, fg, bg]) => TIERS.map((tier) => ({ label, fg, bg, tier })))

  it.each(CASES)('$label, tier $tier — ≥ 4.5 (AA body text)', ({ fg, bg, tier }) => {
    const ground = raw(bg)
    expect(contrast(composite(raw(fg), ground, tier), ground)).toBeGreaterThanOrEqual(4.5)
  })

  it('the reminder due-dot reads ≥ 3:1 as a non-text mark on paper', () => {
    // Burnt orange is a MARK, so it answers to the 3:1 non-text ratio, not 4.5.
    expect(contrast(raw('burnt-orange'), raw('paper'))).toBeGreaterThanOrEqual(3)
  })
})
