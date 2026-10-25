import { isNewTabClick, type NewTabClickEvent } from './nav'

// `altKey` is deliberately not part of `NewTabClickEvent` (alt-click downloads
// the link target in Chrome/Safari rather than opening a tab), so the alt case
// below is built outside the typed helper to still exercise `isNewTabClick`
// with an event that merely carries an unused `altKey` field.
const click = (over: Partial<NewTabClickEvent>): NewTabClickEvent => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  button: 0,
  ...over,
})

describe('isNewTabClick', () => {
  it.each<[string, NewTabClickEvent, boolean]>([
    ['plain left click', click({}), false],
    ['⌘-click', click({ metaKey: true }), true],
    ['Ctrl-click', click({ ctrlKey: true }), true],
    ['⇧-click', click({ shiftKey: true }), true],
    ['middle-click (button 1)', click({ button: 1 }), true],
    ['right-click (button 2)', click({ button: 2 }), true],
  ])('%s → %s', (_label, event, expected) => {
    expect(isNewTabClick(event)).toBe(expected)
  })

  it('⌥-click (alt) is excluded — behaves like a plain click, not a new tab', () => {
    const event = { ...click({}), altKey: true }
    expect(isNewTabClick(event)).toBe(false)
  })
})
