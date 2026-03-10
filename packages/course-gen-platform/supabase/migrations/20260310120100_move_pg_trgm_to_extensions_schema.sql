-- Move pg_trgm extension from public to extensions schema
-- No dependent indexes exist, safe to move
-- Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

ALTER EXTENSION pg_trgm SET SCHEMA extensions;
