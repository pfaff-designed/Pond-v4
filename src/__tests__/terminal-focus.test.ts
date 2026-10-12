/**
 * Terminal focus event name contract (Fix-7 / F18a). The ⌘K handler in ShellCommands
 * fires FOCUS_TERMINAL_EVENT; AITerminal listens for the same constant. Pinning
 * the string ensures they stay in sync across merges.
 */
import {
  COMPOSER_NOTICE_EVENT,
  FOCUS_TERMINAL_EVENT,
  HTML_IMPORT_PICKER_EVENT,
  TOGGLE_COMPOSER_EVENT,
  type ComposerNoticeDetail,
  isComposerToggleKey,
  requestComposerNotice,
  requestComposerToggle,
  requestHtmlImportPicker,
  requestTerminalFocus,
} from '@/lib/terminal-focus'

describe('terminal-focus', () => {
  it('FOCUS_TERMINAL_EVENT is a stable non-empty string', () => {
    expect(typeof FOCUS_TERMINAL_EVENT).toBe('string')
    expect(FOCUS_TERMINAL_EVENT.length).toBeGreaterThan(0)
  })

  it('requestTerminalFocus dispatches the focus event on window', () => {
    const listener = jest.fn()
    window.addEventListener(FOCUS_TERMINAL_EVENT, listener)
    requestTerminalFocus()
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(FOCUS_TERMINAL_EVENT, listener)
  })
})

describe('the html import picker (KAN-251)', () => {
  it('requestHtmlImportPicker dispatches the picker event on window', () => {
    const listener = jest.fn()
    window.addEventListener(HTML_IMPORT_PICKER_EVENT, listener)
    requestHtmlImportPicker()
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(HTML_IMPORT_PICKER_EVENT, listener)
  })
})

describe('the composer notice bridge (KAN-93)', () => {
  it('requestComposerNotice dispatches the notice event on window with the text in its detail', () => {
    const listener = jest.fn()
    window.addEventListener(COMPOSER_NOTICE_EVENT, listener)
    requestComposerNotice("can't undo — the page changed since. revert it from the change log.")
    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0][0] as CustomEvent<ComposerNoticeDetail>
    expect(event.detail.text).toBe(
      "can't undo — the page changed since. revert it from the change log."
    )
    window.removeEventListener(COMPOSER_NOTICE_EVENT, listener)
  })
})

describe('the composer toggle (⌘J)', () => {
  it('requestComposerToggle dispatches the toggle event on window', () => {
    const listener = jest.fn()
    window.addEventListener(TOGGLE_COMPOSER_EVENT, listener)
    requestComposerToggle()
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(TOGGLE_COMPOSER_EVENT, listener)
  })

  describe('the key is Cmd+J on Apple platforms and Ctrl+J everywhere else — never both', () => {
    const platform = (value: string) =>
      jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(value)
    const press = (init: KeyboardEventInit) =>
      isComposerToggleKey(new KeyboardEvent('keydown', init))

    afterEach(() => jest.restoreAllMocks())

    it('on a Mac', () => {
      platform('MacIntel')
      expect(press({ key: 'j', metaKey: true })).toBe(true)
      expect(press({ key: 'J', metaKey: true })).toBe(true)
      expect(press({ key: 'j', ctrlKey: true })).toBe(false)
      expect(press({ key: 'j', metaKey: true, ctrlKey: true })).toBe(false)
    })

    it('on Windows and Linux', () => {
      platform('Win32')
      expect(press({ key: 'j', ctrlKey: true })).toBe(true)
      expect(press({ key: 'j', metaKey: true })).toBe(false)
    })

    it('not with another modifier, nor another key', () => {
      platform('MacIntel')
      expect(press({ key: 'j', metaKey: true, shiftKey: true })).toBe(false)
      expect(press({ key: 'j', metaKey: true, altKey: true })).toBe(false)
      expect(press({ key: 'k', metaKey: true })).toBe(false)
      expect(press({ key: 'j' })).toBe(false)
    })
  })
})
