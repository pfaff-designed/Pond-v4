// Auto-generate the full version with: npx supabase gen types typescript --linked
// This is a hand-authored minimal version for bootstrapping.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// A page's KIND tag in the unified page tree — the human, editable label under a
// title (page, project, routine, action), never a structural marker. 'page' is the
// generic default.
//
// #108: 'area' is GONE. The design settles it — "an area is a page with pages
// inside it; it has no technical meaning" — so area-ness is COMPUTED from having
// children, never stored. A former area is just a page that happens to have
// children (migration 0010).
//
// The two remaining values the UI never offers as a kind are genuinely technical:
// 'home' is the reserved Life home page (ticket-44) — one per user, top-level,
// never a rail child and never counted; it holds the Life root's own blocks.
// 'row' (#18) is a schema-bound child of a collection — a real, openable page that
// is filtered out of the ['pages'] tree (rail / children grid) and surfaced only
// through a collection's views (#19).
export type NodeType = 'routine' | 'project' | 'action' | 'page' | 'home' | 'row'

// The workspace scope discriminator (ticket-43). 'main' is the real workspace;
// 'sandbox' is the isolated orchestrator/user testing scope.
export type Workspace = 'main' | 'sandbox'

// The eight themes `Pond 06.13` `s6m2` draws (migration 0018). #316 ships the
// theme control DISABLED with only paper and ink reachable until #175 builds the
// other six — the board governs the stored domain, the disabled control governs
// the UI.
export type PondTheme =
  'paper' | 'ink' | 'sage' | 'mist' | 'navy' | 'wheat' | 'burnt-orange' | 'ember'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          created_at: string
          /** Null until the make-page proposal card makes the first page (KAN-195). */
          first_run_done_at: string | null
        }
        Insert: {
          id: string
          email: string
          created_at?: string
          first_run_done_at?: string | null
        }
        Update: { email?: string; first_run_done_at?: string | null }
        Relationships: []
      }
      // A pond is an instance of the shell (#312, migration 0018). One person may
      // have several and nothing crosses between them. `last_page_id` serves
      // `s6m6`: "the page you left stays open for when you come back."
      // There is deliberately NO delete policy on this table — deleting a pond is
      // unresolved on #312 — so there is no Delete shape here either.
      ponds: {
        Row: {
          id: string
          user_id: string
          name: string
          glyph: string | null
          theme: PondTheme
          order: number
          last_page_id: string | null
          /** The last 8 distinct glyphs picked in this pond, newest first. */
          recent_glyphs: string[]
          /** 0035: this pond's favourited page ids, in band order. NULL = none. */
          favourite_page_ids: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name?: string
          glyph?: string | null
          theme?: PondTheme
          order?: number
          last_page_id?: string | null
          recent_glyphs?: string[]
          favourite_page_ids?: string[] | null
        }
        Update: {
          name?: string
          glyph?: string | null
          theme?: PondTheme
          order?: number
          last_page_id?: string | null
          recent_glyphs?: string[]
          favourite_page_ids?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      pages: {
        Row: {
          id: string
          user_id: string
          /** 0018: the pond this row belongs to. NULLABLE until #318's children
           *  make every insert supply it; see #314. */
          pond_id: string | null
          parent_id: string | null
          type: NodeType
          title: string
          blocks: Json
          embedding: number[] | null
          status: string | null
          props: Json
          order: number
          workspace: Workspace
          /** Explicit glyph name; null = automatic (an area's from its title, a page's kind dot). */
          glyph: string | null
          /** An area's colour ROLE (area-a|b|c); null = ink. Areas only. */
          area_role: string | null
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          pond_id?: string | null
          parent_id?: string | null
          type?: NodeType
          title?: string
          blocks?: Json
          embedding?: number[] | null
          status?: string | null
          props?: Json
          order?: number
          workspace?: Workspace
          glyph?: string | null
          area_role?: string | null
        }
        Update: {
          parent_id?: string | null
          type?: NodeType
          title?: string
          blocks?: Json
          embedding?: number[] | null
          status?: string | null
          props?: Json
          order?: number
          workspace?: Workspace
          glyph?: string | null
          area_role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          /** 0018: see pages.pond_id. */
          pond_id: string | null
          id: string
          user_id: string
          transcript: Json
          workspace: Workspace
          created_at: string
          dissolved_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          pond_id?: string | null
          transcript?: Json
          workspace?: Workspace
        }
        Update: {
          transcript?: Json
          pond_id?: string | null
          workspace?: Workspace
          dissolved_at?: string
        }
        Relationships: []
      }
      // The durable change log (#102, migration 0011). One row = one diff:
      // before/after + one of eight statuses, scoped per pond (user + workspace).
      // ONLY GROWS — there is no Delete shape here on purpose, and the table's
      // trigger + RLS refuse deletes outright. `Update` is narrowed to the three
      // columns an advance touches, plus the single permitted content mutation
      // (redacting a deleted memory note's before/after to null).
      // Read/write it through src/lib/change-log/store.ts, never inline.
      change_log: {
        Row: {
          /** 0018: see pages.pond_id. Not in the append-only trigger's frozen
           *  list yet — freezing it belongs to the migration that sets NOT NULL. */
          pond_id: string | null
          id: string
          user_id: string
          workspace: Workspace
          status: string
          action: string
          actor: string
          target_page_id: string | null
          target_block_id: string | null
          before: Json
          after: Json
          source_thread_id: string | null
          tool_call_id: string | null
          read: Json
          links: Json
          transitions: Json
          created_at: string
          status_at: string
        }
        Insert: {
          id?: string
          pond_id?: string | null
          user_id: string
          workspace?: Workspace
          status: string
          action: string
          actor?: string
          target_page_id?: string | null
          target_block_id?: string | null
          before?: Json
          after?: Json
          source_thread_id?: string | null
          tool_call_id?: string | null
          read?: Json
          links?: Json
          transitions?: Json
        }
        Update: {
          status?: string
          status_at?: string
          transitions?: Json
          /** Redaction only — may be set to null, never to other content. */
          before?: null
          /** Redaction only — may be set to null, never to other content. */
          after?: null
        }
        Relationships: []
      }
      // The template store (#154, migration 0016). One row = one saved shape,
      // scoped per pond (user + workspace). A template is a shape you copy,
      // never a tie: no FK from pages, nothing cascades into pages. `kind` is
      // the twelve-label vocabulary (TEMPLATE_KINDS in src/lib/templates/types.ts),
      // `origin` is 'premade' | 'yours'. Read/write it through
      // src/lib/templates/client.ts, never inline.
      templates: {
        Row: {
          id: string
          user_id: string
          /** 0018: see pages.pond_id. */
          pond_id: string | null
          workspace: Workspace
          name: string
          kind: string
          blocks: Json
          origin: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          pond_id?: string | null
          workspace?: Workspace
          name: string
          kind: string
          blocks?: Json
          origin: string
        }
        Update: {
          name?: string
          kind?: string
          blocks?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    // `Views` and each table's `Relationships` must exist for postgrest-js to
    // accept this as a schema; without them every query and RPC types as `never`.
    Views: Record<never, never>
    // Migration 0021. Each returns the records it inserted, in the order applied.
    Functions: {
      undo_change_log_record: {
        Args: { p_record_ids: string[]; p_pond_id: string; p_actor?: string }
        Returns: Database['public']['Tables']['change_log']['Row'][]
      }
      redo_change_log_record: {
        Args: { p_record_ids: string[]; p_pond_id: string; p_actor?: string }
        Returns: Database['public']['Tables']['change_log']['Row'][]
      }
      mark_first_run_done: {
        Args: Record<string, never>
        Returns: void
      }
    }
  }
}
