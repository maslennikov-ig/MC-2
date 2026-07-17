---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-plan-builder
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-plan-builder
base_branch: codex/self-hosted-qdrant-platform
base_commit: c1d0ca611fb5106d2a6752e3a755817948be92fd
worktree: /home/me/code/mc2/.worktrees/q12-plan-builder
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-plan-builder and branch
  codex/q12-plan-builder left in place for orchestrator integration; no push.
  All disposable postgres:17.10-bookworm containers/networks/volumes from the
  real-PG17 suites are reclaimed on each run (executor teardown + test finally
  blocks); post-run docker filters show zero leftovers.
risk_level: medium
verification:
  - 'Builder RED->GREEN: a46c6173 (RED, 10 failed) -> 28ec3448 (GREEN).'
  - 'Live orchestration RED->GREEN: ee04d555 (RED, positive live test fails against the stub) -> 2b6b16ad (GREEN).'
  - 'Unit (no docker): tests/unit/ops/q12-migration-plan.test.ts 10 passed | 4 skipped.'
  - 'Real-PG17 (MC2_Q12_REAL_PG17=1): 14 passed — capture helper + full live LivePlanExecutor end-to-end (source snapshot -> isolated restore -> structural-equality proof -> real five migration files applied -> barrier-valid catalog), plus fail-closed equality mismatch and teardown-overrides-success.'
  - 'Regression: q12-command-manifest + q12-retained-barrier-w-composition-seam + q12-live-cutover = 289 passed.'
  - 'pnpm type-check / tsc --noEmit exit 0; python3 compile of both helpers OK.'
  - 'Frozen bytes unchanged: q12-command-manifest.json aaec6fc2… and q12-database-barrier.sh 134255ce…; q12-live-cutover.test.ts and all existing tests untouched.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-live-cutover.sh
  - deploy/qdrant/q12-migration-plan-capture.py
  - packages/course-gen-platform/tests/unit/ops/q12-migration-plan.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-migration-plan-runner.py
explicit_defers:
  - "None outstanding for the builder or the live orchestration. One documented environment boundary (not a work defer): the production leg applies migrations via the real document-evidence CLIs, whose per-version security manifests are cryptographically pinned to the isolated restore of the real Supabase source on the pinned image (document-evidence-approved.ts:1250-1356, digests :528-556). That exact CLI invocation is validated in the owner-approved live window by construction; CI cannot run it on vanilla PG17, so CI instead applies the same five real SQL files through the injectable apply seam and proves the whole orchestration end-to-end. Recommend the live-window operator record the first real run's expected_catalog_sha256 into the frozen command manifest per design §2."
---

# Summary

Delivered the fully working, non-stub Q12 `plan` mode end to end. Follow-up scope
(owner: "fully working product, no MVP stubs") replaced the earlier fail-closed
`LivePlanExecutor.capture()` boundary with the real live-window orchestration from
the corrections design §2 (lines ~395-414), on top of the already-accepted builder.

Two new RED->GREEN commits on `codex/q12-plan-builder`:

- `ee04d555` (RED): gated real-PG17 end-to-end suite for the live orchestration,
  failing against the fail-closed stub.
- `2b6b16ad` (GREEN): the real `LivePlanExecutor` orchestration + teardown contract.

`LivePlanExecutor.capture()` now:

1. captures the read-only source structural catalog / 76 guarded relations / 8
   reduced cron rows / frontier via `q12-migration-plan-capture.py` (TLS host psql
   for the remote source, docker-exec for CI);
2. snapshots the source (`pg_dump -Fc`) and restores it into the pinned isolated
   image, following the reviewed lifecycle of `restore-supabase-drill.sh` (pinned
   digest, labeled isolated network/volume, loopback publish, init-complete
   readiness gate, blocking cleanup);
3. proves the isolate's pre-migration structural catalog SHA equals the source's,
   failing closed on any drift (the structural catalog hashes migration_history
   rows incl. `statements`, so the snapshot carries that table's data);
4. applies only the five release-SHA migration files in-isolate at the base
   (20260711120000/130000/140000) and observability (150000/151000) checkpoints;
5. assembles evidence with guarded/cron/baseline/frontier from the SOURCE (live
   OIDs the barrier re-matches) and checkpoint `catalog_sha256` + relation deltas
   from the ISOLATE.

`run_plan` reclaims the diagnostic container/network/volume/archive only after the
catalog is emitted and its sha bound, and a teardown failure overrides success.

Drift-free by design: production applies migrations with the **real**
`document-evidence-approved.ts` / `document-evidence-observability-index.ts` CLIs in
legacy loopback mode, so the in-isolate history rows are byte-identical to the live
cutover (their pinned security manifests match on a faithful restore, by
construction). Image/source/apply are seam-injectable (`MC2_Q12_PLAN_*`), so CI runs
the identical pipeline on disposable vanilla PostgreSQL 17 for both source and
isolate — applying the same five real SQL files through the apply seam — while
production stays pinned to `public.ecr.aws/supabase/postgres@sha256:d00c45c7…`.

# Verification

- Live orchestration RED (`ee04d555`, impl stashed): the positive real-PG17 test
  failed with `live plan capture requires the isolated pinned-image restore …`
  (the stub), 1 failed | 13 skipped.
- Real-PG17 GREEN (`MC2_Q12_REAL_PG17=1 … tests/unit/ops/q12-migration-plan.test.ts`):
  `Tests 14 passed`. The live-orchestration block stands up a synthetic
  Supabase-shaped source (47 public incl. courses/organizations/clarifying_questions
  with the exact FK/RLS/index/trigger columns the real files require, 22 auth, 5
  named storage, cron.job(8), net.http_request_queue, the frozen frontier row,
  `auth.jwt/role/uid`, plus realtime/cron/net decoys the guarded filter drops),
  then drives the real `plan` CLI through `LivePlanExecutor`: source capture ->
  `pg_dump` snapshot -> restore into a fresh isolate -> structural-equality proof
  -> the real five migration files applied via the seam (with the Supabase roles
  the vanilla isolate lacks bootstrapped first) -> checkpoint captures -> emit.
  It asserts the emitted catalog passes the frozen barrier jq filter, self-binds
  its sha256, has 76 guarded relations, base delta = the seven base tables,
  observability delta = `document_evidence_observability_totals`,
  `migrations["20260711151000"].catalog_sha256 == expected_post_migration_catalog_sha256`,
  and the post-migration hash differs from baseline. Negative cases:
  `MC2_Q12_PLAN_FAULT=equality` fails closed (`structural catalog differs`) with no
  catalog and the isolate reclaimed; `MC2_Q12_PLAN_FAULT=teardown` emits the bound
  catalog then overrides success with a teardown error, still reclaiming the
  isolate. Post-run docker filters show zero leftover plan containers.
- Unit GREEN (no docker): `Tests 10 passed | 4 skipped` — the deterministic
  builder, negative validation, wrapper routing, and the fake-executor path
  (now exercising the teardown contract).
- Regression: `q12-command-manifest + q12-retained-barrier-w-composition-seam +
q12-live-cutover = 289 passed`. `tsc --noEmit` exit 0.
- Frozen bytes: `q12-command-manifest.json` sha256
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841` and
  `q12-database-barrier.sh` sha256
  `134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68` re-verified
  unchanged; `q12-live-cutover.test.ts` and no existing test modified or weakened.
- Consumer acceptance: the emitted catalog passes consumer (a) `q12-database-barrier.sh`
  (the frozen jq schema/inventory gate driven with the script's own filter bytes)
  and its sha binding; consumer (b) `q12-source-manifest.ts` `validateExpectedCatalog`
  shape constraints are a strict subset re-enforced fail-closed in
  `validate_expected_catalog()`; consumer (c) `buildExpectedCatalog` shape matches.

# Risks / Follow-ups

- Documented environment boundary (see `explicit_defers`), not a work defer: the
  production migration-apply path invokes the real document-evidence CLIs, whose
  per-version security manifests are pinned to the real Supabase restore on the
  pinned image; that precise CLI+image leg is validated only in the owner-approved
  live window (it cannot pass on vanilla PG17 by design). CI proves the full
  orchestration and applies the same five real SQL files through the seam. The
  live-window operator should record the first real run's `expected_catalog_sha256`
  into the frozen command manifest before `live` per design §2.
- The isolate throwaway init password is passed via `-e POSTGRES_PASSWORD` (a
  disposable, loopback-only, non-source secret), a minor hygiene divergence from
  restore-supabase-drill.sh's `POSTGRES_PASSWORD_FILE`; the real source credential
  is never placed in argv/environment values (a mode-0600 libpq service file).
- The gated real-PG17 suite depends on Docker + a reachable `postgres:17.10-bookworm`
  and takes ~30s; readiness loops wait on the image's init-complete marker to avoid
  the temporary-init-server race. It is skipped entirely without `MC2_Q12_REAL_PG17=1`,
  so the default `pnpm test` path stays deterministic and docker-free.
- The synthetic CI source schema mirrors only the objects the five files require
  (verified by iterating real apply errors to zero). If a future migration adds a
  new pre-existing dependency, that fixture must grow with it; the production path
  is unaffected (it restores the real source).
