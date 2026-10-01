/**
 * Block types — re-export shim (t12).
 *
 * The `Block` union and its members are now derived from the per-module Zod schemas
 * in `src/lib/modules/` (single source of truth). This file stays as the historical
 * import path so existing consumers keep working unchanged; new code should import
 * from `@/lib/modules/registry` (types) or the individual module folders.
 */
export type { Block } from '@/lib/modules/content'
export type { TextBlock } from '@/lib/modules/text/schema'
export type { TodoBlock, TodoItem } from '@/lib/modules/todo/schema'
