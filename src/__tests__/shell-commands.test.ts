/**
 * `isDeleteBlockChord` (⌘⌫ / Ctrl+⌫), `isMovePageChord` (⌘⇧P / Ctrl+Shift+P) and
 * `isContextMenuKey` (⇧F10 / ContextMenu) as pure units, independent of any call site.
 */

import { isContextMenuKey, isDeleteBlockChord, isMovePageChord } from '@/lib/shell-commands'

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

const pKeyDown = (init: Partial<KeyboardEventInit>) => new KeyboardEvent('keydown', { key: 'p', ...init })

describe('isMovePageChord — ⌘⇧P on a Mac, Ctrl+Shift+P everywhere else', () => {
  it('does not match a plain p', () => {
    onPlatform('MacIntel')
    expect(isMovePageChord(pKeyDown({}))).toBe(false)
  })

  it('does not match ⌘P alone, with no shift', () => {
    onPlatform('MacIntel')
    expect(isMovePageChord(pKeyDown({ metaKey: true }))).toBe(false)
  })

  it('matches ⌘⇧P on a Mac', () => {
    onPlatform('MacIntel')
    expect(isMovePageChord(pKeyDown({ metaKey: true, shiftKey: true }))).toBe(true)
  })

  it('does not match Ctrl+Shift+P on a Mac', () => {
    onPlatform('MacIntel')
    expect(isMovePageChord(pKeyDown({ ctrlKey: true, shiftKey: true }))).toBe(false)
  })

  it('matches Ctrl+Shift+P off a Mac', () => {
    onPlatform('Win32')
    expect(isMovePageChord(pKeyDown({ ctrlKey: true, shiftKey: true }))).toBe(true)
  })

  it('does not match ⌘⇧P off a Mac', () => {
    onPlatform('Win32')
    expect(isMovePageChord(pKeyDown({ metaKey: true, shiftKey: true }))).toBe(false)
  })

  it('does not match with Alt held', () => {
    onPlatform('MacIntel')
    expect(isMovePageChord(pKeyDown({ metaKey: true, shiftKey: true, altKey: true }))).toBe(false)
  })
})

const f10KeyDown = (init: Partial<KeyboardEventInit>) => new KeyboardEvent('keydown', { key: 'F10', ...init })
const contextMenuKeyDown = (init: Partial<KeyboardEventInit>) =>
  new KeyboardEvent('keydown', { key: 'ContextMenu', ...init })

describe('isContextMenuKey — ⇧F10 or the ContextMenu key, same on every platform', () => {
  it('matches ⇧F10', () => {
    expect(isContextMenuKey(f10KeyDown({ shiftKey: true }))).toBe(true)
  })

  it('does not match a bare F10, with no Shift', () => {
    expect(isContextMenuKey(f10KeyDown({}))).toBe(false)
  })

  it('matches a bare ContextMenu key press', () => {
    expect(isContextMenuKey(contextMenuKeyDown({}))).toBe(true)
  })

  it('does not match ContextMenu with Shift held', () => {
    expect(isContextMenuKey(contextMenuKeyDown({ shiftKey: true }))).toBe(false)
  })

  it('does not match ⇧F10 with Alt also held', () => {
    expect(isContextMenuKey(f10KeyDown({ shiftKey: true, altKey: true }))).toBe(false)
  })

  it('does not match a key other than F10 or ContextMenu', () => {
    expect(isContextMenuKey(new KeyboardEvent('keydown', { key: 'F9', shiftKey: true }))).toBe(false)
  })
})
