---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: final recovery-core acceptance guards production bytes and rollback safety
repo: mc2
branch: codex/q12-source-recovery-core-final-review
base_branch: codex/self-hosted-qdrant-platform
base_commit: b553292f
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-core-final-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-final-review.md
success_criteria:
  - review final core b553292f..c1ef4f86 and second correction ddd77560..d44bcfe6
  - verify closure of all prior P1/P2 findings and detect new P0-P3
  - run focused tests, package type-check, artifact validation, and process verification
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-review.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-rereview.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core.md
selected_skills:
  - code-review
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review assets fit
parallel_group: q12-source-recovery-core-gate
depends_on_streams:
  - mc2-jz6y0.13.4.1-core-correction-2
parallel_decision: sequential - final review gates every dependent stream
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and branch may be removed after artifact integration
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: read-only final review; approved design and plan remain current
graph_reviewed: no-change-needed
graph_review_notes: review artifact changes no implementation, architecture, or durable workflow
verification:
  - final range b553292f..c1ef4f86 and correction ddd77560..d44bcfe6: reviewed
  - focused source-recovery tests: passed 18/18
  - package type-check: passed
  - Career Playbook checkpoint negative probe: passed by rejecting direct planned-to-applied
  - canonical manifest SHA negative probe: passed by rejecting a format-valid mismatch
  - artifact schema validation: passed
  - process verification: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-final-review.md
explicit_defers:
  - remaining crash-injection and replacement-inode acceptance coverage is bounded P2 work for the integration/operator gate
  - operator must prove stopped writers, stable exclusively owned directory components, and one host-level lock before mutation
---

# Summary

**Verdict: PASS.** Final core `c1ef4f86` has zero P0, zero P1, one P2,
and zero P3 findings. Both blockers from the first correction re-review are
closed: journal identity is recomputed from canonical manifest bytes, and every
Career Playbook disposition must persist the source-row CAS checkpoint before
the catalog-applied state. Task 1 may proceed to orchestrator acceptance; this
does not authorize staging mutation.

| Priority | Findings | Integration effect |
| -------- | -------: | ------------------ |
| P0       |        0 | none               |
| P1       |        0 | none               |
| P2       |        1 | bounded coverage   |
| P3       |        0 | none               |

# Finding

## P2 — Full crash-order and replacement-inode injection remains an acceptance gate

- **Files:**
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-filesystem.test.ts:109`,
  `packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts:295`
- **Evidence:** the five filesystem tests prove streamed identity, no-replace,
  symlink/traversal rejection, root binding, exact deterministic-temp reuse and
  cleanup, mismatched-temp refusal, target reconciliation, changed-hash rollback
  rejection, and successful rollback. They do not inject failure at each hard
  link, target fsync, parent fsync, temp unlink, journal transition boundary, or
  replace the target with a same-content new inode between hash and unlink.
- **Impact:** reviewed control flow is fail-closed and restart states are
  deterministic, so no current P0/P1 correctness hole was found. The remaining
  tests are still required to demonstrate every host-crash boundary and the
  device/inode guard under adversarial timing before real mutation.
- **Bounded follow-up:** run an injected filesystem failure matrix plus a
  replacement-inode rollback test in the integration/operator acceptance gate.
  Preserve the already mandatory stopped-writer, stable exclusively owned path,
  UID/GID 1001, and host-level `flock` proof across the entire recovery window.

# Prior-finding closure

| Prior finding | Final disposition | Evidence |
| ------------- | ----------------- | -------- |
| Manifest operator/audit/root binding | Fixed | Strict manifest metadata and roots are defined at `source-recovery-manifest.ts:110`; runtime realpaths are compared and overlap-rejected at `source-recovery-filesystem.ts:68`. |
| Full disposition CAS predicates and identity uniqueness | Fixed | File and Career Playbook expected predicates are strict at `source-recovery-manifest.ts:56`; duplicate catalog/source identities are rejected at lines 205-229. |
| Mandatory Career Playbook paired checkpoint | Fixed | `career_playbook_source_applied` is kind-bound and direct planned-to-applied is rejected at `source-recovery-manifest.ts:552-581`; the negative regression is at `source-recovery-manifest.test.ts:395`. |
| Canonical initial journal and phase coherence | Fixed | Initial states are derived from the manifest at lines 413-437; whole-phase gates, immutable kinds, and reindex freeze are enforced at lines 455-592. |
| Canonical manifest SHA binding | Fixed | One canonical hash helper is used at lines 407-421; a format-valid mismatch is rejected by the regression at `source-recovery-manifest.test.ts:529`. |
| Initial journal atomic no-replace | Fixed | Absent initial state selects immutable hard-link publication at lines 596-627; the shared publication path hard-links, fsyncs, unlinks temp, and fsyncs again at lines 352-393. |
| Immutable manifest no-replace and state-directory mode | Fixed | Current-UID/mode-0700 real-directory checks and atomic hard-link publication are enforced at lines 298-404. |
| Deterministic crash-temp reconciliation | Fixed | Run/entry-bound temp inspection, exact reuse/cleanup, mismatch stop, and parent fsync are at `source-recovery-filesystem.ts:182-229` and exercised at test line 109. |
| Rollback hash/inode safety and reindex freeze | Fixed with operator boundary | Rollback rejects terminal phases, verifies expected bytes, compares device/inode immediately before unlink, then fsyncs at `source-recovery-filesystem.ts:376-407`. The unavoidable final path race remains bounded by the mandatory exclusive operator window. |
| Crash-injection test matrix | Bounded P2 | Core behavior is sound, but the exact injected boundary matrix remains the single finding above. |

# Positive evidence

- `calculateRecoveryManifestSha256()` hashes the same normalized serialization
  written by `writeImmutableManifest()`. Initial journal creation rejects any
  different digest before durable publication.
- Initial manifest and journal publication use hard-link no-replace semantics;
  journal revision replacement remains under the approved single-writer lock.
- Journal key sets and disposition kinds cannot change. Every phase must advance
  by at most one, copies must be published before `copied`, dispositions applied
  and verified before later phases, and all entries are frozen correct before
  `reindex_started`.
- Exact prior file/Career Playbook predicates, owner/course/user/playbook
  identities, source hash/path, outcomes, and reasons are inside the immutable
  reviewed manifest; duplicate database identities fail closed.
- Source and temp bytes are streamed and re-hashed, publication is atomic
  no-replace, target and directory are fsynced, restart accepts only absent or
  exact states, and mismatches require investigation.
- Rollback requires durable `rollback_planned`, remains forbidden at/after
  reindex start, never deletes a hash mismatch, and fsyncs the parent after
  unlink.

# Verification evidence

- Reviewed exact history `b553292f..c1ef4f86`, including original
  `cf51722c`, first correction `ddd77560`, second correction `d44bcfe6`, and both
  immutable prior review artifacts. The executable correction is exactly
  `ddd77560..d44bcfe6`; `c1ef4f86` adds only the prior re-review artifact.
- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=unit-test-key pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/tools/qdrant/source-recovery-manifest.test.ts tests/unit/tools/qdrant/source-recovery-filesystem.test.ts`
  passed: 2 files, 18 tests, zero failures.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed after the
  allowed temporary dependency symlinks were supplied.
- Targeted `tsx` probe rejected direct Career Playbook
  `disposition_planned -> disposition_applied` with the required source-CAS
  checkpoint error.
- Targeted `tsx` probe rejected a format-valid noncanonical manifest SHA-256.
- `git diff --check b553292f..c1ef4f86` and
  `git diff --check ddd77560..d44bcfe6` passed.

# Delivery / cleanup

Only this final review artifact is owned by the reviewer. Temporary dependency
symlinks must be removed before commit. No implementation, tests, docs, plan,
spec, Beads state, service, database, Qdrant instance, or runtime data was
mutated.

# Risks / Follow-ups / Explicit Defers

The final core review is PASS because no P0/P1 remains. The single P2 is exact
acceptance coverage, not a known unsafe core transition. Staging execution
remains prohibited until the broader Q12 prerequisites, operator exclusivity,
current database credentials, and full documented recovery gates pass.
