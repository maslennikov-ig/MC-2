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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string | null
          organization_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string | null
          organization_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string | null
          organization_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_deduplication_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: string | null
          course_id: string | null
          created_at: string | null
          download_url: string | null
          duration_seconds: number | null
          file_id: string | null
          file_path: string | null
          file_size_bytes: number | null
          filename: string | null
          id: string
          lesson_id: string | null
          metadata: Json | null
          mime_type: string | null
          size_bytes: number | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          asset_type?: string | null
          course_id?: string | null
          created_at?: string | null
          download_url?: string | null
          duration_seconds?: number | null
          file_id?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          filename?: string | null
          id?: string
          lesson_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          size_bytes?: number | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          asset_type?: string | null
          course_id?: string | null
          created_at?: string | null
          download_url?: string | null
          duration_seconds?: number | null
          file_id?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          filename?: string | null
          id?: string
          lesson_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          size_bytes?: number | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      config_backups: {
        Row: {
          backup_data: Json
          backup_name: string
          backup_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
        }
        Insert: {
          backup_data: Json
          backup_name: string
          backup_type: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
        }
        Update: {
          backup_data?: Json
          backup_name?: string
          backup_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_backups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      context_reserve_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          language: string
          reserve_percent: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          language: string
          reserve_percent?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          language?: string
          reserve_percent?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      course_enrollments: {
        Row: {
          completed_at: string | null
          course_id: string
          enrolled_at: string | null
          id: string
          progress: Json | null
          status: Database["public"]["Enums"]["enrollment_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          enrolled_at?: string | null
          id?: string
          progress?: Json | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          enrolled_at?: string | null
          id?: string
          progress?: Json | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          analysis_result: Json | null
          auto_finalize_after_stage6: boolean | null
          client_ip: string | null
          completed_at: string | null
          content_strategy: string | null
          course_description: string | null
          course_structure: Json | null
          created_at: string | null
          difficulty: string | null
          email: string | null
          error_code: Database["public"]["Enums"]["stage_error_code"] | null
          error_details: Json | null
          error_message: string | null
          estimated_completion_minutes: number | null
          estimated_lessons: number | null
          estimated_sections: number | null
          failed_at_stage: number | null
          generation_code: string | null
          generation_completed_at: string | null
          generation_metadata: Json | null
          generation_progress: Json | null
          generation_started_at: string | null
          generation_status:
            | Database["public"]["Enums"]["generation_status"]
            | null
          has_files: boolean | null
          id: string
          is_published: boolean | null
          language: string | null
          last_progress_update: string | null
          learning_outcomes: string | null
          organization_id: string
          output_formats: string[] | null
          pause_at_stage_5: boolean | null
          prerequisites: string | null
          settings: Json | null
          share_token: string | null
          slug: string
          status: Database["public"]["Enums"]["course_status"]
          style: string | null
          target_audience: string | null
          title: string
          total_lessons_count: number | null
          total_sections_count: number | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          analysis_result?: Json | null
          auto_finalize_after_stage6?: boolean | null
          client_ip?: string | null
          completed_at?: string | null
          content_strategy?: string | null
          course_description?: string | null
          course_structure?: Json | null
          created_at?: string | null
          difficulty?: string | null
          email?: string | null
          error_code?: Database["public"]["Enums"]["stage_error_code"] | null
          error_details?: Json | null
          error_message?: string | null
          estimated_completion_minutes?: number | null
          estimated_lessons?: number | null
          estimated_sections?: number | null
          failed_at_stage?: number | null
          generation_code?: string | null
          generation_completed_at?: string | null
          generation_metadata?: Json | null
          generation_progress?: Json | null
          generation_started_at?: string | null
          generation_status?:
            | Database["public"]["Enums"]["generation_status"]
            | null
          has_files?: boolean | null
          id?: string
          is_published?: boolean | null
          language?: string | null
          last_progress_update?: string | null
          learning_outcomes?: string | null
          organization_id: string
          output_formats?: string[] | null
          pause_at_stage_5?: boolean | null
          prerequisites?: string | null
          settings?: Json | null
          share_token?: string | null
          slug: string
          status?: Database["public"]["Enums"]["course_status"]
          style?: string | null
          target_audience?: string | null
          title: string
          total_lessons_count?: number | null
          total_sections_count?: number | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          analysis_result?: Json | null
          auto_finalize_after_stage6?: boolean | null
          client_ip?: string | null
          completed_at?: string | null
          content_strategy?: string | null
          course_description?: string | null
          course_structure?: Json | null
          created_at?: string | null
          difficulty?: string | null
          email?: string | null
          error_code?: Database["public"]["Enums"]["stage_error_code"] | null
          error_details?: Json | null
          error_message?: string | null
          estimated_completion_minutes?: number | null
          estimated_lessons?: number | null
          estimated_sections?: number | null
          failed_at_stage?: number | null
          generation_code?: string | null
          generation_completed_at?: string | null
          generation_metadata?: Json | null
          generation_progress?: Json | null
          generation_started_at?: string | null
          generation_status?:
            | Database["public"]["Enums"]["generation_status"]
            | null
          has_files?: boolean | null
          id?: string
          is_published?: boolean | null
          language?: string | null
          last_progress_update?: string | null
          learning_outcomes?: string | null
          organization_id?: string
          output_formats?: string[] | null
          pause_at_stage_5?: boolean | null
          prerequisites?: string | null
          settings?: Json | null
          share_token?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["course_status"]
          style?: string | null
          target_audience?: string | null
          title?: string
          total_lessons_count?: number | null
          total_sections_count?: number | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_deduplication_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_priorities: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          classification_rationale: string
          classified_at: string
          course_id: string
          created_at: string
          file_id: string
          id: string
          importance_score: number
          order: number
          organization_id: string
          priority: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["document_category"]
          classification_rationale: string
          classified_at?: string
          course_id: string
          created_at?: string
          file_id: string
          id?: string
          importance_score: number
          order: number
          organization_id: string
          priority: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          classification_rationale?: string
          classified_at?: string
          course_id?: string
          created_at?: string
          file_id?: string
          id?: string
          importance_score?: number
          order?: number
          organization_id?: string
          priority?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_priorities_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_priorities_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "file_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_priorities_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "file_catalog_deduplication_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_priorities_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "file_catalog_processing_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_priorities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_deduplication_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "document_priorities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          created_at: string
          error_message: string
          file_format: string | null
          file_name: string | null
          file_size: number | null
          id: string
          job_id: string | null
          job_type: string | null
          metadata: Json | null
          organization_id: string | null
          severity: string
          stack_trace: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message: string
          file_format?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          job_id?: string | null
          job_type?: string | null
          metadata?: Json | null
          organization_id?: string | null
          severity: string
          stack_trace?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string
          file_format?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          job_id?: string | null
          job_type?: string | null
          metadata?: Json | null
          organization_id?: string | null
          severity?: string
          stack_trace?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_deduplication_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "error_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_catalog: {
        Row: {
          chunk_count: number | null
          course_id: string | null
          created_at: string | null
          error_message: string | null
          file_size: number
          file_type: string
          filename: string
          generated_title: string | null
          hash: string
          id: string
          markdown_content: string | null
          mime_type: string
          organization_id: string
          original_file_id: string | null
          original_name: string | null
          parsed_content: Json | null
          priority: string | null
          processed_content: string | null
          processing_method: string | null
          reference_count: number
          storage_path: string
          summary_metadata: Json | null
          updated_at: string | null
          vector_status: Database["public"]["Enums"]["vector_status"]
        }
        Insert: {
          chunk_count?: number | null
          course_id?: string | null
          created_at?: string | null
          error_message?: string | null
          file_size: number
          file_type: string
          filename: string
          generated_title?: string | null
          hash: string
          id?: string
          markdown_content?: string | null
          mime_type: string
          organization_id: string
          original_file_id?: string | null
          original_name?: string | null
          parsed_content?: Json | null
          priority?: string | null
          processed_content?: string | null
          processing_method?: string | null
          reference_count?: number
          storage_path: string
          summary_metadata?: Json | null
          updated_at?: string | null
          vector_status?: Database["public"]["Enums"]["vector_status"]
        }
        Update: {
          chunk_count?: number | null
          course_id?: string | null
          created_at?: string | null
          error_message?: string | null
          file_size?: number
          file_type?: string
          filename?: string
          generated_title?: string | null
          hash?: string
          id?: string
          markdown_content?: string | null
          mime_type?: string
          organization_id?: string
          original_file_id?: string | null
          original_name?: string | null
          parsed_content?: Json | null
          priority?: string | null
          processed_content?: string | null
          processing_method?: string | null
          reference_count?: number
          storage_path?: string
          summary_metadata?: Json | null
          updated_at?: string | null
          vector_status?: Database["public"]["Enums"]["vector_status"]
        }
        Relationships: [
          {
            foreignKeyName: "file_catalog_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_deduplication_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "file_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_catalog_original_file_id_fkey"
            columns: ["original_file_id"]
            isOneToOne: false
            referencedRelation: "file_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_catalog_original_file_id_fkey"
            columns: ["original_file_id"]
            isOneToOne: false
            referencedRelation: "file_catalog_deduplication_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_catalog_original_file_id_fkey"
            columns: ["original_file_id"]
            isOneToOne: false
            referencedRelation: "file_catalog_processing_status"
            referencedColumns: ["id"]
          },
        ]
      }
      fsm_events: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string
          event_data: Json
          event_id: string
          event_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          entity_id: string
          event_data?: Json
          event_id?: string
          event_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string
          event_data?: Json
          event_id?: string
          event_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fsm_events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_locks: {
        Row: {
          course_id: string
          expires_at: string
          id: string
          locked_at: string
          stage: Database["public"]["Enums"]["generation_stage"]
          worker_id: string
        }
        Insert: {
          course_id: string
          expires_at: string
          id?: string
          locked_at?: string
          stage: Database["public"]["Enums"]["generation_stage"]
          worker_id: string
        }
        Update: {
          course_id?: string
          expires_at?: string
          id?: string
          locked_at?: string
          stage?: Database["public"]["Enums"]["generation_stage"]
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_locks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          course_id: string
          id: string
          metadata: Json | null
          new_status: Database["public"]["Enums"]["generation_status"]
          old_status: Database["public"]["Enums"]["generation_status"] | null
          trigger_source: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          course_id: string
          id?: string
          metadata?: Json | null
          new_status: Database["public"]["Enums"]["generation_status"]
          old_status?: Database["public"]["Enums"]["generation_status"] | null
          trigger_source?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          course_id?: string
          id?: string
          metadata?: Json | null
          new_status?: Database["public"]["Enums"]["generation_status"]
          old_status?: Database["public"]["Enums"]["generation_status"] | null
          trigger_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_status_history_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_trace: {
        Row: {
          completion_text: string | null
          cost_usd: number | null
          course_id: string
          created_at: string
          duration_ms: number | null
          error_data: Json | null
          id: string
          input_data: Json
          lesson_id: string | null
          model_used: string | null
          output_data: Json | null
          phase: string
          prompt_text: string | null
          quality_score: number | null
          retry_attempt: number | null
          stage: string
          step_name: string
          temperature: number | null
          tokens_used: number | null
          was_cached: boolean | null
        }
        Insert: {
          completion_text?: string | null
          cost_usd?: number | null
          course_id: string
          created_at?: string
          duration_ms?: number | null
          error_data?: Json | null
          id?: string
          input_data?: Json
          lesson_id?: string | null
          model_used?: string | null
          output_data?: Json | null
          phase: string
          prompt_text?: string | null
          quality_score?: number | null
          retry_attempt?: number | null
          stage: string
          step_name: string
          temperature?: number | null
          tokens_used?: number | null
          was_cached?: boolean | null
        }
        Update: {
          completion_text?: string | null
          cost_usd?: number | null
          course_id?: string
          created_at?: string
          duration_ms?: number | null
          error_data?: Json | null
          id?: string
          input_data?: Json
          lesson_id?: string | null
          model_used?: string | null
          output_data?: Json | null
          phase?: string
          prompt_text?: string | null
          quality_score?: number | null
          retry_attempt?: number | null
          stage?: string
          step_name?: string
          temperature?: number | null
          tokens_used?: number | null
          was_cached?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_trace_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_trace_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          entity_id: string | null
          expires_at: string
          key: string
          result: Json
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          expires_at?: string
          key: string
          result?: Json
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          expires_at?: string
          key?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      job_outbox: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string
          job_data: Json
          job_options: Json
          last_attempt_at: string | null
          last_error: string | null
          outbox_id: string
          processed_at: string | null
          queue_name: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id: string
          job_data?: Json
          job_options?: Json
          last_attempt_at?: string | null
          last_error?: string | null
          outbox_id?: string
          processed_at?: string | null
          queue_name: string
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string
          job_data?: Json
          job_options?: Json
          last_attempt_at?: string | null
          last_error?: string | null
          outbox_id?: string
          processed_at?: string | null
          queue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_outbox_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      job_status: {
        Row: {
          attempts: number
          cancelled: boolean
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          course_id: string | null
          created_at: string | null
          error_message: string | null
          error_stack: string | null
          failed_at: string | null
          id: string
          job_id: string
          job_type: string
          max_attempts: number
          organization_id: string
          progress: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status_enum"]
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number
          cancelled?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          failed_at?: string | null
          id?: string
          job_id: string
          job_type: string
          max_attempts?: number
          organization_id: string
          progress?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status_enum"]
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number
          cancelled?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          failed_at?: string | null
          id?: string
          job_id?: string
          job_type?: string
          max_attempts?: number
          organization_id?: string
          progress?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status_enum"]
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_status_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_status_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_status_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_deduplication_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "job_status_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_content: {
        Row: {
          interactive_elements: Json | null
          lesson_id: string
          media_urls: string[] | null
          quiz_data: Json | null
          text_content: string | null
          updated_at: string | null
        }
        Insert: {
          interactive_elements?: Json | null
          lesson_id: string
          media_urls?: string[] | null
          quiz_data?: Json | null
          text_content?: string | null
          updated_at?: string | null
        }
        Update: {
          interactive_elements?: Json | null
          lesson_id?: string
          media_urls?: string[] | null
          quiz_data?: Json | null
          text_content?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_content_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_contents: {
        Row: {
          content: Json
          course_id: string
          created_at: string
          generation_attempt: number
          id: string
          lesson_id: string
          metadata: Json
          parent_content_id: string | null
          status: string
          updated_at: string
          user_refinement_prompt: string | null
        }
        Insert: {
          content?: Json
          course_id: string
          created_at?: string
          generation_attempt?: number
          id?: string
          lesson_id: string
          metadata?: Json
          parent_content_id?: string | null
          status?: string
          updated_at?: string
          user_refinement_prompt?: string | null
        }
        Update: {
          content?: Json
          course_id?: string
          created_at?: string
          generation_attempt?: number
          id?: string
          lesson_id?: string
          metadata?: Json
          parent_content_id?: string | null
          status?: string
          updated_at?: string
          user_refinement_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_contents_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_contents_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_contents_parent_content_id_fkey"
            columns: ["parent_content_id"]
            isOneToOne: false
            referencedRelation: "lesson_contents"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_enrichments: {
        Row: {
          asset_id: string | null
          content: Json | null
          course_id: string
          created_at: string | null
          enrichment_type: Database["public"]["Enums"]["enrichment_type"]
          error_details: Json | null
          error_message: string | null
          generated_at: string | null
          generation_attempt: number | null
          id: string
          lesson_id: string
          metadata: Json | null
          order_index: number
          status: Database["public"]["Enums"]["enrichment_status"]
          title: string | null
          updated_at: string | null
        }
        Insert: {
          asset_id?: string | null
          content?: Json | null
          course_id: string
          created_at?: string | null
          enrichment_type: Database["public"]["Enums"]["enrichment_type"]
          error_details?: Json | null
          error_message?: string | null
          generated_at?: string | null
          generation_attempt?: number | null
          id?: string
          lesson_id: string
          metadata?: Json | null
          order_index?: number
          status?: Database["public"]["Enums"]["enrichment_status"]
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          asset_id?: string | null
          content?: Json | null
          course_id?: string
          created_at?: string | null
          enrichment_type?: Database["public"]["Enums"]["enrichment_type"]
          error_details?: Json | null
          error_message?: string | null
          generated_at?: string | null
          generation_attempt?: number | null
          id?: string
          lesson_id?: string
          metadata?: Json | null
          order_index?: number
          status?: Database["public"]["Enums"]["enrichment_status"]
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_enrichments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_enrichments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_enrichments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: Json | null
          content_text: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          lesson_type: Database["public"]["Enums"]["lesson_type"]
          metadata: Json | null
          objectives: string[] | null
          order_index: number
          section_id: string
          status: Database["public"]["Enums"]["lesson_status"]
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: Json | null
          content_text?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          lesson_type: Database["public"]["Enums"]["lesson_type"]
          metadata?: Json | null
          objectives?: string[] | null
          order_index: number
          section_id: string
          status?: Database["public"]["Enums"]["lesson_status"]
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: Json | null
          content_text?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          lesson_type?: Database["public"]["Enums"]["lesson_type"]
          metadata?: Json | null
          objectives?: string[] | null
          order_index?: number
          section_id?: string
          status?: Database["public"]["Enums"]["lesson_status"]
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_model_config: {
        Row: {
          cache_read_enabled: boolean | null
          config_type: string
          context_tier: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          fallback_display_name: string | null
          fallback_model_id: string | null
          id: string
          is_active: boolean
          judge_role: string | null
          language: string | null
          max_context_tokens: number | null
          max_retries: number | null
          max_tokens: number | null
          model_id: string
          phase_name: string
          primary_display_name: string | null
          quality_threshold: number | null
          stage_number: number | null
          temperature: number | null
          threshold_tokens: number | null
          timeout_ms: number | null
          updated_at: string | null
          version: number
          weight: number | null
        }
        Insert: {
          cache_read_enabled?: boolean | null
          config_type: string
          context_tier?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fallback_display_name?: string | null
          fallback_model_id?: string | null
          id?: string
          is_active?: boolean
          judge_role?: string | null
          language?: string | null
          max_context_tokens?: number | null
          max_retries?: number | null
          max_tokens?: number | null
          model_id: string
          phase_name: string
          primary_display_name?: string | null
          quality_threshold?: number | null
          stage_number?: number | null
          temperature?: number | null
          threshold_tokens?: number | null
          timeout_ms?: number | null
          updated_at?: string | null
          version?: number
          weight?: number | null
        }
        Update: {
          cache_read_enabled?: boolean | null
          config_type?: string
          context_tier?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fallback_display_name?: string | null
          fallback_model_id?: string | null
          id?: string
          is_active?: boolean
          judge_role?: string | null
          language?: string | null
          max_context_tokens?: number | null
          max_retries?: number | null
          max_tokens?: number | null
          model_id?: string
          phase_name?: string
          primary_display_name?: string | null
          quality_threshold?: number | null
          stage_number?: number | null
          temperature?: number | null
          threshold_tokens?: number | null
          timeout_ms?: number | null
          updated_at?: string | null
          version?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_model_config_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_model_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_configurations: {
        Row: {
          client_id: string
          client_secret: string
          created_at: string
          default_org: string
          id: string
          import_timeout_seconds: number
          is_active: boolean
          lms_type: string
          lms_url: string
          max_retries: number
          name: string
          organization_id: string
          poll_interval_seconds: number
          studio_url: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          client_secret: string
          created_at?: string
          default_org: string
          id?: string
          import_timeout_seconds?: number
          is_active?: boolean
          lms_type?: string
          lms_url: string
          max_retries?: number
          name: string
          organization_id: string
          poll_interval_seconds?: number
          studio_url?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          created_at?: string
          default_org?: string
          id?: string
          import_timeout_seconds?: number
          is_active?: boolean
          lms_type?: string
          lms_url?: string
          max_retries?: number
          name?: string
          organization_id?: string
          poll_interval_seconds?: number
          studio_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_deduplication_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "lms_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_import_jobs: {
        Row: {
          completed_at: string | null
          course_id: string
          course_url: string | null
          created_at: string
          edx_course_key: string | null
          edx_task_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          lms_config_id: string
          package_size_bytes: number | null
          progress_percent: number | null
          started_at: string | null
          status: string
          studio_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          course_url?: string | null
          created_at?: string
          edx_course_key?: string | null
          edx_task_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lms_config_id: string
          package_size_bytes?: number | null
          progress_percent?: number | null
          started_at?: string | null
          status?: string
          studio_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          course_url?: string | null
          created_at?: string
          edx_course_key?: string | null
          edx_task_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lms_config_id?: string
          package_size_bytes?: number | null
          progress_percent?: number | null
          started_at?: string | null
          status?: string
          studio_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_import_jobs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_import_jobs_lms_config_id_fkey"
            columns: ["lms_config_id"]
            isOneToOne: false
            referencedRelation: "lms_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      log_issue_status: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          log_id: string
          log_type: string
          notes: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          log_id: string
          log_type: string
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          log_id?: string
          log_type?: string
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_issue_status_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_issue_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          storage_quota_bytes: number
          storage_used_bytes: number
          tier: Database["public"]["Enums"]["tier"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          storage_quota_bytes?: number
          storage_used_bytes?: number
          tier?: Database["public"]["Enums"]["tier"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          storage_quota_bytes?: number
          storage_used_bytes?: number
          tier?: Database["public"]["Enums"]["tier"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pipeline_global_settings: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_global_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          prompt_description: string | null
          prompt_key: string
          prompt_name: string
          prompt_template: string
          stage: string
          updated_at: string | null
          variables: Json | null
          version: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          prompt_description?: string | null
          prompt_key: string
          prompt_name: string
          prompt_template: string
          stage: string
          updated_at?: string | null
          variables?: Json | null
          version?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          prompt_description?: string | null
          prompt_key?: string
          prompt_name?: string
          prompt_template?: string
          stage?: string
          updated_at?: string | null
          variables?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_context_cache: {
        Row: {
          chunks: Json
          context_id: string
          course_id: string
          created_at: string
          expires_at: string
          lesson_id: string
          query_params: Json
        }
        Insert: {
          chunks: Json
          context_id?: string
          course_id: string
          created_at?: string
          expires_at: string
          lesson_id: string
          query_params: Json
        }
        Update: {
          chunks?: Json
          context_id?: string
          course_id?: string
          created_at?: string
          expires_at?: string
          lesson_id?: string
          query_params?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rag_context_cache_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_context_cache_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      refinement_config: {
        Row: {
          accept_threshold: number
          adjacent_section_gap: number
          config_type: string
          convergence_threshold: number
          course_id: string | null
          created_at: string
          created_by: string | null
          escalation_enabled: boolean
          good_enough_threshold: number
          id: string
          is_active: boolean
          krippendorff_high_agreement: number
          krippendorff_moderate_agreement: number
          max_concurrent_patchers: number
          max_iterations: number
          max_tokens: number
          on_max_iterations: string
          operation_mode: string
          readability: Json
          regression_tolerance: number
          section_lock_after_edits: number
          sequential_for_regenerations: boolean
          timeout_ms: number
          token_costs: Json
          updated_at: string
          version: number
        }
        Insert: {
          accept_threshold?: number
          adjacent_section_gap?: number
          config_type?: string
          convergence_threshold?: number
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          escalation_enabled?: boolean
          good_enough_threshold?: number
          id?: string
          is_active?: boolean
          krippendorff_high_agreement?: number
          krippendorff_moderate_agreement?: number
          max_concurrent_patchers?: number
          max_iterations?: number
          max_tokens?: number
          on_max_iterations?: string
          operation_mode?: string
          readability?: Json
          regression_tolerance?: number
          section_lock_after_edits?: number
          sequential_for_regenerations?: boolean
          timeout_ms?: number
          token_costs?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          accept_threshold?: number
          adjacent_section_gap?: number
          config_type?: string
          convergence_threshold?: number
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          escalation_enabled?: boolean
          good_enough_threshold?: number
          id?: string
          is_active?: boolean
          krippendorff_high_agreement?: number
          krippendorff_moderate_agreement?: number
          max_concurrent_patchers?: number
          max_iterations?: number
          max_tokens?: number
          on_max_iterations?: string
          operation_mode?: string
          readability?: Json
          regression_tolerance?: number
          section_lock_after_edits?: number
          sequential_for_regenerations?: boolean
          timeout_ms?: number
          token_costs?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "refinement_config_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          course_id: string
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          order_index: number
          title: string
          updated_at: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          order_index: number
          title: string
          updated_at?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          order_index?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      system_metrics: {
        Row: {
          course_id: string | null
          event_type: Database["public"]["Enums"]["metric_event_type"]
          id: string
          job_id: string | null
          message: string | null
          metadata: Json | null
          severity: Database["public"]["Enums"]["metric_severity"]
          timestamp: string
          user_id: string | null
        }
        Insert: {
          course_id?: string | null
          event_type: Database["public"]["Enums"]["metric_event_type"]
          id?: string
          job_id?: string | null
          message?: string | null
          metadata?: Json | null
          severity: Database["public"]["Enums"]["metric_severity"]
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          course_id?: string | null
          event_type?: Database["public"]["Enums"]["metric_event_type"]
          id?: string
          job_id?: string | null
          message?: string | null
          metadata?: Json | null
          severity?: Database["public"]["Enums"]["metric_severity"]
          timestamp?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_metrics_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_settings: {
        Row: {
          allowed_extensions: string[]
          allowed_mime_types: string[]
          created_at: string | null
          display_name: string
          features: Json | null
          id: string
          is_active: boolean | null
          max_concurrent_jobs: number
          max_file_size_bytes: number
          max_files_per_course: number
          monthly_price_cents: number | null
          storage_quota_bytes: number
          tier_key: string
          updated_at: string | null
        }
        Insert: {
          allowed_extensions: string[]
          allowed_mime_types: string[]
          created_at?: string | null
          display_name: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_concurrent_jobs: number
          max_file_size_bytes: number
          max_files_per_course: number
          monthly_price_cents?: number | null
          storage_quota_bytes: number
          tier_key: string
          updated_at?: string | null
        }
        Update: {
          allowed_extensions?: string[]
          allowed_mime_types?: string[]
          created_at?: string | null
          display_name?: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_concurrent_jobs?: number
          max_file_size_bytes?: number
          max_files_per_course?: number
          monthly_price_cents?: number | null
          storage_quota_bytes?: number
          tier_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["role"]
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          role?: Database["public"]["Enums"]["role"]
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_deduplication_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_generation_dashboard: {
        Row: {
          avg_duration_seconds: number | null
          course_count: number | null
          generation_status:
            | Database["public"]["Enums"]["generation_status"]
            | null
          most_recent_update: string | null
          stuck_count: number | null
        }
        Relationships: []
      }
      cleanup_job_monitoring: {
        Row: {
          active: boolean | null
          end_time: string | null
          jobid: number | null
          jobname: string | null
          return_message: string | null
          runid: number | null
          schedule: string | null
          start_time: string | null
          status: string | null
        }
        Relationships: []
      }
      file_catalog_deduplication_stats: {
        Row: {
          course_id: string | null
          created_at: string | null
          file_size: number | null
          file_type: string | null
          filename: string | null
          hash: string | null
          id: string | null
          organization_id: string | null
          original_file_id: string | null
          reference_copies: number | null
          reference_count: number | null
          storage_saved_bytes: number | null
          vector_status: Database["public"]["Enums"]["vector_status"] | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          file_size?: number | null
          file_type?: never
          filename?: string | null
          hash?: string | null
          id?: string | null
          organization_id?: string | null
          original_file_id?: string | null
          reference_copies?: never
          reference_count?: number | null
          storage_saved_bytes?: never
          vector_status?: Database["public"]["Enums"]["vector_status"] | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          file_size?: number | null
          file_type?: never
          filename?: string | null
          hash?: string | null
          id?: string | null
          organization_id?: string | null
          original_file_id?: string | null
          reference_copies?: never
          reference_count?: number | null
          storage_saved_bytes?: never
          vector_status?: Database["public"]["Enums"]["vector_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "file_catalog_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_deduplication_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "file_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_catalog_original_file_id_fkey"
            columns: ["original_file_id"]
            isOneToOne: false
            referencedRelation: "file_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_catalog_original_file_id_fkey"
            columns: ["original_file_id"]
            isOneToOne: false
            referencedRelation: "file_catalog_deduplication_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_catalog_original_file_id_fkey"
            columns: ["original_file_id"]
            isOneToOne: false
            referencedRelation: "file_catalog_processing_status"
            referencedColumns: ["id"]
          },
        ]
      }
      file_catalog_processing_status: {
        Row: {
          created_at: string | null
          file_type: string | null
          filename: string | null
          id: string | null
          image_count: number | null
          markdown_length: number | null
          page_count: number | null
          processing_status: string | null
          table_count: number | null
          text_elements: number | null
          updated_at: string | null
          vector_status: Database["public"]["Enums"]["vector_status"] | null
        }
        Insert: {
          created_at?: string | null
          file_type?: string | null
          filename?: string | null
          id?: string | null
          image_count?: never
          markdown_length?: never
          page_count?: never
          processing_status?: never
          table_count?: never
          text_elements?: never
          updated_at?: string | null
          vector_status?: Database["public"]["Enums"]["vector_status"] | null
        }
        Update: {
          created_at?: string | null
          file_type?: string | null
          filename?: string | null
          id?: string | null
          image_count?: never
          markdown_length?: never
          page_count?: never
          processing_status?: never
          table_count?: never
          text_elements?: never
          updated_at?: string | null
          vector_status?: Database["public"]["Enums"]["vector_status"] | null
        }
        Relationships: []
      }
      organization_deduplication_stats: {
        Row: {
          organization_id: string | null
          organization_name: string | null
          original_files_count: number | null
          reference_files_count: number | null
          storage_saved_bytes: number | null
          total_storage_used_bytes: number | null
        }
        Relationships: []
      }
      v_rls_policy_audit: {
        Row: {
          cmd: string | null
          has_superadmin_access: boolean | null
          permissive: string | null
          policy_role: string | null
          policyname: unknown
          schemaname: unknown
          tablename: unknown
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_generation_lock: {
        Args: {
          p_course_id: string
          p_stage: Database["public"]["Enums"]["generation_stage"]
          p_ttl_minutes?: number
          p_worker_id: string
        }
        Returns: boolean
      }
      check_generation_lock: {
        Args: {
          p_course_id: string
          p_stage: Database["public"]["Enums"]["generation_stage"]
        }
        Returns: {
          expires_at: string
          is_expired: boolean
          is_locked: boolean
          locked_at: string
          worker_id: string
        }[]
      }
      check_pending_cleanup: {
        Args: never
        Returns: {
          newest_draft: string
          oldest_draft: string
          pending_count: number
        }[]
      }
      check_policy_has_superadmin: {
        Args: { p_policy_name: string; p_table_name: string }
        Returns: boolean
      }
      check_stage4_barrier: {
        Args: { p_course_id: string }
        Returns: {
          can_proceed: boolean
          completed_count: number
          total_count: number
        }[]
      }
      cleanup_expired_generation_locks: { Args: never; Returns: number }
      cleanup_expired_idempotency_keys: { Args: never; Returns: undefined }
      cleanup_old_outbox_entries: { Args: never; Returns: undefined }
      course_belongs_to_org: {
        Args: { p_course_id: string; p_org_id: string }
        Returns: boolean
      }
      course_belongs_to_user: {
        Args: { p_course_id: string; p_user_id: string }
        Returns: boolean
      }
      create_test_auth_user: {
        Args: {
          p_email: string
          p_email_confirmed?: boolean
          p_encrypted_password: string
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      create_test_auth_user_with_env: {
        Args: {
          p_email: string
          p_email_confirmed?: boolean
          p_encrypted_password: string
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      decrement_file_reference_count: {
        Args: { p_file_id: string }
        Returns: number
      }
      decrement_storage_quota: {
        Args: { org_id: string; size_bytes: number }
        Returns: boolean
      }
      deduct_tenant_tokens: {
        Args: { p_amount: number; p_course_id: string; p_tenant_id: string }
        Returns: {
          error_code: string
          error_message: string
          new_balance: number
          success: boolean
        }[]
      }
      find_duplicate_file: {
        Args: { p_hash: string }
        Returns: {
          chunk_count: number
          file_id: string
          file_size: number
          markdown_content: string
          mime_type: string
          original_name: string
          parsed_content: Json
          processed_content: string
          processing_method: string
          reference_count: number
          storage_path: string
          summary_metadata: Json
          vector_status: string
        }[]
      }
      get_current_auth_context: { Args: never; Returns: Json }
      get_organization_from_api_key: {
        Args: { key_prefix_param: string }
        Returns: string
      }
      get_tenant_token_balance: {
        Args: { p_tenant_id: string }
        Returns: {
          monthly_tokens: number
          purchased_tokens: number
          queue_priority: number
          subscription_status: string
          tier_display_name: string
          tier_name: string
          tokens_reset_at: string
          total_tokens: number
        }[]
      }
      get_tier_settings: {
        Args: { p_tier_key: string }
        Returns: {
          allowed_extensions: string[]
          allowed_mime_types: string[]
          created_at: string | null
          display_name: string
          features: Json | null
          id: string
          is_active: boolean | null
          max_concurrent_jobs: number
          max_file_size_bytes: number
          max_files_per_course: number
          monthly_price_cents: number | null
          storage_quota_bytes: number
          tier_key: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tier_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hash_password: { Args: { password: string }; Returns: string }
      increment_file_reference_count: {
        Args: { p_file_id: string }
        Returns: number
      }
      increment_lessons_completed: {
        Args: { p_course_id: string }
        Returns: number
      }
      increment_storage_quota: {
        Args: { org_id: string; size_bytes: number }
        Returns: boolean
      }
      initialize_fsm_with_outbox: {
        Args: {
          p_entity_id: string
          p_idempotency_key: string
          p_initial_state: string
          p_initiated_by: string
          p_job_data: Json
          p_metadata?: Json
          p_organization_id: string
          p_user_id: string
        }
        Returns: Json
      }
      is_api_key_valid: { Args: { key_prefix_param: string }; Returns: boolean }
      is_enrolled_in_course: {
        Args: { p_course_id: string; p_user_id: string }
        Returns: boolean
      }
      is_enrolled_via_lesson: {
        Args: { p_lesson_id: string; p_user_id: string }
        Returns: boolean
      }
      is_enrolled_via_section: {
        Args: { p_section_id: string; p_user_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: { user_id: string }; Returns: boolean }
      is_user_active: { Args: { user_id: string }; Returns: boolean }
      lesson_belongs_to_user_course: {
        Args: { p_lesson_id: string; p_user_id: string }
        Returns: boolean
      }
      refund_tenant_tokens: {
        Args: {
          p_amount: number
          p_course_id: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: {
          error_code: string
          error_message: string
          new_balance: number
          success: boolean
        }[]
      }
      release_generation_lock: {
        Args: {
          p_course_id: string
          p_stage: Database["public"]["Enums"]["generation_stage"]
          p_worker_id?: string
        }
        Returns: boolean
      }
      reset_storage_quota: { Args: { org_id: string }; Returns: boolean }
      restart_from_stage: {
        Args: { p_course_id: string; p_stage_number: number; p_user_id: string }
        Returns: Json
      }
      section_belongs_to_user_course: {
        Args: { p_section_id: string; p_user_id: string }
        Returns: boolean
      }
      set_auth_context: {
        Args: {
          organization_id?: string
          user_email?: string
          user_id: string
          user_role?: string
        }
        Returns: undefined
      }
      test_set_jwt: { Args: { user_id: string }; Returns: undefined }
      update_api_key_last_used: {
        Args: { key_prefix_param: string }
        Returns: undefined
      }
      update_course_progress:
        | {
            Args: {
              p_course_id: string
              p_error_details?: Json
              p_error_message?: string
              p_message: string
              p_metadata?: Json
              p_status: string
              p_step_id: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_course_id: string
              p_message: string
              p_metadata?: Json
              p_percent_complete: number
              p_status: string
              p_step_id: number
            }
            Returns: Json
          }
      update_file_catalog_processing: {
        Args: {
          p_file_id: string
          p_markdown_content: string
          p_parsed_content: Json
        }
        Returns: undefined
      }
      validate_minimum_lessons: {
        Args: { course_structure: Json }
        Returns: boolean
      }
    }
    Enums: {
      course_status: "draft" | "published" | "archived"
      document_category:
        | "course_core"
        | "supplementary"
        | "reference"
        | "regulatory"
      enrichment_status:
        | "pending"
        | "draft_generating"
        | "draft_ready"
        | "generating"
        | "completed"
        | "failed"
        | "cancelled"
      enrichment_type: "video" | "audio" | "presentation" | "quiz" | "document"
      enrollment_status: "active" | "completed" | "dropped" | "expired"
      generation_stage: "stage4" | "stage5" | "stage6"
      generation_status:
        | "pending"
        | "stage_2_init"
        | "stage_2_processing"
        | "stage_2_complete"
        | "stage_2_awaiting_approval"
        | "stage_3_init"
        | "stage_3_summarizing"
        | "stage_3_complete"
        | "stage_3_awaiting_approval"
        | "stage_4_init"
        | "stage_4_analyzing"
        | "stage_4_complete"
        | "stage_4_awaiting_approval"
        | "stage_5_init"
        | "stage_5_generating"
        | "stage_5_complete"
        | "stage_5_awaiting_approval"
        | "finalizing"
        | "completed"
        | "failed"
        | "cancelled"
      job_status_enum:
        | "pending"
        | "waiting"
        | "active"
        | "completed"
        | "failed"
        | "delayed"
      lesson_content_status:
        | "pending"
        | "generating"
        | "completed"
        | "failed"
        | "review_required"
      lesson_status: "draft" | "published" | "archived"
      lesson_type: "video" | "text" | "quiz" | "interactive" | "assignment"
      metric_event_type:
        | "job_rollback"
        | "orphaned_job_recovery"
        | "concurrency_limit_hit"
        | "worker_timeout"
        | "rpc_retry_exhausted"
        | "duplicate_job_detected"
        | "llm_phase_execution"
        | "json_repair_execution"
      metric_severity: "info" | "warn" | "error" | "fatal"
      role: "admin" | "superadmin" | "instructor" | "student"
      stage_error_code:
        | "LOCK_ACQUISITION_FAILED"
        | "ORCHESTRATION_FAILED"
        | "VALIDATION_FAILED"
        | "QUALITY_THRESHOLD_NOT_MET"
        | "DATABASE_ERROR"
        | "TIMEOUT"
        | "UNKNOWN"
      tier: "trial" | "free" | "basic" | "standard" | "premium"
      vector_status: "pending" | "indexing" | "indexed" | "failed"
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
      course_status: ["draft", "published", "archived"],
      document_category: [
        "course_core",
        "supplementary",
        "reference",
        "regulatory",
      ],
      enrichment_status: [
        "pending",
        "draft_generating",
        "draft_ready",
        "generating",
        "completed",
        "failed",
        "cancelled",
      ],
      enrichment_type: ["video", "audio", "presentation", "quiz", "document"],
      enrollment_status: ["active", "completed", "dropped", "expired"],
      generation_stage: ["stage4", "stage5", "stage6"],
      generation_status: [
        "pending",
        "stage_2_init",
        "stage_2_processing",
        "stage_2_complete",
        "stage_2_awaiting_approval",
        "stage_3_init",
        "stage_3_summarizing",
        "stage_3_complete",
        "stage_3_awaiting_approval",
        "stage_4_init",
        "stage_4_analyzing",
        "stage_4_complete",
        "stage_4_awaiting_approval",
        "stage_5_init",
        "stage_5_generating",
        "stage_5_complete",
        "stage_5_awaiting_approval",
        "finalizing",
        "completed",
        "failed",
        "cancelled",
      ],
      job_status_enum: [
        "pending",
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
      ],
      lesson_content_status: [
        "pending",
        "generating",
        "completed",
        "failed",
        "review_required",
      ],
      lesson_status: ["draft", "published", "archived"],
      lesson_type: ["video", "text", "quiz", "interactive", "assignment"],
      metric_event_type: [
        "job_rollback",
        "orphaned_job_recovery",
        "concurrency_limit_hit",
        "worker_timeout",
        "rpc_retry_exhausted",
        "duplicate_job_detected",
        "llm_phase_execution",
        "json_repair_execution",
      ],
      metric_severity: ["info", "warn", "error", "fatal"],
      role: ["admin", "superadmin", "instructor", "student"],
      stage_error_code: [
        "LOCK_ACQUISITION_FAILED",
        "ORCHESTRATION_FAILED",
        "VALIDATION_FAILED",
        "QUALITY_THRESHOLD_NOT_MET",
        "DATABASE_ERROR",
        "TIMEOUT",
        "UNKNOWN",
      ],
      tier: ["trial", "free", "basic", "standard", "premium"],
      vector_status: ["pending", "indexing", "indexed", "failed"],
    },
  },
} as const

