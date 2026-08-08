// Auto-generate the full version with: npx supabase gen types typescript --linked
// This is a hand-authored minimal version for bootstrapping.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type NodeType = 'area' | 'routine' | 'project' | 'action' | 'page'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: { id: string; email: string; created_at: string }
        Insert: { id: string; email: string; created_at?: string }
        Update: { email?: string }
      }
      areas: {
        Row: { id: string; user_id: string; name: string; order: number; created_at: string }
        Insert: { id?: string; user_id: string; name: string; order?: number }
        Update: { name?: string; order?: number }
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
      routines: {
        Row: {
          id: string
          area_id: string
          user_id: string
          name: string
          cadence: Json
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          area_id: string
          user_id: string
          name: string
          cadence?: Json
          order?: number
        }
        Update: { name?: string; cadence?: Json; order?: number }
      }
      projects: {
        Row: {
          id: string
          area_id: string
          user_id: string
          title: string
          description: string | null
          status: 'active' | 'paused' | 'completed'
          due_date: string | null
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          area_id: string
          user_id: string
          title: string
          description?: string
          status?: 'active' | 'paused' | 'completed'
          due_date?: string
          order?: number
        }
        Update: {
          title?: string
          description?: string
          status?: 'active' | 'paused' | 'completed'
          due_date?: string
          order?: number
        }
      }
      actions: {
        Row: {
          id: string
          user_id: string
          parent_id: string | null
          parent_type: 'routine' | 'project' | 'action' | null
          area_id: string | null
          project_id: string | null
          title: string
          type: 'task' | 'event'
          status: 'open' | 'done'
          due_at: string | null
          scheduled_at: string | null
          duration_minutes: number | null
          resource_tags: string[]
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          type?: 'task' | 'event'
          parent_id?: string
          parent_type?: 'routine' | 'project' | 'action'
          area_id?: string
          project_id?: string
          status?: 'open' | 'done'
          due_at?: string
          scheduled_at?: string
          duration_minutes?: number
          resource_tags?: string[]
          order?: number
        }
        Update: {
          title?: string
          type?: 'task' | 'event'
          status?: 'open' | 'done'
          due_at?: string
          scheduled_at?: string
          duration_minutes?: number
          resource_tags?: string[]
          order?: number
        }
      }
      documents: {
        Row: {
          id: string
          user_id: string
          node_id: string | null
          node_type: NodeType | null
          title: string
          blocks: Json
          embedding: number[] | null
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          node_id?: string
          node_type?: NodeType
          title?: string
          blocks?: Json
          embedding?: number[]
        }
        Update: {
          node_id?: string
          node_type?: NodeType
          title?: string
          blocks?: Json
          embedding?: number[]
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
