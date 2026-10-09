/**
 * The shapes an HTML import reads into (`Pond 07.11` 7k, `Pond 06.25` 6z frames 2–4).
 *
 * The reader produces data only: blocks for the page, the databases its tables
 * become (with their records), and the parts it could not carry over. Nothing here
 * is written; the proposal that builds the page takes it from here as one diff.
 */
import type { Block } from '@/lib/modules/content'
import type { RowPageInput } from '@/lib/pages/promote-table'
import type { PropertySchema } from '@/lib/properties/schema'

/** A part of the file with no matching block, named by what it is, and why (6z frame 4). */
export interface LeftOut {
  /** What it is, in the card's words: `the map`, `the site’s links`, `styling`, `a form`. */
  name: string
  why: string
  /** Where in the file it sat, as short paths (`section 3 › map`, `header`). */
  from: string[]
}

/** What reading found, as 6z frame 2 counts it: headings, text, tables, charts, images. */
export interface Counts {
  headings: number
  text: number
  tables: number
  charts: number
  images: number
}

/**
 * A database a table becomes, with its records, before anything is written. `id` is
 * the reader's own: every view block that shows or charts it carries it as
 * `collectionId`, and the build swaps it for the real page id when it makes the
 * database.
 */
export interface ImportedDatabase {
  id: string
  title: string
  schema: PropertySchema
  records: RowPageInput[]
  /** The part of the file the rows came from. */
  from: string
}

/** Why a table became what it did, for the question step (6z frame 2 › unsure). */
export type TableReason = 'chart' | 'dates' | 'rows' | 'short'

/** One table's reading: a database with a table view, or a table block. */
export interface TableChoice {
  /** The table block, or the view block that shows the database. */
  blockId: string
  became: 'database' | 'table'
  because: TableReason
  /** Borderline, so the question step asks before it proposes. */
  unsure: boolean
  rows: number
  databaseId?: string
}

export interface HtmlReading {
  title: string
  blocks: Block[]
  records: ImportedDatabase[]
  tables: TableChoice[]
  leftOut: LeftOut[]
  found: Counts
  /** Block id → the part of the file it came from (`section 2 › table`). */
  provenance: Record<string, string>
  /** The absolute image links the file's image blocks point at, each once, in order. */
  linkedImages: string[]
}

export type ReadHtmlError =
  { kind: 'too-large'; size: number; limit: number } | { kind: 'unreadable' }

export type ReadHtmlResult = ({ ok: true } & HtmlReading) | { ok: false; error: ReadHtmlError }

export interface ReadHtmlOptions {
  /** Mints block, item and field ids. Defaults to a counter, so one file always reads the same. */
  mintId?: () => string
  /** Where the file came from, to resolve its relative links and images. */
  baseUrl?: string
}
