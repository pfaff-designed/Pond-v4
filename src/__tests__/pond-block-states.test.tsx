/**
 * PondBlock 2/4 (#238) — hover, selected, loading, error and disabled, measured off
 * `PondBlock.dc.html`'s `renderVals()`:
 *
 *   state     rest · hover · selected · empty · loading · error · deleted · disabled
 *   hover     block.boxShadow === cardShadow (NO card change); one row goes `hover`:
 *             R = { list 1, checklist 1, table 0, log 0, properties 0, gallery card 0 }
 *   selected  boxShadow `0 0 0 2px ${fg},${cardShadow}` — ring PLUS shadow;
 *             gallery card 1 goes `selected`
 *   loading   headNote 'loading…' · bars { display block, height h, width w,
 *             borderRadius 5, background a(.08) } in a stack (gap table 0 else 2):
 *             number [60%×52, 40%×10] · gallery [100%×120, 50%×10] · else [82%,64%,74%]×10
 *   error     <PondMolecule kind="notice" action="reconnect" title={errLine}>;
 *             errLine table/gallery/number 'pond can’t reach this sheet any more ·
 *             showing the last copy', else 'this block couldn’t load'
 *   disabled  opacity .4 — and the card is `inert`, so the live body under it takes
 *             no clicks, text entry or Tab
 *
 * The class recipe is asserted here (jsdom has no layout); computed values live in
 * `PondBlock.stories.tsx`. `empty` is #239 and `deleted` is #240 — both fall through
 * to rest here.
 */

import React, { type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import {
  PondBlock,
  POND_BLOCK_KINDS,
  POND_BLOCK_STATES,
  POND_BLOCK_HOVER_ROW,
  POND_BLOCK_SKELETON,
  POND_BLOCK_ROW_GAP,
  POND_BLOCK_ERROR_LINE,
  blockErrorLine,
  blockRowState,
  type PondBlockKind,
  type PondBlockState,
} from '@/components/organisms/PondBlock'
import { PondMolecule } from '@/components/molecules/PondMolecule'

const classes = (el: Element) => el.className.split(' ')

function renderCard(kind: PondBlockKind, state: PondBlockState, body?: ReactNode) {
  const { container } = render(
    <PondBlock kind={kind} heading="method" headNote="1 of 3" state={state}>
      {body ?? <p data-testid="body">body</p>}
    </PondBlock>
  )
  return container.firstElementChild as HTMLElement
}

const CARD_SHADOW = 'shadow-mn-card'
const RING = ['ring-2', 'ring-mn-text']

describe('PondBlockState — the board’s eight, one source of truth', () => {
  it('declares all eight board states in the board’s order', () => {
    expect(POND_BLOCK_STATES).toEqual([
      'rest',
      'hover',
      'selected',
      'empty',
      'loading',
      'error',
      'deleted',
      'disabled',
    ])
  })

  it('defaults to rest and stamps the state on the card', () => {
    const { container } = render(
      <PondBlock kind="list" heading="notifications" headNote="3">
        <p>body</p>
      </PondBlock>
    )
    expect((container.firstElementChild as HTMLElement).dataset.blockState).toBe('rest')
    expect(renderCard('list', 'selected').dataset.blockState).toBe('selected')
  })
})

describe('rest / hover — the card itself does not change', () => {
  it.each(['rest', 'hover', 'empty', 'deleted'] as const)(
    '%s keeps the card shadow with no ring, lift or opacity',
    (state) => {
      const card = renderCard('list', state)
      const cls = classes(card)
      expect(cls).toContain(CARD_SHADOW)
      for (const r of RING) expect(cls).not.toContain(r)
      expect(cls).not.toContain('opacity-40')
      expect(cls.some((c) => c.startsWith('hover:'))).toBe(false)
      expect(cls.some((c) => /translate|shadow-mn-(md|lg)/.test(c))).toBe(false)
      // The body renders — empty (#239) and deleted (#240) fall through to rest here.
      expect(screen.getByTestId('body')).toBeInTheDocument()
    }
  )

  it('hover paints the board’s row index per kind, and nothing for number', () => {
    expect(POND_BLOCK_HOVER_ROW).toEqual({
      list: 1,
      checklist: 1,
      table: 0,
      log: 0,
      properties: 0,
      gallery: 0,
      number: null,
    })
  })

  it.each(POND_BLOCK_KINDS)('%s: blockRowState is hover only at the board index', (kind) => {
    const idx = POND_BLOCK_HOVER_ROW[kind]
    for (let i = 0; i < 4; i++) {
      expect(blockRowState(kind, 'hover', i)).toBe(idx === i ? 'hover' : 'rest')
    }
  })

  it.each(['rest', 'empty', 'loading', 'error', 'deleted', 'disabled'] as const)(
    '%s: every row is rest for every kind',
    (state) => {
      for (const kind of POND_BLOCK_KINDS) {
        expect([0, 1, 2, 3].map((i) => blockRowState(kind, state, i))).toEqual([
          'rest',
          'rest',
          'rest',
          'rest',
        ])
      }
    }
  )

  it('rendered: exactly one row carries the molecule hover state, at the board index', () => {
    const card = renderCard(
      'list',
      'hover',
      <div data-testid="body">
        {['a', 'b', 'c'].map((t, i) => (
          <PondMolecule
            key={t}
            kind="list-row"
            title={t}
            state={blockRowState('list', 'hover', i)}
          />
        ))}
      </div>
    )
    const rows = Array.from(card.querySelectorAll<HTMLElement>('[data-kind="list-row"]'))
    expect(rows).toHaveLength(3)
    const hovered = rows.filter((r) => r.dataset.state === 'hover')
    expect(hovered).toHaveLength(1)
    expect(rows.indexOf(hovered[0])).toBe(POND_BLOCK_HOVER_ROW.list)
    // The card itself is unchanged — the wash is the row's, not the frame's.
    expect(classes(card)).not.toContain('opacity-40')
    expect(card.hasAttribute('inert')).toBe(false)
  })
})

describe('selected — a 2px full-ink ring PLUS the card shadow', () => {
  it.each(POND_BLOCK_KINDS)(
    '%s carries ring-2 ring-mn-text and shadow-mn-card together',
    (kind) => {
      const cls = classes(renderCard(kind, 'selected'))
      for (const r of RING) expect(cls).toContain(r)
      expect(cls).toContain(CARD_SHADOW)
      expect(cls).not.toContain('ring-inset')
    }
  )

  it('gallery puts record-card 1 in selected; every other kind leaves rows at rest', () => {
    expect([0, 1, 2].map((i) => blockRowState('gallery', 'selected', i))).toEqual([
      'rest',
      'selected',
      'rest',
    ])
    for (const kind of POND_BLOCK_KINDS.filter((k) => k !== 'gallery')) {
      expect([0, 1, 2].map((i) => blockRowState(kind, 'selected', i))).toEqual([
        'rest',
        'rest',
        'rest',
      ])
    }
  })
})

describe('loading — the static three-bar skeleton', () => {
  it('the per-kind bar sets are the board’s', () => {
    const ten = [
      ['w-[82%]', 'h-[10px]'],
      ['w-[64%]', 'h-[10px]'],
      ['w-[74%]', 'h-[10px]'],
    ]
    expect(POND_BLOCK_SKELETON).toEqual({
      list: ten,
      checklist: ten,
      table: ten,
      log: ten,
      properties: ten,
      number: [
        ['w-[60%]', 'h-[52px]'],
        ['w-[40%]', 'h-[10px]'],
      ],
      gallery: [
        ['w-full', 'h-[120px]'],
        ['w-[50%]', 'h-[10px]'],
      ],
    })
  })

  it('the row gap is 0 for table and 2 for every other kind', () => {
    for (const kind of POND_BLOCK_KINDS) {
      expect(POND_BLOCK_ROW_GAP[kind]).toBe(kind === 'table' ? 'gap-0' : 'gap-[2px]')
    }
  })

  it.each(POND_BLOCK_KINDS)(
    '%s replaces the body with its bars and the note with loading…',
    (kind) => {
      const card = renderCard(kind, 'loading')
      expect(screen.queryByTestId('body')).toBeNull()
      expect(screen.getByText('loading…')).toBeInTheDocument()
      expect(screen.queryByText('1 of 3')).toBeNull()
      // The card is the region being updated; the skeleton's children are all hidden.
      expect(card.getAttribute('aria-busy')).toBe('true')

      const stack = card.querySelector('[data-part="skeleton"]') as HTMLElement
      expect(stack).not.toBeNull()
      expect(stack.hasAttribute('aria-busy')).toBe(false)
      const stackCls = classes(stack)
      expect(stackCls).toContain('flex')
      expect(stackCls).toContain('flex-col')
      expect(stackCls).toContain(POND_BLOCK_ROW_GAP[kind])

      const bars = Array.from(stack.children) as HTMLElement[]
      const spec = POND_BLOCK_SKELETON[kind]
      expect(bars).toHaveLength(spec.length)
      bars.forEach((bar, i) => {
        const cls = classes(bar)
        expect(cls).toContain('block')
        expect(cls).toContain('rounded-[5px]')
        expect(cls).toContain('bg-mn-text/[0.08]')
        expect(cls).toContain(spec[i][0])
        expect(cls).toContain(spec[i][1])
        // Static: the board draws no sweep, pulse or shimmer.
        expect(cls.some((c) => /animate|pulse|shimmer/.test(c))).toBe(false)
      })
    }
  )

  it('the loading card keeps the card shadow and no ring', () => {
    const cls = classes(renderCard('list', 'loading'))
    expect(cls).toContain(CARD_SHADOW)
    for (const r of RING) expect(cls).not.toContain(r)
  })
})

describe('error — the existing notice molecule, reconnect, exact copy', () => {
  it('the copy per kind is the board’s, curly apostrophes included', () => {
    const sheet = 'pond can’t reach this sheet any more · showing the last copy'
    const block = 'this block couldn’t load'
    // Exhaustive: a new kind without a line is a compile error, not a silent default.
    expect(POND_BLOCK_ERROR_LINE).toEqual({
      list: block,
      checklist: block,
      table: sheet,
      gallery: sheet,
      number: sheet,
      log: block,
      properties: block,
    })
    for (const kind of POND_BLOCK_KINDS) {
      expect(blockErrorLine(kind)).toBe(POND_BLOCK_ERROR_LINE[kind])
    }
    expect(sheet).toContain('’')
    expect(block).toContain('’')
  })

  it.each(POND_BLOCK_KINDS)(
    '%s replaces the body with the notice and keeps its own headNote',
    (kind) => {
      const card = renderCard(kind, 'error')
      expect(screen.queryByTestId('body')).toBeNull()
      const notice = card.querySelector('[data-kind="notice"]') as HTMLElement
      expect(notice).not.toBeNull()
      expect(notice.querySelector('[data-part="title"]')!.textContent).toBe(blockErrorLine(kind))
      expect(notice.querySelector('[data-part="action"]')!.textContent).toBe('reconnect')
      // The head row stays with the kind's normal note, not `loading…`.
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
      expect(screen.queryByText('loading…')).toBeNull()
      // There is exactly one notice and it is PondMolecule's — not a second component.
      expect(card.querySelectorAll('[data-kind="notice"]')).toHaveLength(1)
    }
  )
})

describe('disabled — opacity .4, and the card is inert', () => {
  it('adds opacity-40 and inert; shadow and paper stay, no ring, no aria-disabled', () => {
    const card = renderCard('list', 'disabled')
    const cls = classes(card)
    expect(cls).toContain('opacity-40')
    expect(cls).toContain(CARD_SHADOW)
    expect(cls).toContain('bg-mn-card')
    for (const r of RING) expect(cls).not.toContain(r)
    // The body still renders (the board draws it at .4) — it just can't be reached.
    expect(screen.getByTestId('body')).toBeInTheDocument()
    expect(card.hasAttribute('inert')).toBe(true)
    // A generic div has no widget role for AT to read aria-disabled from.
    expect(card.getAttribute('aria-disabled')).toBeNull()
  })

  it.each(POND_BLOCK_STATES.filter((s) => s !== 'disabled'))(
    '%s: the card is NOT inert and has no opacity',
    (state) => {
      const card = renderCard('list', state)
      expect(card.hasAttribute('inert')).toBe(false)
      expect(classes(card)).not.toContain('opacity-40')
    }
  )
})
