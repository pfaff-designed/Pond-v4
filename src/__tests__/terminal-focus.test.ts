/**
 * Terminal focus event name contract (Fix-7 / F18a). The ⌘K handler in TopBar
 * fires FOCUS_TERMINAL_EVENT; AITerminal listens for the same constant. Pinning
 * the string ensures they stay in sync across merges.
 */
import { FOCUS_TERMINAL_EVENT, requestTerminalFocus } from '@/lib/terminal-focus'

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
