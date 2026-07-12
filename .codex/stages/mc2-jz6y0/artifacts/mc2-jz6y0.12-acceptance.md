---
schema_version: orchestration-artifact/v1
artifact_type: orchestrator-acceptance
task_id: mc2-jz6y0.12
stage_id: mc2-jz6y0
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: origin/codex/self-hosted-qdrant-platform
base_commit: 2717885ef1b0bd1babfddb1a7661868c9f2073a5
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: All Q11-owned PostgreSQL and Qdrant containers, database, collections, aliases, loopback listeners, recovery directories and temporary worktrees/local branches were removed. Remote evidence branches remain. Build/dependency outputs are ignored workspace caches, not delivery state. No Cloud, S3, notification, service, secret, staging or production mutation occurred.
risk_level: high
docs_reviewed: no-change-needed
docs_review_notes: Q10 already reconciled all durable setup/retrieval/recovery/monitoring/rollback docs. Q11 adds only release evidence and orchestration truth; final independent review reported Ready Yes with P0-P3 zero.
graph_reviewed: updated
graph_review_notes: Local-only Graphify 0.8.45 was refreshed with `graphify update . --force` and `graphify cluster-only . --no-viz` at accepted parent HEAD 3681afb9. `GRAPH_REPORT.md` matched that HEAD and contained 50,490 nodes and 75,065 edges. No external model/API mode or Git hook was used; community totals are intentionally omitted because reclustering is not stable evidence.
verification:
  - Focused backend Stage 2/4/5/6, shared Qdrant, activation, privacy and observability gate passed 124/124 files and 1869/1869 tests with zero skips.
  - Shared document-evidence, clarifying and Stage 5 audit contracts passed 3/3 files and 23/23 tests with zero skips.
  - Web material-conflict gate passed 3/3 files and 20/20 tests with zero skips; four jsdom Window.scrollTo diagnostics were non-blocking.
  - PostgreSQL 16.14 applied migration/recovery/isolation gate passed 4/4 files and 64/64 tests with zero skips: RLS 9, automatic decisions 26, side identity 8 and observability 21.
  - Exact-digest Qdrant 1.18.2 Qdrant-only two-file gate passed 15/15. The full deploy gate passed 23 active tests (15 Qdrant, 4 observability static, 4 Career Playbook schema) with 17 expected database-dependent observability skips covered by the PostgreSQL matrix.
  - Qdrant runtime/Compose contract passed 8/8 and rendered all four full/no-env models.
  - Exact-version local snapshot/restore drill passed 5/5 with checksum, dense/RU/EN/Formula relevance, tenant/course isolation, stable-alias preservation, failure cases and cleanup.
  - Prometheus 3.13.1 exact-digest promtool check config/check rules/test rules passed with 14 rules; Alertmanager 0.33.1 exact-digest amtool check-config passed.
  - pnpm type-check passed across all workspace projects.
  - Full pnpm build passed, including Next.js generation of 75/75 static pages. The root run emitted non-blocking Next workspace-root inference, webpack big-string cache, stale Browserslist, Supabase Edge-runtime Node API and Node DEP0169 url.parse diagnostics. The independent fresh rerun emitted the workspace-root, Browserslist and three DEP0169 warnings but no Edge diagnostic, consistent with cached compilation. These diagnostics predate and are unrelated to the Qdrant/evidence stage; both builds exited zero.
  - Final independent review reran pnpm type-check and pnpm build (75/75 static pages), validated all artifacts/format/diff/process evidence, and reported Ready Yes with P0-P3 zero.
  - `python3 scripts/orchestration/check_stage_ready.py mc2-jz6y0` passed with `artifact validation OK` and `stage mc2-jz6y0 ready` at parent HEAD 3681afb9. Canonical real closeout, Beads closure and push remain parent-owned.
  - Canonical `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-jz6y0` passed with inherited synthetic local Supabase build variables: workspace type-check, production build with 75/75 static pages, process verification, artifact/stage readiness, child cleanup, project-index/docs review and debt scan all passed, ending with `stage closeout verification OK`. The first invocation without those required variables failed at web environment validation before compilation; the unchanged command passed after restoring the already documented local build environment.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-acceptance.md
explicit_defers:
  - Q12 mc2-jz6y0.13 remains open and authorization-gated. Real off-host S3, deployment, live reindex, alias cutover, service/secret changes, real notifications, staging/production mutation and observation are not authorized.
---

# Summary

Q11 release-confidence evidence is green on the integrated local tree at `b9877723`. The broad backend gate expanded beyond historical E7 totals and passed 1,869 tests without skips. Shared contracts, material-conflict UI, applied PostgreSQL migrations/isolation, native multilingual Qdrant retrieval, strict Formula ranking, grouping, Compose, exact-version recovery and monitoring tool configuration all passed without weakening the accepted tests.

Documents remain optional and baseline-compatible; exact durable coverage, explicit/manual/system conflict decisions, bounded large-corpus processing, non-destructive Stage 5 enrichment and decision-aware Stage 6 retrieval remain covered by the focused, shared, web and PostgreSQL gates. The pinned 15/15 Qdrant gate proves RU/EN BM25/IDF, dense+sparse RRF, server Formula, grouping and tenant/course isolation. The separately pinned 5/5 local recovery gate proves checksum, relevance, isolation and cleanup. The historical `19/19` deploy-gate label included four unrelated Career Playbook schema tests; Q11 records the exact composition instead of repeating that label. Real off-host effects remain Q12-only.

# Verification

Detailed commands, environment placeholders, totals and cleanup evidence are recorded in:

- `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-focused.md`
- `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-postgres.md`
- `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-infra.md`

The root release commands were:

```bash
pnpm type-check

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=q11-test-anon-key \
SUPABASE_SERVICE_ROLE_KEY=q11-test-service-role-key \
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=q11-test-service-key \
  pnpm build
```

The first Qdrant CI attempt stopped before relevant test collection because the isolated worktree lacked built shared-package exports. After building `@megacampus/shared-logger`, `@megacampus/shared-types` and `@megacampus/shared-utils`, the unchanged command passed. This setup-only diagnostic is recorded rather than counted as a product failure.

# Cleanup and rollback

The PostgreSQL database was dropped with force, its container was removed, exact container matches were zero and port `15439` was closed. Qdrant authenticated collection and alias lists were empty before container removal; exact container matches and port `16333` listeners were zero afterward, and recovery temp directories were absent. All three Q11 worktrees/local branches were removed after their pushed evidence commits were merged; remote evidence branches are retained.

No runtime rollback is required because Q11 made no remote or durable service/data mutation. Artifact rollback is a normal revert of the eventual acceptance commits.

# Risks / Follow-ups

Beads closure and push remain required before Q11 closeout. Q12 remains the only operational defer and requires a separate explicit authorization packet.

docs-reviewed: no-change-needed - Q10 completed durable documentation; Q11 adds evidence only.

graph-reviewed: updated - local-only Graphify 0.8.45 refresh at accepted parent HEAD `3681afb9` produced 50,490 nodes and 75,065 edges; report/HEAD match passed, with no external model/API mode or Git hook.
