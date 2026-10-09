import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView — mock it globally.
// Guarded so this setup also runs under the `node` test environment,
// which some suites (e.g. ones exercising the streaming AI SDK) opt into.
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
}

// jsdom has no layout, so a Range has no geometry. The text block's editor
// (ProseMirror) measures the caret off its Range to keep it in view; an empty
// rect list and a zero rect stand in.
if (typeof window !== 'undefined' && typeof window.Range.prototype.getClientRects !== 'function') {
  const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 }
  window.Range.prototype.getBoundingClientRect = () =>
    ({ ...emptyRect, toJSON: () => emptyRect }) as DOMRect
  window.Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList
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

// jsdom's selector engine (nwsapi) resolves the top-layer pseudo-classes by
// calling `matches` on itself until the stack overflows — seconds per call.
// floating-ui asks every ancestor of a positioned popup (base-ui's menus) for
// `:popover-open` and `:modal`. jsdom has no top layer, so the answer is false.
if (typeof window !== 'undefined') {
  const TOP_LAYER = /^:(?:modal|fullscreen|popover-open)$/
  const nativeMatches = window.Element.prototype.matches
  window.Element.prototype.matches = function (this: Element, selector: string) {
    return TOP_LAYER.test(selector) ? false : nativeMatches.call(this, selector)
  }
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
