---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4
stage_id: mc2-jz6y0
agent_type: search/data worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: source-of-truth recovery, tenant metadata, filesystem provenance, and staging mutation safety require exact evidence
repo: mc2
branch: codex/q12-source-recovery
base_branch: codex/self-hosted-qdrant-platform
base_commit: 52269005d2438ec35c75be1b31125ecf6838aa6f
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-source-recovery.md
success_criteria:
  - all 261 catalog rows and the reported 80 missing plus 2 invalid paths are reconciled without exposing source identities
  - plan-equivalent eligible counts distinguish canonical, alternate-root, recoverable-copy, invalid, absent, and non-eligible rows
  - exact copies are described by deterministic provenance and fail-closed preconditions but are not executed
  - no server, database, queue, Qdrant, service, or secret mutation occurs
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - packages/course-gen-platform/src/stages/stage1-document-upload/storage-paths.ts
  - packages/course-gen-platform/src/stages/stage1-document-upload/phases/phase-2-storage.ts
  - packages/course-gen-platform/tools/qdrant/reindex-plan.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
selected_skills:
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - search/data worker
catalog_candidates:
  - none - repository storage and reindex contracts are the authoritative sources
parallel_group: Q12-F
depends_on_streams:
  - mc2-jz6y0.13.2
parallel_decision: isolated
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: protected temporary audit data remains local until orchestrator acceptance; no remote resources were created
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: this is a read-only staging truth artifact; stable docs must change only after the owner selects a disposition for unrecoverable sources
graph_reviewed: no-change-needed
graph_review_notes: focused Q12 Graphify evidence was already supplied by the orchestrator; this stream changes no code, architecture, or durable workflow
verification:
  - certificate structure and validity check: passed
  - read-only catalog and course inventory: 261 and 126 rows
  - canonical plus alternate source SHA-256 verification: 179/179 rows match, zero mismatches
  - exact buildReindexPlan current-state replay: passed
  - exact buildReindexPlan proposed-copy replay: passed
  - whole-host exact-size plus SHA-256 search for unresolved eligible sources: zero matches
  - whole-host exact-size plus SHA-256 search for unresolved non-eligible sources: zero matches
  - remote mutation audit: zero mutations
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-source-recovery.md
explicit_defers:
  - independent correctness review and orchestrator acceptance are required before any copy
  - four eligible missing rows and two eligible invalid-path rows require an exact backup or explicit audited product-truth disposition
  - eighteen non-eligible Career Playbook source rows require a separate source-retention disposition and do not belong to course Qdrant reindex
---

# Summary

The server contains enough exact source bytes to raise the course reindex plan
from 109 to 234 recoverable eligible documents by copying 42 distinct files into
their already-recorded canonical production paths. No database path update is
needed for those copies. Six eligible catalog rows remain unrecoverable from the
server: four have valid but absent source paths and two have syntactically
repairable paths but no exact source bytes.

This stream was strictly read-only. It did not copy, rename, write, chmod, chown,
enqueue, update a database row, call Qdrant, restart a service, or touch a secret.
Source filenames, full file/course/organization identifiers, source hashes, and
source text are absent from this artifact.

# Reconciled catalog truth

The earlier `109 production + 70 development + 80 missing + 2 invalid = 261`
inventory describes all `file_catalog` rows across both server upload roots. It
is not the Qdrant reindex plan, which resolves relative paths only under the
production base path and excludes rows without a course.

| Classification | All rows | Qdrant-eligible | Distinct physical target paths | Evidence |
| --- | ---: | ---: | ---: | --- |
| Exact canonical production source | 109 | 109 | 61 | canonical path, size, and database SHA-256 all match |
| Exact alternate development source | 70 | 67 | 42 total; 39 eligible | alternate path, size, and database SHA-256 all match |
| Canonical path absent, exact content elsewhere in development | 58 | 58 | 3 | each logical content has five physical development copies; all size and SHA-256 values match |
| Valid path, source truly absent | 22 | 4 | 20 total; 2 eligible | no exact bytes on the host; 18 rows are non-eligible Career Playbook sources |
| Invalid relative path and source absent | 2 | 2 | 2 | path lacks the required `uploads/` prefix; no exact bytes exist on the host |
| **Total** | **261** | **240** | — | independently counted catalog and course inventories |

The all-row `source_missing=80` therefore separates into:

- 58 eligible rows backed by three exact development-resident contents and
  recoverable without a database update;
- 4 eligible rows backed by two distinct contents that are absent;
- 18 non-eligible Career Playbook rows backed by nine distinct hashes and 18
  distinct paths that are absent.

The 21 non-eligible rows all have `course_id IS NULL` and the canonical shape
`uploads/<organization>/career-playbooks/<owner>/<file>`. The actual
`buildReindexPlan()` contract classifies them as `missing_course` before source
probing. Three have exact files in development. Of the eighteen absent rows,
fifteen retain parsed, markdown, and processed derivatives; three retain none.
Those derivatives are not accepted substitutes for the original source file.

# Exact plan-equivalent counts

The repository's real `buildReindexPlan()` was run over the complete protected
read-only inventory, not a handwritten approximation.

| State | Eligible | Recoverable | Missing source | Invalid source path | Unsupported | Expected documents | Estimated points |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Current production base path | 240 | 109 | 129 | 2 | 21 | 109 | 7,294 |
| After the reviewed 42-file copy | 240 | 234 | 4 | 2 | 21 | 234 | 12,114 |

The current-plan count of 129 missing sources contains the 67 eligible files
whose exact canonical-relative counterparts are presently under the development
mount, the 58 exact-content recoveries, and the final four absent rows. This is
why the prior cross-root `80 missing` number must not be used as the production
reindex gate.

# Root-cause evidence

## Split physical roots with one logical path contract

Production containers bind `/opt/megacampus/data/uploads` to `/app/uploads`.
Development containers bind `/opt/megacampus/data/uploads-dev` to the same
container path. Both write the database-relative shape `uploads/...` to the
shared Supabase catalog. This directly explains the 70 rows that are exact on
the server but environment-local, including 67 Qdrant-eligible rows.

## Shared deduplicated paths

The upload implementation deliberately makes duplicate catalog rows share the
original row's `storage_path`. The 58 recoverable missing rows collapse to only
three original paths: three originals and 55 live references. Exact content for
each group still exists in five development paths with the same size and
SHA-256. The original physical paths are absent, but the content identity is not
ambiguous.

Historical reference counters are larger than current inbound-reference counts
for these three originals. That proves prior reference churn, but not which
actor removed the physical paths. No surviving server log or backup establishes
whether historical cleanup, an operator action, or an older lifecycle defect
removed them; this artifact does not guess.

## Final absent sources

The four eligible valid-path rows reduce to two absent originals: three live
rows reference one historical PDF original, and one row represents a separate
document. The two invalid paths are safe three-segment relative paths missing
only the leading `uploads/` component and refer to text files. Prepending the
component is syntactically deterministic, but would merely change their result
from `invalid_source_path` to `source_missing`, because their exact bytes are
absent.

Database-derived content exists for all six eligible unresolved rows, but no
UTF-8, LF, or CRLF representation reproduces the recorded byte size and
SHA-256. It cannot be silently promoted to an original. One Docling cache entry
references one absent group, but it is likewise derived evidence rather than an
exact source.

# Verification

The search covered:

- canonical production and development upload trees;
- legacy upload trees inside the server checkout;
- application and backup directories under `/opt/megacampus`;
- main/development worker volumes, Docling JSON/model cache mounts, and Docker
  volume metadata;
- the complete host filesystem, including inactive Docker overlay layers,
  filtered first by exact database file size and then by SHA-256;
- open-but-deleted files, root/home trash locations, stopped containers, and
  plain/gzip backup contents;
- exact storage basename plus size, original basename plus size, reference
  relationships, vector state, chunk counts, and retained derivative presence.

All 138 regular source files under the two active upload roots were hashed once.
They support 179 catalog rows: 109 production and 70 development, with 179/179
database hash matches and zero mismatches. For the six unresolved eligible rows,
the whole-host size scan produced eleven candidates and zero hash matches. For
the eighteen unresolved non-eligible rows it produced 1,412 size candidates and
zero hash matches. There were zero relevant open-deleted or trash files.

# Proposed mutation manifest semantics — not executed

The reviewer/orchestrator should regenerate the sensitive manifest from a fresh
read-only catalog snapshot. Identities must remain in an owner-only temporary
file outside Git and must never be printed.

## Set A — relative-path mirror copies

- Select the 39 distinct eligible paths whose production target is absent and
  whose corresponding development-relative source is a regular non-symlink
  file with exact database size and SHA-256.
- Source shape:
  `/opt/megacampus/data/uploads-dev/<relative-tail>`.
- Target shape:
  `/opt/megacampus/data/uploads/<relative-tail>`.
- These 39 copies restore 67 eligible catalog rows.

## Set B — content-provenance copies

- Select the three distinct valid canonical targets shared by the 58 eligible
  rows whose original paths are absent.
- For each expected size/hash pair, require all five development candidates to
  hash identically; choose the lexicographically first safe real path as the
  deterministic copy source.
- Copy to the database-recorded canonical production target. These three copies
  restore 58 eligible rows without changing `storage_path`.

## Mandatory preconditions

1. Quiesce new Stage 1 uploads for the bounded copy window or acquire the
   repository-defined recovery lock.
2. Recount the catalog at 261 and rerun the current plan; any changed count or
   classification aborts the operation.
3. Resolve every source and target with `realpath`-style containment checks.
   Sources must be regular readable non-symlink files under `uploads-dev`.
4. Require all 42 targets to be absent; no overwrite, merge, rename, or database
   mutation is permitted.
5. Verify source size and SHA-256 against every catalog row sharing that target.
   Any disagreement aborts the entire batch before publication.
6. Preserve the established storage contract: directories `0755`, files
   `0644`, owner/group `1001:1001`.

## Atomic copy and verification contract

- Use a same-directory owner-only temporary file for each target, copy bytes,
  `fsync`, verify size/SHA-256, apply final ownership/mode, then publish with an
  atomic **no-replace** operation.
- Process a deterministic sorted list with bounded concurrency. Persist an
  owner-only manifest containing source/target identity, expected and observed
  size/hash, timestamps, and publication result.
- After all 42 publications, rerun `buildReindexPlan()` and require exactly
  `eligible=240`, `recoverable=234`, `missingSource=4`,
  `invalidSourcePath=2`, and `unsupported=21` before Qdrant enqueueing.
- Re-hash every restored target and prove that all 125 affected eligible rows
  resolve to the recorded content. A partial batch is not acceptance evidence.
- Before reindex starts, rollback may delete only manifest-created targets that
  still match the recorded hash. Never delete a pre-existing or changed file.

# Risks / Follow-ups

The copy operation cannot make the reindex gap-free. The owner must choose one
of these truth-preserving outcomes for the remaining six eligible rows:

1. provide an external exact backup whose bytes match the recorded size and
   SHA-256, then restore and re-run the plan; or
2. approve an audited durable failure/retirement disposition for those six
   catalog rows, with reason and provenance, while keeping their courses
   first-class and never representing them as indexed.

The eighteen absent non-eligible Career Playbook sources require a separate
bounded retention/data-hygiene decision. They must not be folded into the course
Qdrant gap count, and their retained derivatives must not be called exact source
recovery.

# Protected command evidence

Commands were executed with secret values captured only in mode-`0600` local
temporary files and removed when no longer needed. No key or source identity was
printed.

- `openssl x509 -in <downloaded-project-ca> -noout -subject -issuer -dates`
  validated the Supabase Root 2021 CA through 2031.
- Read-only Supabase REST inventory returned 261 catalog and 126 course rows.
- Read-only `docker inspect`, `find`, `stat`, `file`, `lsof`, and `sha256sum`
  covered the roots and provenance checks listed above.
- The exact repository `buildReindexPlan()` replay returned the two rows in the
  plan-equivalent table.
- `git status`, artifact validation, `git diff --check`, commit, and push are the
  only local delivery mutations for this stream.
