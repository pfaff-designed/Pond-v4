// Auto-generate the full version with: npx supabase gen types typescript --linked
// This is a hand-authored minimal version for bootstrapping.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// A page's type tag in the unified page tree. 'page' is the generic default;
// the others are carried over from the pre-unification node kinds.
export type NodeType = 'area' | 'routine' | 'project' | 'action' | 'page'

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
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          transcript: Json
          created_at: string
          dissolved_at: string | null
        }
        Insert: { id?: string; user_id: string; transcript?: Json }
        Update: { transcript?: Json; dissolved_at?: string }
      }
    }
  }
}
