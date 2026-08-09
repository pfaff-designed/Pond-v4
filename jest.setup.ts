import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView — mock it globally.
// Guarded so this setup also runs under the `node` test environment,
// which some suites (e.g. ones exercising the streaming AI SDK) opt into.
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
}
