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
// is filtered out of the ['pages'] tree (rail / overview) and surfaced only
// through a collection's views (#19).
export type NodeType = 'routine' | 'project' | 'action' | 'page' | 'home' | 'row'

// The workspace scope discriminator (ticket-43). 'main' is the real workspace;
// 'sandbox' is the isolated orchestrator/user testing scope.
export type Workspace = 'main' | 'sandbox'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: { id: string; email: string; created_at: string }
        Insert: { id: string; email: string; created_at?: string }
        Update: { email?: string }
      }
      pages: {
        Row: {
          id: string
          user_id: string
          parent_id: string | null
          type: NodeType
          title: string
          blocks: Json
          embedding: number[] | null
          status: string | null
          props: Json
          order: number
          workspace: Workspace
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          parent_id?: string | null
          type?: NodeType
          title?: string
          blocks?: Json
          embedding?: number[] | null
          status?: string | null
          props?: Json
          order?: number
          workspace?: Workspace
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
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          transcript: Json
          workspace: Workspace
          created_at: string
          dissolved_at: string | null
        }
        Insert: { id?: string; user_id: string; transcript?: Json; workspace?: Workspace }
        Update: { transcript?: Json; workspace?: Workspace; dissolved_at?: string }
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
      }
    }
  }
}
