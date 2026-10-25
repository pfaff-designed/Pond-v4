/**
 * `formatChord` as a pure unit, independent of any call site.
 */

import { act, renderHook } from '@testing-library/react'

import {
  ariaKeyshortcuts,
  formatChord,
  formatChordMachine,
  useApplePlatform,
} from '@/lib/shell-commands'

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

afterEach(() => jest.restoreAllMocks())

describe('formatChord — Apple glyphs on a Mac, Ctrl words elsewhere', () => {
  it('formats a bare chord on a Mac', () => {
    onPlatform('MacIntel')
    expect(formatChord('mod+k')).toBe('⌘K')
  })

  it('formats a shift chord on a Mac, shift before the command key', () => {
    onPlatform('MacIntel')
    expect(formatChord('mod+shift+z')).toBe('⇧⌘Z')
  })

  it('formats an alt+shift chord on a Mac in HIG order', () => {
    onPlatform('MacIntel')
    expect(formatChord('mod+alt+shift+n')).toBe('⌥⇧⌘N')
  })

  it('leaves a punctuation key as-is on a Mac', () => {
    onPlatform('MacIntel')
    expect(formatChord('mod+.')).toBe('⌘.')
  })

  it('maps backspace to its glyph on a Mac', () => {
    onPlatform('MacIntel')
    expect(formatChord('mod+backspace')).toBe('⌘⌫')
  })

  it('maps enter to its glyph on a Mac', () => {
    onPlatform('MacIntel')
    expect(formatChord('mod+enter')).toBe('⌘↵')
  })

  it('reads an iPadOS UA (MacIntel) as Apple', () => {
    onPlatform('iPad')
    expect(formatChord('mod+k')).toBe('⌘K')
  })

  it('formats a bare chord off a Mac', () => {
    onPlatform('Win32')
    expect(formatChord('mod+k')).toBe('Ctrl K')
  })

  it('formats a shift chord off a Mac, Ctrl then Shift then key', () => {
    onPlatform('Win32')
    expect(formatChord('mod+shift+z')).toBe('Ctrl Shift Z')
  })

  it('formats an alt+shift chord off a Mac in Ctrl, Alt, Shift order', () => {
    onPlatform('Win32')
    expect(formatChord('mod+alt+shift+n')).toBe('Ctrl Alt Shift N')
  })

  it('leaves a punctuation key as-is off a Mac', () => {
    onPlatform('Win32')
    expect(formatChord('mod+.')).toBe('Ctrl .')
  })

  it('names backspace as a word off a Mac', () => {
    onPlatform('Win32')
    expect(formatChord('mod+backspace')).toBe('Ctrl Backspace')
  })

  it('names enter as a word off a Mac', () => {
    onPlatform('Win32')
    expect(formatChord('mod+enter')).toBe('Ctrl Enter')
  })

  it('an explicit apple param wins over the mocked platform', () => {
    onPlatform('Win32')
    expect(formatChord('mod+k', true)).toBe('⌘K')
  })

  it('an explicit non-apple param wins over the mocked platform', () => {
    onPlatform('MacIntel')
    expect(formatChord('mod+k', false)).toBe('Ctrl K')
  })
})

describe('formatChordMachine — the machine surface stays lowercase off Apple (PROJECT_RULES)', () => {
  it.each([
    ['mod+enter', true, '⌘↵'],
    ['mod+enter', false, 'ctrl enter'],
    ['mod+shift+p', true, '⇧⌘P'],
    ['mod+shift+p', false, 'ctrl shift p'],
    ['mod+j', true, '⌘J'],
    ['mod+j', false, 'ctrl j'],
  ])('formats %s on apple=%s as %p', (chord, apple, expected) => {
    expect(formatChordMachine(chord, apple)).toBe(expected)
  })
})

describe('useApplePlatform — a render-time read that corrects on mount', () => {
  it('renders the Apple default before the mount effect corrects it, then flips to match the real platform', () => {
    onPlatform('Win32')
    const renders: boolean[] = []
    renderHook(() => {
      const applePlatform = useApplePlatform()
      renders.push(applePlatform)
      return applePlatform
    })
    expect(renders[0]).toBe(true)
    expect(renders[renders.length - 1]).toBe(false)
  })

  it('stays true once corrected on a Mac, matching the server default', () => {
    onPlatform('MacIntel')
    const { result } = renderHook(() => useApplePlatform())
    act(() => {})
    expect(result.current).toBe(true)
  })
})

describe('ariaKeyshortcuts — the WAI-ARIA form, one platform only', () => {
  it('reads Meta on a Mac', () => {
    onPlatform('MacIntel')
    expect(ariaKeyshortcuts('mod+k')).toBe('Meta+K')
  })

  it('reads Control off a Mac', () => {
    onPlatform('Win32')
    expect(ariaKeyshortcuts('mod+k')).toBe('Control+K')
  })

  it('joins a shift chord with Meta on a Mac', () => {
    onPlatform('MacIntel')
    expect(ariaKeyshortcuts('mod+shift+z')).toBe('Meta+Shift+Z')
  })

  it('joins a shift chord with Control off a Mac', () => {
    onPlatform('Win32')
    expect(ariaKeyshortcuts('mod+shift+z')).toBe('Control+Shift+Z')
  })

  it('leaves a punctuation key as-is', () => {
    onPlatform('MacIntel')
    expect(ariaKeyshortcuts('mod+.')).toBe('Meta+.')
  })

  it('names backspace by its name, not a glyph', () => {
    onPlatform('MacIntel')
    expect(ariaKeyshortcuts('mod+backspace')).toBe('Meta+Backspace')
  })

  it('names enter by its name, not a glyph', () => {
    onPlatform('Win32')
    expect(ariaKeyshortcuts('mod+enter')).toBe('Control+Enter')
  })

  it('an explicit apple param wins over the mocked platform', () => {
    onPlatform('Win32')
    expect(ariaKeyshortcuts('mod+k', true)).toBe('Meta+K')
  })

  it('an explicit non-apple param wins over the mocked platform', () => {
    onPlatform('MacIntel')
    expect(ariaKeyshortcuts('mod+k', false)).toBe('Control+K')
  })
})
