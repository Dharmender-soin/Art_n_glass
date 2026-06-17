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
  public: {
    Tables: {
      clients: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          created_by: string
          id: string
          mobile: string
          name: string
          notes: string | null
          partner_id: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by: string
          id?: string
          mobile: string
          name: string
          notes?: string | null
          partner_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string
          id?: string
          mobile?: string
          name?: string
          notes?: string | null
          partner_id?: string | null
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
          id: string
          vehicle_type: string
          rate_per_km: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vehicle_type: string
          rate_per_km: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vehicle_type?: string
          rate_per_km?: number
          created_at?: string
          updated_at?: string
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
          showroom_id: string | null
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
          showroom_id?: string | null
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
          showroom_id?: string | null
          type?: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
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
      showrooms: {
        Row: {
          city: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          showroom_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          showroom_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
      work_scope_items: {
        Row: {
          amount_in_lac: number | null
          client_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_verified: boolean
          quantity: number | null
          submitted_at: string | null
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
          quantity?: number | null
          submitted_at?: string | null
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
          quantity?: number | null
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
      get_showroom_leaderboard: {
        Args: { p_showroom_id: string }
        Returns: {
          full_name: string
          user_id: string
          visits_count: number
          wos_count: number
          wos_won_total: number
        }[]
      }
      get_user_showroom_id: { Args: { _user_id: string }; Returns: string }
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
    }
    Enums: {
      app_role: "admin" | "manager" | "tl" | "executive" | "md" | "accountant" | "backhand_executive"
      client_status: "new" | "hot" | "converted" | "lost"
      partner_type: "builder" | "architect" | "self"
      visit_status: "planned" | "done" | "cancelled"
      visit_with_type: "client" | "partner"
      work_status:
        | "pending"
        | "won"
        | "lost"
        | "submitted"
        | "draft"
        | "rejected"
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
      app_role: ["admin", "manager", "tl", "executive", "md", "accountant", "backhand_executive"],
      client_status: ["new", "hot", "converted", "lost"],
      partner_type: ["builder", "architect", "self"],
      visit_status: ["planned", "done", "cancelled"],
      visit_with_type: ["client", "partner"],
      work_status: ["pending", "won", "lost", "submitted", "draft", "rejected"],
    },
  },
} as const
