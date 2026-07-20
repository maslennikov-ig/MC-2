# Q12 Durable Recovery Projections Addendum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Execute under
> `orchestrator-stage`, TDD, independent review, and
> verification-before-completion.

**Goal:** Implement the owner-approved D4 capability, resume, immutable
quiesce, database terminal-proof, receipt-CAS, and recovery projections shared
by W, H, and Root without crossing the Q12 remote/live gate.

**Architecture:** Root is the sole durable lifecycle authority. One immutable
host-command capability moves through `issued/claimed/completed/superseded`;
children consume separate exact input checkpoints and publish only their
contracted immutable results. W validates the complete frozen graph and owns
writer/database child behavior, H consumes only accepted final evidence, and
Root alone repairs checkpoints, retires capabilities, performs the database
receipt v1-to-v2 CAS, and accepts phases.

**Tech Stack:** Bash, Python 3, TypeScript/Vitest, PostgreSQL 17, Docker Compose,
canonical UTF-8 JSON/JSONL, `renameat2(RENAME_NOREPLACE)`, fsync, SHA-256.

**Normative design:**
`docs/superpowers/specs/2026-07-14-q12-durable-recovery-projections-addendum-design.md`,
SHA-256 `28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4`.

**Inherited base plan:**
`docs/superpowers/plans/2026-07-13-q12-live-cutover-corrections.md`,
SHA-256 `af05edf1d29fd87d839d6f9c198dbc5824e19354a9762b3e95a9daf309aa4895`.
Its Tasks 4 and 5 remain binding for M and H except for the exact D4 overrides
stated in Task 6 below.

## Global Constraints

- Preserve base design SHA-256
  `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`.
- Preserve lifecycle addendum SHA-256
  `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`.
- Preserve inherited base plan SHA-256
  `af05edf1d29fd87d839d6f9c198dbc5824e19354a9762b3e95a9daf309aa4895`.
- The owner approved exact D4 v4 SHA-256
  `e6ac9c5eb4b8f5a5c0b27626dfe7675d5e98c25bf219ddb0ae65df7087e9e6d9`
  on 2026-07-14.
- No GHCR publication, server/service/secret change, hosted Supabase or Qdrant
  mutation, deployment, live reindex, alias cutover, staging, or production
  action is authorized by this plan.
- External S3 and Qdrant Cloud remain out of scope; snapshots use the approved
  local-disk path.
- Preserve unrelated `.claude/settings.json` changes.
- Preserve the dirty W worktree and its three uncommitted files until W is
  independently accepted, integrated, pushed, and safely cleaned.
- Never weaken RU/EN retrieval, strict-mode, restore, resume, coverage,
  isolation, writer compensation, or crash-recovery tests.
- New immutable JSON uses the normative canonical encoding, exact schemas,
  owner/mode checks, no-replace publication, fsync sequence, and hash domains.
- After lock loss, an old capability never authorizes new child execution; it
  may be completed without replay only when the exact immutable result already
  exists and validates.
- The DB child publishes only terminal proof. Root alone completes the host
  capability, deletes the DB capability, performs the sole receipt v1-to-v2
  CAS, and accepts the phase.

---

## File and ownership map

| Stream | Files                                                                                                                                                                                        | Responsibility                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D      | the normative design, this plan, `.13.16` artifacts, Beads/handoff/summary                                                                                                                   | freeze and review exact D4 contract                                           |
| W      | `deploy/qdrant/q12-writer-resume.py`, `deploy/qdrant/source-recovery-run.sh`, `deploy/qdrant/q12-database-barrier.sh`, `deploy/qdrant/q12-structural-catalog.sql`, W adapters/tests/artifact | child validation, quiesce/resume, DB baseline/proof, structural hash          |
| WR     | read-only W diff/evidence                                                                                                                                                                    | independent correctness acceptance                                            |
| M      | migration-owned files/tests/artifact from `.13.11`                                                                                                                                           | base file/FD, CA/TLS, `q12_guard`, DB capability, Root phase/checkpoint       |
| H      | handoff-owned files/tests/artifact from `.13.12`                                                                                                                                             | consume accepted final writer/quiesce evidence only                           |
| Root   | root supervisor, command manifest, journal/checkpoint tests, root artifact                                                                                                                   | sole capability lifecycle, recovery repair, DB deletion/CAS, final acceptance |

## Parallel Decomposition Matrix

| Stream | Goal                                                                       | Agent                             | Write zone                                             | Dependencies       | Verification                                                     | Decision                | Reason                                                            |
| ------ | -------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------ | ------------------ | ---------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| D      | Freeze approved D4 as normative bytes                                      | root + correctness/docs reviewers | design, plan, `.13.16` evidence, Beads/handoff/summary | owner approval     | hashes, artifact validation, two P0-P3-zero reviews              | sequential gate         | W cannot implement disputed authority before normative acceptance |
| W      | Make all preserved RED tests GREEN and implement the shared child contract | existing visible W worker         | W map above only                                       | D accepted         | focused Vitest, PostgreSQL 17, type-check, syntax/style, cleanup | delegated critical path | shared interfaces block M/H/Root                                  |
| WR     | Review W adversarially                                                     | independent correctness reviewer  | read-only plus review artifact                         | W committed/pushed | diff, evidence, focused invariant rerun                          | delegated after W       | high-risk crash/authority boundary                                |
| M      | Update migration consumer                                                  | visible M worker                  | `.13.11` worktree/zone                                 | W accepted         | migration, receipt, rollback, isolation tests                    | parallel with H         | disjoint accepted consumer                                        |
| H      | Update handoff consumer                                                    | visible H worker                  | `.13.12` worktree/zone                                 | W accepted         | handoff, manifest, rollback, isolation tests                     | parallel with M         | disjoint accepted consumer                                        |
| Root   | Join the state machine and run release-confidence gates                    | root orchestrator                 | root supervisor/tests/docs                             | W, M, H accepted   | journal/command/recovery matrix plus full stage gates            | local join              | sole cross-stream authority owner                                 |

Only D reviewers run in parallel before W. M and H may run in parallel only
after the exact accepted W commit is integrated; Root joins them sequentially.

### Task 1: Accept the normative D4 package

**Files:**

- Create: `docs/superpowers/specs/2026-07-14-q12-durable-recovery-projections-addendum-design.md`
- Create: `docs/superpowers/plans/2026-07-14-q12-durable-recovery-projections-addendum.md`
- Create: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-owner-approval.md`
- Create: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-normative-rereviews.md`
- Modify: `.codex/handoff.md`
- Modify: `.codex/stages/mc2-jz6y0/summary.md`

**Interfaces:**

- Consumes: exact approved D4 v4 SHA-256 and its two zero-finding reviews.
- Produces: frozen normative design and plan SHA-256 values for W, M, H, and
  Root prompts.

- [ ] **Step 1: Validate provenance and immutable predecessors**

  Run `sha256sum` on the base design, lifecycle addendum, lifecycle plan,
  inherited base plan, and D4 v4 artifact. Expected SHA-256 values are
  respectively
  `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`,
  `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`,
  `316c8b20812ae23f2c367282b742d25277acff3557fe38a7515d843360d719db`,
  `af05edf1d29fd87d839d6f9c198dbc5824e19354a9762b3e95a9daf309aa4895`,
  and `e6ac9c5eb4b8f5a5c0b27626dfe7675d5e98c25bf219ddb0ae65df7087e9e6d9`.

- [ ] **Step 2: Review exact normative coverage**

  Confirm the design contains the four capability directories, separate
  capability and child checkpoints, all allowed lock-loss/existing-result
  continuations, accepted/abandoned quiesce overlay chain, DB terminal proof,
  Root-only capability deletion/receipt CAS, exact phase sequences, and the
  unchanged remote boundary.

- [ ] **Step 3: Run formatting and local validation**

  Run:

  ```bash
  pnpm exec prettier --write \
    docs/superpowers/specs/2026-07-14-q12-durable-recovery-projections-addendum-design.md \
    docs/superpowers/plans/2026-07-14-q12-durable-recovery-projections-addendum.md
  scripts/orchestration/validate_artifact.py \
    .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-owner-approval.md
  git diff --check
  ```

  Expected: all commands exit 0.

- [ ] **Step 4: Dispatch independent frozen-byte rereviews**

  Dispatch one correctness reviewer and one docs reviewer in parallel. Both
  read the same recorded design/plan SHA-256 values and return P0=P1=P2=P3=0.
  Any finding requires a correction, new hashes, and fresh review of the new
  bytes.

- [ ] **Step 5: Record acceptance**

  Write and validate the normative-rereviews artifact, close `.13.16`, commit
  the package with `docs(q12): accept durable recovery projections`, push the
  integration branch, and confirm it is up to date with origin.

### Task 2: W TDD — host capability and resume graph

**Files:**

- Modify: `deploy/qdrant/q12-writer-resume.py`
- Modify: `deploy/qdrant/source-recovery-run.sh`
- Test: `packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts`

**Interfaces:**

- Consumes: the exact capability/checkpoint schemas and phase graphs from the
  normative design.
- Produces: a fail-closed resume child that validates Root state but never
  repairs or manufactures it.

- [ ] **Step 1: Preserve and run the nine D4 RED cases**

  Run the focused runtime file and record the eight journal-graph failures and
  one immutable-publication failure. Expected: exactly those D4 cases fail;
  every already-corrected nonblocked case remains green.

- [ ] **Step 2: Add complete capability/checkpoint fixtures**

  Extend the fixture with the exact 12-key immutable capability, issued/claimed/
  completed/superseded placement, capability-checkpoint hash, child-input
  checkpoint hash, lease epoch, supersession chain, and current journal-head
  binding. Add RED cases for orphan files, wrong directory, mismatched hash,
  old capability after lock loss, duplicate lifecycle files, and missing or
  wrong checkpoints.

- [ ] **Step 3: Add exact uninterrupted and recovery graph cases**

  Cover forward/rollback resume `intent -> capability_issued ->
capability_claimed -> capability_completed`, `recovery_reacquired` with a new
  capability, and existing exact result with only missing completion/acceptance.
  Reject repeated, intervening, cross-mode, wrong-epoch, or unlisted outcomes.

- [ ] **Step 4: Implement minimal resume validation/publication**

  Parse every protected JSON with duplicate-key rejection, bind the generic
  `--checkpoint` to the capability-checkpoint, bind the child separately to its
  input checkpoint, validate current fixed checkpoint and FD 9, and preserve
  deterministic no-replace/fsync terminal publication. Do not give the child
  capability path/hash/FD or DB credentials.

- [ ] **Step 5: Prove RED-to-GREEN**

  Run:

  ```bash
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/qdrant-source-recovery-runtime.test.ts
  ```

  Expected: all runtime tests pass with zero failures and no writer process or
  synthetic run-root residue.

### Task 3: W TDD — immutable quiesce recovery

**Files:**

- Modify: `deploy/qdrant/source-recovery-run.sh`
- Modify: `deploy/qdrant/q12-writer-resume.py` only where shared validation is
  required
- Test: `packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts`

**Interfaces:**

- Consumes: Root-issued `writers.quiesce` capability, predecessor manifest,
  accepted/abandoned recovery-prefix overlay chain, and exact inventory.
- Produces: immutable inventory/transition/final evidence; never overwrites the
  final `writer-quiesce-<run-id>.json`.

- [ ] **Step 1: Add RED crash-boundary matrix**

  Cover crash before inventory, after immutable prefix, after overlay
  publication, after claim, after exact final result, and after completion but
  before acceptance. After lock loss, require the durable but unaccepted overlay
  itself to remain immutable abandoned audit residue, move its associated
  capability to `superseded/`, and require the next ordinary overlay to bind the
  abandoned overlay hash through `previous_overlay_sha256`. There is no separate
  abandonment schema, path, or accepted-object kind.

- [ ] **Step 2: Add RED ambiguity and isolation cases**

  Reject a mutable final file, overlay replacement, missing chain link,
  cross-capability overlay, unreferenced issued/claimed/superseded file, unknown
  temporary residue, any invented abandonment object/schema/path/kind, writer
  identity drift, or any child start during quiesce.

- [ ] **Step 3: Implement deterministic bounded recovery**

  W publishes only its inventory, transition, and final evidence once with
  canonical bytes, no-replace rename, file and parent fsync, and reopened
  identity/hash checks. W validates but never creates, publishes, accepts, or
  repairs a quiesce recovery overlay. Root alone publishes the accepted/
  abandoned overlay chain after its recovery capability/checkpoint as specified
  in Task 6. Add a negative case proving a W child cannot manufacture or accept
  its own overlay. After lock loss W never executes under the old capability.

- [ ] **Step 4: Run the focused runtime file**

  Use the Task 2 Vitest command. Expected: all quiesce, resume, signal, crash,
  compensation, and isolation cases pass; cleanup checks find no residue.

### Task 4: W TDD — database terminal proof and sole Root CAS

**Files:**

- Modify: `deploy/qdrant/q12-database-barrier.sh`
- Verify: `deploy/qdrant/q12-structural-catalog.sql`
- Test: `packages/course-gen-platform/tests/unit/ops/q12-database-barrier.test.ts`
- Test: `packages/course-gen-platform/tests/unit/ops/q12-structural-catalog-pg17.test.ts`
- Modify/Test: the accepted W database/reindex adapters listed in its artifact

**Interfaces:**

- Consumes: exact DB capability, guards/v1 receipt, expected structural catalog
  hash, and Root-owned host capability/checkpoints.
- Produces: the exact immutable install baseline before the first v1 receipt,
  plus the operation-specific immutable terminal proof. The existing
  phase-aligned v1 receipt flow remains in force. Root validates/accepts the v1
  receipt and later completes/deletes/CASes/accepts terminal cleanup/rollback.

- [ ] **Step 1: Add RED baseline, proof, and crash table**

  Cover exact 11-key `database-barrier-baseline.json`; install COMMIT followed by
  baseline and first v1 receipt; a crash after install COMMIT with missing
  baseline; reconstruction only from immutable `q12_guard.baseline` plus the
  same claimed child-input checkpoint without repeating the install transaction;
  and baseline mismatch/extra-key/replacement incidents. Also cover pre-COMMIT
  terminal retry, COMMIT without proof, proof with host capability still claimed,
  proof with DB capability present, proof plus absent DB capability and receipt
  v1, receipt v2 without acceptance, missing checkpoint reconstruction, and
  every incident row in the normative design.

- [ ] **Step 2: Freeze structural SQL identity**

  Verify the tracked SQL SHA-256 equals the normative structural-catalog hash;
  reject different bytes even if PostgreSQL output would be equivalent. Keep
  the SQL one semicolon-free query and its existing exact PostgreSQL 17 shape.

- [ ] **Step 3: Implement child terminal-proof publication**

  On install, the child reconnects and publishes the exact immutable baseline
  before the existing first v1 receipt; post-COMMIT recovery may reconstruct only
  that baseline and receipt without replay. On cleanup/rollback, the child
  validates DB state and publishes the exact immutable terminal proof with its
  execution epoch. It does not publish v1 archives or rollback intent, move the
  host capability, delete the DB capability, write receipt v2, append Root
  journal state, or accept a phase.

- [ ] **Step 4: Keep adapters fail-closed**

  Before cleanup, source recovery and reindex accept only the exact phase-aligned
  `megacampus.q12.database-barrier-receipt/v1` in
  `recovery_ready_guarded`, its exact run/catalog/probe binding, and the still
  present bound DB capability required by the frozen guarded lifecycle. They
  reject receipt v2, terminal cleanup/rollback proof, an absent DB capability,
  wrong structural/probe hashes, or an unaccepted `recovery_ready_guarded`
  phase as a phase inversion. After cleanup, only writer resume and Root
  terminal validation consume the exact accepted receipt v2/terminal proof and
  prove the DB capability absent; they reject v1 or a present capability.

- [ ] **Step 5: Run focused and real PostgreSQL gates**

  Run the five-file W aggregate recorded in
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w.md`, then run:

  ```bash
  MC2_Q12_REAL_PG17=1 \
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/q12-structural-catalog-pg17.test.ts
  ```

  Expected: zero failures in both runs; the PG17 container and volumes are
  removed afterward.

### Task 5: Independently accept and integrate W

**Files:**

- Modify: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w.md`
- Create: W rereview artifact under `.codex/stages/mc2-jz6y0/artifacts/`

**Interfaces:**

- Consumes: committed/pushed W branch, RED-to-GREEN evidence, exact normative
  design/plan hashes.
- Produces: one accepted W commit for M, H, and Root.

- [ ] **Step 1: Run W completion gates**

  Run complete focused Vitest, PostgreSQL 17, package type-check, `bash -n`,
  `python3 -m py_compile`, Prettier check, `git diff --check`, secret/leak scan,
  process/container cleanup, and artifact validation. Record exact totals.

- [ ] **Step 2: Commit and push W**

  Commit only the W write zone, push `codex/q12-w-writer-barrier`, and give the
  independent reviewer the exact base/head range plus artifacts and hashes.

- [ ] **Step 3: Require independent PASS**

  The reviewer must explicitly cover capability authority, checkpoint split,
  resume graphs, overlay abandonment, DB proof/CAS separation, structural SQL,
  crash recovery, compensation, isolation, and test realism. P0/P1 blocks;
  any correction is TDD and receives focused delta review.

- [ ] **Step 4: Integrate and clean safely**

  Integrate the exact accepted commit, rerun focused gates on the integration
  worktree, push, then remove only the accepted W worktree/branch after clean
  integration. Close `.13.10` only after all evidence is durable.

### Task 6: Update M and H in parallel, then Root

**Files:**

- Modify: `packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts`
- Modify: `packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts`
- Modify: `packages/course-gen-platform/tests/integration/document-evidence-approved-migrations.test.ts`
- Create: `packages/course-gen-platform/tests/unit/scripts/q12-migration-credentials.test.ts`
- Modify: `scripts/deploy_blue_green.sh`
- Modify: `scripts/rollback_blue_green.sh`
- Modify: `scripts/ci/test_blue_green_fail_closed.sh`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-blue-green-handoff.test.ts`
- Create: `deploy/qdrant/q12-live-cutover.sh`
- Create: `deploy/qdrant/q12-capability-run.sh`
- Create: `deploy/qdrant/q12-command-manifest.json`
- Create: `deploy/qdrant/q12-live-smoke.sh`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts`
- Create: `packages/course-gen-platform/tests/unit/ops/q12-live-smoke.test.ts`
- Modify: `docs/operations/qdrant-self-hosted.md`
- Modify: `docs/operations/document-evidence.md`
- Create: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-q12-root.md`

**Interfaces:**

- Consumes: accepted W commit and normative design/plan hashes.
- Produces: decision-aware migration/handoff consumers and the sole Root
  lifecycle implementation.

- [ ] **Step 1: Dispatch disjoint M and H workers**

  Their prompts use `.codex/subagent-spawn-template.md`, isolated worktrees and
  disjoint write zones, and include Documentation, Graphify, Asset Routing,
  exact verification, artifact, and stop blocks. M attaches installed TDD and
  senior DevOps/database guidance and reads inherited base-plan Task 4 plus the
  D4 design. H attaches TDD and senior DevOps guidance and reads inherited
  base-plan Task 5 plus the D4 design. Catalog candidates are `none` because
  installed assets and frozen repository contracts cover both streams. Each
  worker commits/pushes only its own zone and receives independent review before
  integration.

- [ ] **Step 2: Execute inherited M and H TDD with exact D4 overrides**

  M executes every step of inherited base-plan Task 4. Its contract remains the
  base file/FD, verified CA/TLS, `q12_guard`, DB capability, and Root-owned
  current phase/checkpoint; D4 does not add `recovery_ready_guarded`, terminal
  v2/proof, or a receipt-path argument to either migration command. After each
  migration COMMIT, Root invokes the existing corresponding verify command.
  Add a negative test that rejects any future-readiness/v2 dependency. Run:

  ```bash
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/scripts/q12-migration-credentials.test.ts
  ```

  Then run the applied-migration suite against a disposable loopback `_test`
  PostgreSQL 17 database and prove it has no skips:

  ```bash
  set -euo pipefail
  container="mc2-q12-migration-${PPID}-$$"
  report="/tmp/${container}-vitest.json"
  cleanup() {
    docker rm -f "$container" >/dev/null 2>&1 || true
    rm -f "$report"
  }
  trap cleanup EXIT
  docker run --detach --rm \
    --name "$container" \
    --publish 127.0.0.1::5432 \
    --env POSTGRES_PASSWORD=synthetic-test-password \
    --env POSTGRES_DB=mc2_document_evidence_test \
    public.ecr.aws/supabase/postgres:17.6.1.064 >/dev/null
  for attempt in $(seq 1 60); do
    if docker exec "$container" pg_isready -q -U postgres -d mc2_document_evidence_test; then
      break
    fi
    if [ "$attempt" -eq 60 ]; then
      exit 1
    fi
    sleep 1
  done
  port="$(docker port "$container" 5432/tcp | sed -n 's/^127\.0\.0\.1:\([0-9][0-9]*\)$/\1/p')"
  test -n "$port"
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  DOCUMENT_EVIDENCE_DATABASE_URL="postgresql://postgres:synthetic-test-password@127.0.0.1:${port}/mc2_document_evidence_test" \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config ../../vitest.shared.ts \
    --reporter=json \
    --outputFile="$report" \
    tests/integration/document-evidence-approved-migrations.test.ts
  node -e '
    const result = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    if (result.numFailedTests !== 0 || result.numPendingTests !== 0 || result.numPassedTests < 1) {
      throw new Error(`migration gate incomplete: passed=${result.numPassedTests} failed=${result.numFailedTests} pending=${result.numPendingTests}`);
    }
    console.log(`migration gate: ${result.numPassedTests} passed, 0 failed, 0 skipped`);
  ' "$report"
  cleanup
  trap - EXIT
  ```

  Expected after implementation: the unit command passes; the disposable
  integration command records at least one passed test, zero failures, and zero
  skipped/pending tests; the database container and JSON report are removed;
  normal programmatic APIs remain compatible; no URI, password, CA, or
  capability leaks; migrations do not depend on their future readiness receipt.

  H executes every step of inherited base-plan Task 5. D4 narrows its input to
  the Root-accepted final quiesce manifest and exact terminal transition; H
  never creates/accepts a recovery overlay, discovers replacement writers, or
  starts writers. Run:

  ```bash
  bash scripts/ci/test_blue_green_fail_closed.sh
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/q12-blue-green-handoff.test.ts
  ```

  Expected after implementation: both commands pass with zero failures; normal
  mode remains command-compatible; all Q12 prepare/commit/finalize and rollback
  paths leave writers stopped/no-restart until the Root-owned resume phase.

- [ ] **Step 3: Write Root D4 RED tests**

  In the exact three Root test files, add cases for the single immutable
  capability lifecycle and directory mapping; separate capability/child
  checkpoints; old-capability rejection after lock loss; exact-result
  completion without replay; Root-only publication/acceptance of the quiesce
  overlay and its accepted/abandoned chain; byte-exact operation-specific v1
  archive publication before intent; exact ten-key rollback intent after the
  intent checkpoint and before capability issuance; complete required rollback
  receipt validation; DB proof followed by Root-only completion, exact DB-
  capability unlink, sole receipt v1-to-v2 CAS, and phase acceptance; missing-
  checkpoint-only repair; and every incident row in the normative crash tables.

- [ ] **Step 4: Run Root RED**

  Run:

  ```bash
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_KEY=synthetic-test-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
    --config vitest.config.unit.ts \
    tests/unit/ops/q12-live-cutover.test.ts \
    tests/unit/ops/q12-command-manifest.test.ts \
    tests/unit/ops/q12-live-smoke.test.ts
  ```

  Expected: the new D4 cases fail because the Root supervisor/manifest do not
  yet implement the frozen capability, overlay, proof, CAS, and recovery graph;
  pre-existing accepted assertions remain green.

- [ ] **Step 5: Implement Root-owned lifecycle**

  Root issues/moves/supersedes capabilities, publishes capability and child
  checkpoints, and alone publishes/accepts each quiesce recovery overlay while
  preserving unaccepted overlays as abandoned immutable residue in one hash
  chain. For cleanup/rollback, Root opens/revalidates the predecessor v1,
  publishes/revalidates its operation-specific byte-exact archive before
  intent, appends/checkpoints intent, publishes the exact rollback intent when
  applicable before capability issuance, and validates the complete required-
  receipt set. Root repairs only exact missing checkpoints, appends the frozen
  journal graph, validates terminal results, completes capabilities, deletes
  the exact DB capability inode, performs the only receipt v1-to-v2 CAS, and
  accepts phases. Unknown files, hashes, epochs, sequences, or live state are
  incidents.

- [ ] **Step 6: Run Root GREEN**

  Re-run the exact Step 4 command. Expected: all three Root files pass with zero
  failures; `bash -n` passes the three shell entrypoints; the JSON command
  manifest parses and its exact command-ID set matches the normative design;
  capability/leak scans and synthetic process/container cleanup are empty.

- [ ] **Step 7: Run joined crash and isolation matrix**

  Exercise every durable boundary from issuance through acceptance for
  quiesce, forward/rollback resume, DB cleanup/rollback, recovery reissue,
  existing-result completion, and receipt CAS. Expected: deterministic
  continuation or fail-closed incident exactly as specified, never dual
  authority or child replay under an old capability.

### Task 7: Local release-confidence and stage closeout

- [ ] **Step 1: Run product and platform gates**

  Run focused Stage 2/4/5/6, shared contract/migration, web conflict,
  recovery/isolation tests; pinned Qdrant `1.18.2` integration; Compose
  validation; the local-disk snapshot/restore drill; `pnpm type-check`; and
  `pnpm build`. Record exact commands, totals, cleanup, and rollback state.

- [ ] **Step 2: Run process/docs/graph review**

  Run `scripts/orchestration/run_process_verification.sh`, a `docs_reviewer`
  pass, and a safe local Graphify refresh without external model/API modes or
  Git hooks. Record exact `docs-reviewed` and `graph-reviewed` states.

- [ ] **Step 3: Run canonical closeout**

  When every non-remote dependency is accepted and Beads truth matches the
  repository, run:

  ```bash
  scripts/orchestration/run_stage_closeout.py --stage mc2-jz6y0
  ```

  Push every accepted integration/closeout commit and confirm the branch is up
  to date with origin.

- [ ] **Step 4: Preserve the separate remote gate**

  Before any GHCR/server/Supabase/Qdrant/service/secret/schema/writer/scheduler/
  staging/production mutation, present the exact actions, effects, secrets,
  observation, rollback, downtime, and data effects and obtain new explicit
  current-task authorization. Without it, `.13` remains open with no partial
  activation.

## Plan self-review

- Every new D4 schema, path, authority split, continuation, and incident class
  is implemented by W or Root and consumed narrowly by M/H.
- Each implementation task begins with a concrete RED case and ends with an
  exact command and expected result.
- The file map prevents shared-write conflicts and preserves the dirty W work.
- No placeholder, silent recovery inference, remote authorization, external S3,
  Qdrant Cloud, or production activation is introduced.
- The unchanged product retrieval/coverage/isolation invariants remain required
  by the joined release-confidence gate.
