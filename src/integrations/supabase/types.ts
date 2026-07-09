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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attributes: {
        Row: {
          created_at: string
          data_type: Database["public"]["Enums"]["attribute_type"]
          description: string | null
          id: string
          key: string
          label: string
          tags: Database["public"]["Enums"]["service_tag"][]
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_type?: Database["public"]["Enums"]["attribute_type"]
          description?: string | null
          id?: string
          key: string
          label: string
          tags?: Database["public"]["Enums"]["service_tag"][]
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_type?: Database["public"]["Enums"]["attribute_type"]
          description?: string | null
          id?: string
          key?: string
          label?: string
          tags?: Database["public"]["Enums"]["service_tag"][]
          updated_at?: string
        }
        Relationships: []
      }
      content_assets: {
        Row: {
          body: string
          category: string | null
          created_at: string
          file_name: string | null
          file_path: string | null
          id: string
          kind: string
          mime_type: string | null
          order_index: number
          published: boolean
          tags: Database["public"]["Enums"]["service_tag"][]
          thumbnail_url: string | null
          title: string
          topic_tags: string[]
          updated_at: string
          url: string | null
        }
        Insert: {
          body?: string
          category?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          order_index?: number
          published?: boolean
          tags?: Database["public"]["Enums"]["service_tag"][]
          thumbnail_url?: string | null
          title: string
          topic_tags?: string[]
          updated_at?: string
          url?: string | null
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          order_index?: number
          published?: boolean
          tags?: Database["public"]["Enums"]["service_tag"][]
          thumbnail_url?: string | null
          title?: string
          topic_tags?: string[]
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      detected_attributes: {
        Row: {
          created_at: string
          data_type: Database["public"]["Enums"]["attribute_type"]
          description: string | null
          id: string
          key: string
          label: string
          status: string
          template_id: string | null
        }
        Insert: {
          created_at?: string
          data_type?: Database["public"]["Enums"]["attribute_type"]
          description?: string | null
          id?: string
          key: string
          label: string
          status?: string
          template_id?: string | null
        }
        Update: {
          created_at?: string
          data_type?: Database["public"]["Enums"]["attribute_type"]
          description?: string | null
          id?: string
          key?: string
          label?: string
          status?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "detected_attributes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_signals: {
        Row: {
          active: boolean
          category: string
          created_at: string
          help_text: string | null
          id: string
          input_type: string
          key: string
          label: string
          options: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          help_text?: string | null
          id?: string
          input_type?: string
          key: string
          label: string
          options?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          help_text?: string | null
          id?: string
          input_type?: string
          key?: string
          label?: string
          options?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      question_kb_assets: {
        Row: {
          created_at: string
          file_path: string | null
          filename: string | null
          id: string
          kind: string
          mime_type: string | null
          notes: string | null
          question_id: string
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          filename?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          notes?: string | null
          question_id: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string | null
          filename?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          notes?: string | null
          question_id?: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_kb_assets_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_set_versions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          published_at: string | null
          snapshot: Json
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          published_at?: string | null
          snapshot?: Json
          status?: string
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          published_at?: string | null
          snapshot?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      questions: {
        Row: {
          attribute_id: string | null
          created_at: string
          help_text: string | null
          how_to_answer: string | null
          id: string
          input_type: Database["public"]["Enums"]["question_input_type"]
          options: Json
          prompt: string
          required: boolean
          routing: Json
          sort_order: number
          tags: Database["public"]["Enums"]["service_tag"][]
          updated_at: string
          why_we_ask: string | null
        }
        Insert: {
          attribute_id?: string | null
          created_at?: string
          help_text?: string | null
          how_to_answer?: string | null
          id?: string
          input_type?: Database["public"]["Enums"]["question_input_type"]
          options?: Json
          prompt: string
          required?: boolean
          routing?: Json
          sort_order?: number
          tags?: Database["public"]["Enums"]["service_tag"][]
          updated_at?: string
          why_we_ask?: string | null
        }
        Update: {
          attribute_id?: string | null
          created_at?: string
          help_text?: string | null
          how_to_answer?: string | null
          id?: string
          input_type?: Database["public"]["Enums"]["question_input_type"]
          options?: Json
          prompt?: string
          required?: boolean
          routing?: Json
          sort_order?: number
          tags?: Database["public"]["Enums"]["service_tag"][]
          updated_at?: string
          why_we_ask?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_rule_versions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          published_at: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          published_at?: string
          snapshot: Json
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          published_at?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: []
      }
      recommendation_rules: {
        Row: {
          active: boolean
          conditions: Json
          created_at: string
          description: string | null
          document: string | null
          flag: string
          id: string
          min_matches: number | null
          name: string
          priority: number
          reason: string | null
          recommends: Database["public"]["Enums"]["service_tag"][]
          rule_type: string
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          conditions?: Json
          created_at?: string
          description?: string | null
          document?: string | null
          flag?: string
          id?: string
          min_matches?: number | null
          name: string
          priority?: number
          reason?: string | null
          recommends?: Database["public"]["Enums"]["service_tag"][]
          rule_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          conditions?: Json
          created_at?: string
          description?: string | null
          document?: string | null
          flag?: string
          id?: string
          min_matches?: number | null
          name?: string
          priority?: number
          reason?: string | null
          recommends?: Database["public"]["Enums"]["service_tag"][]
          rule_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      template_families: {
        Row: {
          created_at: string
          description: string | null
          id: string
          jurisdiction: string | null
          name: string
          service_tag: Database["public"]["Enums"]["service_tag"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          name: string
          service_tag: Database["public"]["Enums"]["service_tag"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          name?: string
          service_tag?: Database["public"]["Enums"]["service_tag"]
          updated_at?: string
        }
        Relationships: []
      }
      template_selection_rules: {
        Row: {
          active: boolean
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_fallback: boolean
          name: string
          priority: number
          service_tag: Database["public"]["Enums"]["service_tag"]
          template_family_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_fallback?: boolean
          name: string
          priority?: number
          service_tag: Database["public"]["Enums"]["service_tag"]
          template_family_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_fallback?: boolean
          name?: string
          priority?: number
          service_tag?: Database["public"]["Enums"]["service_tag"]
          template_family_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_selection_rules_template_family_id_fkey"
            columns: ["template_family_id"]
            isOneToOne: false
            referencedRelation: "template_families"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body: string
          created_at: string
          description: string | null
          family_id: string | null
          id: string
          merge_fields: Json
          name: string
          published: boolean
          source_file_path: string | null
          status: string
          tags: Database["public"]["Enums"]["service_tag"][]
          updated_at: string
          version: number
          version_notes: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          description?: string | null
          family_id?: string | null
          id?: string
          merge_fields?: Json
          name: string
          published?: boolean
          source_file_path?: string | null
          status?: string
          tags?: Database["public"]["Enums"]["service_tag"][]
          updated_at?: string
          version?: number
          version_notes?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          description?: string | null
          family_id?: string | null
          id?: string
          merge_fields?: Json
          name?: string
          published?: boolean
          source_file_path?: string | null
          status?: string
          tags?: Database["public"]["Enums"]["service_tag"][]
          updated_at?: string
          version?: number
          version_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "template_families"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string | null
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
      attribute_type:
        | "text"
        | "number"
        | "date"
        | "boolean"
        | "select"
        | "multiselect"
        | "address"
        | "json"
      question_input_type:
        | "short_text"
        | "long_text"
        | "number"
        | "date"
        | "select"
        | "multiselect"
        | "boolean"
        | "address"
        | "document_upload"
        | "voice_input"
      service_tag: "common" | "will" | "trust" | "poa" | "healthcare" | "bundle"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attribute_type: [
        "text",
        "number",
        "date",
        "boolean",
        "select",
        "multiselect",
        "address",
        "json",
      ],
      question_input_type: [
        "short_text",
        "long_text",
        "number",
        "date",
        "select",
        "multiselect",
        "boolean",
        "address",
        "document_upload",
        "voice_input",
      ],
      service_tag: ["common", "will", "trust", "poa", "healthcare", "bundle"],
    },
  },
} as const
