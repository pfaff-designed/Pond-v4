import { FOCUS_RAIL_ROW_EVENT, requestRailRowFocus } from '@/lib/layout/rail-focus'

describe('rail-focus (KAN-476)', () => {
  it('requestRailRowFocus dispatches the focus event on window', () => {
    const listener = jest.fn()
    window.addEventListener(FOCUS_RAIL_ROW_EVENT, listener)
    requestRailRowFocus()
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(FOCUS_RAIL_ROW_EVENT, listener)
  })
})
