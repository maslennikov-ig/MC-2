CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE users(id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations(id), role text NOT NULL);
CREATE TABLE organization_members(user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE, role text DEFAULT 'member',
  PRIMARY KEY(user_id,organization_id));
CREATE TABLE courses(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid REFERENCES users(id), generation_status text, generation_completed_at timestamptz,
  title text NOT NULL DEFAULT 'Fixture Course', language text DEFAULT 'ru',
  course_structure jsonb DEFAULT '{}', course_description text, slug text,
  is_published boolean DEFAULT false, status text DEFAULT 'draft',
  generation_progress jsonb DEFAULT '{}', analysis_result jsonb, generation_metadata jsonb, updated_at timestamptz DEFAULT now());
CREATE TABLE career_playbooks(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid REFERENCES users(id), status text NOT NULL DEFAULT 'draft', completed_at timestamptz,
  position_title text DEFAULT 'Fixture Role Guide', language text DEFAULT 'ru',
  final_markdown text, role_profile_spec jsonb DEFAULT '{}', generated_blocks jsonb DEFAULT '{}',
  is_public boolean DEFAULT false, share_slug text, cost_breakdown jsonb, image_status text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE course_enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, status text DEFAULT 'active');
CREATE FUNCTION is_superadmin(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS(SELECT 1 FROM users WHERE id=p_id AND role='superadmin') $$;
CREATE FUNCTION is_enrolled_in_course(p_user_id uuid,p_course_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id=p_user_id AND course_id=p_course_id AND status='active') $$;
CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TABLE sections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid REFERENCES courses(id) ON DELETE CASCADE);
CREATE TABLE lessons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_id uuid REFERENCES sections(id) ON DELETE CASCADE);
CREATE TABLE lesson_contents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id uuid NOT NULL,
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE, status text DEFAULT 'completed',
  content jsonb DEFAULT '{}', metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE file_catalog(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE, filename text DEFAULT 'source.txt',
  mime_type text DEFAULT 'text/plain', hash text, storage_path text DEFAULT 'fixtures/source.txt',
  markdown_content text, processed_content text, parsed_content jsonb, summary_metadata jsonb,
  updated_at timestamptz DEFAULT now());
CREATE TABLE career_playbook_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), playbook_id uuid REFERENCES career_playbooks(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id), user_id uuid REFERENCES users(id), source_type text,
  status text DEFAULT 'ready', filename text, file_catalog_id uuid REFERENCES file_catalog(id) ON DELETE CASCADE,
  text text, updated_at timestamptz DEFAULT now());
CREATE TABLE document_evidence_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE, status text, source_manifest jsonb,
  completed_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE course_job_instruction_sources(course_id uuid PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id), job_instruction_id text, source_version text,
  source_content_hash text, origin_binding_id text, origin_command_id text);
CREATE TABLE course_job_instruction_native_sources(course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id), file_catalog_id uuid REFERENCES file_catalog(id) ON DELETE CASCADE,
  source_canonical_content text, source_content_hash text);
CREATE TABLE helixa_generation_commands(binding_id text, command_id text, command_kind text,
  proposal_id text, approved_revision integer, proposal_payload_hash text,
  object_kind text, object_id uuid, organization_id uuid, status text);
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_playbooks ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
