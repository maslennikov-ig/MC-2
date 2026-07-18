---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-source-manifest-round-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: defe14fbe
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only pre-merge review; single write is this artifact. No code/config modified, no server/db/docker command run.'
risk_level: low
verification:
  - 'Reviewed range defe14fbe..bb069e59 (9 commits, 3 TDD triples) via git show/diff in worktree /home/me/code/mc2/.worktrees/q12-live-controller.'
  - 'Frozen trio at bb069e59 UNTOUCHED: manifest aaec6fc2…, barrier 3673ee49… (the ratified fixed barrier), structural-catalog 0b8a943f…; only deploy/postgres/q12-source-manifest.ts changed among deployed files (53647f0a… -> 902cd6a1…).'
  - "Group 1 provenance: the barrier's real CREATE FUNCTION q12_guard.* set is EXACTLY the 10 the source-manifest GUARD_FUNCTIONS now lists (grepped the barrier bytes); GUARD_TRIGGERS=8 (6 immutable on the 3 append-only tables + 2 on probe) is empirically confirmed by the passing rc=0 acceptance; exact-set fail-closed retained (11th-function negative asserts 'q12_guard function set')."
  - "Group 2 (hardest): approvedGuardIdentity('type',...) accepts the arrays via startsWith('_')&&GUARD_TABLES.has(slice(1)); the exemption is scoped to EXACTLY {4 array names}×{object_type type}×{grantor postgres}×{grantee PUBLIC}×{privilege USAGE} — the only ACL state PG permits on an array type — with composite/element types still owner-only-verified (grantor==grantee==postgres); mirrors the ratified barrier typcategory<>'A' fix. MAINTAIN added to the exact 8-privilege owner set for q12_guard tables (PG17-correct, fail-closed)."
  - 'Group 3: the ::text casts widen name-typed UNION-first-branch columns to text, preventing silent 63-byte truncation of concatenated identities; no column/filter/ORDER-BY-key/projection change beyond the type; lossless for <=63-byte names; consistent baseline-vs-cutover.'
  - "Group 4: rowExpression = (schema==='cron' && relation==='job') ? (to_jsonb(t) - 'active') : to_jsonb(t) — column-scoped (only 'active') AND relation-scoped (only cron.job); the mandatory tamper negative asserts a mutated command still changes row_sha256."
  - 'Group 5: the four baseline sorts (cron_jobs/database.settings/schemas/relations) mirror the pre-existing cutover sorts; sortedArray preserves content; the final canonical(baseline)!==canonical(cutover) byte-strict gate (source :1474) catches any real content divergence; the content-negative test asserts a content change under an order shuffle still fails.'
  - 'TDD: all three RED commits (f64e3ff05, f7af63e0c, 432fe3bd0) touch ONLY tests/fixtures, not q12-source-manifest.ts; GREEN commits fix the tool.'
  - "No existing test weakened: the acceptance diff removes only 'not asserted' comments and ADDS capture_rc===0 (strengthening), retaining the full maintenance_guarded shape (13 assertions); no other *.test.ts modified beyond the 4 round files."
  - 'Acceptance asserts capture_rc===0 + no baseline-to-cutover delta + the full maintenance_guarded shape (4 tables/10 functions/1 event trigger, cron 0/8, read-only on).'
  - 'Did NOT run the vitest suite or any server/db/docker command (constraint); relied on the personally re-verified rc=0 end-to-end acceptance plus the static verification above.'
changed_files:
  - deploy/postgres/q12-source-manifest.ts
  - packages/course-gen-platform/tests/unit/ops/q12-source-manifest-guard-surface.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-cron-row-hash-normalization.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-source-manifest-baseline-order-symmetry.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-barrier-cutover.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-cron-row-hash-normalization-runner.py
explicit_defers:
  - 'P3-1: the ::text widening (Group 3) changes the UNION column type from name (C collation) to text (database-default collation), so the ORDER BY on identity columns can reorder object_owners/object_acls/comments/security_labels rows and thus their absolute hashes vs the pre-fix tool; internally consistent (baseline and cutover use the same fixed projection; validated by the rc=0 acceptance) and no external consumer pins these source-manifest object hashes — noted for awareness, not a defect.'
  - "P3-2: the ratified 'grantable true->false' ACL sub-item is not a discrete code change in the diff; grantable is carried verbatim in the object_acls projection and gated by the final byte-strict canonical(baseline)!==canonical(cutover) comparison plus the owner-only guard filter — confirm the ruling's intent is satisfied by that coverage (it appears to be)."
  - 'Cross-round (informational): this validator round pairs with the barrier-fix round; the frozen-trio succession + W-tuple field-4 amendment + server reinstall tracked in the barrier-fix review still gate the window opening — unaffected by this source-manifest round, which leaves all frozen bytes untouched.'
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1 — mergeable.** Findings: two P3 (an internally-consistent collation
side effect of the ::text fix, and a confirm-item on the grantable ruling) plus one
informational cross-round note.

All five ratified change groups are sound, correctly scoped, and empirically
validated by the personally re-verified rc=0 end-to-end acceptance. The frozen trio
(manifest, the now-fixed barrier `3673ee49…`, structural catalog) is untouched;
only the validator tool changed. The highest-risk item — the array-type ACL
exemption — is **minimally scoped with no over-approval**: it exempts exactly the
single ACL state PostgreSQL physically permits on an array type and nothing else,
mirroring the ratified barrier `typcategory<>'A'` fix, while the element types stay
owner-only-verified. Every exact-set / byte-strict fail-closed gate is retained,
each proven by a genuine RED negative.

# Verification

## Frozen surface

Manifest `aaec6fc2…`, barrier `3673ee49…`, structural catalog `0b8a943f…` all
byte-unchanged; `q12-source-manifest.ts` is the only deployed file edited
(`53647f0a…` → `902cd6a1…`).

## Group 1 — function 5→10, trigger 2→8 (provenance verified)

The barrier's real `CREATE FUNCTION q12_guard.*` set is exactly the 10 the new
`GUARD_FUNCTIONS` lists — `assert_capability`, `assert_controller_binding`,
`enforce_ddl_barrier`, `enforce_write_barrier`, `extend_guard`,
`quiesce_client_backends`, `verify_activated_state`, `verify_capability`,
`verify_expected_guards`, `verify_install_resume_state` — no more, no fewer.
`GUARD_TRIGGERS` = 8 (the `q12_guard_immutable`/`_truncate` pair on the three
append-only tables + `q12_guard_row`/`_truncate` on `probe`) is confirmed by the
passing rc=0 acceptance (an exact-set mismatch would have failed capture). The
exact-set fail-closed is retained and proven: a fabricated 11th function fails with
`q12_guard function set`.

## Group 2 — ACL exact-set (scrutinized hardest; no over-approval)

`isUnrevocableArrayTypePublicUsage` gates on `key==='object_acls' &&
object_type==='type' && ARRAY_TYPE_NAMES.has(identity) && grantor==='postgres' &&
grantee==='PUBLIC' && privilege==='USAGE'` — i.e. exactly the four array-type names
(`_active_run`/`_baseline`/`_migration_guards`/`_probe`) with the single
grantor/grantee/privilege triple that is the ONLY ACL state PostgreSQL permits on an
array type (it categorically refuses `GRANT`/`REVOKE` on arrays, and leaves the
default `PUBLIC=USAGE`). Any other grantee, privilege, type, or grantor is **not**
exempted and fails the exact-set. The element/composite types remain owner-only
verified via the unchanged `grantor==='postgres' && grantee==='postgres'` clause, so
nothing is loosened for a lockable object — the exemption is the unrevocable
consequence of the ratified barrier `typcategory<>'A'` fix and matches it exactly.
`approvedGuardIdentity('type',…)` correctly recognises the arrays
(`startsWith('_') && GUARD_TABLES.has(slice(1))`). The `MAINTAIN` addition sets the
exact 8-privilege owner set for q12_guard tables (PG17 added `MAINTAIN`), a
tightening, fail-closed against any drift.

## Group 3 — ::text truncation fix (behavior-preserving)

Each affected UNION's first branch now casts its `name`-typed column to `::text`, so
the UNION column type is `text` (unlimited) instead of `name` (63-byte), preventing
the silent truncation of the later branches' concatenated identities
(`relname||'.'||attname`, `…conname`, `…tgname`, …). For any ≤63-byte identity the
output bytes are identical; for longer ones the fix yields the full (correct)
identity instead of a truncated one. No column, filter, or ORDER BY key changed —
purely a type widening — and it is applied to source capture generally, consistent
across baseline and cutover.

## Group 4 — cron.job active normalization (scoped + tamper-safe)

`rowExpression` excludes the `active` column **only** for `cron.job`
(`(to_jsonb(t) - 'active')`), every other relation keeps `to_jsonb(t)`. This is
coherent with the top-level `cron_jobs` summary, whose per-job exact field set
(`{jobid,username,command_sha256}`) already omits `active`, so barrier.install's
sanctioned `active true→false` maintenance flip is not double-counted as a
violation. The mandatory tamper negative proves the scoping is safe: mutating the
`command` on top of the same `active` flip still changes `row_sha256`
(`expect(tampered.row_sha256).not.toBe(baseline.row_sha256)`), so excluding `active`
hides no other column.

## Group 5 — four-site baseline order symmetry (order-only)

The four baseline sorts (`baseline.cron_jobs = baselineJobs`; `sortedArray` on
`baselineDatabase.settings`, `baseline.schemas`, `baseline.relations`) mirror the
pre-existing cutover-side sorts so the final comparison is order-insensitive.
`sortedArray` reorders without adding/removing/reprojecting, and the final gate is a
full byte-strict `canonical(baseline) !== canonical(cutover)` (source :1474) after
`refreshDerivedHashes` on both — so a genuine content difference cannot be masked by
sorting. The cron per-index `canonical(before)!==canonical(normalized)` check
additionally catches cron content divergence before the reassignment. The
content-negative test proves a real relation/schema content change riding under an
order shuffle still fails.

## TDD integrity and acceptance

The three RED commits touch only tests/fixtures against the unmodified tool; the
GREEN commits fix the tool. No existing test was weakened — the acceptance diff
removes only "not asserted" comments and promotes `capture_rc` to an asserted
`===0`, while keeping the full `maintenance_guarded` shape (4 tables / 10 functions
/ 1 event trigger, cron 0/8, read-only on); no other test file changed. The
acceptance is the aggregate proof: real-PG17 baseline → real `barrier.install`
cutover → source-manifest capture `rc=0` with `validateTransition` passing.

# Risks / Follow-ups

- **P3-1 (confidence medium) — ::text collation side effect.** Widening the UNION
  column from `name` (C collation) to `text` (database-default collation) can
  reorder the `ORDER BY … identity` rows in `object_owners`/`object_acls`/
  `comments`/`security_labels`, changing their absolute hashes vs the pre-fix tool.
  Internally consistent (baseline and cutover use the same fixed projection;
  validated by the rc=0 acceptance) and no external consumer pins these
  source-manifest object hashes, so it is harmless — noted for awareness only.

- **P3-2 (confidence low) — grantable ruling.** The ratified "grantable true→false"
  ACL sub-item has no discrete code change in the diff; `grantable` is carried
  verbatim in the `object_acls` projection and gated by the final byte-strict
  `canonical(baseline)!==canonical(cutover)` comparison plus the owner-only guard
  filter. Confirm the ruling's intent is satisfied by that coverage (it appears to
  be) rather than expecting a dedicated gate.

- **Informational — cross-round.** This validator round leaves all frozen bytes
  untouched, so the window-opening cascade tracked in the barrier-fix review
  (frozen-trio succession to `3673ee49…`, W-tuple field-4 amendment, byte-verified
  server reinstall) is unaffected by and independent of this round.
