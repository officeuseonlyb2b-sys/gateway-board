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
      app_master_state: {
        Row: {
          created_at: string
          data: Json
          id: string
          rev: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          id: string
          rev?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          rev?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      crm_employees: {
        Row: {
          created_at: string
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_events: {
        Row: {
          at: string | null
          created_at: string
          data: Json
          dedupe_key: string | null
          id: string
          query_id: string | null
        }
        Insert: {
          at?: string | null
          created_at?: string
          data: Json
          dedupe_key?: string | null
          id: string
          query_id?: string | null
        }
        Update: {
          at?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          id?: string
          query_id?: string | null
        }
        Relationships: []
      }
      crm_notifications: {
        Row: {
          category: string
          created_at: string
          dedupe_key: string | null
          href: string | null
          id: string
          kind: string
          message: string
          query_id: string | null
          read: boolean
          recipient_name: string | null
          recipient_user_id: string | null
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id: string
          kind?: string
          message: string
          query_id?: string | null
          read?: boolean
          recipient_name?: string | null
          recipient_user_id?: string | null
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id?: string
          kind?: string
          message?: string
          query_id?: string | null
          read?: boolean
          recipient_name?: string | null
          recipient_user_id?: string | null
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_queries: {
        Row: {
          created_at: string
          data: Json
          escalated_at: string | null
          id: string
          lost_reason: string | null
          next_action_due: string | null
          owner: string | null
          owner_user_id: string | null
          query_id: string | null
          reopened_at: string | null
          stage: string | null
          sub_stage: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          escalated_at?: string | null
          id: string
          lost_reason?: string | null
          next_action_due?: string | null
          owner?: string | null
          owner_user_id?: string | null
          query_id?: string | null
          reopened_at?: string | null
          stage?: string | null
          sub_stage?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          escalated_at?: string | null
          id?: string
          lost_reason?: string | null
          next_action_due?: string | null
          owner?: string | null
          owner_user_id?: string | null
          query_id?: string | null
          reopened_at?: string | null
          stage?: string | null
          sub_stage?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_tasks: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          completed_by: string | null
          created_at: string
          data: Json
          dedupe_key: string | null
          done: boolean
          followup_type: string | null
          id: string
          item_kind: string
          next_followup_at: string | null
          outcome: string | null
          owner: string | null
          owner_user_id: string | null
          purpose: string | null
          query_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_by?: string | null
          created_at?: string
          data: Json
          dedupe_key?: string | null
          done?: boolean
          followup_type?: string | null
          id: string
          item_kind?: string
          next_followup_at?: string | null
          outcome?: string | null
          owner?: string | null
          owner_user_id?: string | null
          purpose?: string | null
          query_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_by?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          done?: boolean
          followup_type?: string | null
          id?: string
          item_kind?: string
          next_followup_at?: string | null
          outcome?: string | null
          owner?: string | null
          owner_user_id?: string | null
          purpose?: string | null
          query_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      destination_cities: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      destination_tours: {
        Row: {
          city_id: string
          created_at: string
          description: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          city_id: string
          created_at?: string
          description?: string | null
          id: string
          title: string
          updated_at?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "destination_tours_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "destination_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_cities: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hotel_rates: {
        Row: {
          created_at: string
          cwb_rate: number | null
          cwb_rule_text: string | null
          dinner_rate: number | null
          double_rate: number
          extra_bed_rate: number
          extra_breakfast_rate: number | null
          id: string
          include_in_quote: boolean
          lunch_rate: number | null
          meal_plan: string
          newyear_date_from: string | null
          newyear_date_to: string | null
          newyear_supplement: number | null
          newyear_supplement_type: string | null
          quad_rate: number | null
          remarks: string | null
          room_id: string
          season_label: string
          single_rate: number
          updated_at: string
          validity_end: string
          validity_start: string
          xmas_date_from: string | null
          xmas_date_to: string | null
          xmas_supplement: number | null
          xmas_supplement_type: string | null
        }
        Insert: {
          created_at?: string
          cwb_rate?: number | null
          cwb_rule_text?: string | null
          dinner_rate?: number | null
          double_rate?: number
          extra_bed_rate?: number
          extra_breakfast_rate?: number | null
          id: string
          include_in_quote?: boolean
          lunch_rate?: number | null
          meal_plan: string
          newyear_date_from?: string | null
          newyear_date_to?: string | null
          newyear_supplement?: number | null
          newyear_supplement_type?: string | null
          quad_rate?: number | null
          remarks?: string | null
          room_id: string
          season_label?: string
          single_rate?: number
          updated_at?: string
          validity_end: string
          validity_start: string
          xmas_date_from?: string | null
          xmas_date_to?: string | null
          xmas_supplement?: number | null
          xmas_supplement_type?: string | null
        }
        Update: {
          created_at?: string
          cwb_rate?: number | null
          cwb_rule_text?: string | null
          dinner_rate?: number | null
          double_rate?: number
          extra_bed_rate?: number
          extra_breakfast_rate?: number | null
          id?: string
          include_in_quote?: boolean
          lunch_rate?: number | null
          meal_plan?: string
          newyear_date_from?: string | null
          newyear_date_to?: string | null
          newyear_supplement?: number | null
          newyear_supplement_type?: string | null
          quad_rate?: number | null
          remarks?: string | null
          room_id?: string
          season_label?: string
          single_rate?: number
          updated_at?: string
          validity_end?: string
          validity_start?: string
          xmas_date_from?: string | null
          xmas_date_to?: string | null
          xmas_supplement?: number | null
          xmas_supplement_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rates_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_rooms: {
        Row: {
          created_at: string
          hotel_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hotel_id: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hotel_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rooms_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          address: string
          blackout_ranges: Json
          city_id: string
          contact_name: string
          contact_phone: string
          created_at: string
          email: string
          has_pool: boolean
          has_wifi: boolean
          hotel_category: string
          hotel_type: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string
          blackout_ranges?: Json
          city_id: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          email?: string
          has_pool?: boolean
          has_wifi?: boolean
          hotel_category: string
          hotel_type?: string | null
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string
          blackout_ranges?: Json
          city_id?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          email?: string
          has_pool?: boolean
          has_wifi?: boolean
          hotel_category?: string
          hotel_type?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotels_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "hotel_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_hotel_cascade: { Args: { p_hotel_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_crm_query_number: { Args: never; Returns: string }
      save_hotel_bundle: {
        Args: { p_expected_updated_at?: string; p_hotel: Json; p_rooms: Json }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "staff"
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
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const
