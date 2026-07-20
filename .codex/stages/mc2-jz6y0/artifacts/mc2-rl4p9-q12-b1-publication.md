---
schema_version: orchestration-artifact/v1
artifact_type: orchestrator-implementation-stream
task_id: mc2-rl4p9
stage_id: mc2-jz6y0
agent_type: root orchestrator direct execution with one delta correctness reviewer
subagent_model: claude-fable-5
reasoning_effort: high
model_reasoning_rationale: first live run of the supply-chain publication path; owner-credentialed remote action.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 266de3d7
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - deploy/qdrant/publish-qdrant-operator.sh
  - packages/course-gen-platform/tests/unit/ops/qdrant-operator-publisher.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-rl4p9-q12-b1-publication.md
selected_docs:
  - docs/superpowers/plans/2026-07-16-q12-full-completion.md (Phase B, Task B1)
  - deploy/qdrant/image-lock.json (qdrant base pin, unchanged)
selected_skills:
  - orchestrator-stage
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - orchestration-bridge:correctness-reviewer (b1-publisher-fix-review, delta review)
catalog_candidates:
  - none; installed plugin reviewer sufficient
parallel_group: none
depends_on_streams:
  - Phase A integration head 266de3d7 (D6 .13.19 + Root .13.13 closed)
parallel_decision: single owner-gated credentialed action; no decomposition.
status: merged
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: PAT scratchpad file shredded; isolated docker configs removed; default ~/.docker/config.json restored byte-identically (mv round-trip); publisher's own state root auto-cleaned by its traps.
risk_level: high
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: handoff/summary updated with the publication receipt and Phase B closure in this slice.
graph_reviewed: no-change-needed
graph_review_notes: two-file localized fix on an already-indexed script/test pair; refresh deferred to the stage closeout boundary.
verification:
  - 'Publication receipt: tag ghcr.io/maslennikov-ig/mc-2/qdrant-operator:266de3d7457f81a035c9698768e8b7ffb0053495; manifest-list (index) digest sha256:0fe4265ca80eb100912f6ce8155b061712db90ace4e0b1641e63e9a1a247e199; image manifest sha256:8de97bf311bceb6500e1abb78adbc140b5c219b258d8449bea65558b60b90533; config sha256:4b02d3f9f73d3db019ad9855f2f7d3d796d0c533c9e93b2652a3675a8d9bb19d; attestation manifest sha256:ae2289bdbc75d94f5d8337a2c60c04fadf01d2b101426c952715b0428d1a7582; platform linux/amd64; label org.opencontainers.image.revision=266de3d7…'
  - 'Independent remote verification (isolated one-shot docker config, then logout+removal): imagetools Manifest.Digest == sha256:0fe4265c… (matches build log); remote SLSA v1 provenance fetched and validated — vcs.source == https://github.com/maslennikov-ig/MC-2.git PASS, vcs.revision == 266de3d7457f81a035c9698768e8b7ffb0053495 PASS, Dockerfile evidence in source.infos PASS'
  - 'Fixed validator (both SLSA shapes) re-run against the real registry provenance bytes: PASS; adversarial wrong-revision re-run: correctly rejected'
  - 'TDD: three new tests emulating real buildx (0644 metadata file + SLSA v1 provenance, positive and negative) were RED on the pre-fix script — first failure reproduced the exact live error "Buildx metadata file must be mode 0600" — then GREEN after the fix: publisher suite 24/24'
  - 'bash -n publish-qdrant-operator.sh: OK; pnpm type-check: exit 0'
  - 'image-lock.json digests unchanged (qdrant/qdrant v1.18.2 index sha256:75eab8c4…, child sha256:da65a06b…) — they pin the Qdrant base container for Phase C, not the operator image (orchestrator ruling below)'
changed_files:
  - deploy/qdrant/publish-qdrant-operator.sh
  - packages/course-gen-platform/tests/unit/ops/qdrant-operator-publisher.test.ts
explicit_defers:
  - 'GHCR package visibility / pull-credential path for the server (Phase C deploy pulls this image): decided and gated in the Task C0 window packet.'
  - 'The one-time publication PAT entered the local session transcript with explicit owner acceptance («Токен в чате - не страшно», 2026-07-17); revocation recommended to the owner now that publication is complete. Never persisted to git, argv, env, or server.'
---

# Summary

Phase B Task B1 delivered. The owner approved the packet on 2026-07-17 and
supplied a classic PAT with `write:packages`; the publisher ran with the token
via stdin redirect from a 0600 scratchpad file (shredded afterwards). The
pinned operator image built from the clean detached worktree at
`266de3d7457f81a035c9698768e8b7ffb0053495` and pushed successfully, after
which the script failed post-push on two latent defects its fully mocked test
suite had never exercised:

1. **Metadata file mode**: real buildx v0.34 writes `--metadata-file` with
   mode 0644; the script asserted 0600 without normalizing. The mocked docker
   fixture chmod-ed the file to 0600 itself, hiding the defect.
2. **Provenance format**: the registry returns SLSA v1
   (`buildDefinition`/`runDetails`), while the embedded validator accepted
   only the legacy v0.2 shape — the verification chain would have failed even
   past the mode check.

Because the failure occurred strictly after the push, the publication itself
was completed and then verified independently with the same predicates the
script enforces (digest identity + source/revision/Dockerfile provenance).
Both defects are fixed with TDD (RED reproduced the exact live error), and
the fixture now emulates real buildx behavior.

## Orchestrator rulings

1. **Plan Step-3 imprecision**: "confirm the published index/child digests
   match deploy/qdrant/image-lock.json" conflates two images. The image-lock
   pins the `qdrant/qdrant` v1.18.2 base container consumed in Phase C; the
   operator image is built fresh and its digests are recorded in this
   receipt. Verified image-lock bytes unchanged instead.
2. **Manual remote verification accepted in lieu of the in-script chain** for
   this run: the push had already happened (tag immutable by the script's own
   preflight rule), re-publication would require destructive GHCR tag
   deletion, and the independent verification used the same validator
   predicates against the real registry bytes — strictly stronger evidence
   than the local metadata path that failed.
3. **chmod-before-assert** keeps the owner-only property (file lives inside
   the 0700 publisher state root for its whole life) without depending on
   buildx honoring the caller umask; the regular-file/symlink check still
   precedes the chmod.

# Verification

See frontmatter `verification`: publication receipt digests, independent
remote digest + SLSA v1 provenance validation, fixed-validator re-run against
real registry bytes with adversarial rejection, RED→GREEN publisher suite
24/24, bash syntax, type-check, image-lock unchanged. Delta correctness
review: `mc2-rl4p9-b1-publisher-fix-review.md`.

# Risks / Follow-ups

- The publication PAT is transcript-exposed with owner acceptance; revoke it
  at github.com/settings/tokens now that B1 is complete (recommended in the
  final report).
- Server-side pull auth / package visibility for the GHCR image is C0-packet
  scope.
- The validator now accepts both SLSA shapes; if buildx is ever upgraded
  beyond v0.34 the live path re-verifies itself end-to-end on the next
  publication run.
