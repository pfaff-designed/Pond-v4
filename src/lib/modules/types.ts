/**
 * Module registry — shared facet types (t12).
 *
 * A **module** is a registered `schema + renderer` pair keyed by a `type` string:
 * the floor of AI composition (the AI arranges whole modules, never their private
 * internals). The registry is split across the runtime boundary and joined by
 * `type`:
 *   - `ModuleDescriptor` — server-safe, isomorphic: `{ type, schema, description }`.
 *     Pure data, no React. Assembled in `registry.ts`; read by the AI (t16) and the
 *     server-side write validation.
 *   - `ModuleRenderer` — client: `{ view, editor?, differ? }`. Assembled in
 *     `renderers.ts`; read only in client React.
 *
 * These are TYPE declarations only — the `import type` React references below are
 * erased at compile, so this file stays server-safe.
 */
import type { ComponentType } from 'react'
import type { ZodType } from 'zod'

/**
 * The AI-facing, server-safe half of a module. One Zod `schema` (the single source
 * of truth — TS type, runtime validation, and AI tool-input schema all derive from
 * it) plus a one-line natural-language `description` so the model knows when to
 * reach for this type.
 */
export interface ModuleDescriptor<T = unknown> {
  type: string
  schema: ZodType<T>
  /** One NL line: purpose + when-to-use. Feeds the AI composition catalog (t16). */
  description: string
}

/**
 * Props every module `view` receives. `editable` is passed by the *host/slot*, not
 * declared on the descriptor: the same module is interactive in the document panel
 * and read-only when the AI terminal shows it as reference. When `editable`, the
 * view wires its own interactions and emits a whole new module state via `onChange`
 * (full-state, per the contract — no ops/patch vocabulary).
 */
export interface ModuleViewProps<T = unknown> {
  data: T
  editable?: boolean
  onChange?: (next: T) => void
}

/**
 * The client half of a module. `view` is the one required facet. `editor` is the
 * exception — declared only when the edit surface genuinely differs from the read
 * surface (interactive modules fold editing into the view and declare none).
 * `differ` is a type-specific body slotted into the shared DiffCard shell (t16).
 */
export interface ModuleRenderer<T = unknown> {
  view: ComponentType<ModuleViewProps<T>>
  editor?: ComponentType<ModuleViewProps<T>>
  differ?: ComponentType<{ before: T | null; after: T }>
}
