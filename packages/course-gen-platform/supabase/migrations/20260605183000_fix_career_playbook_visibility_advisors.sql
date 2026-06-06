BEGIN;

ALTER FUNCTION public.career_playbooks_sync_is_public_from_visibility()
  SET search_path = public, extensions;

CREATE INDEX IF NOT EXISTS idx_career_playbook_sources_user
  ON public.career_playbook_sources(user_id);

COMMIT;
