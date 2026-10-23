export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      competitors: {
        Row: {
          blog_url: string | null
          changelog_url: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          blog_url?: string | null
          changelog_url: string
          created_at?: string
          id: string
          name: string
        }
        Update: {
          blog_url?: string | null
          changelog_url?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          competitor_id: string
          confidence: number
          feature_id: string | null
          id: string
          idempotency_key: string
          entry_date: string | null
          title: string
          description: string
          run_id: string | null
          test_case: string | null
          matched_via: string | null
          raw_feature_name: string
          reason: string
          retrieved_at: string
          source_type: string
          source_url: string
          status: string
          verify_status: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          competitor_id: string
          confidence?: number
          feature_id?: string | null
          id?: string
          idempotency_key: string
          entry_date?: string | null
          title: string
          description?: string
          run_id?: string | null
          test_case?: string | null
          matched_via?: string | null
          raw_feature_name: string
          reason: string
          retrieved_at?: string
          source_type: string
          source_url: string
          status: string
          verify_status?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          competitor_id?: string
          confidence?: number
          feature_id?: string | null
          id?: string
          idempotency_key?: string
          entry_date?: string | null
          title?: string
          description?: string
          run_id?: string | null
          test_case?: string | null
          matched_via?: string | null
          raw_feature_name?: string
          reason?: string
          retrieved_at?: string
          source_type?: string
          source_url?: string
          status?: string
          verify_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          aliases: string[]
          created_at: string
          id: string
          standard_name: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          id: string
          standard_name: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          id?: string
          standard_name?: string
        }
        Relationships: []
      }
      runs: {
        Row: {
          diff_summary: Json
          id: string
          run_date: string
          status: string
        }
        Insert: {
          diff_summary?: Json
          id?: string
          run_date?: string
          status?: string
        }
        Update: {
          diff_summary?: Json
          id?: string
          run_date?: string
          status?: string
        }
        Relationships: []
      }
      test_results: {
        Row: {
          actual_result: string | null
          execution_status: string
          evidence: string | null
          expected_result: string
          id: string
          input_url: string
          passed: boolean
          scenario: string
          updated_at: string
        }
        Insert: {
          actual_result?: string | null
          execution_status?: string
          evidence?: string | null
          expected_result: string
          id: string
          input_url: string
          passed?: boolean
          scenario: string
          updated_at?: string
        }
        Update: {
          actual_result?: string | null
          execution_status?: string
          evidence?: string | null
          expected_result?: string
          id?: string
          input_url?: string
          passed?: boolean
          scenario?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_weekly_digest: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          competitor_name: string | null
          confidence: number | null
          display_feature_name: string | null
          entry_date: string | null
          description: string | null
          id: string | null
          matched_via: string | null
          mapped_feature_id: string | null
          run_id: string | null
          raw_feature_name: string | null
          test_case: string | null
          title: string | null
          reason: string | null
          retrieved_at: string | null
          source_type: string | null
          source_url: string | null
          status: string | null
          verify_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_feature_id_fkey"
            columns: ["mapped_feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
        ]
      }
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
