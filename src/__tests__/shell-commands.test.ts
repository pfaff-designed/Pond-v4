/**
 * `isDeleteBlockChord` (⌘⌫ / Ctrl+⌫) as a pure unit, independent of any call site.
 */

import { isDeleteBlockChord } from '@/lib/shell-commands'

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

afterEach(() => jest.restoreAllMocks())

const keyDown = (init: Partial<KeyboardEventInit>) =>
  new KeyboardEvent('keydown', { key: 'Backspace', ...init })

describe('isDeleteBlockChord — ⌘⌫ on a Mac, Ctrl+⌫ everywhere else', () => {
  it('matches ⌘⌫ on a Mac', () => {
    onPlatform('MacIntel')
    expect(isDeleteBlockChord(keyDown({ metaKey: true }))).toBe(true)
  })

  it('does not match Ctrl+⌫ on a Mac', () => {
    onPlatform('MacIntel')
    expect(isDeleteBlockChord(keyDown({ ctrlKey: true }))).toBe(false)
  })

  it('matches Ctrl+⌫ off a Mac', () => {
    onPlatform('Win32')
    expect(isDeleteBlockChord(keyDown({ ctrlKey: true }))).toBe(true)
  })

  it('does not match ⌘⌫ off a Mac', () => {
    onPlatform('Win32')
    expect(isDeleteBlockChord(keyDown({ metaKey: true }))).toBe(false)
  })

  it('does not match a bare Backspace', () => {
    onPlatform('MacIntel')
    expect(isDeleteBlockChord(keyDown({}))).toBe(false)
  })

  it('does not match a key other than Backspace', () => {
    onPlatform('MacIntel')
    expect(isDeleteBlockChord(keyDown({ key: 'Delete', metaKey: true }))).toBe(false)
  })

  it('does not match with Shift held', () => {
    onPlatform('MacIntel')
    expect(isDeleteBlockChord(keyDown({ metaKey: true, shiftKey: true }))).toBe(false)
  })

  it('does not match with Alt held', () => {
    onPlatform('MacIntel')
    expect(isDeleteBlockChord(keyDown({ metaKey: true, altKey: true }))).toBe(false)
  })

  it('does not match both the command key and Ctrl held at once', () => {
    onPlatform('MacIntel')
    expect(isDeleteBlockChord(keyDown({ metaKey: true, ctrlKey: true }))).toBe(false)
  })
})
