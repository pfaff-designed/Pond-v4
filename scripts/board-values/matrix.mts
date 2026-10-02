/**
 * Walks a component's prop matrix and delta-encodes the result.
 *
 *   base                              full vals at every axis default
 *   variants["kind=table|theme=ink"]  delta vs base, plus its own states/secondary
 *
 * `kind`, `variant` and `theme` are crossed in full (one entry each); `state` and
 * the remaining axes (size, level, color, role) hang off their variant as deltas.
 * See diff.mts for why the whole thing is deltas rather than resolved copies.
 */

import type { PropSchema, Vals, ValsFn } from './dc.mts'
import { diff, type Delta } from './diff.mts'

const PRIMARY = ['kind', 'variant', 'theme']
const STATE = 'state'

type Errored = { error: string }

export type VariantCell = {
  props: Record<string, string>
  delta: Delta
  states?: Record<string, Delta | Errored>
  secondary?: Record<string, Delta | Errored>
}

export type ComponentValues = {
  source: string
  props: Record<string, PropSchema>
  /** Axes crossed in full; every combination is its own `variants` entry. */
  primaryAxes: string[]
  /** The axis encoded as deltas under `states` (null when the component has none). */
  stateAxis: string | null
  /** Axes encoded as one-at-a-time deltas under `secondary`. */
  secondaryAxes: string[]
  /**
   * Props the extractor deliberately leaves unset so the component's own
   * fallback (`p.x ?? '…'`) fires — that fallback is the designer's fixture copy.
   */
  unsetProps: Record<string, unknown>
  /** The variants key every `delta` is relative to. */
  baseKey: string
  base: { props: Record<string, string>; vals: Vals }
  variants: Record<string, VariantCell>
}

function enumAxes(schema: Record<string, PropSchema>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(schema)) {
    if (v.editor === 'enum' && Array.isArray(v.options) && v.options.length) out[k] = v.options
  }
  return out
}

function defaultOf(schema: Record<string, PropSchema>, axis: string, options: string[]): string {
  const d = schema[axis]?.default
  return typeof d === 'string' && options.includes(d) ? d : options[0]
}

function cross(axes: [string, string[]][]): Record<string, string>[] {
  let rows: Record<string, string>[] = [{}]
  for (const [name, options] of axes)
    rows = rows.flatMap((r) => options.map((o) => ({ ...r, [name]: o })))
  return rows
}

const key = (props: Record<string, string>, order: string[]) =>
  order.map((a) => `${a}=${props[a]}`).join('|')

function run(fn: ValsFn, props: Record<string, string>): Vals | Errored {
  try {
    return fn({ ...props })
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

const errored = (v: Vals | Errored): v is Errored =>
  typeof (v as Errored).error === 'string' && Object.keys(v).length === 1

function deltasFor(
  vals: ValsFn,
  props: Record<string, string>,
  own: Vals,
  axis: string,
  options: string[],
  label: (o: string) => string
): Record<string, Delta | Errored> {
  const out: Record<string, Delta | Errored> = {}
  for (const o of options) {
    if (o === props[axis]) continue
    const next = run(vals, { ...props, [axis]: o })
    out[label(o)] = errored(next) ? next : (diff(own, next) ?? {})
  }
  return out
}

export function buildComponent(opts: {
  source: string
  schema: Record<string, PropSchema>
  vals: ValsFn
}): ComponentValues {
  const { source, schema, vals } = opts
  const axes = enumAxes(schema)
  const primaryAxes = PRIMARY.filter((a) => a in axes)
  const stateAxis = STATE in axes ? STATE : null
  const secondaryAxes = Object.keys(axes).filter((a) => !primaryAxes.includes(a) && a !== stateAxis)
  const unsetProps: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema)) if (!(k in axes)) unsetProps[k] = v.default

  const baseProps: Record<string, string> = {}
  for (const [a, options] of Object.entries(axes)) baseProps[a] = defaultOf(schema, a, options)
  const baseVals = run(vals, baseProps)
  if (errored(baseVals))
    throw new Error(`${source}: renderVals failed at defaults — ${baseVals.error}`)

  const variants: Record<string, VariantCell> = {}
  for (const combo of cross(primaryAxes.map((a) => [a, axes[a]] as [string, string[]]))) {
    const props = { ...baseProps, ...combo }
    const own = run(vals, props)
    const entry: VariantCell = {
      props,
      delta: errored(own) ? own : (diff(baseVals, own) ?? {}),
    }
    if (!errored(own)) {
      if (stateAxis) {
        entry.states = deltasFor(vals, props, own, stateAxis, axes[stateAxis], (o) => o)
      }
      const secondary: Record<string, Delta | Errored> = {}
      for (const a of secondaryAxes) {
        Object.assign(
          secondary,
          deltasFor(vals, props, own, a, axes[a], (o) => `${a}=${o}`)
        )
      }
      if (Object.keys(secondary).length) entry.secondary = secondary
    }
    variants[key(props, primaryAxes)] = entry
  }

  return {
    source,
    props: schema,
    primaryAxes,
    stateAxis,
    secondaryAxes,
    unsetProps,
    baseKey: key(baseProps, primaryAxes),
    base: { props: baseProps, vals: baseVals },
    variants,
  }
}
