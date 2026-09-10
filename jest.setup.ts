import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView — mock it globally.
// Guarded so this setup also runs under the `node` test environment,
// which some suites (e.g. ones exercising the streaming AI SDK) opt into.
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
}

// jsdom does not implement ResizeObserver — stub it so components that measure
// their own track (gantt/timeline axis-tick thinning, #57) can mount. Width
// reads come back 0 in jsdom, which the views treat as "unmeasured".
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
