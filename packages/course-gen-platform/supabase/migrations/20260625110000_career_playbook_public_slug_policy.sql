BEGIN;

CREATE OR REPLACE FUNCTION career_playbook_db_fallback_share_slug(
  position_title text,
  playbook_id uuid
)
RETURNS text AS $$
DECLARE
  base text;
  suffix text;
BEGIN
  base := lower(regexp_replace(coalesce(position_title, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  base := regexp_replace(base, '(^-+|-+$)', '', 'g');
  base := regexp_replace(base, '-+', '-', 'g');

  IF length(base) < 3 THEN
    base := 'role-guide';
  END IF;

  base := left(base, 86);
  base := regexp_replace(base, '-+$', '', 'g');
  suffix := left(replace(coalesce(playbook_id, gen_random_uuid())::text, '-', ''), 12);

  RETURN base || '-' || suffix;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION career_playbooks_sync_is_public_from_visibility()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_public := NEW.visibility = 'public';

  IF NEW.visibility = 'public' AND NEW.share_slug IS NULL THEN
    NEW.share_slug := career_playbook_db_fallback_share_slug(NEW.position_title, NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE career_playbooks
SET share_slug = career_playbook_db_fallback_share_slug(position_title, id)
WHERE share_slug ~* '^cp-[a-f0-9]{24,32}$';

COMMENT ON FUNCTION career_playbook_db_fallback_share_slug(text, uuid) IS
  'DB safety fallback for Career Playbook public slugs. Application code owns canonical role-based slug allocation and collision handling.';
COMMENT ON FUNCTION career_playbooks_sync_is_public_from_visibility() IS
  'Keeps legacy is_public/share_slug fields compatible with canonical Career Playbook visibility without creating cp-* public slugs.';

COMMIT;
