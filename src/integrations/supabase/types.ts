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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      clients: {
        Row: {
          address: string | null
          architect_name: string | null
          city: string | null
          created_at: string
          created_by: string
          id: string
          lat: number | null
          lng: number | null
          mobile: string
          name: string
          notes: string | null
          partner_id: string | null
          project_status: string | null
          secondary_owner_id: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          architect_name?: string | null
          city?: string | null
          created_at?: string
          created_by: string
          id?: string
          lat?: number | null
          lng?: number | null
          mobile: string
          name: string
          notes?: string | null
          partner_id?: string | null
          project_status?: string | null
          secondary_owner_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          architect_name?: string | null
          city?: string | null
          created_at?: string
          created_by?: string
          id?: string
          lat?: number | null
          lng?: number | null
          mobile?: string
          name?: string
          notes?: string | null
          partner_id?: string | null
          project_status?: string | null
          secondary_owner_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_secondary_owner_id_fkey"
            columns: ["secondary_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conveyance_records: {
        Row: {
          amount: number
          created_at: string
          date: string
          distance_km: number
          from_lat: number
          from_lng: number
          from_location_name: string | null
          id: string
          rate_per_km: number
          to_lat: number
          to_lng: number
          to_location_name: string | null
          user_id: string
          vehicle_type: string
          visit_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          distance_km: number
          from_lat: number
          from_lng: number
          from_location_name?: string | null
          id?: string
          rate_per_km: number
          to_lat: number
          to_lng: number
          to_location_name?: string | null
          user_id: string
          vehicle_type: string
          visit_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          distance_km?: number
          from_lat?: number
          from_lng?: number
          from_location_name?: string | null
          id?: string
          rate_per_km?: number
          to_lat?: number
          to_lng?: number
          to_location_name?: string | null
          user_id?: string
          vehicle_type?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conveyance_records_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      conveyance_settings: {
        Row: {
          created_at: string
          id: string
          rate_per_km: number
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          rate_per_km: number
          updated_at?: string
          vehicle_type: string
        }
        Update: {
          created_at?: string
          id?: string
          rate_per_km?: number
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      daily_attendance: {
        Row: {
          check_in_lat: number
          check_in_lng: number
          created_at: string
          date: string
          id: string
          user_id: string
        }
        Insert: {
          check_in_lat: number
          check_in_lng: number
          created_at?: string
          date?: string
          id?: string
          user_id: string
        }
        Update: {
          check_in_lat?: number
          check_in_lng?: number
          created_at?: string
          date?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      live_locations: {
        Row: {
          lat: number
          lng: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          lat: number
          lng: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          lat?: number
          lng?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      location_history: {
        Row: {
          id: string
          lat: number
          lng: number
          timestamp: string
          user_id: string
        }
        Insert: {
          id?: string
          lat: number
          lng: number
          timestamp?: string
          user_id: string
        }
        Update: {
          id?: string
          lat?: number
          lng?: number
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      master_work_types: {
        Row: {
          id: string
          sub_work: string
          type_of_work: string
        }
        Insert: {
          id: string
          sub_work: string
          type_of_work: string
        }
        Update: {
          id?: string
          sub_work?: string
          type_of_work?: string
        }
        Relationships: []
      }
      monthly_champions: {
        Row: {
          avatar_url: string | null
          category: string
          created_at: string
          full_name: string
          id: string
          month: string
          role: string | null
          score: number
          showroom_id: string | null
          showroom_name: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          category: string
          created_at?: string
          full_name: string
          id?: string
          month: string
          role?: string | null
          score?: number
          showroom_id?: string | null
          showroom_name?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          category?: string
          created_at?: string
          full_name?: string
          id?: string
          month?: string
          role?: string | null
          score?: number
          showroom_id?: string | null
          showroom_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_champions_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_champions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      partners: {
        Row: {
          address: string | null
          city: string | null
          company_name: string | null
          created_at: string
          created_by: string
          id: string
          mobile: string
          name: string
          secondary_owner_id: string | null
          type: Database["public"]["Enums"]["partner_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          created_by: string
          id?: string
          mobile: string
          name: string
          secondary_owner_id?: string | null
          type: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string
          id?: string
          mobile?: string
          name?: string
          secondary_owner_id?: string | null
          type?: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_secondary_owner_id_fkey"
            columns: ["secondary_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          conveyance_rate: number | null
          conveyance_type: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          conveyance_rate?: number | null
          conveyance_type?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          conveyance_rate?: number | null
          conveyance_type?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purpose_masters: {
        Row: {
          created_at: string
          entity_type: Database["public"]["Enums"]["visit_with_type"]
          id: string
          is_active: boolean | null
          purpose_name: string
        }
        Insert: {
          created_at?: string
          entity_type: Database["public"]["Enums"]["visit_with_type"]
          id?: string
          is_active?: boolean | null
          purpose_name: string
        }
        Update: {
          created_at?: string
          entity_type?: Database["public"]["Enums"]["visit_with_type"]
          id?: string
          is_active?: boolean | null
          purpose_name?: string
        }
        Relationships: []
      }
      scheduled_notifications: {
        Row: {
          body: string
          created_at: string
          error_message: string | null
          id: string
          recurrence: string
          scheduled_for: string
          status: string | null
          target_id: string | null
          target_type: string
          target_url: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          error_message?: string | null
          id?: string
          recurrence?: string
          scheduled_for: string
          status?: string | null
          target_id?: string | null
          target_type: string
          target_url?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          error_message?: string | null
          id?: string
          recurrence?: string
          scheduled_for?: string
          status?: string | null
          target_id?: string | null
          target_type?: string
          target_url?: string | null
          title?: string
        }
        Relationships: []
      }
      showrooms: {
        Row: {
          city: string
          created_at: string
          id: string
          name: string
          whatsapp_group_id: string | null
          whatsapp_planning_enabled: boolean
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          name: string
          whatsapp_group_id?: string | null
          whatsapp_planning_enabled?: boolean
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          name?: string
          whatsapp_group_id?: string | null
          whatsapp_planning_enabled?: boolean
        }
        Relationships: []
      }
      whatshub_message_logs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string
          message_type: string
          recipient_count: number
          showroom_id: string | null
          status: string
          success_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          message_type: string
          recipient_count?: number
          showroom_id?: string | null
          status: string
          success_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          message_type?: string
          recipient_count?: number
          showroom_id?: string | null
          status?: string
          success_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatshub_message_logs_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fcm_tokens: {
        Row: {
          created_at: string | null
          device_platform: string | null
          id: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_platform?: string | null
          id?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_platform?: string | null
          id?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          reports_to: string | null
          role: Database["public"]["Enums"]["app_role"]
          showroom_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          reports_to?: string | null
          role: Database["public"]["Enums"]["app_role"]
          showroom_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          reports_to?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          showroom_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          address: string | null
          check_in_at: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          client_id: string | null
          created_at: string
          created_by: string
          done_at: string | null
          gps_latitude: number | null
          gps_longitude: number | null
          id: string
          partner_id: string | null
          photo_url: string | null
          planning_date: string | null
          pooled_with_user_id: string | null
          purpose: string
          purpose_id: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["visit_status"]
          tat_due_date: string | null
          travel_mode: string | null
          updated_at: string
          visit_date: string
          visit_with_type: Database["public"]["Enums"]["visit_with_type"]
        }
        Insert: {
          address?: string | null
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          client_id?: string | null
          created_at?: string
          created_by: string
          done_at?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          partner_id?: string | null
          photo_url?: string | null
          planning_date?: string | null
          pooled_with_user_id?: string | null
          purpose: string
          purpose_id?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          tat_due_date?: string | null
          travel_mode?: string | null
          updated_at?: string
          visit_date: string
          visit_with_type: Database["public"]["Enums"]["visit_with_type"]
        }
        Update: {
          address?: string | null
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          done_at?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          partner_id?: string | null
          photo_url?: string | null
          planning_date?: string | null
          pooled_with_user_id?: string | null
          purpose?: string
          purpose_id?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          tat_due_date?: string | null
          travel_mode?: string | null
          updated_at?: string
          visit_date?: string
          visit_with_type?: Database["public"]["Enums"]["visit_with_type"]
        }
        Relationships: [
          {
            foreignKeyName: "visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_purpose_id_fkey"
            columns: ["purpose_id"]
            isOneToOne: false
            referencedRelation: "purpose_masters"
            referencedColumns: ["id"]
          },
        ]
      }
      wos_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: string
          old_status: string | null
          reason: string | null
          work_scope_item_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: string
          old_status?: string | null
          reason?: string | null
          work_scope_item_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: string
          old_status?: string | null
          reason?: string | null
          work_scope_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wos_status_history_work_scope_item_id_fkey"
            columns: ["work_scope_item_id"]
            isOneToOne: false
            referencedRelation: "work_scope_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_scope_items: {
        Row: {
          amount_in_lac: number | null
          client_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_verified: boolean
          last_status_change_reason: string | null
          quantity: number | null
          submitted_at: string | null
          verification_reason: string | null
          verification_remarks: string | null
          verified_amount: number | null
          verified_at: string | null
          verified_by: string | null
          work_status: Database["public"]["Enums"]["work_status"]
          work_type_id: string
        }
        Insert: {
          amount_in_lac?: number | null
          client_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_verified?: boolean
          last_status_change_reason?: string | null
          quantity?: number | null
          submitted_at?: string | null
          verification_reason?: string | null
          verification_remarks?: string | null
          verified_amount?: number | null
          verified_at?: string | null
          verified_by?: string | null
          work_status?: Database["public"]["Enums"]["work_status"]
          work_type_id: string
        }
        Update: {
          amount_in_lac?: number | null
          client_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_verified?: boolean
          last_status_change_reason?: string | null
          quantity?: number | null
          submitted_at?: string | null
          verification_reason?: string | null
          verification_remarks?: string | null
          verified_amount?: number | null
          verified_at?: string | null
          verified_by?: string | null
          work_status?: Database["public"]["Enums"]["work_status"]
          work_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_scope_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_scope_items_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "master_work_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accountant_can_view_conveyance: {
        Args: { record_user_id: string }
        Returns: boolean
      }
      check_and_trigger_attendance_alerts: {
        Args: { is_start_day: boolean }
        Returns: undefined
      }
      check_and_trigger_daily_alerts: { Args: never; Returns: undefined }
      check_and_trigger_weekly_alerts: { Args: never; Returns: undefined }
      get_showroom_leaderboard: {
        Args: { p_showroom_id: string }
        Returns: {
          full_name: string
          role: string
          user_id: string
          visits_count: number
          wos_count: number
          wos_won_total: number
        }[]
      }
      get_assignable_users: {
        Args: never
        Returns: {
          full_name: string
          role: string
          showroom_id: string | null
          user_id: string
        }[]
      }
      get_wos_status_history: {
        Args: { p_work_scope_item_id: string }
        Returns: {
          changed_at: string
          changed_by_name: string
          id: string
          new_status: string
          old_status: string | null
          reason: string | null
        }[]
      }
      get_user_showroom_id: { Args: { _user_id: string }; Returns: string }
      get_user_showroom_ids: {
        Args: { _user_id: string }
        Returns: {
          showroom_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      in_same_showroom: {
        Args: { _target_user_id: string; _user_id: string }
        Returns: boolean
      }
      process_scheduled_notifications: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "executive"
        | "md"
        | "accountant"
        | "tl"
        | "backhand_executive"
      client_status: "new" | "hot" | "converted" | "lost"
      partner_type: "builder" | "architect" | "self"
      visit_status: "planned" | "done" | "cancelled"
      visit_with_type: "client" | "partner" | "home" | "hotel" | "showroom"
      work_status:
        | "pending"
        | "won"
        | "lost"
        | "submitted"
        | "draft"
        | "rejected"
        | "hold"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "admin",
        "manager",
        "executive",
        "md",
        "accountant",
        "tl",
        "backhand_executive",
      ],
      client_status: ["new", "hot", "converted", "lost"],
      partner_type: ["builder", "architect", "self"],
      visit_status: ["planned", "done", "cancelled"],
      visit_with_type: ["client", "partner", "home", "hotel", "showroom"],
      work_status: [
        "pending",
        "won",
        "lost",
        "submitted",
        "draft",
        "rejected",
        "hold",
      ],
    },
  },
} as const
