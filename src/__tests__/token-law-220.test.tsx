/**
 * Token law (#220) — the three token-layer defects and the leaks of the same class.
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
import { TodoView } from '@/lib/modules/todo/view'
import { TableView } from '@/lib/modules/table/view'
import { TextView } from '@/lib/modules/text/view'

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

/** Files whose lines match `re`, as `file:line` strings for a readable failure. */
function linesMatching(re: RegExp, files = sourceFiles()): string[] {
  const hits: string[] = []
  for (const file of files) {
    read(file)
      .split('\n')
      .forEach((line, i) => {
        if (re.test(line)) hits.push(`${file}:${i + 1}`)
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

  it('the mark token is spent only on decorations (the scroll-to-block ring)', () => {
    const hits = linesMatching(/mn-mark-faint/)
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) {
      expect(hit).toMatch(/globals\.css|block-dom\.ts/)
    }
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

  it('the button destructive variant resolves to ink, not a red class', () => {
    const cls = buttonVariants({ variant: 'destructive' })
    expect(cls).not.toMatch(/raw-red|signal-removal/)
  })
})

// ── Defect 3: mono letterspacing inverted ───────────────────────────────────

describe('globals.css — mono carries no added letterspacing', () => {
  const css = read(CSS)

  it('the mono voice tracks normal; label-bold keeps .1em', () => {
    expect(css).toMatch(/--voice-mono-tracking:\s*var\(--tracking-normal\)/)
    expect(css).toMatch(/--voice-label-bold-tracking:\s*var\(--tracking-wider\)/)
    expect(css).toMatch(/--tracking-wider:\s*0\.1em;/)
  })

  it('--tracking-wider no longer claims the machine surface', () => {
    const line = css.split('\n').find((l) => /--tracking-wider:/.test(l)) ?? ''
    expect(line).not.toMatch(/machine/i)
  })
})

describe('source sweep — no font-mono class string adds letterspacing', () => {
  it('no line pairs font-mono with tracking-wide / tracking-wider / tracking-widest', () => {
    expect(linesMatching(/font-mono[^"'`\n]*tracking-wide(r|st)?\b/)).toEqual([])
    expect(linesMatching(/tracking-wide(r|st)?\b[^"'`\n]*font-mono/)).toEqual([])
  })

  it('no mono line carries a bracket tracking wider than the boards’ .02em', () => {
    // .02em is measured off `Pond 06.01` 6a (ProposalActions, MadeFromChip, #97);
    // anything looser on mono was the inverted token leaking in.
    const loose = /tracking-\[0?\.(0[3-9]|[1-9]\d*)em\]/
    const hits = linesMatching(/font-mono/).filter((hit) => {
      const [file, line] = hit.split(':')
      return loose.test(read(file).split('\n')[Number(line) - 1])
    })
    expect(hits).toEqual([])
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

  it('table: the empty row reads at .68', () => {
    render(
      <TableView
        data={{ id: 'tb', type: 'table', columns: ['date', 'recipe'], rows: [] }}
        editable={false}
      />
    )
    const cell = screen.getByText('No entries yet')
    expect(cell.className).toMatch(/text-mn-text-secondary/)
    expect(cell.className).not.toMatch(/mn-text-faint/)
  })
})
