-- Default-off MegaCampus knowledge-sync v2. Native visibility/RLS are unchanged.
-- Current audience: at least one actual producer-organization member can read
-- the completed object. Removing a public link alone does not withdraw it.
BEGIN;

ALTER TABLE helixa_knowledge_sync_bindings
  ADD COLUMN contract_v2_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE helixa_knowledge_sync_outbox
  ADD COLUMN contract_version INTEGER NOT NULL DEFAULT 1 CHECK (contract_version IN (1,2)),
  ADD COLUMN event_type TEXT,
  ADD COLUMN revision BIGINT CHECK (revision BETWEEN 1 AND 9007199254740991),
  ADD COLUMN retraction_reason TEXT CHECK (retraction_reason IN
    ('deleted','unpublished','visibility_restricted','generation_reverted')),
  ADD COLUMN content_hash TEXT CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN snapshot JSONB;
ALTER TABLE helixa_knowledge_sync_outbox ADD CONSTRAINT helixa_sync_outbox_v2_shape CHECK (
  contract_version=1 OR (revision IS NOT NULL AND event_type IS NOT NULL AND (
    (event_type=object_kind||'_RETRACTED' AND retraction_reason IS NOT NULL AND snapshot IS NULL AND content_hash IS NULL)
    OR (event_type IN (object_kind||'_COMPLETED',object_kind||'_UPDATED')
      AND retraction_reason IS NULL AND snapshot IS NOT NULL AND content_hash IS NOT NULL)
  ))
);
-- A completion instant identifies v1 only; many v2 edits share that instant.
DO $$
DECLARE completion_constraint TEXT;
BEGIN
  SELECT c.conname INTO STRICT completion_constraint FROM pg_constraint c
    WHERE c.conrelid='public.helixa_knowledge_sync_outbox'::regclass AND c.contype='u'
    AND (SELECT array_agg(a.attname::text ORDER BY k.position) FROM unnest(c.conkey) WITH ORDINALITY k(number,position)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.number)
      =ARRAY['binding_id','object_kind','object_id','completed_at'];
  EXECUTE format('ALTER TABLE helixa_knowledge_sync_outbox DROP CONSTRAINT %I',completion_constraint);
END;
$$;
CREATE UNIQUE INDEX helixa_sync_outbox_v1_completion
  ON helixa_knowledge_sync_outbox(binding_id,object_kind,object_id,completed_at)
  WHERE contract_version=1;

CREATE TABLE helixa_knowledge_sync_revisions (
  object_kind TEXT NOT NULL CHECK (object_kind IN ('COURSE','ROLE_GUIDE')),
  object_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  active BOOLEAN NOT NULL,
  last_visibility TEXT,
  fingerprint TEXT,
  content_hash TEXT,
  completed_at TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  retraction_reason TEXT,
  snapshot JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(object_kind,object_id)
);
COMMENT ON TABLE helixa_knowledge_sync_revisions IS
  'Durable object clocks have no native-object or organization foreign key: hard deletion never resets ordering.';
CREATE TABLE helixa_knowledge_sync_v2_dirty (
  transaction_id BIGINT NOT NULL,
  object_kind TEXT NOT NULL,
  object_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  PRIMARY KEY(transaction_id,object_kind,object_id,organization_id)
);
ALTER TABLE helixa_knowledge_sync_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE helixa_knowledge_sync_v2_dirty ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON helixa_knowledge_sync_revisions,helixa_knowledge_sync_v2_dirty FROM PUBLIC,anon,authenticated;
GRANT SELECT ON helixa_knowledge_sync_revisions TO service_role;

-- Canonical JSON matches canonical-json.ts: compact JSON, JS numeric spelling,
-- and UTF-16 object-key ordering (including supplementary Unicode keys).
CREATE FUNCTION helixa_sync_utf16_key(p_value TEXT) RETURNS BYTEA
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public AS $$
DECLARE result TEXT := ''; code INTEGER; i INTEGER;
BEGIN
  FOR i IN 1..length(p_value) LOOP
    code := ascii(substr(p_value,i,1));
    IF code > 65535 THEN
      code := code-65536;
      result := result||lpad(to_hex(55296+(code>>10)),4,'0')||lpad(to_hex(56320+(code&1023)),4,'0');
    ELSE result := result||lpad(to_hex(code),4,'0'); END IF;
  END LOOP;
  RETURN decode(result,'hex');
END;
$$;
CREATE FUNCTION helixa_sync_canonical_json(p_value JSONB) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public AS $$
DECLARE result TEXT; number DOUBLE PRECISION; raw TEXT; exponent INTEGER; coefficient TEXT; digits TEXT;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT '{'||coalesce(string_agg(to_jsonb(e.key)::text||':'||helixa_sync_canonical_json(e.value),','
        ORDER BY helixa_sync_utf16_key(e.key)),'')||'}' INTO result FROM jsonb_each(p_value) e;
    WHEN 'array' THEN
      SELECT '['||coalesce(string_agg(helixa_sync_canonical_json(e.value),',' ORDER BY e.position),'')||']'
        INTO result FROM jsonb_array_elements(p_value) WITH ORDINALITY e(value,position);
    WHEN 'number' THEN
      number := (p_value::text)::double precision;
      IF number=0 THEN RETURN '0'; END IF;
      raw := number::text;
      IF abs(number)>=0.000001 AND abs(number)<1e21 THEN
        result := trim_scale(raw::numeric)::text;
      ELSE
        IF position('e' IN raw)>0 THEN
          coefficient := split_part(raw,'e',1); exponent := split_part(raw,'e',2)::integer;
        ELSE
          -- float8 emits scientific notation at these magnitudes on PG17;
          -- retain a numeric fallback for different extra_float_digits settings.
          digits := replace(ltrim(raw,'-'),'.','');
          exponent := CASE WHEN abs(number)>=1 THEN length(split_part(raw,'.',1))-1
            ELSE -(length(split_part(raw,'.',2))-length(ltrim(split_part(raw,'.',2),'0'))+1) END;
          digits := rtrim(ltrim(digits,'0'),'0');
          coefficient := left(digits,1)||CASE WHEN length(digits)>1 THEN '.'||substr(digits,2) ELSE '' END;
          IF number<0 THEN coefficient := '-'||coefficient; END IF;
        END IF;
        result := coefficient||'e'||CASE WHEN exponent>=0 THEN '+' ELSE '' END||exponent::text;
      END IF;
    ELSE result := p_value::text;
  END CASE;
  RETURN result;
END;
$$;
CREATE FUNCTION helixa_sync_content_hash(p_snapshot JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT SET search_path=public AS $$
  SELECT encode(extensions.digest(convert_to(helixa_sync_canonical_json(jsonb_build_object(
    'summaryMarkdown',p_snapshot->'summaryMarkdown','structure',p_snapshot->'structure',
    'blocks',p_snapshot->'blocks','lessons',p_snapshot->'lessons')),'UTF8'),'sha256'),'hex')
$$;
CREATE FUNCTION helixa_sync_snapshot_fingerprint(p_snapshot JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT SET search_path=public AS $$
  SELECT encode(extensions.digest(convert_to(helixa_sync_canonical_json(
    (p_snapshot-'completedAt'-'_generationOrigin')||jsonb_build_object('sources',
      (SELECT coalesce(jsonb_agg(s.source-'_file'-'_nativeProof'-'storagePath'-'fileId' ORDER BY s.position),'[]')
        FROM jsonb_array_elements(p_snapshot->'sources') WITH ORDINALITY s(source,position)))),'UTF8'),'sha256'),'hex')
$$;

CREATE FUNCTION helixa_sync_object_is_readable(p_kind TEXT,p_id UUID,p_org UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE p_kind
    WHEN 'COURSE' THEN EXISTS(
      SELECT 1 FROM courses c JOIN organization_members m ON m.organization_id=c.organization_id
        JOIN users u ON u.id=m.user_id
      WHERE c.id=p_id AND c.organization_id=p_org AND (
        is_superadmin(u.id) OR CASE u.role::text
          WHEN 'admin' THEN u.organization_id=c.organization_id
          WHEN 'instructor' THEN u.organization_id=c.organization_id
          WHEN 'student' THEN c.visibility::text='public'
            OR (c.visibility::text='organization' AND u.organization_id=c.organization_id)
            OR is_enrolled_in_course(u.id,c.id)
          ELSE false END))
    WHEN 'ROLE_GUIDE' THEN EXISTS(
      SELECT 1 FROM career_playbooks c JOIN organization_members m ON m.organization_id=c.organization_id
        JOIN users u ON u.id=m.user_id
      WHERE c.id=p_id AND c.organization_id=p_org AND (
        is_superadmin(u.id) OR (c.visibility::text='private' AND c.user_id=u.id)
        OR c.visibility::text IN ('public','organization')))
    ELSE false END
$$;

-- Pinned source descriptors contain only provenance/answerable fields. No
-- timestamps, processing progress, costs or worker state enter comparisons.
CREATE FUNCTION helixa_sync_file_source(p_file JSONB,p_kind TEXT,p_object UUID,p_source UUID,
  p_version TEXT,p_approved BOOLEAN,p_native JSONB DEFAULT NULL) RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id',p_source,'sourceType',CASE p_kind WHEN 'COURSE' THEN 'file_catalog' ELSE 'career_playbook_source' END,
    'organizationId',p_file->'organization_id','objectKind',p_kind,'objectId',p_object,
    'approved',p_approved,'version',p_version,
    'sourceSha256',CASE WHEN p_file->>'hash' ~ '^[a-f0-9]{64}$' THEN p_file->>'hash' END,
    'underlyingFileId',CASE WHEN p_source::text<>p_file->>'id' THEN p_file->>'id' END,
    'fileId',p_file->>'id','fileName',p_file->>'filename','mediaType',p_file->>'mime_type',
    'storagePath',p_file->>'storage_path',
    'acceptedDoclingJson',CASE WHEN p_file->'parsed_content'->>'schema_name'='DoclingDocument'
      THEN helixa_sync_canonical_json(p_file->'parsed_content') END,
    'trustedMarkdown',CASE WHEN btrim(p_file->>'markdown_content')<>'' THEN p_file->>'markdown_content' END,
    '_file',p_file,'_nativeProof',p_native))
$$;
-- Match native latest-usable-lesson-content.ts: completed/approved is filtered
-- by the caller; an empty or failed newest version must not hide older usable
-- content. markdownContent is answerable metadata, unlike worker bookkeeping.
CREATE FUNCTION helixa_sync_text_is_nonempty(p_value JSONB) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(jsonb_typeof(p_value)='string' AND btrim(p_value#>>'{}',
    -- ECMAScript String.trim whitespace, including Unicode and BOM.
    chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||
    chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||
    chr(8287)||chr(12288)||chr(65279))<>'',false)
$$;
CREATE FUNCTION helixa_sync_normalize_lesson_content(p_value JSONB) RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE WHEN jsonb_typeof(p_value)='object' AND jsonb_typeof(p_value->'content')='object'
    THEN p_value-'metadata'-'status'-'created_at'-'updated_at' ELSE p_value END
$$;
CREATE FUNCTION helixa_sync_lesson_content_is_usable(p_content JSONB,p_metadata JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE content JSONB; key TEXT;
BEGIN
  IF helixa_sync_text_is_nonempty(p_metadata->'markdownContent') THEN RETURN true; END IF;
  IF jsonb_typeof(p_content)='string' THEN RETURN helixa_sync_text_is_nonempty(p_content); END IF;
  IF jsonb_typeof(p_content) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  content:=CASE WHEN jsonb_typeof(p_content->'content')='object' THEN p_content->'content' ELSE p_content END;
  FOREACH key IN ARRAY ARRAY['markdown','rawMarkdown','raw_markdown','text','intro','introduction',
    'mainContent','main_content','summary','body'] LOOP
    IF helixa_sync_text_is_nonempty(content->key) THEN RETURN true; END IF;
  END LOOP;
  IF jsonb_typeof(content->'sections')='array' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(content->'sections') section WHERE
      helixa_sync_text_is_nonempty(section->'title') OR helixa_sync_text_is_nonempty(section->'content')) THEN RETURN true; END IF;
  IF jsonb_typeof(content->'exercises')='array' THEN RETURN jsonb_array_length(content->'exercises')>0; END IF;
  RETURN false;
END;
$$;
CREATE FUNCTION get_helixa_knowledge_sync_v2_snapshot(p_object_kind TEXT,p_object_id UUID,p_organization_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE native JSONB; origin JSONB; relation JSONB; source_rows JSONB; block_rows JSONB; lesson_rows JSONB; result JSONB;
BEGIN
  IF NOT helixa_sync_object_is_readable(p_object_kind,p_object_id,p_organization_id) THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('binding_id',g.binding_id,'command_id',g.command_id,'command_kind',g.command_kind,
    'proposal_id',g.proposal_id,'approved_revision',g.approved_revision,'proposal_payload_hash',g.proposal_payload_hash,
    'object_kind',g.object_kind,'object_id',g.object_id,'organization_id',g.organization_id,'status',g.status)
    INTO origin FROM helixa_generation_commands g WHERE g.object_kind=p_object_kind AND g.object_id=p_object_id
      AND g.organization_id=p_organization_id AND g.status='native_completed' ORDER BY g.binding_id LIMIT 1;
  IF p_object_kind='COURSE' THEN
    SELECT to_jsonb(c) INTO native FROM courses c WHERE c.id=p_object_id AND c.organization_id=p_organization_id
      AND c.generation_status='completed' AND c.generation_completed_at IS NOT NULL;
    IF native IS NULL THEN RETURN NULL; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('lesson_id',l.lesson_id,'content',helixa_sync_normalize_lesson_content(l.content))||
      CASE WHEN helixa_sync_text_is_nonempty(l.metadata->'markdownContent') THEN
        jsonb_build_object('metadata',jsonb_build_object('markdownContent',l.metadata->'markdownContent')) ELSE '{}'::jsonb END
      ORDER BY l.lesson_id),'[]') INTO lesson_rows FROM (
      SELECT DISTINCT ON (candidate.lesson_id) candidate.lesson_id,candidate.content,candidate.metadata
      FROM lesson_contents candidate WHERE candidate.course_id=p_object_id AND candidate.status IN ('completed','approved')
        AND helixa_sync_lesson_content_is_usable(candidate.content,candidate.metadata)
      ORDER BY candidate.lesson_id,candidate.created_at DESC,candidate.id DESC
    ) l;
    SELECT jsonb_build_object('course_id',r.course_id,'organization_id',r.organization_id,
      'job_instruction_id',r.job_instruction_id,'source_version',r.source_version,'source_content_hash',r.source_content_hash,
      'origin_binding_id',r.origin_binding_id,'origin_command_id',r.origin_command_id) INTO relation FROM course_job_instruction_sources r
      WHERE r.course_id=p_object_id AND r.organization_id=p_organization_id;
    IF origin->>'command_kind'='CREATE_COURSE' THEN source_rows := '[]';
    ELSE
      SELECT coalesce(jsonb_agg(helixa_sync_file_source(
        jsonb_build_object('id',f.id,'organization_id',f.organization_id,'course_id',f.course_id,'filename',f.filename,
          'mime_type',f.mime_type,'hash',f.hash,'storage_path',f.storage_path,'markdown_content',f.markdown_content,
          'processed_content',f.processed_content,'parsed_content',f.parsed_content,'summary_metadata',
          CASE WHEN f.storage_path LIKE 'helixa-generation://%' THEN f.summary_metadata END),
        'COURSE',p_object_id,(s.item->>'document_id')::uuid,s.item->>'source_version_hash',
        coalesce(f.hash=s.item->>'source_version_hash' AND f.organization_id=p_organization_id AND f.course_id=p_object_id,false),
        (SELECT jsonb_build_object('course_id',n.course_id,'organization_id',n.organization_id,'file_catalog_id',n.file_catalog_id,
          'source_canonical_content',n.source_canonical_content,'source_content_hash',n.source_content_hash) FROM course_job_instruction_native_sources n
          WHERE n.course_id=p_object_id AND n.organization_id=p_organization_id AND n.file_catalog_id=f.id)
      ) ORDER BY s.ordinality),'[]') INTO source_rows
      FROM (SELECT r.source_manifest FROM document_evidence_runs r
        WHERE r.course_id=p_object_id AND r.organization_id=p_organization_id AND r.status='accepted'
        ORDER BY r.completed_at DESC,r.id DESC LIMIT 1) run
      CROSS JOIN LATERAL jsonb_array_elements(run.source_manifest) WITH ORDINALITY s(item,ordinality)
      LEFT JOIN file_catalog f ON f.id=(s.item->>'document_id')::uuid;
    END IF;
    result := jsonb_build_object('kind','COURSE','id',p_object_id,'organizationId',p_organization_id,
      'completedAt',to_char((native->>'generation_completed_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'title',native->>'title','language',coalesce(native->>'language','ru'),
      'summaryMarkdown',coalesce(nullif(btrim(native->>'course_description'),''),'# '||(native->>'title')),
      'structure',CASE WHEN jsonb_typeof(native->'course_structure')='object' THEN native->'course_structure' ELSE '{}'::jsonb END,
      'blocks','[]'::jsonb,'lessons',lesson_rows,'sources',source_rows);
    IF native->>'slug' IS NOT NULL THEN result := result||jsonb_build_object('url','https://ai.megacampus.ru/courses/'||(native->>'slug')); END IF;
  ELSIF p_object_kind='ROLE_GUIDE' THEN
    SELECT to_jsonb(c) INTO native FROM career_playbooks c WHERE c.id=p_object_id AND c.organization_id=p_organization_id
      AND c.status='completed' AND c.completed_at IS NOT NULL AND btrim(c.final_markdown)<>'';
    IF native IS NULL THEN RETURN NULL; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('key',b.key,'value',jsonb_build_object('content',b.value->>'content'))
      ORDER BY helixa_sync_utf16_key(b.key)),'[]') INTO block_rows
      FROM jsonb_each(CASE WHEN jsonb_typeof(native->'generated_blocks')='object' THEN native->'generated_blocks' ELSE '{}'::jsonb END) b;
    SELECT coalesce(jsonb_agg(CASE WHEN s.source_type='text' THEN jsonb_build_object(
      'id',s.id,'sourceType','career_playbook_source','organizationId',s.organization_id,'objectKind','ROLE_GUIDE',
      'objectId',p_object_id,'approved',s.organization_id=p_organization_id,
      'version',encode(extensions.digest(convert_to(s.text,'UTF8'),'sha256'),'hex'),
      'sourceSha256',encode(extensions.digest(convert_to(s.text,'UTF8'),'sha256'),'hex'),
      'fileName',coalesce(s.filename,'source-'||s.id||'.txt'),'mediaType','text/plain','originalText',s.text,'trustedMarkdown',s.text)
      ELSE helixa_sync_file_source(jsonb_build_object('id',f.id,'organization_id',f.organization_id,'course_id',f.course_id,
        'filename',f.filename,'mime_type',f.mime_type,'hash',f.hash,'storage_path',f.storage_path,
        'markdown_content',f.markdown_content,'processed_content',f.processed_content,'parsed_content',f.parsed_content,
        'summary_metadata',NULL), 'ROLE_GUIDE',p_object_id,s.id,f.hash,
        coalesce(s.organization_id=p_organization_id AND f.organization_id=p_organization_id AND f.course_id IS NULL,false)) END
      ORDER BY s.id),'[]') INTO source_rows FROM career_playbook_sources s
      LEFT JOIN file_catalog f ON f.id=s.file_catalog_id
      WHERE s.playbook_id=p_object_id AND s.status='ready' AND (s.source_type='file' OR btrim(s.text)<>'');
    result := jsonb_build_object('kind','ROLE_GUIDE','id',p_object_id,'organizationId',p_organization_id,
      'completedAt',to_char((native->>'completed_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'title',coalesce(nullif(btrim(native->>'position_title'),''),'Role Guide'),'language',native->>'language',
      'summaryMarkdown',native->>'final_markdown',
      'structure',jsonb_build_object('roleProfileSpec',CASE WHEN jsonb_typeof(native->'role_profile_spec')='object'
        THEN native->'role_profile_spec' ELSE '{}'::jsonb END),
      'blocks',block_rows,'lessons','[]'::jsonb,'sources',source_rows);
  ELSE RAISE EXCEPTION 'Unsupported knowledge object kind'; END IF;
  IF origin IS NOT NULL THEN result := result||jsonb_build_object('_generationOrigin',origin); END IF;
  IF relation IS NOT NULL THEN result := result||jsonb_build_object('_jobInstructionSource',relation); END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION assert_helixa_knowledge_sync_v2_binding(p_binding_id TEXT,p_organization_id UUID,
  p_environment TEXT,p_destination_binding_id TEXT,p_require_v2 BOOLEAN DEFAULT true) RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM helixa_knowledge_sync_bindings b WHERE b.binding_id=p_binding_id
    AND b.organization_id=p_organization_id AND b.environment=p_environment
    AND b.destination_binding_id=p_destination_binding_id AND b.enabled AND (NOT p_require_v2 OR b.contract_v2_enabled))
    THEN RAISE EXCEPTION 'Knowledge sync binding is not active for requested contract'; END IF;
END;
$$;
CREATE FUNCTION set_helixa_knowledge_sync_v2_enabled(p_binding_id TEXT,p_organization_id UUID,
  p_environment TEXT,p_destination_binding_id TEXT,p_enabled BOOLEAN) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous_mode BOOLEAN;
BEGIN
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'Capture gate requires explicit boolean'; END IF;
  SELECT b.contract_v2_enabled INTO previous_mode FROM helixa_knowledge_sync_bindings b
    WHERE b.binding_id=p_binding_id AND b.organization_id=p_organization_id AND b.environment=p_environment
      AND b.destination_binding_id=p_destination_binding_id AND (NOT p_enabled OR b.enabled) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge sync binding is not active for requested contract'; END IF;
  -- A timeout may leave the v1 receiver materializing after the HTTP request.
  -- Do not switch protocols until every previously leased/frozen v1 intent is
  -- delivered. Durable history prevents a manual attempts reset bypassing this.
  IF p_enabled AND NOT previous_mode AND EXISTS(SELECT 1 FROM helixa_knowledge_sync_outbox o
    WHERE o.binding_id=p_binding_id AND o.organization_id=p_organization_id AND o.environment=p_environment
      AND o.destination_binding_id=p_destination_binding_id AND o.contract_version=1 AND o.status<>'delivered'
      AND (o.claim_generation>0 OR o.attempts>0 OR o.raw_body IS NOT NULL)) THEN
    RAISE EXCEPTION 'Knowledge sync v1 delivery must complete before v2 activation';
  END IF;
  UPDATE helixa_knowledge_sync_bindings SET contract_v2_enabled=p_enabled,updated_at=now()
    WHERE binding_id=p_binding_id AND organization_id=p_organization_id AND environment=p_environment
      AND destination_binding_id=p_destination_binding_id;
  IF p_enabled AND NOT previous_mode THEN
    PERFORM reconcile_helixa_knowledge_sync_v2(p_binding_id,p_organization_id,p_environment,p_destination_binding_id,true);
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION enqueue_helixa_knowledge_sync_v2_revision(p_kind TEXT,p_id UUID) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state helixa_knowledge_sync_revisions%ROWTYPE; inserted INTEGER;
BEGIN
  SELECT * INTO state FROM helixa_knowledge_sync_revisions WHERE object_kind=p_kind AND object_id=p_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  INSERT INTO helixa_knowledge_sync_outbox(binding_id,environment,destination_binding_id,event_id,object_kind,object_id,
    organization_id,completed_at,contract_version,event_type,revision,retraction_reason,content_hash,snapshot)
  SELECT b.binding_id,b.environment,b.destination_binding_id,
    'mc2:'||p_kind||':'||state.organization_id||':'||p_id||':'||split_part(state.event_type,'_',
      CASE p_kind WHEN 'ROLE_GUIDE' THEN 3 ELSE 2 END)||':'||state.revision,
    p_kind,p_id,state.organization_id,state.completed_at,2,state.event_type,state.revision,state.retraction_reason,state.content_hash,state.snapshot
  FROM helixa_knowledge_sync_bindings b WHERE b.organization_id=state.organization_id AND b.enabled AND (
    b.contract_v2_enabled OR (state.event_type=p_kind||'_RETRACTED' AND EXISTS(
      SELECT 1 FROM helixa_knowledge_sync_outbox prior WHERE prior.binding_id=b.binding_id
        AND prior.object_kind=p_kind AND prior.object_id=p_id AND prior.contract_version=2
        AND prior.event_type IN (p_kind||'_COMPLETED',p_kind||'_UPDATED'))))
  ON CONFLICT(binding_id,event_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  RETURN inserted;
END;
$$;
CREATE FUNCTION capture_helixa_knowledge_sync_v2_object(p_kind TEXT,p_id UUID,p_org UUID) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state helixa_knowledge_sync_revisions%ROWTYPE; snapshot JSONB; visibility TEXT; native_status TEXT;
  completed TIMESTAMPTZ; fingerprint TEXT; reason TEXT; next_revision BIGINT; type TEXT; inserted INTEGER := 0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM helixa_knowledge_sync_bindings b
    WHERE b.organization_id=p_org AND b.enabled AND b.contract_v2_enabled) THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('helixa-v2:'||p_kind||':'||p_id,0));
  SELECT * INTO state FROM helixa_knowledge_sync_revisions r WHERE r.object_kind=p_kind AND r.object_id=p_id FOR UPDATE;
  IF p_kind='COURSE' THEN
    SELECT c.visibility::text,c.generation_status,c.generation_completed_at INTO visibility,native_status,completed
      FROM courses c WHERE c.id=p_id AND c.organization_id=p_org;
  ELSIF p_kind='ROLE_GUIDE' THEN
    SELECT c.visibility::text,c.status,c.completed_at INTO visibility,native_status,completed
      FROM career_playbooks c WHERE c.id=p_id AND c.organization_id=p_org;
  ELSE RAISE EXCEPTION 'Unsupported knowledge object kind'; END IF;
  snapshot := get_helixa_knowledge_sync_v2_snapshot(p_kind,p_id,p_org);
  IF state.active AND state.organization_id<>p_org AND visibility IS NOT NULL THEN
    -- NEW may be queued before OLD on a tenant transfer. Preserve the former
    -- scope's withdrawal, including an earlier-v2 binding currently gated off.
    UPDATE helixa_knowledge_sync_revisions SET revision=revision+1,active=false,
      fingerprint=NULL,content_hash=NULL,event_type=p_kind||'_RETRACTED',
      retraction_reason='visibility_restricted',snapshot=NULL,updated_at=now()
      WHERE object_kind=p_kind AND object_id=p_id RETURNING * INTO state;
    inserted:=inserted+enqueue_helixa_knowledge_sync_v2_revision(p_kind,p_id);
  END IF;
  IF snapshot IS NULL THEN
    IF state.object_id IS NULL OR NOT state.active OR state.organization_id<>p_org THEN RETURN inserted; END IF;
    reason := CASE WHEN visibility IS NULL THEN CASE WHEN
      (p_kind='COURSE' AND EXISTS(SELECT 1 FROM courses WHERE id=p_id))
      OR (p_kind='ROLE_GUIDE' AND EXISTS(SELECT 1 FROM career_playbooks WHERE id=p_id))
      THEN 'visibility_restricted' ELSE 'deleted' END
      WHEN native_status IS DISTINCT FROM 'completed' OR completed IS NULL THEN 'generation_reverted'
      WHEN state.last_visibility='public' AND visibility='private' THEN 'unpublished'
      ELSE 'visibility_restricted' END;
    type := p_kind||'_RETRACTED';
  ELSE
    fingerprint := helixa_sync_snapshot_fingerprint(snapshot);
    IF state.active AND state.organization_id=p_org AND state.fingerprint=fingerprint THEN
      UPDATE helixa_knowledge_sync_revisions SET last_visibility=visibility WHERE object_kind=p_kind AND object_id=p_id;
      RETURN enqueue_helixa_knowledge_sync_v2_revision(p_kind,p_id);
    END IF;
    type := p_kind||CASE WHEN state.active AND state.organization_id=p_org THEN '_UPDATED' ELSE '_COMPLETED' END;
  END IF;
  next_revision := coalesce(state.revision,0)+1;
  INSERT INTO helixa_knowledge_sync_revisions(object_kind,object_id,organization_id,revision,active,last_visibility,
    fingerprint,content_hash,completed_at,event_type,retraction_reason,snapshot)
  VALUES(p_kind,p_id,p_org,next_revision,snapshot IS NOT NULL,visibility,fingerprint,helixa_sync_content_hash(snapshot),
    coalesce(completed,state.completed_at,now()),type,reason,snapshot)
  ON CONFLICT(object_kind,object_id) DO UPDATE SET organization_id=excluded.organization_id,revision=excluded.revision,
    active=excluded.active,last_visibility=excluded.last_visibility,fingerprint=excluded.fingerprint,
    content_hash=excluded.content_hash,completed_at=excluded.completed_at,event_type=excluded.event_type,
    retraction_reason=excluded.retraction_reason,snapshot=excluded.snapshot,updated_at=now();
  RETURN inserted+enqueue_helixa_knowledge_sync_v2_revision(p_kind,p_id);
END;
$$;

CREATE FUNCTION queue_helixa_knowledge_sync_v2_object(p_kind TEXT,p_id UUID,p_org UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE gate_enabled BOOLEAN;
BEGIN
  IF p_id IS NULL OR p_org IS NULL THEN RETURN; END IF;
  -- Lock before testing the gate: an activation may have warmed this object
  -- but not committed. After that wait, capture must see the current mode.
  SELECT coalesce(bool_or(locked.contract_v2_enabled),false) INTO gate_enabled FROM (
    SELECT b.contract_v2_enabled FROM helixa_knowledge_sync_bindings b
    WHERE b.organization_id=p_org AND b.enabled ORDER BY b.binding_id FOR KEY SHARE
  ) locked;
  IF NOT gate_enabled THEN RETURN; END IF;
  INSERT INTO helixa_knowledge_sync_v2_dirty VALUES(txid_current(),p_kind,p_id,p_org)
    ON CONFLICT DO NOTHING;
END;
$$;
CREATE FUNCTION queue_helixa_knowledge_sync_v2_organization(p_org UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE object RECORD; gate_enabled BOOLEAN;
BEGIN
  IF p_org IS NULL THEN RETURN; END IF;
  SELECT coalesce(bool_or(locked.contract_v2_enabled),false) INTO gate_enabled FROM (
    SELECT b.contract_v2_enabled FROM helixa_knowledge_sync_bindings b
    WHERE b.organization_id=p_org AND b.enabled ORDER BY b.binding_id FOR KEY SHARE
  ) locked;
  IF NOT gate_enabled THEN RETURN; END IF;
  FOR object IN SELECT 'COURSE' kind,id FROM courses WHERE organization_id=p_org
    UNION ALL SELECT 'ROLE_GUIDE',id FROM career_playbooks WHERE organization_id=p_org
  LOOP PERFORM queue_helixa_knowledge_sync_v2_object(object.kind,object.id,p_org); END LOOP;
END;
$$;
CREATE FUNCTION mark_helixa_knowledge_sync_v2_dirty() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item JSONB; previous JSONB; object RECORD;
BEGIN
  IF TG_OP<>'DELETE' THEN item := to_jsonb(NEW); END IF;
  IF TG_OP<>'INSERT' THEN previous := to_jsonb(OLD); END IF;
  FOR item IN SELECT v FROM (VALUES(item),(previous)) data(v) WHERE v IS NOT NULL LOOP
    CASE TG_TABLE_NAME
      WHEN 'courses' THEN PERFORM queue_helixa_knowledge_sync_v2_object('COURSE',(item->>'id')::uuid,(item->>'organization_id')::uuid);
      WHEN 'career_playbooks' THEN PERFORM queue_helixa_knowledge_sync_v2_object('ROLE_GUIDE',(item->>'id')::uuid,(item->>'organization_id')::uuid);
      WHEN 'career_playbook_sources' THEN PERFORM queue_helixa_knowledge_sync_v2_object('ROLE_GUIDE',(item->>'playbook_id')::uuid,(item->>'organization_id')::uuid);
      WHEN 'organization_members' THEN PERFORM queue_helixa_knowledge_sync_v2_organization((item->>'organization_id')::uuid);
      WHEN 'users' THEN
        PERFORM queue_helixa_knowledge_sync_v2_organization((item->>'organization_id')::uuid);
        FOR object IN SELECT organization_id FROM organization_members WHERE user_id=(item->>'id')::uuid
          LOOP PERFORM queue_helixa_knowledge_sync_v2_organization(object.organization_id); END LOOP;
      WHEN 'file_catalog' THEN
        PERFORM queue_helixa_knowledge_sync_v2_object('COURSE',(item->>'course_id')::uuid,(item->>'organization_id')::uuid);
        FOR object IN SELECT playbook_id,organization_id FROM career_playbook_sources WHERE file_catalog_id=(item->>'id')::uuid
          LOOP PERFORM queue_helixa_knowledge_sync_v2_object('ROLE_GUIDE',object.playbook_id,object.organization_id); END LOOP;
      ELSE
        FOR object IN SELECT organization_id FROM courses WHERE id=(item->>'course_id')::uuid
          LOOP PERFORM queue_helixa_knowledge_sync_v2_object('COURSE',(item->>'course_id')::uuid,object.organization_id); END LOOP;
    END CASE;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE FUNCTION flush_helixa_knowledge_sync_v2_dirty() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM helixa_knowledge_sync_v2_dirty WHERE transaction_id=NEW.transaction_id AND object_kind=NEW.object_kind
    AND object_id=NEW.object_id AND organization_id=NEW.organization_id;
  IF FOUND THEN PERFORM capture_helixa_knowledge_sync_v2_object(NEW.object_kind,NEW.object_id,NEW.organization_id); END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER flush_helixa_knowledge_sync_v2_dirty_trigger
  AFTER INSERT ON helixa_knowledge_sync_v2_dirty DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION flush_helixa_knowledge_sync_v2_dirty();
DO $$
DECLARE native_table TEXT;
BEGIN
  FOREACH native_table IN ARRAY ARRAY['courses','career_playbooks','lesson_contents','file_catalog','career_playbook_sources',
    'document_evidence_runs','course_job_instruction_sources','course_job_instruction_native_sources',
    'organization_members','users','course_enrollments'] LOOP
    EXECUTE format('CREATE TRIGGER mark_helixa_knowledge_sync_v2_dirty_trigger AFTER INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION mark_helixa_knowledge_sync_v2_dirty()',native_table);
  END LOOP;
END;
$$;

-- Keep both original capture entrypoints/signatures and v1 identities.
CREATE OR REPLACE FUNCTION enqueue_helixa_course_knowledge_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.generation_status='completed' AND NEW.generation_completed_at IS NOT NULL THEN
    INSERT INTO helixa_knowledge_sync_outbox(binding_id,environment,destination_binding_id,event_id,
      object_kind,object_id,organization_id,completed_at)
    SELECT b.binding_id,b.environment,b.destination_binding_id,
      'mc2:COURSE:'||NEW.organization_id||':'||NEW.id||':'||to_char(NEW.generation_completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'COURSE',NEW.id,NEW.organization_id,NEW.generation_completed_at
    FROM helixa_knowledge_sync_bindings b WHERE b.organization_id=NEW.organization_id AND b.enabled AND NOT b.contract_v2_enabled
    ON CONFLICT(binding_id,event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION enqueue_helixa_role_guide_knowledge_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='completed' AND NEW.completed_at IS NOT NULL THEN
    INSERT INTO helixa_knowledge_sync_outbox(binding_id,environment,destination_binding_id,event_id,
      object_kind,object_id,organization_id,completed_at)
    SELECT b.binding_id,b.environment,b.destination_binding_id,
      'mc2:ROLE_GUIDE:'||NEW.organization_id||':'||NEW.id||':'||to_char(NEW.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'ROLE_GUIDE',NEW.id,NEW.organization_id,NEW.completed_at
    FROM helixa_knowledge_sync_bindings b WHERE b.organization_id=NEW.organization_id AND b.enabled AND NOT b.contract_v2_enabled
    ON CONFLICT(binding_id,event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION claim_helixa_knowledge_sync_outbox(p_binding_id TEXT,p_organization_id UUID,p_environment TEXT,
  p_destination_binding_id TEXT,p_batch_size INTEGER DEFAULT 10)
RETURNS TABLE(id UUID,event_id TEXT,object_kind TEXT,object_id UUID,organization_id UUID,completed_at TIMESTAMPTZ,
  raw_body_base64 TEXT,attempts INTEGER,claim_generation INTEGER,lease_token UUID,binding_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v2_enabled BOOLEAN;
BEGIN
  -- Hold the binding lock through lease allocation. FOR KEY SHARE conflicts
  -- with the activation setter's FOR UPDATE, closing both switch race orders.
  SELECT b.contract_v2_enabled INTO v2_enabled FROM helixa_knowledge_sync_bindings b
    WHERE b.binding_id=p_binding_id AND b.organization_id=p_organization_id AND b.environment=p_environment
      AND b.destination_binding_id=p_destination_binding_id AND b.enabled FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge sync binding is not active for requested contract'; END IF;
  IF v2_enabled THEN RETURN; END IF;
  UPDATE helixa_knowledge_sync_outbox o SET status='action_required',lease_token=NULL,last_error='Retry budget exhausted',updated_at=now()
  WHERE o.binding_id=p_binding_id AND o.organization_id=p_organization_id AND o.environment=p_environment
    AND o.destination_binding_id=p_destination_binding_id AND o.contract_version=1 AND o.attempts>=8
    AND (o.status IN ('pending','retryable') OR (o.status='processing' AND o.last_attempt_at<now()-interval '15 minutes'));
  RETURN QUERY WITH claimed AS (
    SELECT o.id FROM helixa_knowledge_sync_outbox o WHERE o.binding_id=p_binding_id AND o.organization_id=p_organization_id
      AND o.environment=p_environment AND o.destination_binding_id=p_destination_binding_id AND o.contract_version=1 AND o.attempts<8
      AND ((o.status IN ('pending','retryable') AND o.next_attempt_at<=now()) OR (o.status='processing' AND o.last_attempt_at<now()-interval '15 minutes'))
    ORDER BY o.next_attempt_at,o.created_at FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_batch_size,1),100)
  ) UPDATE helixa_knowledge_sync_outbox o SET status='processing',attempts=o.attempts+1,claim_generation=o.claim_generation+1,
    lease_token=gen_random_uuid(),last_attempt_at=now(),updated_at=now() FROM claimed WHERE o.id=claimed.id
    RETURNING o.id,o.event_id,o.object_kind,o.object_id,o.organization_id,o.completed_at,
      CASE WHEN o.raw_body IS NULL THEN NULL ELSE encode(o.raw_body,'base64') END,o.attempts,o.claim_generation,o.lease_token,o.binding_id;
END;
$$;
CREATE FUNCTION claim_helixa_knowledge_sync_v2_outbox(p_binding_id TEXT,p_organization_id UUID,p_environment TEXT,
  p_destination_binding_id TEXT,p_batch_size INTEGER DEFAULT 10)
RETURNS TABLE(id UUID,event_id TEXT,object_kind TEXT,object_id UUID,organization_id UUID,completed_at TIMESTAMPTZ,
  raw_body_base64 TEXT,attempts INTEGER,claim_generation INTEGER,lease_token UUID,binding_id TEXT,
  event_type TEXT,revision BIGINT,retraction_reason TEXT,content_hash TEXT,created_at TIMESTAMPTZ,snapshot JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM assert_helixa_knowledge_sync_v2_binding(p_binding_id,p_organization_id,p_environment,p_destination_binding_id);
  UPDATE helixa_knowledge_sync_outbox o SET status='action_required',lease_token=NULL,last_error='Retry budget exhausted',updated_at=now()
  WHERE o.binding_id=p_binding_id AND o.organization_id=p_organization_id AND o.environment=p_environment
    AND o.destination_binding_id=p_destination_binding_id AND o.contract_version=2 AND o.attempts>=8
    AND (o.status IN ('pending','retryable') OR (o.status='processing' AND o.last_attempt_at<now()-interval '15 minutes'));
  RETURN QUERY WITH claimed AS (
    SELECT o.id FROM helixa_knowledge_sync_outbox o WHERE o.binding_id=p_binding_id AND o.organization_id=p_organization_id
      AND o.environment=p_environment AND o.destination_binding_id=p_destination_binding_id AND o.contract_version=2 AND o.attempts<8
      AND ((o.status IN ('pending','retryable') AND o.next_attempt_at<=now()) OR (o.status='processing' AND o.last_attempt_at<now()-interval '15 minutes'))
    ORDER BY o.next_attempt_at,o.created_at FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_batch_size,1),100)
  ) UPDATE helixa_knowledge_sync_outbox o SET status='processing',attempts=o.attempts+1,claim_generation=o.claim_generation+1,
    lease_token=gen_random_uuid(),last_attempt_at=now(),updated_at=now() FROM claimed WHERE o.id=claimed.id
    RETURNING o.id,o.event_id,o.object_kind,o.object_id,o.organization_id,o.completed_at,
      CASE WHEN o.raw_body IS NULL THEN NULL ELSE encode(o.raw_body,'base64') END,o.attempts,o.claim_generation,o.lease_token,o.binding_id,
      o.event_type,o.revision,o.retraction_reason,o.content_hash,o.created_at,o.snapshot;
END;
$$;

CREATE FUNCTION reconcile_helixa_knowledge_sync_v2(p_binding_id TEXT,p_organization_id UUID,p_environment TEXT,
  p_destination_binding_id TEXT,p_apply BOOLEAN DEFAULT false) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE object RECORD; state helixa_knowledge_sync_revisions%ROWTYPE; snapshot JSONB; missing INTEGER:=0; inserted INTEGER:=0;
BEGIN
  PERFORM assert_helixa_knowledge_sync_v2_binding(p_binding_id,p_organization_id,p_environment,p_destination_binding_id);
  FOR object IN SELECT 'COURSE' kind,c.id FROM courses c WHERE c.organization_id=p_organization_id
    UNION SELECT 'ROLE_GUIDE',c.id FROM career_playbooks c WHERE c.organization_id=p_organization_id
    UNION SELECT r.object_kind,r.object_id FROM helixa_knowledge_sync_revisions r WHERE r.organization_id=p_organization_id AND r.active
  LOOP
    IF p_apply THEN inserted:=inserted+capture_helixa_knowledge_sync_v2_object(object.kind,object.id,p_organization_id);
    ELSE
      snapshot:=get_helixa_knowledge_sync_v2_snapshot(object.kind,object.id,p_organization_id);
      SELECT * INTO state FROM helixa_knowledge_sync_revisions r WHERE r.object_kind=object.kind AND r.object_id=object.id;
      IF (snapshot IS NOT NULL AND (state.object_id IS NULL OR NOT state.active OR state.fingerprint IS DISTINCT FROM helixa_sync_snapshot_fingerprint(snapshot)))
        OR (snapshot IS NULL AND state.active) OR (snapshot IS NOT NULL AND NOT EXISTS(
          SELECT 1 FROM helixa_knowledge_sync_outbox o WHERE o.binding_id=p_binding_id AND o.object_kind=object.kind
            AND o.object_id=object.id AND o.contract_version=2 AND o.revision=state.revision)) THEN missing:=missing+1; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('missing',missing,'inserted',inserted,'applied',p_apply);
END;
$$;

-- One JSON scalar RPC and one stable database snapshot. PostgREST's default
-- 1000-row cap cannot truncate this inventory. Unreconciled clocks fail closed.
CREATE FUNCTION get_helixa_knowledge_sync_manifest(p_binding_id TEXT,p_organization_id UUID,p_environment TEXT,
  p_destination_binding_id TEXT) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE object RECORD; result JSONB:='[]';
BEGIN
  PERFORM assert_helixa_knowledge_sync_v2_binding(p_binding_id,p_organization_id,p_environment,p_destination_binding_id);
  FOR object IN SELECT o.kind,o.id,r.revision,r.active,r.fingerprint,r.content_hash,
    get_helixa_knowledge_sync_v2_snapshot(o.kind,o.id,p_organization_id) snapshot
    FROM (SELECT 'COURSE' kind,c.id FROM courses c WHERE c.organization_id=p_organization_id
      UNION ALL SELECT 'ROLE_GUIDE',c.id FROM career_playbooks c WHERE c.organization_id=p_organization_id) o
    LEFT JOIN helixa_knowledge_sync_revisions r ON r.object_kind=o.kind AND r.object_id=o.id ORDER BY o.kind,o.id
  LOOP
    IF object.snapshot IS NULL THEN CONTINUE; END IF;
    IF object.revision IS NULL OR NOT object.active OR object.fingerprint IS DISTINCT FROM helixa_sync_snapshot_fingerprint(object.snapshot)
      THEN RAISE EXCEPTION 'Knowledge inventory requires reconciliation'; END IF;
    result:=result||jsonb_build_array(jsonb_build_object('kind',object.kind,'id',object.id,'revision',object.revision,'contentHash',object.content_hash));
  END LOOP;
  RETURN result;
END;
$$;
CREATE FUNCTION enqueue_helixa_knowledge_sync_v2_resend(p_binding_id TEXT,p_organization_id UUID,p_environment TEXT,
  p_destination_binding_id TEXT,p_objects JSONB) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE object JSONB; state helixa_knowledge_sync_revisions%ROWTYPE; snapshot JSONB; changed INTEGER; total INTEGER:=0;
BEGIN
  PERFORM assert_helixa_knowledge_sync_v2_binding(p_binding_id,p_organization_id,p_environment,p_destination_binding_id);
  IF jsonb_typeof(p_objects) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid resend list'; END IF;
  FOR object IN SELECT DISTINCT item FROM jsonb_array_elements(p_objects) item LOOP
    IF object->>'kind' NOT IN ('COURSE','ROLE_GUIDE') OR object->>'id' IS NULL THEN RAISE EXCEPTION 'Invalid resend identity'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('helixa-v2:'||(object->>'kind')||':'||(object->>'id'),0));
    SELECT * INTO state FROM helixa_knowledge_sync_revisions r WHERE r.object_kind=object->>'kind' AND r.object_id=(object->>'id')::uuid
      AND r.organization_id=p_organization_id AND r.active FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    snapshot:=get_helixa_knowledge_sync_v2_snapshot(state.object_kind,state.object_id,p_organization_id);
    IF snapshot IS NULL THEN CONTINUE; END IF;
    IF state.fingerprint IS DISTINCT FROM helixa_sync_snapshot_fingerprint(snapshot)
      THEN RAISE EXCEPTION 'Knowledge resend requires reconciliation'; END IF;
    UPDATE helixa_knowledge_sync_outbox o SET status='pending',lease_token=NULL,attempts=0,next_attempt_at=now(),
      last_attempt_at=NULL,last_error=NULL,delivered_at=NULL,updated_at=now()
    WHERE o.binding_id=p_binding_id AND o.organization_id=p_organization_id AND o.environment=p_environment
      AND o.destination_binding_id=p_destination_binding_id AND o.object_kind=state.object_kind AND o.object_id=state.object_id
      AND o.revision=state.revision AND o.contract_version=2 AND o.status<>'processing';
    GET DIAGNOSTICS changed=ROW_COUNT; total:=total+changed;
  END LOOP;
  RETURN total;
END;
$$;

CREATE FUNCTION delete_helixa_course_downstream_v2(p_course_id UUID,p_organization_id UUID,p_from_stage INTEGER,
  p_course_patch JSONB DEFAULT '{}',p_expected_course_state JSONB DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lessons_count INTEGER; sections_count INTEGER:=0; native JSONB; field_patch BOOLEAN; result JSONB;
BEGIN
  IF p_from_stage NOT IN (4,5) OR p_from_stage IS NULL THEN RAISE EXCEPTION 'Unsupported downstream stage'; END IF;
  IF jsonb_typeof(p_course_patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid course field patch'; END IF;
  field_patch:=p_course_patch<>'{}';
  IF field_patch THEN
    IF (p_from_stage=4 AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_course_patch) key)<>ARRAY['analysis_result'])
      OR (p_from_stage=5 AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_course_patch) key)<>ARRAY['course_structure','generation_metadata'])
      OR EXISTS(SELECT 1 FROM jsonb_each(p_course_patch) e WHERE jsonb_typeof(e.value)<>'object')
      THEN RAISE EXCEPTION 'Invalid course field patch'; END IF;
    IF jsonb_typeof(p_expected_course_state) IS DISTINCT FROM 'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_expected_course_state) key)
        IS DISTINCT FROM ARRAY['analysis_result','course_structure','generation_metadata','updated_at']
      OR nullif(p_expected_course_state->>'updated_at','') IS NULL
      THEN RAISE EXCEPTION 'Field patch requires exact prior course state'; END IF;
  END IF;
  SELECT to_jsonb(c) INTO native FROM courses c WHERE c.id=p_course_id AND c.organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoped course not found'; END IF;
  IF field_patch AND (
    (native->>'updated_at')::timestamptz IS DISTINCT FROM (p_expected_course_state->>'updated_at')::timestamptz
    OR native->'analysis_result' IS DISTINCT FROM p_expected_course_state->'analysis_result'
    OR native->'course_structure' IS DISTINCT FROM p_expected_course_state->'course_structure'
    OR native->'generation_metadata' IS DISTINCT FROM p_expected_course_state->'generation_metadata') THEN
    RAISE EXCEPTION 'Course changed during field preparation' USING ERRCODE='40001';
  END IF;
  DELETE FROM lessons l USING sections s WHERE l.section_id=s.id AND s.course_id=p_course_id;
  GET DIAGNOSTICS lessons_count=ROW_COUNT;
  IF p_from_stage=4 THEN
    DELETE FROM sections WHERE course_id=p_course_id; GET DIAGNOSTICS sections_count=ROW_COUNT;
    UPDATE courses SET course_structure=NULL,updated_at=now() WHERE id=p_course_id AND organization_id=p_organization_id;
  END IF;
  IF field_patch THEN
    UPDATE courses SET analysis_result=CASE WHEN p_from_stage=4 THEN p_course_patch->'analysis_result' ELSE analysis_result END,
      course_structure=CASE WHEN p_from_stage=5 THEN p_course_patch->'course_structure' ELSE course_structure END,
      generation_metadata=CASE WHEN p_from_stage=5 THEN p_course_patch->'generation_metadata' ELSE generation_metadata END,
      updated_at=now() WHERE id=p_course_id AND organization_id=p_organization_id;
  END IF;
  result:=jsonb_build_object('deletedLessonsCount',lessons_count,'deletedSectionsCount',sections_count,'deletedStructure',p_from_stage=4);
  IF field_patch THEN result:=result||jsonb_build_object('fieldApplied',true); END IF;
  RETURN result;
END;
$$;

-- No public/anon/authenticated entrypoint may read private pinned snapshots or
-- mutate the clocks/gates. Explicit qualification keeps pgcrypto reachable.
DO $$
DECLARE function RECORD;
BEGIN
  FOR function IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'helixa_sync_%' OR p.proname IN (
      'assert_helixa_knowledge_sync_v2_binding','set_helixa_knowledge_sync_v2_enabled','get_helixa_knowledge_sync_v2_snapshot',
      'enqueue_helixa_knowledge_sync_v2_revision','capture_helixa_knowledge_sync_v2_object','queue_helixa_knowledge_sync_v2_object',
      'queue_helixa_knowledge_sync_v2_organization','mark_helixa_knowledge_sync_v2_dirty','flush_helixa_knowledge_sync_v2_dirty',
      'claim_helixa_knowledge_sync_v2_outbox','reconcile_helixa_knowledge_sync_v2','get_helixa_knowledge_sync_manifest',
      'enqueue_helixa_knowledge_sync_v2_resend','delete_helixa_course_downstream_v2',
      'enqueue_helixa_course_knowledge_sync','enqueue_helixa_role_guide_knowledge_sync'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',function.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',function.signature);
  END LOOP;
END;
$$;
COMMIT;
