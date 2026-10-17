import { isStepOutKey } from './step-out-key'

const base = { key: 'Enter', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }

describe('isStepOutKey', () => {
  it.each([
    ['Enter', { ...base, key: 'Enter' }, true],
    ['ArrowDown', { ...base, key: 'ArrowDown' }, true],
    ['Shift+Enter', { ...base, key: 'Enter', shiftKey: true }, false],
    ['Escape', { ...base, key: 'Escape' }, false],
  ])('%s → %s', (_label, event, expected) => {
    expect(isStepOutKey(event)).toBe(expected)
  })
})
