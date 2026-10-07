/**
 * Reads a `.dc.html` component file and evaluates its design logic.
 *
 * A component `.dc.html` is NOT static markup: the template's `style` attributes
 * are `{{ token }}` bindings, and every real value lives in the
 * `<script type="text/x-dc">` logic class, whose `renderVals()` returns the style
 * objects as a pure function of props. So the spec is recovered by running that
 * one method with a stub base class — no browser, no React, no layout.
 */

export type PropSchema = {
  editor?: string
  options?: string[]
  default?: unknown
  tsType?: string
}

export type DcFile = {
  /** Declared prop editors, straight from the file's `data-props` attribute. */
  propsSchema: Record<string, PropSchema>
  /** The logic class source. */
  logicSrc: string
}

export type Vals = Record<string, unknown>

const SCRIPT_RE = /<script type="text\/x-dc"([^>]*)>([\s\S]*?)<\/script>/

function unescapeAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function readDcFile(html: string, name: string): DcFile {
  const m = SCRIPT_RE.exec(html)
  if (!m) throw new Error(`${name}: no <script type="text/x-dc"> logic block`)
  const propsAttr = /data-props="([^"]*)"/.exec(m[1])
  if (!propsAttr) throw new Error(`${name}: logic block has no data-props`)
  const raw = JSON.parse(unescapeAttr(propsAttr[1])) as Record<string, PropSchema>
  const propsSchema: Record<string, PropSchema> = {}
  for (const [k, v] of Object.entries(raw)) if (k !== '$preview') propsSchema[k] = v
  return { propsSchema, logicSrc: m[2] }
}

/**
 * The documented base class (`support.js` aliases it to its React logic base).
 * `renderVals()` only ever reads `this.props`, so a stub is enough — and keeping
 * it a stub guarantees we never run `componentDidMount`, the only place the real
 * components touch `window`.
 */
class DCLogicStub {
  props: Record<string, unknown>
  state: Record<string, unknown> = {}
  constructor(props: Record<string, unknown>) {
    this.props = props ?? {}
  }
  setState() {}
  forceUpdate() {}
  renderVals(): Vals {
    return {}
  }
}

/**
 * `createElement` returns null on purpose. The only thing any component builds
 * through React in `renderVals` is PondChart's `plot`, which is the pre-rendered
 * SVG artwork from pond-charts.js — megabytes of path data, and not a value a
 * builder needs. Everything else PondChart returns (title, type, sub, reads) is
 * plain text and comes through intact.
 */
const REACT_STUB = {
  createElement: () => null,
  Fragment: 'fragment',
  createContext: () => ({}),
  createRef: () => ({ current: null }),
}

export type ValsFn = (props: Record<string, unknown>) => Vals

/**
 * The globals the mockup runtime installs. PondChart reads `window.PondCharts`
 * inside `renderVals` for its per-kind copy, so that one is loaded for real;
 * `MNIcons` is only ever touched from `componentDidMount`, which never runs here.
 */
export type DcGlobals = { PondCharts?: unknown }

/** pond-charts.js is one JSON assignment: `window.PondCharts={…};`. */
export function readPondCharts(src: string): unknown {
  const m = /^\s*window\.PondCharts\s*=\s*([\s\S]*?);?\s*$/.exec(src)
  if (!m) throw new Error('pond-charts.js: unexpected shape (expected window.PondCharts = {…})')
  return JSON.parse(m[1])
}

/** Compile the logic class once; returns a `renderVals` runner for any props. */
export function compileVals(logicSrc: string, name: string, globals: DcGlobals = {}): ValsFn {
  const factory = new Function(
    'DCLogic',
    'StreamableLogic',
    'React',
    'window',
    `${logicSrc}\n;return typeof Component !== 'undefined' ? Component : undefined;`
  ) as (
    a: unknown,
    b: unknown,
    c: unknown,
    d: unknown
  ) => (new (p: Record<string, unknown>) => DCLogicStub) | undefined
  const win = { ...globals, MNIcons: { upgrade() {} } }
  const Cls = factory(DCLogicStub, DCLogicStub, REACT_STUB, win)
  if (typeof Cls !== 'function') throw new Error(`${name}: logic block defines no Component class`)
  return (props) => new Cls(props).renderVals()
}
