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
      admin_password_requirements: {
        Row: {
          exempt_session_id: string | null
          requested_at: string | null
          required: boolean
          user_id: string
        }
        Insert: {
          exempt_session_id?: string | null
          requested_at?: string | null
          required?: boolean
          user_id: string
        }
        Update: {
          exempt_session_id?: string | null
          requested_at?: string | null
          required?: boolean
          user_id?: string
        }
        Relationships: []
      }
      agent_audit: {
        Row: {
          action: string
          channel: string
          created_at: string
          detail: Json
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          channel: string
          created_at?: string
          detail?: Json
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          channel?: string
          created_at?: string
          detail?: Json
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          category_id: string | null
          created_at: string
          dedup_key: string
          event_type: Database["public"]["Enums"]["analytics_event_type"]
          id: string
          marketplace_id: string | null
          path: string
          product_id: string | null
          referrer_host: string | null
          session_id: string
          share_channel: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          dedup_key: string
          event_type: Database["public"]["Enums"]["analytics_event_type"]
          id?: string
          marketplace_id?: string | null
          path?: string
          product_id?: string | null
          referrer_host?: string | null
          session_id: string
          share_channel?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          dedup_key?: string
          event_type?: Database["public"]["Enums"]["analytics_event_type"]
          id?: string
          marketplace_id?: string | null
          path?: string
          product_id?: string | null
          referrer_host?: string | null
          session_id?: string
          share_channel?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          alt: string
          created_at: string
          id: string
          image_mobile_url: string | null
          image_url: string
          is_active: boolean
          link_url: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          alt?: string
          created_at?: string
          id?: string
          image_mobile_url?: string | null
          image_url: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Update: {
          alt?: string
          created_at?: string
          id?: string
          image_mobile_url?: string | null
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      commercial_preferences: {
        Row: {
          channel: string
          daily_count: number
          daily_plan_enabled: boolean
          id: number
          max_price_cents: number | null
          min_commission_pct: number | null
          min_price_cents: number | null
          monthly_goal_cents: number | null
          preferred_marketplaces: string[]
          priority_categories: string[]
          updated_at: string
        }
        Insert: {
          channel?: string
          daily_count?: number
          daily_plan_enabled?: boolean
          id?: number
          max_price_cents?: number | null
          min_commission_pct?: number | null
          min_price_cents?: number | null
          monthly_goal_cents?: number | null
          preferred_marketplaces?: string[]
          priority_categories?: string[]
          updated_at?: string
        }
        Update: {
          channel?: string
          daily_count?: number
          daily_plan_enabled?: boolean
          id?: number
          max_price_cents?: number | null
          min_commission_pct?: number | null
          min_price_cents?: number | null
          monthly_goal_cents?: number | null
          preferred_marketplaces?: string[]
          priority_categories?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      daily_plans: {
        Row: {
          created_at: string
          error: string | null
          id: string
          plan: Json
          status: string
          trigger: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          plan?: Json
          status: string
          trigger: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          plan?: Json
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      import_approvals: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          opportunity_ids: string[]
          preview: Json
          publish: boolean
          result: Json | null
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          opportunity_ids: string[]
          preview?: Json
          publish?: boolean
          result?: Json | null
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          opportunity_ids?: string[]
          preview?: Json
          publish?: boolean
          result?: Json | null
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      marketplace_integrations: {
        Row: {
          last_checked_at: string | null
          last_error: string | null
          last_sync_at: string | null
          marketplace_slug: string
          status: string
          updated_at: string
        }
        Insert: {
          last_checked_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          marketplace_slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          last_checked_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          marketplace_slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketplaces: {
        Row: {
          allow_manual_price: boolean
          allowed_domains: string[]
          created_at: string
          id: string
          integration_status: Database["public"]["Enums"]["integration_status"]
          is_active: boolean
          name: string
          price_max_age_hours: number
          slug: string
          updated_at: string
        }
        Insert: {
          allow_manual_price?: boolean
          allowed_domains?: string[]
          created_at?: string
          id?: string
          integration_status?: Database["public"]["Enums"]["integration_status"]
          is_active?: boolean
          name: string
          price_max_age_hours?: number
          slug: string
          updated_at?: string
        }
        Update: {
          allow_manual_price?: boolean
          allowed_domains?: string[]
          created_at?: string
          id?: string
          integration_status?: Database["public"]["Enums"]["integration_status"]
          is_active?: boolean
          name?: string
          price_max_age_hours?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt: string
          created_at: string
          id: string
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt?: string
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt?: string
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          affiliate_url: string
          category_id: string | null
          created_at: string
          current_price_cents: number | null
          external_id: string | null
          id: string
          is_featured: boolean
          is_weekly_pick: boolean
          main_image_alt: string | null
          main_image_url: string | null
          marketplace_id: string | null
          name: string
          previous_price_cents: number | null
          price_checked_at: string | null
          price_source: Database["public"]["Enums"]["price_source"]
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          short_description: string
          slug: string
          source: Database["public"]["Enums"]["price_source"]
          status: Database["public"]["Enums"]["product_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          affiliate_url?: string
          category_id?: string | null
          created_at?: string
          current_price_cents?: number | null
          external_id?: string | null
          id?: string
          is_featured?: boolean
          is_weekly_pick?: boolean
          main_image_alt?: string | null
          main_image_url?: string | null
          marketplace_id?: string | null
          name?: string
          previous_price_cents?: number | null
          price_checked_at?: string | null
          price_source?: Database["public"]["Enums"]["price_source"]
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string
          slug: string
          source?: Database["public"]["Enums"]["price_source"]
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          affiliate_url?: string
          category_id?: string | null
          created_at?: string
          current_price_cents?: number | null
          external_id?: string | null
          id?: string
          is_featured?: boolean
          is_weekly_pick?: boolean
          main_image_alt?: string | null
          main_image_url?: string | null
          marketplace_id?: string | null
          name?: string
          previous_price_cents?: number | null
          price_checked_at?: string | null
          price_source?: Database["public"]["Enums"]["price_source"]
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string
          slug?: string
          source?: Database["public"]["Enums"]["price_source"]
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_opportunities: {
        Row: {
          affiliate_url: string | null
          category: string | null
          commission_rate: number | null
          coupon: string | null
          created_at: string
          discount_pct: number | null
          external_id: string
          extra_commission_rate: number | null
          extra_earnings_cents: number | null
          fetched_at: string
          growth_pct: number | null
          id: string
          image_url: string | null
          marketplace_slug: string
          name: string
          original_price_cents: number | null
          price_cents: number | null
          rating: number | null
          sales: number | null
          search_volume: number | null
          seasonal_dates: string[]
          signals: string[]
          source: string
          valid_until: string | null
        }
        Insert: {
          affiliate_url?: string | null
          category?: string | null
          commission_rate?: number | null
          coupon?: string | null
          created_at?: string
          discount_pct?: number | null
          external_id: string
          extra_commission_rate?: number | null
          extra_earnings_cents?: number | null
          fetched_at?: string
          growth_pct?: number | null
          id?: string
          image_url?: string | null
          marketplace_slug: string
          name: string
          original_price_cents?: number | null
          price_cents?: number | null
          rating?: number | null
          sales?: number | null
          search_volume?: number | null
          seasonal_dates?: string[]
          signals?: string[]
          source: string
          valid_until?: string | null
        }
        Update: {
          affiliate_url?: string | null
          category?: string | null
          commission_rate?: number | null
          coupon?: string | null
          created_at?: string
          discount_pct?: number | null
          external_id?: string
          extra_commission_rate?: number | null
          extra_earnings_cents?: number | null
          fetched_at?: string
          growth_pct?: number | null
          id?: string
          image_url?: string | null
          marketplace_slug?: string
          name?: string
          original_price_cents?: number | null
          price_cents?: number | null
          rating?: number | null
          sales?: number | null
          search_volume?: number | null
          seasonal_dates?: string[]
          signals?: string[]
          source?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      radar_runs: {
        Row: {
          errors: string[]
          finished_at: string | null
          id: string
          items: number
          requests: number
          sources: Json
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          errors?: string[]
          finished_at?: string | null
          id?: string
          items?: number
          requests?: number
          sources?: Json
          started_at?: string
          status?: string
          trigger: string
        }
        Update: {
          errors?: string[]
          finished_at?: string | null
          id?: string
          items?: number
          requests?: number
          sources?: Json
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      radar_settings: {
        Row: {
          daily_enabled: boolean
          id: number
          max_items: number
          updated_at: string
          weights: Json
        }
        Insert: {
          daily_enabled?: boolean
          id?: number
          max_items?: number
          updated_at?: string
          weights: Json
        }
        Update: {
          daily_enabled?: boolean
          id?: number
          max_items?: number
          updated_at?: string
          weights?: Json
        }
        Relationships: []
      }
      radar_snapshots: {
        Row: {
          commission_rate: number | null
          day: string
          fetched_at: string
          opportunity_id: string
          price_cents: number | null
          sales: number | null
          search_volume: number | null
          source: string
        }
        Insert: {
          commission_rate?: number | null
          day: string
          fetched_at: string
          opportunity_id: string
          price_cents?: number | null
          sales?: number | null
          search_volume?: number | null
          source: string
        }
        Update: {
          commission_rate?: number | null
          day?: string
          fetched_at?: string
          opportunity_id?: string
          price_cents?: number | null
          sales?: number | null
          search_volume?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "radar_snapshots_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "radar_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      site_searches: {
        Row: {
          count: number
          day: string
          term: string
        }
        Insert: {
          count?: number
          day: string
          term: string
        }
        Update: {
          count?: number
          day?: string
          term?: string
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
      admin_performance_report: {
        Args: {
          _category?: string
          _from: string
          _marketplace?: string
          _to: string
        }
        Returns: Json
      }
      f_unaccent: { Args: { "": string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_allowed_affiliate_url: {
        Args: { _domains: string[]; _url: string }
        Returns: boolean
      }
      log_search: { Args: { _term: string }; Returns: undefined }
      password_change_required: { Args: never; Returns: boolean }
      request_password_change: { Args: never; Returns: undefined }
      search_products: {
        Args: { q: string }
        Returns: {
          affiliate_url: string
          category_id: string | null
          created_at: string
          current_price_cents: number | null
          external_id: string | null
          id: string
          is_featured: boolean
          is_weekly_pick: boolean
          main_image_alt: string | null
          main_image_url: string | null
          marketplace_id: string | null
          name: string
          previous_price_cents: number | null
          price_checked_at: string | null
          price_source: Database["public"]["Enums"]["price_source"]
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          short_description: string
          slug: string
          source: Database["public"]["Enums"]["price_source"]
          status: Database["public"]["Enums"]["product_status"]
          tags: string[]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      analytics_event_type:
        | "page_view"
        | "product_view"
        | "offer_click"
        | "share_click"
        | "instagram_click"
      app_role: "admin"
      integration_status: "manual" | "planned" | "active"
      price_source: "manual" | "api"
      product_status: "draft" | "published" | "inactive"
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
      analytics_event_type: [
        "page_view",
        "product_view",
        "offer_click",
        "share_click",
        "instagram_click",
      ],
      app_role: ["admin"],
      integration_status: ["manual", "planned", "active"],
      price_source: ["manual", "api"],
      product_status: ["draft", "published", "inactive"],
    },
  },
} as const
