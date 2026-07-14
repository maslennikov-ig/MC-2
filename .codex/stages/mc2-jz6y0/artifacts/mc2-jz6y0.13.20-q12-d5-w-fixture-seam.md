---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.20
stage_id: mc2-jz6y0
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: xhigh
model_reasoning_rationale: Cross-language immutable evidence, path containment, and no-authority-injection are security-critical.
repo: /home/me/code/mc2
branch: codex/q12-d5-w-fixture-seam
base_branch: codex/self-hosted-qdrant-platform
base_commit: ce77a416c90e16e6d51ef7edb0140e8114577e9b
worktree: /home/me/code/mc2/.worktrees/q12-d5-w-fixture-seam
write_zone:
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.20-q12-d5-w-fixture-seam.md
success_criteria:
  - All later-four Root fixtures bind a real immutable W-owned quiesce-manifest preimage instead of synthetic 3*64.
  - The test-only runner derives the exact SHA-256 from a safely opened existing file and forwards no path or mutation seam to production run_supervisor.
  - Missing, outside-root, symlink, ancestor-symlink, hardlink, unsafe-mode, changed-file, and digest-override cases fail before producer state.
  - Install-only frozen zero context, production core/CLI isolation, and the complete Root focused suite remain green.
selected_docs:
  - docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md
  - docs/superpowers/plans/2026-07-14-q12-retained-barrier-capability-provenance-addendum.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.18-q12-root-d5.md
  - 'external read-only W artifact: /home/me/code/mc2/.worktrees/q12-w-writer-barrier/.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w.md; branch codex/q12-w-writer-barrier; commit e6d12583f75d84d16e9622357a60174e43bd3905; sha256 eb6341130bf89faabdec8549ec273a78bd9c421c8d2564af36d355575c34c2f4'
  - 'pre-fix docs review: .superpowers/sdd/q12-d5-w-fixture-seam-docs-review.md; FAIL 0/2/2/0; sha256 c4a4368c3dd25c6b2ef6ab3efe024532c2d611aa74aa3326a48018ffa2980d5e'
  - 'pre-fix correctness review: .superpowers/sdd/q12-d5-w-fixture-seam-correctness-review.md; FAIL 0/2/0/0; sha256 c8d393fc413ecf3984559b7fe18b43efb26606e4ef8c44edc87bbc125ebdc8db'
  - 'post-fix correctness delta review: .superpowers/sdd/q12-d5-w-fixture-seam-correctness-delta-review.md; PASS 0/0/0/0; sha256 88adcb536b5ff2db57089a6fc8ae4dff2bac2d9209d2bb8ae046d31f55023440'
  - 'post-fix docs delta review: .superpowers/sdd/q12-d5-w-fixture-seam-docs-delta-review.md; PASS 0/0/0/0; sha256 8558cdb50979b01a075709316cd6027ed9b94dd39541a6d78f285fa09b1f55d6'
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - senior-architect
  - superpowers:verification-before-completion
selected_agents:
  - backend correctness implementer
catalog_candidates:
  - none; accepted repo contracts and installed skills were sufficient
parallel_group: D5-W-fixture-seam
depends_on_streams:
  - accepted Root D5 producer mc2-jz6y0.13.18
parallel_decision: sequential
status: merged
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Source commit 3dd9ad53 was merged into integration as da5d8305 and into W as 383443aa; both integration/W reruns passed 271/271 before the clean source worktree and local branch were removed. The remote source branch was preserved.
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: The seam is test-only, adds no production CLI/core/runtime behavior, and does not change the frozen normative contract or operator runbooks.
verification:
  - 'initial seam RED: 10/10 selected tests failed for the expected synthetic/no-preimage, digest-override, unsafe-path, and changed-file gaps'
  - 'runRoot ancestor-symlink RED: 1/1 selected test failed because derive-run-id followed the unsafe ancestor'
  - 'R2 ordinary parallel RED: 252/260 passed and 8/260 failed, all canonical cutover.lock EAGAIN; rejected pre-fix evidence'
  - 'R2 frontier RED: 2/8 selected rows failed exactly for missing and supplied prefix-1 verify-after-base preimage; 6/8 passed'
  - 'final focused seam GREEN: 20/20 passed in the dedicated quiesce-seam test file, zero failed or skipped'
  - 'ordinary file-parallel two-file GREEN: 268/268 passed across lifecycle 248 and quiesce seam 20, zero failed or skipped, no serialization override'
  - 'serialized three-file Root focused GREEN: 271/271 passed across lifecycle 248, quiesce seam 20, and command manifest 3, zero failed or skipped'
  - 'controller ordinary file-parallel rerun: 268/268 passed, zero failed or skipped, in 84.97 seconds'
  - 'controller serialized three-file rerun: 271/271 passed, zero failed or skipped, in 84.33 seconds'
  - 'controller statics and cleanup: all focused static gates passed; zero current-run processes, roots, caches, or test locks after safe cleanup'
  - 'integration serialized three-file rerun at da5d8305: 271/271 passed, zero failed or skipped, in 74.06 seconds'
  - 'W merge serialized three-file rerun at 383443aa: 271/271 passed, zero failed or skipped, in 74.19 seconds; the two pre-existing W-owned uncommitted files remained intact'
  - 'post-fix correctness delta review: PASS P0/P1/P2/P3 0/0/0/0'
  - 'post-fix docs delta review: PASS P0/P1/P2/P3 0/0/0/0; durable docs no-change-needed'
  - 'bash -n both deployed wrappers, py_compile production core plus runner, jq command manifest, ordinary Prettier four TS files, and git diff --check: passed'
  - 'ordinary ESLint four TS files, with no override or suppression: passed; lifecycle file remains below the configured counted max-lines threshold after the focused seam split'
  - 'artifact validation: passed'
  - 'current-run residue cleanup: zero active processes, zero current-run roots, zero pycache, and no cutover.lock; one pre-existing probe root was preserved'
changed_files:
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.20-q12-d5-w-fixture-seam.md
explicit_defers:
  - mc2-jz6y0.13.10 - W remains the read-only semantic/schema validator of the supplied quiesce bytes and must integrate this accepted seam before final rereview.
  - mc2-jz6y0.13.13 - Production join, remote/live activation, database, Docker, services, secrets, staging, and production remain Root-owned and outside this local-only stream.
---

# Summary

The old shared Root fixture used `3` repeated 64 times for every non-install command but emitted no corresponding writer-quiesce bytes. This made exact W coverage impossible without fabricating evidence. The shared fixture spec now accepts only `existingQuiesceManifestPath`; it has no digest input. Install-only with no frontier keeps its frozen 64-zero context, while every fixture containing either a later-four completed chain or any non-install abandoned frontier requires an already-existing immutable file under its run root. The exact digest is carried by every applicable frontier capability, journal row, and disposition row.

The test-only Python runner opens the run root and every nested path component through directory descriptors with `O_DIRECTORY|O_NOFOLLOW`. It requires an owner-only real run root, then opens the quiesce file with `O_NOFOLLOW`, requiring a regular current-owner/current-group file, mode `0400`, `st_nlink=1`, nonempty bounded size, and stable device/inode/mode/owner/link/size/mtime/ctime before and after streaming SHA-256. It rechecks the pathname identity before producer state. The test-only replacement injection proves TOCTOU rejection. Neither the existing path nor the mutation selector is forwarded to production `run_supervisor`; only the runner-derived SHA is forwarded.

The fixed W path contains the run ID. `deriveRootRetainedBarrierFixtureRunId(runRoot)` asks the test-only Python runner over stdin for the same UUIDv5 it will use later, so W/TypeScript does not duplicate or choose identity authority. The read-only derivation path uses the same component-wise safe-root validation and accepts only `runRoot`. Positive tests bind exact unchanged file bytes, manifest run ID, later-four capability fields, and every matching journal row. Direct and public-contract digest overrides both fail before journal/capability creation.

The dedicated seam test and lifecycle test are ordinary independently scheduled Vitest files. A test-only outer flock serializes their runner processes before either can touch the shared canonical test lock. Its fixed `/tmp/.mc2-q12-retained-barrier-fixture.lock` inode is opened with `O_NOFOLLOW|O_CLOEXEC`, must be a current-owner/current-group regular `0600` file with one link, and is acquired only through bounded 120-second `LOCK_NB` retries. The descriptor is never inherited and its kernel lock is released on every runner exit. The safe inode is not unlinked by a runner because unlinking while another process waits would create split-brain coordination; closeout removes it only after proving no runner remains. Production `q12-lifecycle-core.py`, canonical FD9 identity, and production `LOCK_NB` proof are byte-unchanged.

# Scope / Routing

Only the five assigned tracked paths changed. The seam-specific tests live in the dedicated `q12-retained-barrier-quiesce-seam.test.ts`, keeping the ordinary lifecycle lint gate below its configured counted `max-lines` threshold without a suppression. The production lifecycle core, deployed wrappers, command manifest, W controller/tests, shared runtime manifests, durable docs, handoff, and Beads were not edited. The current W fixed path `writer-quiesce-<run-id>.json`, exact schema validation, and mode `0400` publication were inspected read-only at `codex/q12-w-writer-barrier@e6d12583f75d84d16e9622357a60174e43bd3905`; the inspected W artifact SHA-256 was `eb6341130bf89faabdec8549ec273a78bd9c421c8d2564af36d355575c34c2f4`. No W-owned tracked file was copied or edited.

No external dependency docs were needed. Graphify output is absent from this isolated worktree; this test-only stream changes no production architecture, and Root retains the required integration refresh.

# Verification

The initial selected RED collected 258 lifecycle tests and failed exactly the 10 selected new seam rows: the old all-five fixture accepted synthetic `3*64`, exact derived parity failed, camel/snake digest overrides were accepted, outside-root/symlink/hardlink/`0600`/missing files were accepted, and the replacement injection was accepted. After minimal implementation, those 10 passed. A controller hardening check then added a genuine 1/1 RED showing that `--derive-run-id` followed a run-root ancestor symlink; the common directory-FD walk corrected it.

R2 reproduced the ordinary file-parallel regression without a serialization flag: 252/260 passed and eight lifecycle rows failed at the canonical `cutover.lock` nonblocking acquisition while the second discovered test file held it. That run and the two pre-fix FAIL reviews are rejected evidence, not accepted verification. The frontier-focused RED selected eight rows: missing and supplied prefix-1 `verify-after-base` failed exactly as expected, while the six already-covered later-prefix rows passed. After the minimal predicate, caller, and coordination corrections, all eight frontier rows passed.

The final ordinary two-file command passed 268/268 with Vitest's normal file parallelism: 248 lifecycle plus 20 quiesce-seam tests, zero failed/skipped, in 71.37 seconds. The final serialized diagnostic passed 271/271: 248 lifecycle, 20 quiesce seam, and 3 command-manifest tests, zero failed/skipped, in 76.08 seconds.

The controller independently reran both exact gates after inspecting the diff: ordinary file-parallel passed 268/268 with zero failed/skipped in 84.97 seconds, and serialized three-file passed 271/271 with zero failed/skipped in 84.33 seconds. Controller Prettier, ordinary ESLint without suppression, Bash syntax, Python compilation, JSON parsing, diff, artifact validation, and cleanup checks all passed. The post-fix correctness delta review (`88adcb536b5ff2db57089a6fc8ae4dff2bac2d9209d2bb8ae046d31f55023440`) and documentation delta review (`8558cdb50979b01a075709316cd6027ed9b94dd39541a6d78f285fa09b1f55d6`) both returned PASS with P0/P1/P2/P3 `0/0/0/0`.

Exact accepted commands (synthetic environment and unit-only configuration):

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/q12-live-cutover.test.ts \
  tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts

SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts --no-file-parallelism \
  tests/unit/ops/q12-live-cutover.test.ts \
  tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts \
  tests/unit/ops/q12-command-manifest.test.ts
```

# Delivery / Cleanup

The controller accepted the exact five-path diff after independent reruns and two clean post-fix delta reviews. The accepted source commit `3dd9ad53ac506f9bfdaeca1ef29709b082bd4e3e` was pushed, merged normally into integration as `da5d83050b95d701a6d055b35dc0fca24cb8d39e`, and merged normally into the preserved W branch as `383443aacef27122933197884777d2f0e4a87f5c`; the two W-owned uncommitted files remained intact. Bash syntax for both deployed wrappers, Python byte-compilation for the unchanged production core and changed runner, JSON manifest parsing, ordinary Prettier and ESLint for the four focused TypeScript files, `git diff --check`, and artifact validation all passed. The ordinary ESLint command used no override or suppression; after the seam split the lifecycle file remains within the configured counted limit.

The interrupted pre-hardening run root, generated Python caches, unlocked canonical test lock, and unlocked safe test coordination inode were removed only after proving no runner process remained. The controller independently confirmed zero current-run processes, roots, caches, or test locks after the integration and W reruns. The older `/tmp/mc2-q12-d5-root-probe-qP49vk` predates this worktree and was preserved as unrelated state. After both merges and reruns, the clean source worktree and local source branch were removed; the remote source branch remains. No remote/live operation occurred.

# Risks / Follow-ups / Explicit Defers

The runner hashes but deliberately does not parse or bless the W manifest. W remains responsible for exact writer-quiesce schema, run, ten-writer, barrier, and semantic validation; Root owns only the durable lifecycle context that consumes its exact digest. This separation prevents the fixture producer from becoming a second W authority.

The only rollback state is this local branch/worktree. Before integration the tracked diff can be reverted as one unit; after accepted integration Root/W must rerun their complete focused matrices. Remote/live activation and all external effects remain separately gated.

docs-reviewed: no-change-needed — test-only producer/consumer seam; frozen specs and runbooks remain accurate.

graph-reviewed: no-change-needed — isolated worktree has no Graphify report, production architecture is unchanged, and Root owns integration refresh.
