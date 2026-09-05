-- Helixa AIOS bridge: three defects found reviewing the database side before the
-- five 2026-08-2x migrations are applied anywhere (mc2-gxese, mc2-sdjy8.6).
--
-- D1  pgcrypto lives in the `extensions` schema on this project, not `public`
--     (verified: SELECT extnamespace FROM pg_extension -> 'extensions'; `digest`
--     resolves only there). Four Helixa functions call a bare `digest(...)` under
--     `SET search_path = public`, which overrides the role search_path, so every
--     one of them raises `function digest(bytea, unknown) does not exist` the
--     first time it is reached. The repo precedent is explicit: the 2026-07-11
--     auto-answer migration calls `extensions.digest(...)`, and
--     `update_file_catalog_processing` uses `SET search_path = public, extensions`.
--     Nothing caught this because the only tests that execute this SQL are the
--     `*-pg17.test.ts` files, which skip without a live database.
--
--     The worst of the four is `capture_helixa_role_guide_generation_proof`: it is
--     an AFTER trigger on `career_playbooks`, so its exception would abort the
--     career playbook completion write itself. It is reached only when a matching
--     `helixa_generation_commands` row exists, so the tables being empty is what
--     keeps it a no-op today.
--
-- D2  `prevent_helixa_native_source_file_mutation` is a BEFORE UPDATE OR DELETE
--     trigger on the live `file_catalog` table and was NOT `SECURITY DEFINER`. It
--     reads `course_job_instruction_native_sources`, which is REVOKEd from
--     `authenticated`/`anon` and has RLS enabled with no policy. `file_catalog`'s
--     own `file_catalog_all` policy explicitly permits an admin or instructor JWT
--     to UPDATE and DELETE, and `authenticated` has no BYPASSRLS. Such a write
--     would fail with `permission denied for table
--     course_job_instruction_native_sources` on rows that have nothing to do with
--     Helixa, and the table-level ACL is checked whether or not the table has any
--     rows -- so this one is NOT gated on the feature being used. Today every
--     in-repo `file_catalog` write goes through `getSupabaseAdmin()` (service_role,
--     BYPASSRLS), which is the only reason it is latent rather than live.
--     `validate_course_job_instruction_native_source` reads the same revoked table
--     and gets the same treatment.
--
-- D3  Three per-write lookups had no index to stand on. Both `courses` triggers
--     and all three `career_playbooks` triggers run on every ordinary completion
--     write, and `observe_helixa_native_generation` cannot use the outbox UNIQUE
--     constraint because that constraint leads with `binding_id` and the function
--     never has one.
--
-- Also here: `observe_helixa_native_generation` matched an outbox row on
-- `(object_kind, object_id, completed_at)` alone. It is handed an organization and
-- did not use it, so with more than one binding it could return a different
-- binding's `event_id`, which `complete_observed_helixa_generation_command` then
-- rejects as an unavailable proof. The signature is unchanged on purpose: adding a
-- parameter would leave two same-named functions and make the PostgREST `rpc()`
-- call unresolvable.

BEGIN;

-- D1 + D2 ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION capture_helixa_role_guide_generation_proof()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
DECLARE source_version TEXT;
DECLARE content_hash TEXT;
BEGIN
  IF NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
    SELECT * INTO command FROM helixa_generation_commands c
    WHERE c.organization_id = NEW.organization_id AND c.object_kind = 'ROLE_GUIDE'
      AND c.object_id = NEW.id AND c.command_kind = 'CREATE_JOB_INSTRUCTION';
    IF FOUND THEN
      source_version := to_char(NEW.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
      content_hash := encode(extensions.digest(convert_to(helixa_canonical_json_v1(
        helixa_role_guide_content_v1(NEW.final_markdown, NEW.role_profile_spec, NEW.generated_blocks)
      ), 'UTF8'), 'sha256'), 'hex');
      INSERT INTO role_guide_generation_proofs(playbook_id, organization_id, source_version, content_hash, origin_binding_id, origin_command_id)
      VALUES (NEW.id, NEW.organization_id, source_version, content_hash, command.binding_id, command.command_id)
      ON CONFLICT (playbook_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_course_job_instruction_native_source()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM course_job_instruction_sources relation
    JOIN file_catalog file ON file.id = NEW.file_catalog_id
    WHERE relation.course_id = NEW.course_id
      AND relation.organization_id = NEW.organization_id
      AND relation.source_content_hash = NEW.source_content_hash
      AND file.course_id = NEW.course_id
      AND file.organization_id = NEW.organization_id
      AND file.hash = NEW.source_content_hash
      AND file.processed_content = NEW.source_canonical_content
      AND file.markdown_content = NEW.source_canonical_content
      AND file.vector_status = 'indexed'
  ) OR encode(extensions.digest(convert_to(NEW.source_canonical_content, 'UTF8'), 'sha256'), 'hex') <> NEW.source_content_hash
  THEN
    RAISE EXCEPTION 'Native ROLE_GUIDE source proof is invalid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_helixa_native_source_file_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM course_job_instruction_native_sources source
    WHERE source.file_catalog_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Native ROLE_GUIDE source file is immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION validate_course_job_instruction_source()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
BEGIN
  SELECT * INTO command FROM helixa_generation_commands c
  WHERE c.binding_id = NEW.origin_binding_id AND c.command_id = NEW.origin_command_id;
  IF NOT FOUND OR command.command_kind <> 'CREATE_COURSE_FROM_JOB_INSTRUCTION'
    OR command.object_kind <> 'COURSE' OR command.object_id <> NEW.course_id
    OR command.organization_id <> NEW.organization_id
    OR command.command_payload->'sourceJobInstruction'->>'kind' <> 'ROLE_GUIDE'
    OR command.command_payload->'sourceJobInstruction'->>'id' <> NEW.job_instruction_id::TEXT
    OR command.command_payload->'sourceJobInstruction'->>'sourceVersion' <> NEW.source_version
    OR command.command_payload->'sourceJobInstruction'->>'contentHash' <> NEW.source_content_hash
    OR NOT EXISTS (SELECT 1 FROM courses course WHERE course.id = NEW.course_id AND course.organization_id = NEW.organization_id)
    OR NOT EXISTS (SELECT 1 FROM career_playbooks guide WHERE guide.id = NEW.job_instruction_id AND guide.organization_id = NEW.organization_id AND guide.status = 'completed')
    OR NOT EXISTS (
      SELECT 1 FROM role_guide_generation_proofs proof
      WHERE proof.playbook_id = NEW.job_instruction_id AND proof.organization_id = NEW.organization_id
        AND proof.source_version = NEW.source_version AND proof.content_hash = NEW.source_content_hash
    )
  THEN RAISE EXCEPTION 'Course Job Instruction source relation is invalid'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION schedule_helixa_course_from_role_guide(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID, p_organization_id UUID,
  p_user_id UUID, p_course JSONB, p_source_job_instruction JSONB,
  p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
DECLARE guide career_playbooks%ROWTYPE;
DECLARE current_source_version TEXT;
DECLARE current_source_content TEXT;
DECLARE current_content_hash TEXT;
DECLARE native_source_file_id UUID;
BEGIN
  SELECT * INTO command FROM helixa_generation_commands c
  WHERE c.binding_id = p_binding_id AND c.command_id = p_command_id
    AND c.command_kind = 'CREATE_COURSE_FROM_JOB_INSTRUCTION'
    AND c.object_kind = 'COURSE' AND c.object_id = p_course_id
    AND c.organization_id = p_organization_id
    AND c.lease_token = p_lease_token AND c.claim_generation = p_claim_generation
    AND c.status IN ('reserved', 'executing') AND c.lease_expires_at > NOW()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GENERATION_COMMAND_FENCE_LOST'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM helixa_knowledge_sync_bindings binding
    JOIN auth.users principal ON principal.id = binding.generation_service_principal_user_id
    JOIN users public_user ON public_user.id = principal.id AND public_user.organization_id = binding.organization_id
    JOIN organization_members membership ON membership.user_id = principal.id
      AND membership.organization_id = binding.organization_id
      AND membership.role::TEXT IN ('owner', 'admin', 'instructor')
    WHERE binding.binding_id = p_binding_id AND binding.organization_id = p_organization_id
      AND binding.enabled AND binding.course_from_job_instruction_creation_enabled
      AND binding.generation_service_principal_user_id = p_user_id
      AND COALESCE(principal.raw_app_meta_data->>'kind', '') = 'service_principal'
      AND NOT COALESCE((principal.raw_app_meta_data->>'interactive_login_allowed')::BOOLEAN, true)
  ) THEN RAISE EXCEPTION 'GENERATION_SERVICE_PRINCIPAL_INVALID'; END IF;
  IF command.command_payload->'sourceJobInstruction' <> p_source_job_instruction
    OR command.command_payload->'course' <> p_course
  THEN RAISE EXCEPTION 'GENERATION_COMMAND_PAYLOAD_MISMATCH'; END IF;

  SELECT * INTO guide FROM career_playbooks p
  WHERE p.id = (p_source_job_instruction->>'id')::UUID
    AND p.organization_id = p_organization_id AND p.status = 'completed' AND p.completed_at IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROLE_GUIDE_SOURCE_UNAVAILABLE'; END IF;

  current_source_version := to_char(guide.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  current_source_content := helixa_canonical_json_v1(
    helixa_role_guide_content_v1(guide.final_markdown, guide.role_profile_spec, guide.generated_blocks)
  );
  current_content_hash := encode(extensions.digest(convert_to(current_source_content, 'UTF8'), 'sha256'), 'hex');
  IF p_source_job_instruction->>'kind' <> 'ROLE_GUIDE'
    OR p_source_job_instruction->>'sourceVersion' <> current_source_version
    OR p_source_job_instruction->>'contentHash' <> current_content_hash
  THEN RAISE EXCEPTION 'ROLE_GUIDE_SOURCE_STALE'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM role_guide_generation_proofs proof
    WHERE proof.playbook_id = guide.id AND proof.organization_id = p_organization_id
      AND proof.source_version = current_source_version AND proof.content_hash = current_content_hash
  ) THEN RAISE EXCEPTION 'ROLE_GUIDE_SOURCE_STALE'; END IF;

  INSERT INTO courses(
    id, title, slug, user_id, organization_id, status, course_description,
    target_audience, learning_outcomes, language, course_size, style,
    generation_mode, settings, has_files, created_at, updated_at
  ) VALUES (
    p_course_id, p_course->>'title', 'helixa-' || replace(p_course_id::TEXT, '-', ''),
    p_user_id, p_organization_id, 'draft', p_course->>'courseDescription',
    p_course->>'targetAudience', array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_course->'learningOutcomes')), E'\n'),
    p_course->>'language', p_course->>'courseSize', p_course->>'style',
    'semi_automatic', jsonb_build_object(
      'includeWebResearch', false, 'includeBusinessContextSources', false,
      'roleGuideId', guide.id, 'roleGuideSourceVersion', current_source_version
    ), true, NOW(), NOW()
  );

  INSERT INTO course_job_instruction_sources(
    course_id, organization_id, job_instruction_id, source_version, source_content_hash,
    origin_binding_id, origin_command_id
  ) VALUES (
    p_course_id, p_organization_id, guide.id, current_source_version, current_content_hash,
    p_binding_id, p_command_id
  );

  INSERT INTO file_catalog(
    organization_id, course_id, filename, original_name, file_type, file_size,
    storage_path, hash, mime_type, vector_status, markdown_content, processed_content,
    processing_method, summary_metadata, priority
  ) VALUES (
    p_organization_id, p_course_id, 'role-guide-' || guide.id::TEXT || '.json',
    'ROLE_GUIDE ' || guide.id::TEXT, 'json', octet_length(current_source_content),
    'helixa-generation://role-guide/' || guide.id::TEXT || '/' || current_content_hash,
    current_content_hash, 'application/json', 'indexed', current_source_content,
    current_source_content, 'full_text', jsonb_build_object(
      'source', 'helixa_role_guide', 'source_version_hash', current_content_hash,
      'original_tokens', greatest(1, octet_length(current_source_content) / 4),
      'summary_tokens', greatest(1, octet_length(current_source_content) / 4),
      'compression_ratio', 1, 'quality_score', 1
    ), 'CORE'
  ) RETURNING id INTO native_source_file_id;

  INSERT INTO course_job_instruction_native_sources(
    course_id, organization_id, file_catalog_id, source_canonical_content, source_content_hash
  ) VALUES (
    p_course_id, p_organization_id, native_source_file_id, current_source_content, current_content_hash
  );

  INSERT INTO job_outbox(entity_id, queue_name, job_data, job_options, target_queue)
  VALUES (
    p_course_id, 'structure_analysis',
    jsonb_build_object(
      'jobType', 'structure_analysis', 'organizationId', p_organization_id,
      'courseId', p_course_id, 'userId', p_user_id, 'createdAt', NOW(),
      'title', p_course->>'title', 'settings', jsonb_build_object(
        'includeWebResearch', false, 'includeBusinessContextSources', false,
        'roleGuideId', guide.id, 'roleGuideSourceVersion', current_source_version,
        'roleGuideSourceFileId', native_source_file_id
      ), 'courseSize', p_course->>'courseSize'
    ), jsonb_build_object('priority', 0), 'course-generation'
  );
  RETURN true;
END;
$$;

-- Outbox match scoped to the organization it was already handed -----------------

CREATE OR REPLACE FUNCTION observe_helixa_native_generation(
  p_organization_id UUID, p_object_kind TEXT, p_object_id UUID
) RETURNS TABLE(outcome TEXT, native_completed_at TIMESTAMPTZ, outbox_event_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_native_status TEXT;
DECLARE v_completed_at TIMESTAMPTZ;
DECLARE v_event_id TEXT;
BEGIN
  IF p_object_kind = 'COURSE' THEN
    SELECT generation_status::TEXT, generation_completed_at INTO v_native_status, v_completed_at
    FROM courses WHERE id = p_object_id AND organization_id = p_organization_id;
  ELSIF p_object_kind = 'ROLE_GUIDE' THEN
    SELECT status, completed_at INTO v_native_status, v_completed_at
    FROM career_playbooks WHERE id = p_object_id AND organization_id = p_organization_id;
  ELSE
    RAISE EXCEPTION 'Unsupported native generation object kind';
  END IF;
  IF NOT FOUND THEN RETURN QUERY SELECT 'missing', NULL::TIMESTAMPTZ, NULL::TEXT; RETURN; END IF;
  IF v_native_status = 'failed' THEN RETURN QUERY SELECT 'failed', NULL::TIMESTAMPTZ, NULL::TEXT; RETURN; END IF;
  IF v_native_status <> 'completed' OR v_completed_at IS NULL THEN
    RETURN QUERY SELECT 'running', NULL::TIMESTAMPTZ, NULL::TEXT; RETURN;
  END IF;
  SELECT outbox.event_id INTO v_event_id FROM helixa_knowledge_sync_outbox outbox
  WHERE outbox.organization_id = p_organization_id
    AND outbox.object_kind = p_object_kind AND outbox.object_id = p_object_id
    AND outbox.completed_at = v_completed_at ORDER BY outbox.event_id LIMIT 1;
  IF v_event_id IS NULL THEN
    RETURN QUERY SELECT 'succeeded_awaiting_signed_import', v_completed_at, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT 'completed', v_completed_at, v_event_id;
  END IF;
END;
$$;

-- D3 ---------------------------------------------------------------------------

-- Read by both enqueue triggers on every `courses` and `career_playbooks` write.
CREATE INDEX IF NOT EXISTS idx_helixa_knowledge_sync_bindings_organization_enabled
  ON helixa_knowledge_sync_bindings(organization_id) WHERE enabled;

-- Read by `capture_helixa_role_guide_generation_proof` and
-- `mark_helixa_generation_native_completed` on the same writes. The existing
-- UNIQUE (binding_id, object_kind, object_id) cannot serve them: neither has a
-- binding_id, and binding_id leads that index.
CREATE INDEX IF NOT EXISTS idx_helixa_generation_commands_organization_object
  ON helixa_generation_commands(organization_id, object_kind, object_id);

-- Read by `observe_helixa_native_generation`, which has no binding_id either.
CREATE INDEX IF NOT EXISTS idx_helixa_knowledge_sync_outbox_organization_object
  ON helixa_knowledge_sync_outbox(organization_id, object_kind, object_id, completed_at);

REVOKE ALL ON FUNCTION capture_helixa_role_guide_generation_proof() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION validate_course_job_instruction_native_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION validate_course_job_instruction_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION prevent_helixa_native_source_file_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION schedule_helixa_course_from_role_guide(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION observe_helixa_native_generation(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION schedule_helixa_course_from_role_guide(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION observe_helixa_native_generation(UUID, TEXT, UUID) TO service_role;

COMMIT;
