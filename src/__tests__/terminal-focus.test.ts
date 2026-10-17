/**
 * Terminal focus event name contract (Fix-7 / F18a). The ⌘K handler in ShellCommands
 * fires FOCUS_TERMINAL_EVENT; AITerminal listens for the same constant. Pinning
 * the string ensures they stay in sync across merges.
 */
import { act, renderHook } from '@testing-library/react'
import {
  COMPOSER_NOTICE_EVENT,
  FOCUS_TERMINAL_EVENT,
  HTML_IMPORT_PICKER_EVENT,
  REQUEST_CHANGES_EVENT,
  TOGGLE_COMPOSER_EVENT,
  type ComposerNoticeDetail,
  type RequestChangesDetail,
  clearUndoNotice,
  isComposerToggleKey,
  notifyComposerOpenChange,
  requestChanges,
  requestComposerNotice,
  requestComposerToggle,
  requestHtmlImportPicker,
  requestTerminalFocus,
  requestUndoNotice,
  takePendingTerminalResearch,
  toNoticeLines,
  useComposerOpen,
  useUndoNotice,
  type FocusTerminalDetail,
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

describe('deep research from the palette (KAN-182)', () => {
  it('requestTerminalFocus carries research: true in the dispatched detail', () => {
    const listener = jest.fn()
    window.addEventListener(FOCUS_TERMINAL_EVENT, listener)
    requestTerminalFocus(undefined, { research: true })
    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0][0] as CustomEvent<FocusTerminalDetail>
    expect(event.detail.research).toBe(true)
    window.removeEventListener(FOCUS_TERMINAL_EVENT, listener)
  })

  it('a request dispatched before a listener mounts waits in the pending research slot', () => {
    requestTerminalFocus(undefined, { research: true })
    expect(takePendingTerminalResearch()).toBe(true)
    // Claimed once — a second late-mounting listener finds nothing left.
    expect(takePendingTerminalResearch()).toBeUndefined()
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

describe("the composer's open state outside AITerminal (KAN-186)", () => {
  it('useComposerOpen flips when notifyComposerOpenChange dispatches', () => {
    const { result } = renderHook(() => useComposerOpen())
    expect(result.current).toBe(false)

    act(() => notifyComposerOpenChange(true))
    expect(result.current).toBe(true)

    act(() => notifyComposerOpenChange(false))
    expect(result.current).toBe(false)
  })

  it('a listener that mounts after AITerminal already broadcast reads the true state, not the closed default', () => {
    // Host order: AITerminal (the broadcaster) mounts and announces open
    // before ZenComposerChrome/ZenPill (the listeners) ever subscribe. A
    // useState(false)-backed hook would miss this — the CustomEvent already
    // fired and isn't replayed — and read 'closed' until the next change.
    notifyComposerOpenChange(true)

    const { result } = renderHook(() => useComposerOpen())
    expect(result.current).toBe(true)

    act(() => notifyComposerOpenChange(false))
    expect(result.current).toBe(false)
  })
})

describe('the undo/redo notice (KAN-139)', () => {
  afterEach(() => act(() => clearUndoNotice()))

  it('useUndoNotice reads the dispatched notice, then clearUndoNotice resets it to null', () => {
    const { result } = renderHook(() => useUndoNotice())
    expect(result.current).toBeNull()

    act(() =>
      requestUndoNotice({
        direction: 'undo',
        pastTense: 'removed chickpeas, harissa',
        openedPageTitle: 'recipes',
        previousPageTitle: 'kitchen renovation',
      })
    )
    expect(result.current).toEqual({
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: 'recipes',
      previousPageTitle: 'kitchen renovation',
    })

    act(() => clearUndoNotice())
    expect(result.current).toBeNull()
  })

  it('a request made before any reader mounts is read by a reader mounted afterwards', () => {
    requestUndoNotice({
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      previousPageTitle: 'kitchen renovation',
    })

    const { result } = renderHook(() => useUndoNotice())
    expect(result.current).toEqual({
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      previousPageTitle: 'kitchen renovation',
    })
  })

  it('toNoticeLines shows no "opened"/"you were on"/"back to" clauses for a same-page step', () => {
    const lines = toNoticeLines({
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      previousPageTitle: 'kitchen renovation',
    })
    expect(lines.headRight).toBeNull()
    expect(lines.body).toBe('removed chickpeas, harissa.')
    expect(lines.footRight).toBeNull()
  })

  it('toNoticeLines shows the "opened" clause when the step navigated, Apple glyphs on a Mac', () => {
    const platform = jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const lines = toNoticeLines({
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: 'recipes',
      previousPageTitle: 'kitchen renovation',
    })
    expect(lines.headLeft).toBe('undo · ⌘Z')
    expect(lines.headRight).toBe('opened recipes')
    expect(lines.footLeft).toBe('redo ⇧⌘Z')
    expect(lines.footRight).toBe('back to kitchen renovation ⌘[')
    platform.mockRestore()
  })

  it('toNoticeLines reads Ctrl words off a Mac', () => {
    const platform = jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
    const lines = toNoticeLines({
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: 'recipes',
      previousPageTitle: 'kitchen renovation',
    })
    expect(lines.headLeft).toBe('undo · Ctrl Z')
    expect(lines.footLeft).toBe('redo Ctrl Shift Z')
    expect(lines.footRight).toBe('back to kitchen renovation Ctrl [')
    platform.mockRestore()
  })
})

describe('request changes with no mounted thread (KAN-96)', () => {
  it('requestChanges dispatches the event with the toolCallId, note and reason', () => {
    const listener = jest.fn()
    window.addEventListener(REQUEST_CHANGES_EVENT, listener)
    requestChanges({ toolCallId: 'call-1', note: 'please fix the date', reason: 'note' })
    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0][0] as CustomEvent<RequestChangesDetail>
    expect(event.detail).toEqual({
      toolCallId: 'call-1',
      note: 'please fix the date',
      reason: 'note',
    })
    window.removeEventListener(REQUEST_CHANGES_EVENT, listener)
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
