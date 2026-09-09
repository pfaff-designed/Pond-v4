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
// `Path` is computed in a parameter default, not inline on the property: a
// conditional on `T` inside the structure makes T's variance unmeasurable and
// breaks the registry `satisfies` (ZodType fails the structural fallback).
//
// A path is either a top-level field (`'items'`, `'rows'`) or ONE dotted deep
// segment (`'columns.cards'`, ticket-35 kanban) — the deep form names a field on
// the objects of a top-level array whose OWN elements also carry ids. Only the
// first segment is keyed to `T` (a typo'd top-level field is still a compile
// error); the nested segment is a plain string the walkers dereference at runtime.
export type NestedIdPath<T> = T extends object
  ? (keyof T & string) | `${keyof T & string}.${string}`
  : string
export interface ModuleDescriptor<T = unknown, Path extends string = NestedIdPath<T>> {
  type: string
  schema: ZodType<T>
  /** One NL line: purpose + when-to-use. Feeds the AI composition catalog (t16). */
  description: string
  /**
   * Short (≤2 sentence) label for the block palette UI (UI-audit Slice 2). The
   * long `description` above is the AI catalog text and reads too long in the
   * picker; `palette.ts` prefers this when present and falls back to `description`.
   * Keep it human, imperative, and terse — no schema/JSON detail.
   */
  paletteDescription?: string
  /**
   * Full-fidelity text rendering of a block — the prompt body and the embedding
   * source. REQUIRED: a block the model cannot read here is silently destroyed on
   * the next wholesale `edit` (the model re-emits what it can see). Must render
   * every piece of user content, not a summary.
   *
   * `siblings` (ticket-23) is the block's page-mates, passed by callers that have
   * them (context assembly does) so a module whose DISPLAY derives from sibling
   * state (a bound metric) serializes the same number the UI shows — the AI and
   * the user must never see different values. Typed `readonly unknown[]` rather
   * than `Block[]` to keep this file out of the types↔content import cycle
   * (content.ts imports every schema, which imports this); a module that cares
   * narrows the type itself. A caller without the page in hand may omit it — a
   * deriving module must then say so in its output, never guess a number.
   */
  // Method syntax (not arrow-property): keeps `T` bivariant so the heterogeneous
  // `moduleDescriptors` map still satisfies `Record<string, ModuleDescriptor>`.
  serialize(data: T, siblings?: readonly unknown[]): string
  /** One-line listing for the id-addressed editable-blocks context. Defaults to `serialize`. */
  preview?(data: T, siblings?: readonly unknown[]): string
  /**
   * Fields holding id-bearing collections. A top-level field (`['items']`,
   * `['rows']`) OR a dotted deep path (`'columns.cards'` — cards nested one level
   * inside a top-level `columns` array, ticket-35 kanban). The one declared fact
   * behind every id walk: write-time minting (`hydrate.ts`) and display-time
   * stamping (`preview.ts`) both traverse these paths. Omit when the module has
   * none. A deep path implies its parent is also walked — declare BOTH
   * (`['columns', 'columns.cards']`) so the parent array elements get ids too.
   */
  // First segment keyed to T (a typo'd top-level field is a compile error); the
  // nested segment is a plain string the walkers dereference at runtime.
  nestedIdPaths?: readonly Path[]
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
