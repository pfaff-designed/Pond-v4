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

// jsdom does not implement PointerEvent — base-ui's Switch and Checkbox roots
// (under `PondControl`, #221) forward a click to their hidden <input> as a
// PointerEvent, so without this a `fireEvent.click` on a role="switch" /
// role="checkbox" throws and never toggles. A MouseEvent carrying the pointer
// fields is all the primitives read.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
      this.isPrimary = init.isPrimary ?? true
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
}
