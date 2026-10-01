/**
 * PondAtom (#93) — the one polymorphic inline atom: 24 content kinds × 9 states,
 * driven entirely by Make Noise role tokens. These tests defend the acceptance
 * criteria head-on: every kind renders at rest (desktop + mobile), the full
 * 216-cell matrix mounts, the source carries zero `press-*` / zero literal hex,
 * the three type registers hold (serif-never-400, mono-lowercase, numeric
 * tabular), area colour tints MARKS only, date+due shows exactly one burnt-
 * orange dot, and the delegating chips (RelationChip / QuoteChip) keep their
 * public contract for BacklinksSection / RelationValue / AITerminal.
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { render, fireEvent, within } from '@testing-library/react'
import {
  PondAtom,
  POND_ATOM_KINDS,
  POND_ATOM_STATES,
  type PondAtomKind,
} from '@/components/atoms/PondAtom'
import { RelationChip } from '@/components/atoms/RelationChip'
import { QuoteChip } from '@/components/atoms/QuoteChip'
import { RelationValue } from '@/components/molecules/RelationValue'
import { BacklinksSection } from '@/components/molecules/BacklinksSection'

/** The atom's root element (wrap span / media tile / divider rule). */
function atomRoot(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-kind]')
  if (!el) throw new Error('PondAtom rendered no [data-kind] root')
  return el
}

/** The inner text span (display value), when the kind shows text. */
function textSpan(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-part="text"]')
  if (!el) throw new Error('PondAtom rendered no [data-part="text"] span')
  return el
}

// ── AC1: all 24 kinds at rest, desktop + mobile ─────────────────────────────

describe('AC1 — every kind renders at rest', () => {
  it.each(POND_ATOM_KINDS.map((k) => [k] as [PondAtomKind]))('kind=%s (desktop)', (kind) => {
    const { container } = render(<PondAtom kind={kind} />)
    const root = atomRoot(container)
    expect(root.dataset.kind).toBe(kind)
    expect(root.dataset.state).toBe('rest')
  })

  it.each(POND_ATOM_KINDS.map((k) => [k] as [PondAtomKind]))('kind=%s (mobile)', (kind) => {
    const { container } = render(<PondAtom kind={kind} size="mobile" />)
    expect(atomRoot(container).dataset.kind).toBe(kind)
  })

  it('exposes exactly 24 kinds and 9 states', () => {
    expect(POND_ATOM_KINDS).toHaveLength(24)
    expect(POND_ATOM_STATES).toHaveLength(9)
  })
})

// ── AC2: the 216-cell matrix mounts (unused states fall back to rest) ───────

describe('AC2 — full kind × state matrix', () => {
  it('renders all 216 cells without throwing', () => {
    for (const kind of POND_ATOM_KINDS) {
      for (const state of POND_ATOM_STATES) {
        const { container, unmount } = render(<PondAtom kind={kind} state={state} />)
        expect(atomRoot(container).dataset.state).toBe(state)
        unmount()
      }
    }
  })
})

// ── AC3: zero press-* and zero literal hex in the touched sources ───────────

describe('AC3/AC7 — token hygiene in source', () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), 'src/components/atoms', rel), 'utf8')

  it.each([['PondAtom.tsx'], ['RelationChip.tsx'], ['QuoteChip.tsx']])(
    '%s carries no press-* classes',
    (file) => {
      expect(read(file)).not.toMatch(/press-/)
    }
  )

  it('PondAtom.tsx carries no literal hex colour', () => {
    expect(read('PondAtom.tsx')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

// ── AC4: the three type registers ───────────────────────────────────────────

describe('AC4 — type registers', () => {
  it.each([['prose'], ['highlight'], ['quote']] as [PondAtomKind][])(
    'serif kind %s is Editorial 200, never 400',
    (kind) => {
      const { container } = render(<PondAtom kind={kind} />)
      const cls = textSpan(container).className
      expect(cls).toContain('font-serif')
      expect(cls).toContain('font-extralight')
      expect(cls).not.toContain('font-normal')
    }
  )

  it.each([['code'], ['tag'], ['relation'], ['file']] as [PondAtomKind][])(
    'mono kind %s is machine-surface mono, lowercase',
    (kind) => {
      const cls = textSpan(render(<PondAtom kind={kind} />).container).className
      expect(cls).toContain('font-mono')
      expect(cls).toContain('lowercase')
    }
  )

  it.each([['number'], ['money'], ['percent'], ['date'], ['time'], ['duration']] as [
    PondAtomKind,
  ][])('numeric kind %s uses tabular-nums', (kind) => {
    expect(textSpan(render(<PondAtom kind={kind} />).container).className).toContain(
      'tabular-nums'
    )
  })
})

// ── AC5: area colour tints marks ONLY ───────────────────────────────────────

describe('AC5 — colour prop tints only icon glyph + dot', () => {
  it('tints the icon glyph (sage → mn-area-a)', () => {
    const { container } = render(<PondAtom kind="icon" color="sage" />)
    const glyph = container.querySelector('[data-part="glyph"]')
    expect(glyph?.className).toContain('text-mn-area-a')
  })

  it('tints the dot (navy → mn-area-c, the role that flips to mist on dark)', () => {
    const { container } = render(<PondAtom kind="dot" color="navy" />)
    const dot = container.querySelector('[data-part="dot"]')
    expect(dot?.className).toContain('bg-mn-area-c')
  })

  it.each([['text'], ['heading'], ['prose'], ['number'], ['tag']] as [PondAtomKind][])(
    'never tints text or ground on kind %s',
    (kind) => {
      const { container } = render(<PondAtom kind={kind} color="sage" />)
      expect(container.innerHTML).not.toContain('mn-area')
    }
  )
})

// ── AC6: date + due = exactly one burnt-orange dot ──────────────────────────

describe('AC6 — the one dated thing', () => {
  it('date + due shows exactly one signal-dated dot', () => {
    const { container } = render(<PondAtom kind="date" due />)
    expect(container.querySelectorAll('.bg-mn-signal-dated')).toHaveLength(1)
  })

  it('date without due shows none', () => {
    const { container } = render(<PondAtom kind="date" />)
    expect(container.querySelectorAll('.bg-mn-signal-dated')).toHaveLength(0)
  })

  it('due is ignored off the date kind', () => {
    const { container } = render(<PondAtom kind="time" due />)
    expect(container.querySelectorAll('.bg-mn-signal-dated')).toHaveLength(0)
  })

  it('no other signal colour appears on a plain text atom', () => {
    const { container } = render(<PondAtom kind="text" />)
    expect(container.innerHTML).not.toMatch(/mn-signal/)
  })
})

// ── AC8: focus ring / editing caret / disabled opacity ──────────────────────

describe('AC8 — interaction states', () => {
  it('focus draws the mist ring', () => {
    const { container } = render(<PondAtom kind="text" state="focus" />)
    expect(atomRoot(container).className).toContain('outline-mn-area-b')
  })

  it('editing shows the inset ink border and a caret', () => {
    const { container } = render(<PondAtom kind="text" state="editing" />)
    expect(atomRoot(container).className).toContain('ring-mn-text')
    expect(container.querySelector('[data-part="caret"]')).toBeInTheDocument()
  })

  it('rest shows no caret', () => {
    const { container } = render(<PondAtom kind="text" />)
    expect(container.querySelector('[data-part="caret"]')).not.toBeInTheDocument()
  })

  it('disabled dims to 40%', () => {
    const { container } = render(<PondAtom kind="text" state="disabled" />)
    expect(atomRoot(container).className).toContain('opacity-40')
  })
})

// ── Kind behaviours from the mockup ─────────────────────────────────────────

describe('kind behaviours', () => {
  it('relation appends › as a decorative (aria-hidden) mark', () => {
    const { container, getByText } = render(<PondAtom kind="relation" value="chickpeas" />)
    expect(getByText('chickpeas')).toBeInTheDocument()
    const suffix = container.querySelector('[data-part="suffix"]')
    expect(suffix).toHaveAttribute('aria-hidden')
    expect(suffix?.textContent).toContain('›')
  })

  it('link appends ↗', () => {
    const { container } = render(<PondAtom kind="link" value="open in sheets" />)
    expect(container.querySelector('[data-part="suffix"]')?.textContent).toContain('↗')
  })

  it('file appends · <size>', () => {
    const { container } = render(<PondAtom kind="file" value="quote-hartley.pdf" />)
    expect(container.querySelector('[data-part="suffix"]')?.textContent).toContain('· 212 kb')
  })

  it.each([
    ['relation', 'link a record'],
    ['person', 'assign someone'],
    ['heading', 'untitled'],
    ['prose', 'write something'],
    ['link', 'add a link'],
    ['file', 'attach a file'],
    ['text', 'empty'],
  ] as [PondAtomKind, string][])('empty %s shows the "%s" placeholder', (kind, placeholder) => {
    const { getByText } = render(<PondAtom kind={kind} state="empty" />)
    expect(getByText(placeholder)).toBeInTheDocument()
  })

  it('loading shows an ellipsis', () => {
    const { getByText } = render(<PondAtom kind="text" state="loading" />)
    expect(getByText('…')).toBeInTheDocument()
  })

  it('relation error strikes through and notes the kept id', () => {
    const { container, getByText } = render(
      <PondAtom kind="relation" state="error" value="chickpeas" />
    )
    expect(textSpan(container).className).toContain('line-through')
    expect(getByText('deleted · kept 710')).toBeInTheDocument()
  })

  it('note={false} suppresses the error note', () => {
    const { queryByText } = render(
      <PondAtom kind="relation" state="error" value="chickpeas" note={false} />
    )
    expect(queryByText('deleted · kept 710')).not.toBeInTheDocument()
  })

  it.each([['checkbox'], ['icon'], ['dot']] as [PondAtomKind][])(
    '%s renders no text',
    (kind) => {
      const { container } = render(<PondAtom kind={kind} />)
      expect(container.querySelector('[data-part="text"]')).not.toBeInTheDocument()
    }
  )

  it('checkbox on renders the check mark; off does not', () => {
    const on = render(<PondAtom kind="checkbox" on />)
    expect(on.container.querySelector('[data-part="check"]')).toBeInTheDocument()
    const off = render(<PondAtom kind="checkbox" />)
    expect(off.container.querySelector('[data-part="check"]')).not.toBeInTheDocument()
  })

  it('divider is a hairline rule', () => {
    const { container } = render(<PondAtom kind="divider" />)
    expect(atomRoot(container).className).toContain('border-mn-line')
  })

  it('person renders avatar initials from the value', () => {
    const { container } = render(<PondAtom kind="person" value="Charles Pfaff" />)
    expect(container.querySelector('[data-part="avatar"]')?.textContent).toBe('CP')
  })

  it('empty person shows the placeholder, not an avatar', () => {
    const { container, getByText } = render(<PondAtom kind="person" state="empty" />)
    expect(getByText('assign someone')).toBeInTheDocument()
    expect(container.querySelector('[data-part="avatar"]')).not.toBeInTheDocument()
  })

  it('image is a media tile with a caption', () => {
    const { getByText } = render(<PondAtom kind="image" />)
    expect(getByText('image · 4:3')).toBeInTheDocument()
  })

  it('video carries the play affordance', () => {
    const { container, getByText } = render(<PondAtom kind="video" />)
    expect(getByText('video · 0:42')).toBeInTheDocument()
    expect(container.querySelector('[data-part="play"]')).toBeInTheDocument()
  })

  it('empty media invites a drop', () => {
    expect(
      render(<PondAtom kind="image" state="empty" />).getByText('drop an image')
    ).toBeInTheDocument()
    expect(
      render(<PondAtom kind="video" state="empty" />).getByText('drop a video')
    ).toBeInTheDocument()
  })

  it('heading levels change the register (level 1 uppercase display, level 3 plain)', () => {
    const h1 = textSpan(render(<PondAtom kind="heading" level={1} />).container)
    expect(h1.className).toContain('uppercase')
    const h3 = textSpan(render(<PondAtom kind="heading" level={3} />).container)
    expect(h3.className).not.toContain('uppercase')
  })

  it('highlight rides the wheat signal and always carries ink', () => {
    const cls = textSpan(render(<PondAtom kind="highlight" />).container).className
    expect(cls).toContain('bg-mn-signal-highlight')
    expect(cls).toContain('text-mn-signal-highlight-ink')
  })
})

// ── AC9 (contrast): the three ink tiers hold WCAG AA on both grounds ───────
// Mirrors the audit-tokens contrast check in-suite so it can never silently rot:
// raw palette values are parsed from globals.css, tiers composited per the
// --mn-text/-meta/-secondary alphas, and checked at the AA body-text ratio.

describe('AC9 — ink-tier contrast on paper and dark grounds', () => {
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
})

// ── AC7: the delegating chips keep their public contract ────────────────────

describe('AC7 — RelationChip through PondAtom', () => {
  it('renders the title via a relation atom and opens on click', () => {
    const onOpen = jest.fn()
    const { container, getByText, getByRole } = render(
      <RelationChip id="page-42" title="The Odyssey" onOpen={onOpen} />
    )
    expect(container.querySelector('[data-kind="relation"]')).toBeInTheDocument()
    expect(getByText('The Odyssey')).toBeInTheDocument()
    fireEvent.click(getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith('page-42')
  })

  it('missing → the atom error state: struck label, inert, removable', () => {
    const onOpen = jest.fn()
    const onRemove = jest.fn()
    const { container, getByText, getByLabelText } = render(
      <RelationChip id="gone" onOpen={onOpen} onRemove={onRemove} missing />
    )
    const atom = container.querySelector('[data-kind="relation"]')
    expect(atom).toHaveAttribute('data-state', 'error')
    expect(getByText('Missing page')).toBeInTheDocument()
    fireEvent.click(getByText('Missing page'))
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(getByLabelText('Remove missing link'))
    expect(onRemove).toHaveBeenCalled()
  })

  it('carries no press-* classes in the rendered DOM', () => {
    const { container } = render(
      <RelationChip id="p" title="T" onOpen={jest.fn()} onRemove={jest.fn()} />
    )
    expect(container.querySelector('[class*="press-"]')).not.toBeInTheDocument()
  })
})

describe('AC7 — QuoteChip through PondAtom', () => {
  it('renders the excerpt via a quote atom, trimmed at 120 chars', () => {
    const long = 'x'.repeat(200)
    const { container } = render(<QuoteChip text={long} onRemove={jest.fn()} />)
    const atom = container.querySelector('[data-kind="quote"]')
    expect(atom).toBeInTheDocument()
    expect(atom?.textContent).toBe('x'.repeat(120) + '…')
  })

  it('the × still removes, and no press-* class remains', () => {
    const onRemove = jest.fn()
    const { container, getByLabelText } = render(
      <QuoteChip text="Needs more salt." onRemove={onRemove} />
    )
    fireEvent.click(getByLabelText('Remove quoted context'))
    expect(onRemove).toHaveBeenCalled()
    expect(container.querySelector('[class*="press-"]')).not.toBeInTheDocument()
  })
})

describe('AC7 — consumers keep working (integration)', () => {
  it('RelationValue renders present + missing chips and unlinks via ×', () => {
    const onChange = jest.fn()
    const onOpen = jest.fn()
    const { getByText, getByLabelText } = render(
      <RelationValue
        value={['a', 'b']}
        titles={new Map([['a', 'Trip to Rome']])}
        candidates={[]}
        editable
        onChange={onChange}
        onOpen={onOpen}
      />
    )
    expect(getByText('Trip to Rome')).toBeInTheDocument()
    expect(getByText('Missing page')).toBeInTheDocument()
    fireEvent.click(getByText('Trip to Rome'))
    expect(onOpen).toHaveBeenCalledWith('a')
    fireEvent.click(getByLabelText('Remove Trip to Rome'))
    expect(onChange).toHaveBeenCalledWith(['b'])
  })

  it('BacklinksSection renders read-only chips (no ×) that open the source row', () => {
    const onOpen = jest.fn()
    const { getByText, queryByLabelText } = render(
      <BacklinksSection
        groups={[
          {
            sourceCollectionId: 'col-1',
            sourceCollectionTitle: 'Tasks',
            propertyId: 'p-1',
            propertyName: 'Project',
            rows: [{ id: 'row-1', title: 'Sand the bench' }],
          },
        ]}
        onOpen={onOpen}
      />
    )
    const section = within(getByText('Linked from').closest('section') as HTMLElement)
    fireEvent.click(section.getByText('Sand the bench'))
    expect(onOpen).toHaveBeenCalledWith('row-1')
    expect(queryByLabelText(/Remove/)).not.toBeInTheDocument()
  })
})
