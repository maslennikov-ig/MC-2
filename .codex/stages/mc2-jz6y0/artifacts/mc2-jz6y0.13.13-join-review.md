---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13.13
stage_id: mc2-jz6y0
agent_type: correctness-reviewer
subagent_model: claude-fable-5
repo: /home/me/code/mc2
branch: codex/q12-root-join
base_branch: codex/self-hosted-qdrant-platform
base_commit: 8717f7ac7daba6cc9132788f2ab82af05f55f58c
review_range: 8717f7ac..dc6c2093
worktree: /home/me/code/mc2/.worktrees/q12-root-join
verdict: PASS
findings_by_severity: 'P0=0, P1=0, P2=0, P3=5'
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Read-only independent review; the sole write is this review artifact in the integration worktree. No source, test, doc, branch, or Beads mutation was performed; the q12-root-join worktree/branch remain for the orchestrator to integrate.
risk_level: high
docs_reviewed: no-change-needed
docs_review_notes: Runbook (qdrant-self-hosted.md) joined-controller subsection and document-evidence.md cross-reference claim only local/synthetic truth ("takes no live/remote action", "Neither opens a database, container, socket, or service"); thresholds quoted match §13. No doc drift found; review adds no doc change.
graph_reviewed: no-change-needed
graph_review_notes: Read-only review; no code or architecture change to refresh.
verification:
  - 'Contract tail hash: tail -c 47092 docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md | sha256sum = 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5 (matches frozen normative).'
  - 'Range 8717f7ac..dc6c2093 touches exactly the 7 authorized files; git diff shows 0 deletion lines (+1249, additions only) — no accepted D6 function modified, no existing assertion weakened.'
  - 'Frozen bytes verified unchanged: q12-command-manifest.json sha256 aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841; q12-database-barrier.sh sha256 134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68; q12-live-cutover.sh / q12-capability-run.sh / q12-live-cutover.test.ts not in range (byte-identical).'
  - 'Fresh suite rerun (SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key --config vitest.config.unit.ts): q12-root-join.test.ts 15/15 + q12-live-smoke.test.ts 24/24 = 39/39 passed.'
  - 'D6 envelope fidelity: D6_FRAME_KEYS order = (schema_version, sequence, kind, run_id, payload, previous_frame_sha256, frame_sha256) exact; d6_frame_sha256 hashes canonical body excluding frame_sha256; d6_validate_frame_chain enforces genesis previous=null, sequence==index+1 from 1, prior-tip chaining, run_id stability, and exact kind order per classification.'
  - 'Handshake kind orders match contract Exact frame payloads: precommit/committed = db_locked,host_projection,host_bound,predecision_*,sealed,release,closed; drift = db_locked,host_projection,host_bound,abort_incident.'
  - 'Outcome→authority mapping correct: precommit_rollback_sealed→task9_retirement_rollback_preparation; committed_finish_forward_sealed→finish_forward; drift/no-seal→incident_only (via d6_authority_without_seal). Bindings enforced: predecision transcript_head_before == host_bound frame hash; seal via integrated d6_verify_seal_binding; seal.final_transcript_head_sha256 == chain tip.'
  - 'Validation-at-load: d6_load_transcript parses each JSONL line then re-derives frame_sha256 from canonical() and re-verifies the chain; the test proves a reversed-key / pretty-spaced re-serialization still validates and a payload mutation under a stale frame_sha256 fails closed — never hashes raw file bytes.'
  - 'Genesis-null consistency: at sequence 1 d6_validate_frame_chain requires previous_frame_sha256==null (previous starts None), consistent with the integrated probe makeFrame rule; null accepted as the ruling.'
  - 'Smoke thresholds all sourced from §13 (2026-07-13-q12-live-cutover-corrections-design.md lines 1213-1237): 60-min, coverage/baseline 100%, isolation/incidents 0, REST >2% breach, hybrid >5% breach, memory >85% breach, point-drop >10% breach, initial cutover exactly 12114, degraded >=3 breach, firing+resolved notification, activation rows enabled=true/status=active/rollout_percentage=100. No invented threshold; boundary operators correct.'
  - 'Fail-closed logic: accepted=not breaches; q12_open=not accepted; selected_path=phase_aware_rollback_incident on any breach; rotation_required hardcoded True on every verdict.'
  - 'Wrapper safety: q12-live-smoke.sh is a 4-line thin exec into q12-lifecycle-core.py smoke; smoke action restricted to choices=(observe,); added code region (lines 3781-4185) contains no socket/http/subprocess/psycopg/exec primitive; run_smoke and d6_load_transcript both call require_lexical_absolute.'
  - 'Artifact mc2-jz6y0.13.13-q12-root.md: scripts/orchestration/validate_artifact.py = artifact validation OK; recorded RED→GREEN commits, 283/283 and 117/117 counts, and frozen hashes are consistent with independent checks.'
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-join-review.md (this read-only review artifact; no source/test/doc file changed by the reviewer)
explicit_defers:
  - 'F1 (P3): d6_load_transcript uses plain json.loads (last-value-wins) rather than a duplicate-key-rejecting parser — minor deviation from the contract canonical "duplicate-key rejecting" property; the re-hash-and-chain check fails closed on any value-changing duplicate, so exploitable impact is ~nil. Orchestrator discretion whether to harden.'
  - 'F2 (P3): d6_bind_handshake_authority does not cross-check the predecision frame payload predecision_sha256 against d6_predecision_sha256(predecision); the predecision is instead pinned by the terminal seal (sealed paths) and by transcript_head_before position. The drift path has no seal but yields incident_only (no mutation) regardless. Defense-in-depth only.'
  - 'F3 (P3): head_before uses frames[predecision_index - 1]; predecision_index is fixed at 3 for every classification so this is safe today, but a hypothetical predecision-at-index-0 kind order would negative-index to the last frame. Latent, unreachable given the frozen kind orders.'
  - 'F4 (P3): the drift_incident join hard-rejects any terminal seal while the coordinator models a drift_incident_sealed outcome (authority none). This matches the tasked design ("drift/no-seal→incident-only") — documented narrowing, not a defect.'
  - 'F5 (P3): the §13 course-cycle sub-components are collapsed to a single course_cycle_complete boolean; the full machine-checkable acceptance list is enforced but cycle granularity is coarser than the §13 narrative. Modeling choice for a synthetic gate.'
---

# Summary

Independent read-only correctness review of the Root `.13.13` join (D5 plan Task 9
scope: synthetic smoke/observation gate + D6 real frame envelope / R-handshake join)
over range `8717f7ac..dc6c2093` in worktree `/home/me/code/mc2/.worktrees/q12-root-join`.

**Verdict: PASS.** No P0/P1/P2 findings. Five P3 informational/defense-in-depth
observations, none blocking, all deferred to orchestrator discretion.

Stop conditions all clear: the frozen contract tail hash matches
(`2a2251ac…aae5`), the range touches exactly the seven authorized files with zero
deletion lines, and the two frozen hashes match (manifest `aaec6fc2…`, barrier
`134255ce…`; the three frozen cutover files are absent from the range).

Focus results:

1. **D6 frame join fidelity — PASS.** The 7-key envelope order is exact; `frame_sha256`
   hashes the canonical body excluding itself; the chain starts at sequence 1 from a
   null predecessor and chains the prior tip; `d6_validate_frame_chain` enforces exact
   sequence monotonicity, run*id stability, prior-tip linkage, and per-classification
   kind order. The handshake kind orders match the contract's "Exact frame payloads"
   sequence for precommit/committed (…predecision*\*→sealed→release→closed) and for the
   drift abort (…→abort_incident). Validation-at-load parses→`canonical()`→hash and
   re-verifies the chain, never hashing raw file/JSONL bytes (proven by the reversed-key
   pretty-spaced round-trip test and the stale-`frame_sha256` payload-mutation rejection).
   Bindings are enforced via the integrated `d6_verify_seal_binding` plus predecision
   `transcript_head_before` == host_bound frame hash and seal `final_transcript_head` ==
   chain tip. Outcome→authority mapping is correct.

2. **Consumes accepted D6 unchanged — PASS.** The diff is additions only (0 deletion
   lines); `d6_build_predecision`, `d6_build_terminal_seal`, `d6_verify_seal_binding`,
   `d6_terminal_seal_authority`, `d6_authority_without_seal` are called unmodified.

3. **Smoke/observation gate — PASS.** Every one of the 13 thresholds maps exactly to
   §13 (2026-07-13-q12-live-cutover-corrections-design.md lines 1213-1237); no invented
   threshold; boundary operators correct (`>` for at-most ratios, `>=` for "fewer than 3"
   degraded, `!=` for exact-equality fields). Fail-closed: any breach ⇒ `accepted=false`,
   `q12_open=true`, `phase_aware_rollback_incident`; `rotation_required` is always `true`.

4. **Wrapper safety — PASS.** `q12-live-smoke.sh` is a thin `exec` into the core; the
   smoke action is restricted to `observe`; the added code region has no
   network/subprocess/DB primitive; paths go through `require_lexical_absolute`.

5. **Tests — PASS.** Both suites drive the production core through synthetic drivers with
   genuine RED anchors (broken chain link, payload mutation, non-monotonic sequence,
   kind-order swap, seal/predecision binding mismatch, final-head mismatch, canonical-vs-
   raw-bytes, and each §13 breach code); no tautologies; no existing assertion weakened
   (additions only). Fresh rerun 39/39.

6. **Artifact — PASS.** `mc2-jz6y0.13.13-q12-root.md` validates (`artifact validation OK`)
   and its recorded evidence (RED→GREEN commits, 283/283, 117/117, frozen hashes) is
   consistent with independent checks.

## Findings

| id  | severity | confidence | file:line                                                                                | description                                                                                                                                                                                                                                                                                                      |
| --- | -------- | ---------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | P3       | low        | deploy/qdrant/q12-lifecycle-core.py:3932 (`d6_load_transcript`)                          | Uses plain `json.loads` (last-value-wins) rather than a duplicate-key-rejecting parser; minor deviation from the contract's canonical "duplicate-key rejecting" property. Re-hash-and-chain check fails closed on any value-changing duplicate, so exploitable impact ~nil.                                      |
| F2  | P3       | low        | deploy/qdrant/q12-lifecycle-core.py:3949 (`d6_bind_handshake_authority`)                 | Does not cross-check the predecision frame payload's `predecision_sha256` against `d6_predecision_sha256(predecision)`. Predecision is pinned by the terminal seal (sealed paths) and by `transcript_head_before` position; drift path has no seal but yields `incident_only` regardless. Defense-in-depth only. |
| F3  | P3       | low        | deploy/qdrant/q12-lifecycle-core.py:3968 (`head_before = frames[predecision_index - 1]`) | `predecision_index` is fixed at 3 for every classification, so safe today; a hypothetical predecision-at-index-0 kind order would negative-index to the last frame. Latent, unreachable under the frozen kind orders.                                                                                            |
| F4  | P3       | info       | deploy/qdrant/q12-lifecycle-core.py:3972-3975                                            | The drift join hard-rejects any terminal seal while the coordinator models a `drift_incident_sealed` outcome (authority `none`). Matches the tasked "drift/no-seal→incident-only" design; documented narrowing, not a defect.                                                                                    |
| F5  | P3       | info       | deploy/qdrant/q12-lifecycle-core.py:4091 (`course_cycle_complete`)                       | §13's course-cycle sub-components are collapsed to one boolean; the machine-checkable acceptance list is fully enforced but cycle granularity is coarser than the §13 narrative. Modeling choice for a synthetic gate.                                                                                           |

## Significant Findings

None at P0-P2. The join faithfully implements the frozen D6 frame envelope, the
R-handshake chain and its predecision/seal bindings, and the §13 activation observation
gate, consuming the accepted D6 coordinator objects without modification and adding no
live/remote surface. The five P3 items are hardening / documentation-of-narrowing notes
that do not change the verdict.

# Verification

All commands run read-only from the `q12-root-join` worktree (source of truth) and,
for schema checks, the integration worktree. Evidence is enumerated in the frontmatter
`verification` list: contract tail hash match; exact 7-file range with 0 deletions;
frozen manifest/barrier hash match and frozen cutover files absent from range; fresh
39/39 suite rerun under the synthetic env; envelope/chain/binding/authority fidelity;
validation-at-load canonical (not raw-byte) hashing; genesis-null consistency; all 13
§13 thresholds sourced with correct boundaries; fail-closed logic; wrapper and added-
region safety sweep; and `validate_artifact.py` = OK on the delivered stream artifact.

# Risks / Follow-ups

- F1-F5 (all P3) are listed under `explicit_defers` for orchestrator discretion; none
  block integration.
- The live smoke subcommands (activation/stage2/4/5/6/notification-cycle/cleanup/contain)
  remain remote-gated and unimplemented locally, as declared in the stream's defers — the
  reviewed surface is the synthetic observation-gate proof only.
- This review is read-only; integration, cleanup, and Beads/close remain the
  orchestrator's Step 3 responsibility.
