# Q12 SQL Type-Coercion Audit Report: 2026-08-09

**Generated**: 2026-08-09T18:00:00+03:00
**Status**: ✓ success
**Version**: mc2-68qwn
**Scope**: PostgreSQL `name` versus `text` coercion across Q12 capture and comparison SQL

---

## Executive Summary

No additional live truncation hazard was found. The previously repaired source-manifest unions
remain the only surface where a composite identity can exceed PostgreSQL's 63-byte `name` limit.
Their leading schema and identity expressions are explicitly `text`, and a disposable PostgreSQL
17.10 regression now proves a long function identity survives unchanged in `object_owners`,
`object_acls`, and `comments`.

## Audited Surfaces

| Surface                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                | Result                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `deploy/postgres/q12-source-manifest.ts` `catalogSql()` | Reviewed every `UNION`/`UNION ALL`. The four composite catalog families begin with `NULL::text` or `nspname::text`; relation/type/extension identity arms use explicit `::text`, while concatenated identities are already `text`. Role-union arms contain only PostgreSQL role names, which are identifiers and cannot exceed `NAMEDATALEN`.                                           | Safe; runtime regression added. |
| `deploy/qdrant/q12-structural-catalog.sql`              | Contains no `UNION` or `UNION ALL`. Composite identities come from `pg_identify_object` into independent JSON aggregates, so set-operation type resolution cannot coerce them to `name`.                                                                                                                                                                                                | No hazard.                      |
| `deploy/qdrant/q12-migration-plan-capture.py`           | Contains no `UNION` or `UNION ALL`; it wraps the structural catalog rather than rebuilding identity projections.                                                                                                                                                                                                                                                                        | No hazard.                      |
| `deploy/qdrant/q12-database-barrier.sh`                 | The install-time trigger set intentionally compares `tgname::name` with `pg_trigger.tgname` (`name`); these are real identifiers and therefore bounded by PostgreSQL itself. The three later expected/actual delta checks cast both `relname` and `tgname` to `text`, while their `VALUES` counterparts resolve to `text`. No composite function identity participates in those unions. | No hazard.                      |
| `deploy/postgres/restore-supabase-drill.sh`             | Contains no `UNION` or `UNION ALL`; catalog comparison consumes captured JSON rather than projecting PostgreSQL catalog identity columns.                                                                                                                                                                                                                                               | No hazard.                      |

## Regression Boundary

The test exports the production `catalogSql()` generator as a test seam, starts the existing
disposable PostgreSQL 17.10 fixture, and creates a function whose identity includes four descriptive
argument names. It first proves the UTF-8 identity length is greater than 63 bytes, then executes the
real source-manifest SQL and requires byte-exact identity equality in all three populated catalog
families.

The test is opt-in because it starts a local disposable Docker container:

```bash
MC2_Q12_REAL_PG17=1 pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/q12-structural-catalog-pg17.test.ts \
  -t 'preserves function identities longer than PostgreSQL NAMEDATALEN'
```

## Conclusion

The audit does not justify production SQL changes beyond exporting `catalogSql()` for direct test
execution. Changing the already-safe sibling projections would add churn without reducing risk.
