import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cn, MN_TEXT_SCALE } from '@/lib/utils'

/**
 * #252: `cn()` was bare `twMerge(clsx(...))`, and tailwind-merge cannot tell that
 * `text-mn-16` is a font size while `text-mn-text-secondary` is a colour — both
 * match its `text-*` pattern, so it dropped one, silently, by argument order.
 *
 * These tests pin BOTH halves of the fix. The second half matters as much as the
 * first: classifying `text-mn-*` as a font size re-arms tailwind-merge's stock
 * font-size-clobbers-leading rule, which would have broken every
 * `leading-* text-mn-*` pair that works today.
 */

const has = (out: string, ...classes: string[]) => {
  const parts = out.split(' ')
  return classes.every((c) => parts.includes(c))
}

describe('cn() — the #252 collision: a size and a colour must both survive', () => {
  it.each([
    ['text-mn-16', 'text-mn-text-secondary'],
    ['text-mn-11', 'text-mn-text-meta'],
    ['text-mn-13', 'text-mn-text-secondary'],
    ['text-mn-22', 'text-mn-text-secondary'],
    ['text-mn-46', 'text-mn-text'],
  ])('keeps %s with %s, in BOTH orders', (size, colour) => {
    expect(has(cn(size, colour), size, colour)).toBe(true)
    expect(has(cn(colour, size), size, colour)).toBe(true)
  })

  // The four live sites #252 measured. Each is the real class pair from the file.
  it.each([
    ['PondMolecule.tsx notice title', 'text-mn-text-meta', 'text-mn-11'],
    ['PondAtom.tsx file atom', 'text-mn-text-meta', 'text-mn-11'],
    ['PondMolecule.tsx record-card empty title', 'text-mn-13', 'text-mn-text-secondary'],
    ['PondAtom.tsx code atom (mobile)', 'text-mn-text', 'text-mn-13'],
  ])('%s keeps both halves', (_site, a, b) => {
    expect(has(cn(a, b), a, b)).toBe(true)
  })
})

describe('cn() — merging that must still happen', () => {
  it('two sizes still collapse to the last', () => {
    expect(cn('text-mn-13', 'text-mn-16')).toBe('text-mn-16')
    expect(cn('text-mn-13', 'text-[16px]')).toBe('text-[16px]')
  })

  it('two colours still collapse to the last', () => {
    expect(cn('text-mn-text', 'text-mn-text-secondary')).toBe('text-mn-text-secondary')
  })
})

describe('cn() — a font size must not clobber leading (the half that prevents a new #252)', () => {
  it.each([
    ['leading-tight', 'text-mn-22'],
    ['leading-snug', 'text-[15px]'],
    ['leading-relaxed', 'text-[17.5px]'],
    ['leading-none', 'text-[38px]'],
    ['leading-[normal]', 'text-[13px]'],
  ])('keeps %s with %s, in BOTH orders', (leading, size) => {
    expect(has(cn(leading, size), leading, size)).toBe(true)
    expect(has(cn(size, leading), leading, size)).toBe(true)
  })

  it('two leadings still collapse to the last', () => {
    expect(cn('leading-tight', 'leading-snug')).toBe('leading-snug')
  })
})

describe('the scale tailwind-merge is taught matches the token layer', () => {
  it('equals every --text-mn-* token in globals.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const tokens = [...css.matchAll(/--text-(mn-[\w-]+)\s*:/g)].map((m) => m[1])

    expect(tokens.length).toBeGreaterThan(0)
    // Sorted compare: order in the config is irrelevant, membership is not. A new
    // step in globals.css fails HERE rather than silently reopening #252.
    expect([...new Set(tokens)].sort()).toEqual([...MN_TEXT_SCALE].sort())
  })
})
