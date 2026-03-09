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
      audit_logs: {
        Row: {
          action: string
          changed_by: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          timestamp: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          timestamp?: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          timestamp?: string
        }
        Relationships: []
      }
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
          id: string
          user_id: string
          visit_id: string | null
          date: string
          from_location_name: string | null
          from_lat: number | null
          from_lng: number | null
          to_location_name: string | null
          to_lat: number | null
          to_lng: number | null
          distance_km: number | null
          vehicle_type: string | null
          rate_per_km: number | null
          amount: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          visit_id?: string | null
          date: string
          from_location_name?: string | null
          from_lat?: number | null
          from_lng?: number | null
          to_location_name?: string | null
          to_lat?: number | null
          to_lng?: number | null
          distance_km?: number | null
          vehicle_type?: string | null
          rate_per_km?: number | null
          amount?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          visit_id?: string | null
          date?: string
          from_location_name?: string | null
          from_lat?: number | null
          from_lng?: number | null
          to_location_name?: string | null
          to_lat?: number | null
          to_lng?: number | null
          distance_km?: number | null
          vehicle_type?: string | null
          rate_per_km?: number | null
          amount?: number | null
          created_at?: string
        }
        Relationships: []
      }
      daily_attendance: {
        Row: {
          id: string
          user_id: string
          date: string
          check_in_lat: number | null
          check_in_lng: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          check_in_lat?: number | null
          check_in_lng?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          check_in_lat?: number | null
          check_in_lng?: number | null
          created_at?: string
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
          type?: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
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
      profiles: {
        Row: {
          conveyance_rate: number | null
          conveyance_type: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conveyance_rate?: number | null
          conveyance_type?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conveyance_rate?: number | null
          conveyance_type?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
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
          purpose: string
          purpose_id: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["visit_status"]
          tat_due_date: string | null
          travel_mode: string | null
          pooled_with_user_id: string | null
          updated_at: string
          visit_date: string
          visit_with_type: Database["public"]["Enums"]["visit_with_type"]
        }
        Insert: {
          address?: string | null
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
          purpose: string
          purpose_id?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          tat_due_date?: string | null
          travel_mode?: string | null
          pooled_with_user_id?: string | null
          updated_at?: string
          visit_date: string
          visit_with_type: Database["public"]["Enums"]["visit_with_type"]
        }
        Update: {
          address?: string | null
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
          purpose?: string
          purpose_id?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          tat_due_date?: string | null
          travel_mode?: string | null
          pooled_with_user_id?: string | null
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
      app_role: "admin" | "manager" | "executive" | "md"
      client_status: "new" | "hot" | "converted" | "lost"
      partner_type: "builder" | "architect"
      visit_status: "planned" | "in_progress" | "done" | "missed" | "rescheduled" | "cancelled"
      visit_with_type: "client" | "partner"
      work_status: "draft" | "submitted" | "pending" | "won" | "lost" | "rejected"
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
      app_role: ["admin", "manager", "executive", "md"],
      client_status: ["new", "hot", "converted", "lost"],
      partner_type: ["builder", "architect"],
      visit_status: ["planned", "in_progress", "done", "missed", "rescheduled", "cancelled"],
      visit_with_type: ["client", "partner"],
      work_status: ["draft", "submitted", "pending", "won", "lost", "rejected"],
    },
  },
} as const
