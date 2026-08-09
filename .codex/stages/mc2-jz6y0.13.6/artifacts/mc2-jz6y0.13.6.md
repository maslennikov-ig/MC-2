---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-jz6y0.13.6/stage-manifest.json
stream_owner: root-owner
orchestration_level: integration
scope_kind: foundation
immediate_consumer: production Qdrant recovery operations
public_facade: restricted pull backup and exact-version restore evidence
bounded_acceptance: one live off-host generation and isolated restore are verified without loading application traffic
non_goals:
  - S3 provisioning after the owner selected the already available second host
  - reindex, schema migration, paid calls, force-push, or version release
  - claiming two-provider disaster recovery
task_id: mc2-jz6y0.13.6
epic_id: mc2-jz6y0
stage_id: mc2-jz6y0.13.6
session_id: mc2-jz6y0.13.6
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one high-risk production-data boundary remains under the root owner
repo: mc2
branch: develop
base_branch: develop
base_commit: dfb9f4503cc6340b8a17daaede736fee128eff0a
worktree: /home/me/code/mc2
write_zone:
  - deploy/qdrant-offhost-backup, Qdrant alert contracts, runbook, focused tests, and stage state
success_criteria:
  - all six immutable scope criteria pass locally and live
selected_docs:
  - Qdrant 1.18.2 snapshot documentation
  - systemd 255 resource-control and execution documentation
selected_skills:
  - orchestrator-stage
  - technical-premortem
  - superpowers-test-driven-development
selected_agents:
  - existing ghcr_security_review agent for final independent security review only
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: root owner used the primary develop worktree; no child worktree or delegated runtime tail exists
risk_level: high
risk_tags:
  - security
  - authorization
  - atomicity
  - rollback
  - data
affected_surfaces:
  - data
invariants:
  - idempotency
  - rollback
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: canonical Qdrant runbook and project index now route the off-host recovery path
verification:
  - focused contract RED before implementation: failed four of four because the owned files and alerts did not exist
  - review-fix RED: three new contracts failed before size-aware capacity, protected metrics, and source export limits were implemented
  - focused backup, observability, operator, snapshot, and restore tests: passed fifty-one of fifty-one
  - promtool check rules and test rules with the pinned Prometheus image: passed
  - systemd-analyze verify on helixa-new systemd 255: passed
  - restricted-key negative shell and concurrent export probes: both rejected
  - live hardened backup verify: passed 142585344 bytes and exact SHA-256 while preserving 48 GiB free
  - live exact-version restore after hardening: passed Qdrant 1.18.2 green with 13712 points and no residual container
  - live metrics boundary: UID 1001 could write its own file but could not unlink root-owned off-host evidence
  - production Prometheus: both off-host rules inactive and healthy after metric scrape
  - independent security re-review: pass with no remaining must-fix or high-value findings
  - pnpm type-check and pnpm build: exited zero
  - Documentation: docs-resolve for Qdrant 1.18.2 and systemd 255 external/versioned behavior
  - docs-reviewed: updated Qdrant runbooks and project index for the durable off-host path
  - graph-reviewed: updated local code graph without external semantic or API mode
changed_files:
  - deploy/qdrant-offhost-backup/
  - ops/qdrant/prometheus/alerts.yml
  - ops/qdrant/prometheus/alert-tests.yml
  - packages/course-gen-platform/tests/unit/ops/qdrant-offhost-backup.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-observability-contract.test.ts
  - packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
  - packages/course-gen-platform/tools/qdrant/snapshot-recovery.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/snapshot.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/restore-drill.test.ts
  - packages/course-gen-platform/tests/integration/qdrant-snapshot-restore.test.ts
  - docs/operations/qdrant-self-hosted.md
  - .codex/project-index.md
explicit_defers:
  - none
---

# Summary

The owner-selected restricted pull to `helixa-new` is installed and measured. The hardened live
generation copied 142,585,344 bytes and independently matched the production SHA-256 while keeping
about 48 GiB free. An isolated container restored the exact digest-pinned Qdrant 1.18.2 snapshot
and returned the same 13,712 points with green status.

# Scope / Routing

One root-owned integration stream. Production never receives a credential for the backup host;
the backup host receives only a restricted SSH key and no Qdrant API key.

Technical premortem controls:

- disk exhaustion: exact incoming-size reservation above a 10 GiB floor, a second pre-promotion
  floor check, and 14-day/14-generation hard bounds;
- host overload: one off-peak daily pull, non-overlap with uploads, low CPU/I/O priority/quota, and
  one nonblocking source-export lock;
- credential misuse: mode-0600 root key, `restrict`, forced command, no shell or forwarding;
- partial or corrupt copy: hidden incoming directory, size/SHA-256 verification, atomic publication;
- stale source: reject a source manifest older than eight hours;
- false recoverability: exact digest-pinned 1.18.2 isolated restore and point-count comparison;
- silent failure: root-owned success-only backup/restore timestamps protected from application
  replacement, plus stale/absent Prometheus alerts;
- unsafe cleanup: prune only validated timestamp generations below the owned backup root.

# Verification

The focused test began four-of-four red before implementation. Review-fix contracts then began
three-of-three red; the selected backup, observability, operator, snapshot, and restore set now
passes 51/51. Both Prometheus rule validation phases pass with the pinned image.
On systemd 255, both units validate and expose the configured low weights, 25% one-core unit quota,
memory limits, and idle I/O class. The restricted key rejected a shell command and an overlapping
export. UID 1001 can write its own application metric but cannot unlink root-owned off-host
evidence. Production scraped both success timestamps; both new alert rules evaluate inactive with
health `ok`.

The first restore attempt failed before Qdrant started because supplying `--snapshot` replaced the
image's default `./entrypoint.sh` CMD. Image inspection proved the root cause; a focused regression
test was red, the explicit entrypoint was added, and the unchanged live drill then passed. No
container remained after either attempt.

# Delivery / Cleanup

Both timers are enabled on `helixa-new`. The backup private key is root-owned mode 0600 there; the
production authorized key is restricted to the root-owned forced command. Verified generations are
preserved. Repository delivery remains pending the canonical closeout receipt.

# Risks / Follow-ups / Explicit Defers

The second VPS is one off-host copy, not full multi-provider disaster recovery. No in-scope defer is
currently planned.
