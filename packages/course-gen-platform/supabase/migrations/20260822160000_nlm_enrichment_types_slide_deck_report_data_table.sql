-- ============================================================================
-- Three NotebookLM enrichment types the library produces and the enum refuses
-- Purpose: nlm_slide_deck, nlm_report, nlm_data_table
-- Date: 2026-08-22
-- Related: mc2-6ye5z.4 / .5 / .8; docs/plans/snuggly-wiggling-sutton.md phase 1.3
-- ============================================================================
--
-- notebooklm-py 0.8.0 generates all three. `enrichment_type` carried fourteen
-- values and none of them, so the handlers could not be written at all: a row
-- naming an unlisted type is rejected by the type, not by validation, and the
-- failure is a database error rather than a product decision.
--
-- Approved by the owner on 2026-08-22 as necessary, useful and current.
--
-- Additive and idempotent. `ALTER TYPE ... ADD VALUE` is transaction-safe from
-- PostgreSQL 12 onward provided the new value is not used in the same
-- transaction, and this server is 17.6 — checked, because the push wraps every
-- migration in one transaction and on an older server that combination fails.
-- Nothing here uses the values it adds.
--
-- Note that dev and staging share one Supabase project, so applying this
-- reaches both at once.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'nlm_slide_deck'
    AND enumtypid = 'enrichment_type'::regtype
  ) THEN
    ALTER TYPE enrichment_type ADD VALUE 'nlm_slide_deck';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'nlm_report'
    AND enumtypid = 'enrichment_type'::regtype
  ) THEN
    ALTER TYPE enrichment_type ADD VALUE 'nlm_report';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'nlm_data_table'
    AND enumtypid = 'enrichment_type'::regtype
  ) THEN
    ALTER TYPE enrichment_type ADD VALUE 'nlm_data_table';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Seventeen: fourteen before, three added. A count rather than a existence
-- check, so a partially applied migration is loud instead of plausible.
DO $$
DECLARE
  enum_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO enum_count
  FROM pg_enum
  WHERE enumtypid = 'enrichment_type'::regtype;

  IF enum_count <> 17 THEN
    RAISE EXCEPTION 'Expected 17 enrichment types, found %', enum_count;
  END IF;

  RAISE NOTICE 'enrichment_type now carries % values', enum_count;
END $$;
