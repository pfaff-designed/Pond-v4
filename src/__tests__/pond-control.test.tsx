/**
 * PondControl (#221) — the five control kinds (button · field · toggle · checkbox ·
 * menu) built on the base-ui primitives and tinted to `PondControl.dc.html`. Every
 * value below is a literal from `wayfinder/board-values.generated.json`
 * (`.components.PondControl`), which is that board's own `renderVals()` output.
 *
 * jsdom cannot compute Tailwind, so these tests defend STRUCTURE and CLASS
 * COMPOSITION — the role tree the primitives give us, the eight-state table as one
 * shared map, the board's literals as classes, the focus ring's single owner, and
 * the two call sites that gave up their bare `<input type="checkbox">`. The
 * measured geometry and colours are asserted off real computed styles in
 * `PondControl.stories.tsx`.
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  PondControl,
  POND_CONTROL_KINDS,
  POND_CONTROL_STATES,
  POND_CONTROL_VARIANTS,
  type PondControlKind,
  type PondControlState,
} from '@/components/atoms/PondControl'
import { FOCUS_RING, FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
const classes = (el: Element) => el.className.split(/\s+/)

function root(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-kind]')
  if (!el) throw new Error('PondControl rendered no [data-kind] root')
  return el
}

// ── The axes ───────────────────────────────────────────────────────────────────

describe('PondControl — the board’s axes', () => {
  it('exposes exactly five kinds, four variants and eight states', () => {
    expect(POND_CONTROL_KINDS).toEqual(['button', 'field', 'toggle', 'checkbox', 'menu'])
    expect(POND_CONTROL_VARIANTS).toEqual(['primary', 'secondary', 'ghost', 'quiet'])
    expect(POND_CONTROL_STATES).toEqual([
      'rest',
      'hover',
      'focus',
      'selected',
      'editing',
      'disabled',
      'loading',
      'error',
    ])
  })

  const cells = POND_CONTROL_KINDS.flatMap((kind) =>
    POND_CONTROL_STATES.map((state) => [kind, state] as [PondControlKind, PondControlState])
  )

  it.each(cells)('kind=%s state=%s mounts on desktop and mobile', (kind, state) => {
    for (const size of ['desktop', 'mobile'] as const) {
      const { container, unmount } = render(<PondControl kind={kind} state={state} size={size} />)
      const el = root(container)
      expect(el.dataset.kind).toBe(kind)
      expect(el.dataset.state).toBe(state)
      unmount()
    }
  })
})

// ── button ─────────────────────────────────────────────────────────────────────

describe('kind=button — the shadcn Button under the board’s skin', () => {
  it('is the ui Button primitive at the board’s desktop geometry: h32 · px14 · 12px · 500 · pill · gap 6', () => {
    render(<PondControl kind="button" />)
    const b = screen.getByRole('button', { name: 'keep page' })
    expect(b.dataset.slot).toBe('button')
    for (const c of ['h-8', 'px-3.5', 'text-[12px]', 'font-medium', 'rounded-mn-pill', 'gap-1.5']) {
      expect(classes(b)).toContain(c)
    }
    expect(b.className).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b/)
  })

  it('mobile is the board’s h44 · px20 · 14px — the 44px touch minimum (AUDIT X1)', () => {
    render(<PondControl kind="button" size="mobile" />)
    const b = screen.getByRole('button')
    for (const c of ['h-11', 'px-5', 'text-[14px]']) expect(classes(b)).toContain(c)
  })

  it('primary: full ink on paper; hover is opacity .9, not a colour change', () => {
    const { container, rerender } = render(<PondControl kind="button" variant="primary" />)
    const b = root(container)
    expect(classes(b)).toContain('bg-mn-text')
    expect(b.className).toContain('text-raw-paper')
    expect(b.className).toContain('hover:opacity-90')
    rerender(<PondControl kind="button" variant="primary" state="hover" />)
    expect(classes(root(container))).toContain('opacity-90')
  })

  it('secondary: ink .07 ground, ink .8 label, hover/selected .12 — literals, not --secondary', () => {
    const { container, rerender } = render(<PondControl kind="button" variant="secondary" />)
    let b = root(container)
    expect(classes(b)).toContain('bg-mn-text/[0.07]')
    expect(classes(b)).toContain('text-mn-text/80')
    expect(b.className).toContain('hover:bg-mn-text/[0.12]')
    expect(b.className).not.toMatch(/\bbg-secondary\b|secondary-foreground/)
    rerender(<PondControl kind="button" variant="secondary" state="selected" />)
    b = root(container)
    expect(classes(b)).toContain('bg-mn-text/[0.12]')
  })

  it('ghost: transparent + inset 1px ink .2 (NOT --mn-hair); quiet: inset 1px ink .4', () => {
    const { container, rerender } = render(<PondControl kind="button" variant="ghost" />)
    let b = root(container)
    for (const c of ['ring-1', 'ring-inset', 'ring-mn-text/20', 'text-mn-text']) {
      expect(classes(b)).toContain(c)
    }
    expect(b.className).not.toContain('mn-hair')
    rerender(<PondControl kind="button" variant="quiet" />)
    b = root(container)
    for (const c of ['ring-1', 'ring-inset', 'ring-mn-text/40']) expect(classes(b)).toContain(c)
  })

  it('focus wears the mist ring from its one owner; disabled is opacity .4 + inert; loading is a copy swap', () => {
    const { container, rerender } = render(<PondControl kind="button" state="focus" />)
    for (const c of FOCUS_RING.split(' ')) expect(classes(root(container))).toContain(c)

    rerender(<PondControl kind="button" state="disabled" />)
    const b = screen.getByRole('button')
    expect(b).toBeDisabled()
    expect(b.className).toContain('disabled:opacity-40')
    expect(b.className).toContain('disabled:pointer-events-none')

    rerender(<PondControl kind="button" state="loading" />)
    expect(screen.getByRole('button')).toHaveTextContent('saving…')
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('[class*="animate-"]')).toBeNull()
  })

  it('keeps the primitive’s press semantics and menu wiring: onClick fires, aria-haspopup/expanded pass through', () => {
    const onClick = jest.fn()
    render(
      <PondControl
        kind="button"
        label="move it"
        onClick={onClick}
        aria-haspopup="menu"
        aria-expanded
      />
    )
    const b = screen.getByRole('button', { name: 'move it' })
    fireEvent.click(b)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(b).toHaveAttribute('aria-haspopup', 'menu')
    expect(b).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('ui/button.tsx — reconciled with PondControl.dc.html', () => {
  it('its variant axis is the board’s four and nothing else', () => {
    const source = read('src/components/ui/button.tsx')
    for (const gone of ['destructive', 'outline', 'link', 'default:']) {
      expect(source).not.toMatch(new RegExp(`^\\s*${gone.replace(':', '')}:`, 'm'))
    }
    expect(source).toMatch(/^\s*primary:/m)
    expect(source).toMatch(/^\s*quiet:/m)
    expect(buttonVariants()).toBe(buttonVariants({ variant: 'primary', size: 'desktop' }))
  })

  it('12px (not text-sm), disabled .4 (not .5), the mist focus ring (not ring-ring ink)', () => {
    const base = buttonVariants()
    expect(base).toContain('text-[12px]')
    expect(base).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b/)
    expect(base).toContain('disabled:opacity-40')
    expect(base).not.toContain('disabled:opacity-50')
    for (const c of FOCUS_VISIBLE_RING.split(' ')) expect(base).toContain(c)
    expect(base).not.toMatch(/ring-ring|border-ring|focus-visible:ring-3/)
  })

  it('the size axis keeps sm/xs for the composer’s diff actions and the dialogs (#230), adds mobile, drops lg/icon', () => {
    const source = read('src/components/ui/button.tsx')
    expect(source).toMatch(/^\s*sm:/m)
    expect(source).toMatch(/^\s*xs:/m)
    expect(source).toMatch(/^\s*mobile:/m)
    expect(source).not.toMatch(/^\s*lg:/m)
    expect(source).not.toMatch(/^\s*icon(-xs|-sm|-lg)?:/m)
    expect(source).toMatch(/230/)
    expect(buttonVariants({ size: 'mobile' })).toMatch(/\bh-11\b.*\bpx-5\b.*\btext-\[14px\]/)
  })

  it('cn() keeps both the size and the colour of every variant (#252 regression guard)', () => {
    for (const variant of POND_CONTROL_VARIANTS) {
      const merged = cn(buttonVariants({ variant }))
      expect(merged).toContain('text-[12px]')
      expect(merged).toMatch(/text-mn-text(\/80)?\b|text-raw-paper/)
    }
  })
})

// ── field ──────────────────────────────────────────────────────────────────────

describe('kind=field — base-ui Field + Input in the board’s card', () => {
  it('a real textbox with the board’s placeholder, in a 240×38 radius-14 card at 13.5px', () => {
    const { container } = render(<PondControl kind="field" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('placeholder', 'email')
    expect(input.className).toContain('placeholder:text-mn-text-secondary')
    const box = container.querySelector<HTMLElement>('[data-part="field"]')!
    for (const c of [
      'w-[240px]',
      'h-[38px]',
      'px-[14px]',
      'rounded-mn-inner',
      'bg-mn-card',
      'shadow-mn-card',
      'text-[13.5px]',
      'gap-0.5',
    ]) {
      expect(classes(box)).toContain(c)
    }
    expect(container.querySelector('[data-part="caret"]')).toBeNull()
    expect(container.querySelector('[data-part="hint"]')).toBeNull()
  })

  it('mobile is 280×48 at 15px', () => {
    const { container } = render(<PondControl kind="field" size="mobile" />)
    const box = container.querySelector<HTMLElement>('[data-part="field"]')!
    for (const c of ['w-[280px]', 'h-[48px]', 'text-[15px]']) expect(classes(box)).toContain(c)
  })

  it('editing shows the fixture value in full ink with the caret; focus shows the caret too', () => {
    const { container, unmount } = render(<PondControl kind="field" state="editing" />)
    expect(screen.getByRole('textbox')).toHaveValue('hi@make-noise')
    const caret = container.querySelector<HTMLElement>('[data-part="caret"]')!
    for (const c of ['w-[1.5px]', 'h-[15px]', 'bg-mn-text']) expect(classes(caret)).toContain(c)
    unmount()
    const focused = render(<PondControl kind="field" state="focus" />).container
    expect(focused.querySelector('[data-part="caret"]')).not.toBeNull()
    for (const c of FOCUS_RING.split(' ')) {
      expect(classes(focused.querySelector('[data-part="field"]')!)).toContain(c)
    }
  })

  it('loading is a copy swap (`checking…`), no spinner; disabled disables the input and dims the card', () => {
    const { container, rerender } = render(<PondControl kind="field" state="loading" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'checking…')
    expect(container.querySelector('[class*="animate-"]')).toBeNull()
    rerender(<PondControl kind="field" state="disabled" />)
    expect(screen.getByRole('textbox')).toBeDisabled()
    const box = container.querySelector<HTMLElement>('[data-part="field"]')!
    expect(classes(box)).toContain('opacity-40')
    expect(classes(box)).toContain('pointer-events-none')
  })

  it('error composes the 1.4px ink inset BEFORE the card shadow and shows the mono 10.5 hint at ink .8', () => {
    const { container } = render(<PondControl kind="field" state="error" />)
    const box = container.querySelector<HTMLElement>('[data-part="field"]')!
    expect(classes(box)).toContain(
      'shadow-[inset_0_0_0_1.4px_var(--mn-text),var(--mn-shadow-card)]'
    )
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    const hint = container.querySelector<HTMLElement>('[data-part="hint"]')!
    expect(hint).toHaveTextContent('that isn’t an email address')
    for (const c of ['font-mono', 'text-[10.5px]', 'text-mn-text-meta', 'pl-1']) {
      expect(classes(hint)).toContain(c)
    }
  })

  it('is a live control: value + onValueChange, and a hint renders without error', () => {
    const onValueChange = jest.fn()
    const { container } = render(
      <PondControl kind="field" value="hi" hint="we’ll send a code" onValueChange={onValueChange} />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hi@' } })
    expect(onValueChange).toHaveBeenCalledWith('hi@', expect.anything())
    expect(container.querySelector('[data-part="hint"]')).toHaveTextContent('we’ll send a code')
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid', 'true')
  })
})

// ── toggle ─────────────────────────────────────────────────────────────────────

describe('kind=toggle — base-ui Switch in the board’s row', () => {
  it('is a role=switch with a 30×18 track at ink .2 and a 14px card knob at 2/2, in a gap-10 sans row', () => {
    const { container } = render(<PondControl kind="toggle" />)
    const sw = screen.getByRole('switch')
    expect(sw).toHaveAttribute('aria-checked', 'false')
    for (const c of [
      'w-[30px]',
      'h-[18px]',
      'rounded-mn-pill',
      'bg-mn-text/20',
      'relative',
      'flex-none',
    ]) {
      expect(classes(sw)).toContain(c)
    }
    expect(sw.className).toContain('data-[checked]:bg-mn-text')
    const knob = container.querySelector<HTMLElement>('[data-part="knob"]')!
    for (const c of [
      'absolute',
      'top-0.5',
      'left-0.5',
      'size-3.5',
      'rounded-mn-pill',
      'bg-mn-card',
    ]) {
      expect(classes(knob)).toContain(c)
    }
    expect(knob.className).toContain('data-[checked]:left-3.5')
    const row = root(container)
    expect(row.tagName).toBe('LABEL')
    for (const c of [
      'inline-flex',
      'items-center',
      'gap-2.5',
      'font-sans',
      'text-[13.5px]',
      'text-mn-text',
      'min-h-6',
    ]) {
      expect(classes(row)).toContain(c)
    }
    expect(row).toHaveTextContent('keep page')
  })

  it('mobile: 38×22 track, 18px knob, row min-height 44 at 15px', () => {
    const { container } = render(<PondControl kind="toggle" size="mobile" />)
    const sw = screen.getByRole('switch')
    for (const c of ['w-[38px]', 'h-[22px]']) expect(classes(sw)).toContain(c)
    const knob = container.querySelector<HTMLElement>('[data-part="knob"]')!
    expect(classes(knob)).toContain('size-[18px]')
    expect(knob.className).toContain('data-[checked]:left-[18px]')
    for (const c of ['min-h-11', 'text-[15px]']) expect(classes(root(container))).toContain(c)
  })

  it('selected (or on) is checked; hover deepens the track to .28; disabled dims the row and is inert', () => {
    const { rerender, unmount } = render(<PondControl kind="toggle" state="selected" />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    rerender(<PondControl kind="toggle" on />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    unmount()
    const { container, rerender: again } = render(<PondControl kind="toggle" state="hover" />)
    expect(classes(screen.getByRole('switch'))).toContain('bg-mn-text/[0.28]')
    again(<PondControl kind="toggle" state="focus" />)
    for (const c of FOCUS_RING.split(' ')) expect(classes(screen.getByRole('switch'))).toContain(c)
    const onCheckedChange = jest.fn()
    again(<PondControl kind="toggle" state="disabled" onCheckedChange={onCheckedChange} />)
    expect(classes(root(container))).toContain('opacity-40')
    expect(classes(root(container))).toContain('pointer-events-none')
    fireEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('toggles exactly once per click, on the switch or on its label text', () => {
    const onCheckedChange = jest.fn()
    render(<PondControl kind="toggle" label="zen" onCheckedChange={onCheckedChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange.mock.calls[0][0]).toBe(true)
    fireEvent.click(screen.getByText('zen'))
    expect(onCheckedChange).toHaveBeenCalledTimes(2)
    expect(onCheckedChange.mock.calls[1][0]).toBe(false)
  })
})

// ── checkbox ───────────────────────────────────────────────────────────────────

describe('kind=checkbox — base-ui Checkbox in the board’s row (14 / radius 4 / inset .68)', () => {
  it('is a role=checkbox; the box is 14px, radius 4, 1.4px inset at ink .68, transparent, tick in paper', () => {
    const { container } = render(<PondControl kind="checkbox" />)
    const cb = screen.getByRole('checkbox')
    expect(cb).toHaveAttribute('aria-checked', 'false')
    for (const c of [
      'size-3.5',
      'rounded-[4px]',
      'ring-[1.4px]',
      'ring-inset',
      'ring-mn-text-secondary',
      'bg-transparent',
      'text-raw-paper',
      'flex-none',
    ]) {
      expect(classes(cb)).toContain(c)
    }
    expect(container.querySelector('svg')).toBeNull()
    expect(root(container).tagName).toBe('LABEL')
  })

  it('mobile is a 20px box', () => {
    render(<PondControl kind="checkbox" size="mobile" />)
    expect(classes(screen.getByRole('checkbox'))).toContain('size-5')
  })

  it('selected/on fills full ink with no inset and draws the 9×9 tick; hover washes .07', () => {
    const { container, unmount } = render(<PondControl kind="checkbox" state="selected" />)
    const cb = screen.getByRole('checkbox')
    expect(cb).toHaveAttribute('aria-checked', 'true')
    expect(cb.className).toContain('data-[checked]:bg-mn-text')
    expect(cb.className).toContain('data-[checked]:ring-0')
    const tick = container.querySelector('svg')!
    expect(tick).toHaveAttribute('width', '9')
    expect(tick).toHaveAttribute('stroke-width', '1.4')
    unmount()
    render(<PondControl kind="checkbox" state="hover" />)
    expect(classes(screen.getByRole('checkbox'))).toContain('bg-mn-text/[0.07]')
  })

  it('is live: onCheckedChange with the next value, once per click; aria-label reaches the control', () => {
    const onCheckedChange = jest.fn()
    render(
      <PondControl kind="checkbox" aria-label="Done value" onCheckedChange={onCheckedChange} />
    )
    const cb = screen.getByLabelText('Done value')
    expect(cb).toHaveAttribute('role', 'checkbox')
    fireEvent.click(cb)
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange.mock.calls[0][0]).toBe(true)
  })
})

// ── menu ───────────────────────────────────────────────────────────────────────

describe('kind=menu — the mono row a Menu.Item renders into', () => {
  it('is a 320-wide min-h-30 radius-10 mono 12px row: label · .68 hint at 10.5 · .8 enter at 10', () => {
    const { container } = render(<PondControl kind="menu" label="open page" hint="page" on />)
    const row = root(container)
    expect(row).toHaveAttribute('role', 'menuitem')
    for (const c of [
      'flex',
      'items-center',
      'gap-2.5',
      'w-[320px]',
      'min-h-[30px]',
      'px-2.5',
      'rounded-mn-row',
      'font-mono',
      'text-[12px]',
      'text-mn-text',
      'bg-transparent',
    ]) {
      expect(classes(row)).toContain(c)
    }
    expect(row.className).toContain('data-[highlighted]:bg-mn-text/5')
    const label = row.querySelector<HTMLElement>('[data-part="label"]')!
    expect(label).toHaveTextContent('open page')
    for (const c of ['flex-1', 'min-w-0', 'truncate']) expect(classes(label)).toContain(c)
    const hint = row.querySelector<HTMLElement>('[data-part="hint"]')!
    for (const c of ['text-[10.5px]', 'text-mn-text-secondary', 'whitespace-nowrap']) {
      expect(classes(hint)).toContain(c)
    }
    const enter = row.querySelector<HTMLElement>('[data-part="enter"]')!
    expect(enter).toHaveTextContent('↵')
    for (const c of ['text-[10px]', 'text-mn-text-meta']) expect(classes(enter)).toContain(c)
  })

  it('draws no hint and no enter glyph unless given; mobile is min-h-44 at 14px', () => {
    const { container, rerender } = render(<PondControl kind="menu" />)
    expect(container.querySelector('[data-part="hint"]')).toBeNull()
    expect(container.querySelector('[data-part="enter"]')).toBeNull()
    rerender(<PondControl kind="menu" size="mobile" />)
    for (const c of ['min-h-11', 'text-[14px]']) expect(classes(root(container))).toContain(c)
  })

  it('hover .05 · selected .07 (+ the enter glyph) · focus ring · disabled dims', () => {
    const { container, rerender } = render(<PondControl kind="menu" state="hover" />)
    expect(classes(root(container))).toContain('bg-mn-text/5')
    rerender(<PondControl kind="menu" state="selected" />)
    expect(classes(root(container))).toContain('bg-mn-text/[0.07]')
    expect(container.querySelector('[data-part="enter"]')).not.toBeNull()
    rerender(<PondControl kind="menu" state="focus" />)
    for (const c of FOCUS_RING.split(' ')) expect(classes(root(container))).toContain(c)
    rerender(<PondControl kind="menu" state="disabled" />)
    expect(classes(root(container))).toContain('opacity-40')
    expect(classes(root(container))).toContain('pointer-events-none')
  })

  it('forwards the host’s props so a base-ui Menu.Item can render into it', () => {
    const onClick = jest.fn()
    const { container } = render(
      <PondControl kind="menu" role="option" tabIndex={0} data-highlighted="" onClick={onClick} />
    )
    const row = root(container)
    expect(row).toHaveAttribute('role', 'option')
    expect(row).toHaveAttribute('tabindex', '0')
    expect(row).toHaveAttribute('data-highlighted')
    fireEvent.click(row)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

// ── Shared law ─────────────────────────────────────────────────────────────────

describe('one owner for the focus ring; one shared state table; no named type sizes', () => {
  it('FOCUS_RING is declared once, in atoms/focus-ring.ts, and imported by PondAtom, PondMolecule, PondControl and button', () => {
    expect(FOCUS_RING).toBe('outline-2 outline-offset-2 outline-mn-area-b')
    for (const file of [
      'src/components/atoms/PondAtom.tsx',
      'src/components/molecules/PondMolecule.tsx',
      'src/components/atoms/PondControl.tsx',
      'src/components/ui/button.tsx',
    ]) {
      const source = read(file)
      expect(source).not.toMatch(/const FOCUS_RING\s*=/)
      expect(source).toMatch(/from '@\/components\/atoms\/focus-ring'/)
    }
  })

  it('the eight states are ONE exhaustive map in PondControl, not per-kind recipes', () => {
    const source = read('src/components/atoms/PondControl.tsx')
    expect(source).toMatch(/Record<PondControlState,/)
    expect(source).toMatch(/Record<PondControlKind,/)
  })

  it('neither PondControl nor button uses a Tailwind named type size', () => {
    for (const file of ['src/components/atoms/PondControl.tsx', 'src/components/ui/button.tsx']) {
      expect(read(file)).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b/)
    }
  })
})

// ── The call sites ─────────────────────────────────────────────────────────────

describe('the two bare <input type="checkbox"> sites take PondControl kind="checkbox"', () => {
  it('PropertyInspector’s checkbox property is the control, labelled, and raises a boolean', () => {
    const onChange = jest.fn()
    const { container } = render(
      <PropertyInspector
        schema={[{ id: 'done', name: 'Done', type: 'checkbox' }]}
        values={{ done: false }}
        onChange={onChange}
      />
    )
    expect(container.querySelector('input[type="checkbox"]:not([aria-hidden])')).toBeNull()
    const cb = screen.getByLabelText('Done value')
    expect(cb).toHaveAttribute('role', 'checkbox')
    expect(cb.closest('[data-kind="checkbox"]')).not.toBeNull()
    fireEvent.click(cb)
    expect(onChange).toHaveBeenCalledWith('done', true)
  })

  it('PropertyInspector read-only: the control is disabled and emits nothing', () => {
    const onChange = jest.fn()
    render(
      <PropertyInspector
        schema={[{ id: 'done', name: 'Done', type: 'checkbox' }]}
        values={{ done: true }}
        onChange={onChange}
        editable={false}
      />
    )
    const cb = screen.getByLabelText('Done value')
    expect(cb).toHaveAttribute('aria-checked', 'true')
    expect(cb).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(cb)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('no production source keeps a bare checkbox input; each surviving checkbox names its board', () => {
    expect(read('src/components/molecules/PropertyInspector.tsx')).not.toMatch(/type="checkbox"/)
    expect(read('src/lib/modules/view/view.tsx')).not.toMatch(/type="checkbox"/)
    // Three boards, three checkboxes — unreconciled, each commented with its owner.
    expect(read('src/components/atoms/PondControl.tsx')).toMatch(/PondControl\.dc\.html/)
    expect(read('src/components/atoms/PondAtom.tsx')).toMatch(
      /PondAtom\.dc\.html[^\n]*checkbox|checkbox[^\n]*PondAtom\.dc\.html/
    )
  })
})
