/**
 * PondBlock 4/4 (#240) — the `deleted` tombstone, the eighth and last state.
 * Measured off `PondBlock.dc.html`'s `renderVals()` (`tombed = state === 'deleted'`):
 *
 *   W           tombed ? 460 : per-kind       — the ONE state that overrides the width
 *   block       background transparent · boxShadow `inset 0 0 0 1.4px a(.2)` — a SOLID
 *               inset hairline ring, no card paper, no card shadow, NOT dashed
 *   H           [H0[0], 'database deleted']   — the kind's heading survives; the note goes
 *   tomb        flex · column · gap 12
 *   tombText    mono · 11 · line-height 1.55 · a(.8)   — the META tier, not the .68 note
 *   tombLine    `This view showed ${H0[0]}, which was deleted on 22 sep. It can be
 *               restored for 30 days.`         — a real sentence; date + window are fixtures
 *   tombActions flex · gap 8 · `restore` (secondary) · `remove block` (ghost) at auto,32
 *   special     tombed || gallery || number → showRows false; gallery / number / skeleton /
 *               notice / empty all suppressed
 *
 * The class recipe is asserted here (jsdom has no layout); computed values live in
 * `PondBlock.stories.tsx`. Presentation only: no `deleted_at` exists in the schema
 * (that is #199), so the date and window ride props with the board's defaults, and
 * both actions are callbacks a host wires. Nothing in the product can set this
 * state yet — BlockCanvas is deliberately untouched.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import {
  PondBlock,
  POND_BLOCK_KINDS,
  POND_BLOCK_WIDTHS,
  POND_BLOCK_STATES,
  POND_BLOCK_TOMB_WIDTH,
  POND_BLOCK_TOMB_NOTE,
  POND_BLOCK_TOMB_FIXTURE,
  blockTombLine,
} from '@/components/organisms/PondBlock'

const classes = (el: Element) => el.className.split(' ')

function renderTomb(kind: (typeof POND_BLOCK_KINDS)[number] = 'list', extra = {}) {
  const onRestore = jest.fn()
  const onRemoveBlock = jest.fn()
  const result = render(
    <PondBlock
      kind={kind}
      heading="notifications"
      headNote="3"
      state="deleted"
      onRestore={onRestore}
      onRemoveBlock={onRemoveBlock}
      {...extra}
    >
      <p data-testid="live-body">the view</p>
    </PondBlock>
  )
  const card = result.container.firstElementChild as HTMLElement
  return { ...result, card, onRestore, onRemoveBlock }
}

// ── The pure data ───────────────────────────────────────────────────────────────

describe('block-frame — the tombstone’s data', () => {
  it('`deleted` is the board’s seventh state, between error and disabled', () => {
    expect(POND_BLOCK_STATES.indexOf('deleted')).toBe(6)
  })

  it('the tombstone width is 460 — and it is a single width, not a per-kind map', () => {
    expect(POND_BLOCK_TOMB_WIDTH).toBe(460)
    // Only `log` happens to share it; every other kind is overridden.
    expect(Object.values(POND_BLOCK_WIDTHS).filter((w) => w !== 460).length).toBeGreaterThan(0)
  })

  it('the head note is the board’s literal', () => {
    expect(POND_BLOCK_TOMB_NOTE).toBe('database deleted')
  })

  it('the line is the board’s sentence, with its fixtures as the defaults', () => {
    expect(POND_BLOCK_TOMB_FIXTURE).toEqual({ deletedOn: '22 sep', restoreWindow: '30 days' })
    expect(blockTombLine('notifications')).toBe(
      'This view showed notifications, which was deleted on 22 sep. It can be restored for 30 days.'
    )
    expect(blockTombLine('calories')).toBe(
      'This view showed calories, which was deleted on 22 sep. It can be restored for 30 days.'
    )
  })

  it('the line takes a real date and window when a host has them (#199)', () => {
    expect(blockTombLine('kitchen costs', '24 sep', '29 days')).toBe(
      'This view showed kitchen costs, which was deleted on 24 sep. It can be restored for 29 days.'
    )
  })
})

// ── The frame recipe ────────────────────────────────────────────────────────────

describe('PondBlock — the deleted tombstone is not a card', () => {
  it.each(POND_BLOCK_KINDS)('%s renders at 460, overriding its own width', (kind) => {
    const { card } = renderTomb(kind)
    expect(card.dataset.blockState).toBe('deleted')
    expect(card.dataset.blockKind).toBe(kind)
    const cls = classes(card)
    expect(cls).toContain('w-[460px]')
    if (POND_BLOCK_WIDTHS[kind] !== 460)
      expect(cls).not.toContain(`w-[${POND_BLOCK_WIDTHS[kind]}px]`)
    expect(cls).toContain('max-w-full')
  })

  it('transparent ground, a SOLID 1.4px inset hairline ring, no card paper and no card shadow', () => {
    const { card } = renderTomb()
    const cls = classes(card)
    expect(cls).toContain('bg-transparent')
    expect(cls).not.toContain('bg-mn-card')
    expect(cls).not.toContain('shadow-mn-card')
    // The ring is the same hairline PondMolecule’s empty record-card wears.
    expect(cls).toContain('ring-[1.4px]')
    expect(cls).toContain('ring-inset')
    expect(cls).toContain('ring-mn-text/20')
    // Not the selected ring, and never a dashed border.
    expect(cls).not.toContain('ring-2')
    expect(cls).not.toContain('ring-mn-text')
    expect(cls.some((c) => /dashed/.test(c))).toBe(false)
    expect(cls.some((c) => /^border/.test(c))).toBe(false)
  })

  it('keeps the frame’s own geometry: radius 20 · padding 16/18 · gap 12 · sans · full ink', () => {
    const { card } = renderTomb()
    const cls = classes(card)
    for (const c of [
      'rounded-mn-card',
      'px-[18px]',
      'py-mn-4',
      'gap-mn-3',
      'flex',
      'flex-col',
      'font-sans',
      'text-mn-text',
    ]) {
      expect(cls).toContain(c)
    }
  })

  it('is live: not inert, not busy, not faded', () => {
    const { card } = renderTomb()
    expect(card.hasAttribute('inert')).toBe(false)
    expect(card.hasAttribute('aria-busy')).toBe(false)
    expect(classes(card)).not.toContain('opacity-40')
  })
})

// ── The head row ────────────────────────────────────────────────────────────────

describe('PondBlock — the tombstone’s head', () => {
  it('keeps the kind’s heading and replaces the note with `database deleted`', () => {
    const { card } = renderTomb()
    const head = card.firstElementChild as HTMLElement
    const [eyebrow, note] = Array.from(head.children) as HTMLElement[]
    expect(eyebrow.textContent).toBe('notifications')
    expect(eyebrow.className).toBe(pageEyebrowClass)
    expect(note.textContent).toBe(POND_BLOCK_TOMB_NOTE)
    expect(screen.queryByText('3')).toBeNull()
    // The note keeps its #237 recipe — mono 10.5 on the secondary tier.
    for (const c of ['font-mono', 'text-[10.5px]', 'text-mn-text-secondary']) {
      expect(classes(note)).toContain(c)
    }
  })
})

// ── The body ────────────────────────────────────────────────────────────────────

describe('PondBlock — the tombstone’s body', () => {
  it('suppresses the live view, the skeleton, the notice and the empty box', () => {
    const { card } = renderTomb()
    expect(screen.queryByTestId('live-body')).toBeNull()
    expect(card.querySelector('[data-part="skeleton"]')).toBeNull()
    expect(card.querySelector('[data-part="empty"]')).toBeNull()
    expect(card.querySelector('[data-kind="notice"]')).toBeNull()
    // Exactly head + tomb.
    expect(card.children).toHaveLength(2)
  })

  it('tomb: a column at gap 12 holding the line and the actions', () => {
    const { card } = renderTomb()
    const tomb = card.querySelector<HTMLElement>('[data-part="tomb"]')!
    expect(tomb).toBe(card.children[1])
    for (const c of ['flex', 'flex-col', 'gap-mn-3']) expect(classes(tomb)).toContain(c)
    expect(tomb.children).toHaveLength(2)
  })

  it('the line: mono · 11 · 1.55 · the META ink tier (.8), interpolating the kind’s heading', () => {
    const { card } = renderTomb()
    const line = card.querySelector<HTMLElement>('[data-part="tomb-line"]')!
    expect(line.textContent).toBe(blockTombLine('notifications'))
    // A real sentence, unlike the lowercase empty copy.
    expect(line.textContent!.startsWith('This view showed ')).toBe(true)
    expect(line.textContent!.endsWith('.')).toBe(true)
    const cls = classes(line)
    expect(cls).toContain('font-mono')
    expect(cls).toContain('text-mn-11')
    expect(cls).toContain('leading-[1.55]')
    expect(cls).toContain('text-mn-text-meta')
    expect(cls).not.toContain('text-mn-text-secondary')
  })

  it('the line names what was deleted, with the date and window from props (#199)', () => {
    const { card } = renderTomb('table', {
      heading: 'table',
      deletedName: 'kitchen costs',
      deletedOn: '24 sep',
      restoreWindow: '29 days',
    })
    const line = card.querySelector<HTMLElement>('[data-part="tomb-line"]')!
    expect(line.textContent).toBe(
      'This view showed kitchen costs, which was deleted on 24 sep. It can be restored for 29 days.'
    )
    // The eyebrow is still the view’s own heading — two inputs, as the board has them.
    expect((card.firstElementChild as HTMLElement).children[0].textContent).toBe('table')
  })
})

// ── The actions ─────────────────────────────────────────────────────────────────

describe('PondBlock — the tombstone’s two ways out', () => {
  it('`restore` is the secondary pill and `remove block` the ghost, in a row at gap 8', () => {
    const { card } = renderTomb()
    const actions = card.querySelector<HTMLElement>('[data-part="tomb-actions"]')!
    for (const c of ['flex', 'gap-mn-2']) expect(classes(actions)).toContain(c)
    const buttons = Array.from(actions.querySelectorAll('button'))
    expect(buttons.map((b) => b.textContent)).toEqual(['restore', 'remove block'])
    // The existing button primitive at its default size — the board’s auto × 32.
    for (const b of buttons) {
      expect(b.dataset.slot).toBe('button')
      expect(classes(b)).toContain('h-8')
      expect(classes(b)).toContain('rounded-mn-pill')
      expect(b.hasAttribute('disabled')).toBe(false)
    }
    // PondControl.dc.html's literals (#221): secondary = ink .07 ground, ghost = inset 1px ink .2.
    expect(classes(buttons[0])).toContain('bg-mn-text/[0.07]')
    expect(classes(buttons[1])).toContain('ring-mn-text/20')
    expect(classes(buttons[1])).not.toContain('bg-mn-text/[0.07]')
  })

  it('both are wired: each click reaches its own callback and nothing else', () => {
    const { onRestore, onRemoveBlock } = renderTomb()
    fireEvent.click(screen.getByRole('button', { name: 'restore' }))
    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(onRemoveBlock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'remove block' }))
    expect(onRemoveBlock).toHaveBeenCalledTimes(1)
    expect(onRestore).toHaveBeenCalledTimes(1)
  })

  // NB: this asserts only that an unwired action is not drawn. 7a's real
  // past-the-window frame also shortens the copy to a single line naming the
  // database and drops the "can be restored" promise — `blockTombLine` always
  // emits it, so that variant is unbuilt and is #199's (nothing can compute
  // "past the window" without `deleted_at`).
  it('an action is offered or it is not drawn — never a dead button', () => {
    const { container } = render(
      <PondBlock kind="list" heading="notifications" state="deleted" onRemoveBlock={() => {}}>
        <p>the view</p>
      </PondBlock>
    )
    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.map((b) => b.textContent)).toEqual(['remove block'])
  })
})

// ── Every other state is untouched ──────────────────────────────────────────────

describe('PondBlock — the tombstone recipe leaks into no other state', () => {
  it.each(POND_BLOCK_STATES.filter((s) => s !== 'deleted'))(
    '%s keeps its card and width',
    (state) => {
      const { container } = render(
        <PondBlock kind="table" heading="calories" headNote="rows only" state={state}>
          <p>the view</p>
        </PondBlock>
      )
      const card = container.firstElementChild as HTMLElement
      const cls = classes(card)
      expect(cls).toContain('w-[500px]')
      expect(cls).toContain('bg-mn-card')
      expect(cls).toContain('shadow-mn-card')
      expect(cls).not.toContain('ring-[1.4px]')
      expect(card.querySelector('[data-part="tomb"]')).toBeNull()
      expect(screen.queryByText(POND_BLOCK_TOMB_NOTE)).toBeNull()
    }
  )
})
