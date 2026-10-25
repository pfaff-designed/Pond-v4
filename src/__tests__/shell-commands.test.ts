/**
 * `isDeleteBlockChord` (⌘⌫ / Ctrl+⌫), `isMovePageChord` (⌘⇧P / Ctrl+Shift+P),
 * `isGoToParentChord` (⌘⇧↑ / Ctrl+Shift+↑), `isRailFocusChord` (⌘⇧\ / Ctrl+Shift+\)
 * and `isEditableField` as pure units, independent of any call site.
 */

import {
  isDeleteBlockChord,
  isEditableField,
  isGoToParentChord,
  isMovePageChord,
  isRailFocusChord,
} from '@/lib/shell-commands'

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

const upKeyDown = (init: Partial<KeyboardEventInit>) =>
  new KeyboardEvent('keydown', { key: 'ArrowUp', ...init })

describe('isGoToParentChord — ⌘⇧↑ on a Mac, Ctrl+Shift+↑ everywhere else', () => {
  it('matches ⌘⇧↑ on a Mac', () => {
    onPlatform('MacIntel')
    expect(isGoToParentChord(upKeyDown({ metaKey: true, shiftKey: true }))).toBe(true)
  })

  it('matches Ctrl+Shift+↑ off a Mac', () => {
    onPlatform('Win32')
    expect(isGoToParentChord(upKeyDown({ ctrlKey: true, shiftKey: true }))).toBe(true)
  })

  it('does not match with Alt held', () => {
    onPlatform('MacIntel')
    expect(isGoToParentChord(upKeyDown({ metaKey: true, shiftKey: true, altKey: true }))).toBe(false)
  })

  it('does not match ⌘↑ alone, with no shift', () => {
    onPlatform('MacIntel')
    expect(isGoToParentChord(upKeyDown({ metaKey: true }))).toBe(false)
  })

  it('does not match Ctrl+Shift+↑ on a Mac (off-platform modifier)', () => {
    onPlatform('MacIntel')
    expect(isGoToParentChord(upKeyDown({ ctrlKey: true, shiftKey: true }))).toBe(false)
  })

  it('does not match ⌘⇧↑ off a Mac (off-platform modifier)', () => {
    onPlatform('Win32')
    expect(isGoToParentChord(upKeyDown({ metaKey: true, shiftKey: true }))).toBe(false)
  })
})

/** A real browser reports the Shift-ed character in `e.key` (`'|'` on a US layout) while
 *  `e.code` stays the unshifted physical key — so these fixtures default to that pair,
 *  not to `{ key: '\\' }`, which no real Shift+\ keydown ever produces. */
const backslashKeyDown = (init: Partial<KeyboardEventInit>) =>
  new KeyboardEvent('keydown', { key: '|', code: 'Backslash', ...init })

describe('isRailFocusChord — ⌘⇧\\ on a Mac, Ctrl+Shift+\\ everywhere else', () => {
  it('matches ⌘⇧\\ on a Mac (key reports the shifted "|" character)', () => {
    onPlatform('MacIntel')
    expect(isRailFocusChord(backslashKeyDown({ metaKey: true, shiftKey: true }))).toBe(true)
  })

  it('matches Ctrl+Shift+\\ off a Mac (key reports the shifted "|" character)', () => {
    onPlatform('Win32')
    expect(isRailFocusChord(backslashKeyDown({ ctrlKey: true, shiftKey: true }))).toBe(true)
  })

  it('does not match ⌘\\ alone, with no shift (already isMinimizeRailChord)', () => {
    onPlatform('MacIntel')
    expect(
      isRailFocusChord(backslashKeyDown({ metaKey: true, key: '\\', shiftKey: false }))
    ).toBe(false)
  })

  it('does not match with Alt held', () => {
    onPlatform('MacIntel')
    expect(isRailFocusChord(backslashKeyDown({ metaKey: true, shiftKey: true, altKey: true }))).toBe(
      false
    )
  })

  it('does not match Ctrl+Shift+\\ on a Mac (off-platform modifier)', () => {
    onPlatform('MacIntel')
    expect(isRailFocusChord(backslashKeyDown({ ctrlKey: true, shiftKey: true }))).toBe(false)
  })

  it('does not match ⌘⇧\\ off a Mac (off-platform modifier)', () => {
    onPlatform('Win32')
    expect(isRailFocusChord(backslashKeyDown({ metaKey: true, shiftKey: true }))).toBe(false)
  })
})

describe('isEditableField — a plain text field, no undo-specific exceptions', () => {
  it('matches an input', () => {
    const el = document.createElement('input')
    expect(isEditableField(el)).toBe(true)
  })

  it('matches a textarea', () => {
    const el = document.createElement('textarea')
    expect(isEditableField(el)).toBe(true)
  })

  it('matches a contenteditable element', () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'true')
    expect(isEditableField(el)).toBe(true)
  })

  it('does not match contenteditable="false"', () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'false')
    expect(isEditableField(el)).toBe(false)
  })

  it('does not match a plain div', () => {
    const el = document.createElement('div')
    expect(isEditableField(el)).toBe(false)
  })

  it('does not match null', () => {
    expect(isEditableField(null)).toBe(false)
  })
})
