// Auto-generated types for Supabase tables
// Run: npx supabase gen types typescript --project-id dseyuaoarfrkihzujutz > src/lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      test: {
        Row: {
          id: string
          message: string
          created_at: string
        }
        Insert: {
          id?: string
          message: string
          created_at?: string
        }
        Update: {
          id?: string
          message?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}












