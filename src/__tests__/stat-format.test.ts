/**
 * The `stat` formatting helpers (#12) — pure, shared by the view (via
 * ChartStatFlow's `formatOptions`) and by `serialize`, so the AI's context and
 * the rendered figure can never disagree. Locale is pinned to en-US for the
 * string-producing side (serialize + the static pre-custom-element render path)
 * so the output is deterministic across environments.
 */

import {
  formatStatDelta,
  formatStatValue,
  signedStatDelta,
  statFormatOptions,
} from '@/lib/modules/stat/format'

describe('formatStatValue', () => {
  it('number (default): grouped, up to 2 decimals', () => {
    expect(formatStatValue({ value: 1234 })).toBe('1,234')
    expect(formatStatValue({ value: 4.5 })).toBe('4.5')
    expect(formatStatValue({ value: 4.567 })).toBe('4.57')
  })

  it('currency: USD, whole dollars unless cents are present', () => {
    expect(formatStatValue({ value: 12500, format: 'currency' })).toBe('$12,500')
    expect(formatStatValue({ value: 99.99, format: 'currency' })).toBe('$99.99')
  })

  it('percent: value is a FRACTION, rendered ×100 with up to 1 decimal', () => {
    expect(formatStatValue({ value: 0.62, format: 'percent' })).toBe('62%')
    expect(formatStatValue({ value: 0.625, format: 'percent' })).toBe('62.5%')
  })

  it('prefix and suffix wrap the formatted number', () => {
    expect(formatStatValue({ value: 38, suffix: ' mi' })).toBe('38 mi')
    expect(formatStatValue({ value: 120, prefix: '~' })).toBe('~120')
  })
})

describe('delta formatting (delta is a FRACTION: 0.12 → 12%)', () => {
  it('view glyph form: ▲ for up (including zero), ▼ for down, magnitude only', () => {
    expect(formatStatDelta(0.12)).toBe('▲ 12%')
    expect(formatStatDelta(-0.05)).toBe('▼ 5%')
    expect(formatStatDelta(0.045)).toBe('▲ 4.5%')
    expect(formatStatDelta(0)).toBe('▲ 0%')
  })

  it('serialize signed form: explicit +/-', () => {
    expect(signedStatDelta(0.12)).toBe('+12%')
    expect(signedStatDelta(-0.05)).toBe('-5%')
  })
})

describe('statFormatOptions (the ChartStatFlow bridge)', () => {
  it('maps each format to Intl options the view hands to ChartStatFlow', () => {
    expect(statFormatOptions('currency')).toMatchObject({ style: 'currency', currency: 'USD' })
    expect(statFormatOptions('percent')).toMatchObject({ style: 'percent' })
    expect(statFormatOptions()).toMatchObject({ style: 'decimal' })
  })

  it('formatStatValue and the options agree (the view/serialize honesty seam)', () => {
    // The static string ChartStatFlow renders pre-hydration is Intl over the same
    // options — pin one example per format so the two paths can't drift.
    for (const [format, value] of [
      ['currency', 12500],
      ['percent', 0.62],
      [undefined, 1234],
    ] as const) {
      const viaIntl = new Intl.NumberFormat('en-US', statFormatOptions(format)).format(value)
      expect(formatStatValue({ value, format })).toBe(viaIntl)
    }
  })
})
