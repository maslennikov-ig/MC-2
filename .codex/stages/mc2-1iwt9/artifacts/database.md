---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1iwt9/stage-manifest.json
stream_owner: database_v2
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Helixa transport and atomic edit workers
public_facade: Service-only knowledge-sync v2 RPCs
bounded_acceptance: Disposable PostgreSQL 17 red and green controls
non_goals:
  - Deployments, activation, provider calls, customer data, Helixa source edits
evidence:
  - none
task_id: mc2-1iwt9
epic_id: n/a
stage_id: mc2-1iwt9
session_id: n/a
milestone: Durable v2 capture and scoped atomic course editing
milestone_status: in_progress
agent_type: worker
subagent_model: gpt-6.1-sol
reasoning_effort: max
model_reasoning_rationale: Critical migration, concurrency, tenancy and immutable revision semantics
repo: /home/me/code/mc2
branch: codex/helixa-v2-database
base_branch: origin/develop
base_commit: c7a000ec6cf387153f94b26d00b5db7c51237d03
worktree: /home/me/code/mc2/.worktrees/helixa-v2-database
write_zone:
  - packages/course-gen-platform/supabase/migrations/20260930120000_helixa_knowledge_sync_v2.sql
  - packages/course-gen-platform/tests/unit/integrations/helixa/knowledge-sync-v2-pg17*
  - .codex/stages/mc2-1iwt9/artifacts/database.md
success_criteria:
  - Durable clocks, completed and content-only updated intents, all four withdrawal reasons
  - Exact current completed inventory using actual organization-member read predicates
  - One logical atomic field edit, frozen retries, no-bump current-revision resend
  - Default-off v1 preservation including off-on-off transitions
selected_docs:
  - AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md
  - Helixa section C sources-complete-and-current spec at origin/main
  - docs/helixa/contract-v2-implementation.md in root worktree
  - Existing native course and career-playbook RLS migrations
selected_skills:
  - graphify-project
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
  - format-commit-message
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: database
depends_on_streams:
  - transport RPC agreement
  - atomic edit RPC agreement
parallel_decision: parallel
status: returned
delivery_method: cherry-pick
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Isolated branch retained for root integration; disposable databases removed
risk_level: high
risk_tags:
  - migration
  - tenancy
  - concurrency
  - idempotency
  - atomicity
  - retry
affected_surfaces:
  - database
  - backend
invariants:
  - tenancy
  - state-transition
  - idempotency
  - rollback
docs_impact: migration
docs_reviewed: updated
docs_review_notes: Internal RPC contract and evidence recorded here; root owns public implementation guide
verification:
  - Original disposable PG17 baseline controls: expected red, 21 failed and 1 legacy passed
  - Supplemental baseline controls: expected red, 6 failed, 3 failed, and 1 failed
  - Original disposable PG17 focused controls: passed, 32 of 32
  - Review regression controls on original v2 migration: expected red, 3 failed
  - Review normalization and disabled-binding controls: expected red, 4 failed
  - Review protocol-switch controls: expected red, 7 failed and 1 delivered/scoped control passed
  - Review frozen-body activation control: expected red, 1 failed
  - Review disposable PG17 final focused controls: passed, 46 of 46, exit 0
  - Prettier test formatting: passed
changed_files:
  - packages/course-gen-platform/supabase/migrations/20260930120000_helixa_knowledge_sync_v2.sql
  - packages/course-gen-platform/tests/unit/integrations/helixa/knowledge-sync-v2-pg17-fixture.sql
  - packages/course-gen-platform/tests/unit/integrations/helixa/knowledge-sync-v2-pg17.test.ts
  - .codex/stages/mc2-1iwt9/artifacts/database.md
explicit_defers:
  - none
---

# Summary

Implemented the default-off v2 database slice. Separate durable `(kind,id)`
clocks survive hard deletion and recreation. A dirty-object queue and deferred
constraint trigger capture final answerable content once per transaction,
including multi-row writes and cascades. Outbox records pin protocol, revision,
event identity and semantic snapshot; existing raw-payload freezing and lease
transitions preserve retry bytes.

Audience follows the owner's explicit resolution: a completed object is current
when at least one actual producer-organization member can read it. The course
predicate mirrors current JWT role/primary-org branches and invokes the existing
`is_superadmin` and `is_enrolled_in_course` helpers. The guide predicate mirrors
its current owner/membership/visibility SELECT policy. Public-link removal alone
does not withdraw a still-readable object. Membership, primary org/role and
enrollment writes trigger the same final-state comparison.

Gate enable warms existing completed objects once on false-to-true. Unchanged
true does not rescan every claim batch. Org transfer persists former-scope
withdrawal before publishing in the new org, with sequential global revisions;
an earlier-v2 binding currently gated off retains its pinned withdrawal intent.
Never-enabled v1-only bindings receive no speculative v2 events.

V2 course lessons select one current usable completed/approved version per
lesson, ordered by `created_at DESC,id DESC`. Empty/failed newest versions do
not hide older usable content. Old-version edits and native envelope telemetry
do not advance a revision. Native preview's answerable outer
`metadata.markdownContent` survives exactly when ECMAScript whitespace trimming
leaves text; all other outer metadata is omitted. For object content containing
an object `.content`, only envelope-level `metadata,status,created_at,updated_at`
are removed. Actual body fields and nested semantic metadata remain intact.

Activation holds the exact binding row lock and refuses outstanding v1 delivery
history: non-delivered scoped legacy rows with `claim_generation > 0`,
`attempts > 0`, or a frozen body. Resetting attempts cannot bypass the barrier.
Legacy claims hold a compatible binding lock through leasing and return no rows
in v2 mode. Dormant unattempted v1 rows remain unchanged until flag-off; completed
legacy delivery allows activation. Disabling succeeds for an exact existing
disabled binding; enabling and claims still require an enabled binding.

# Scope / Routing

Only the four listed files were written. Transport and atomic-edit workers own
consumers; internal RPC agreement was exchanged directly before consumers were
implemented. Root owns integration, public docs, tracker state and final suite.
No further subagents, external services or paid calls were used.

`graph-reviewed: used`. Borrowed the primary checkout's local graph read-only
for orientation and verified relevant current source in this worktree. Graph
refresh belongs to root's accepted integration boundary; the worker cannot
write outside its explicit migration/test/artifact zone.

All binding-scoped v2 RPCs share named parameters `p_binding_id TEXT`,
`p_organization_id UUID`, `p_environment TEXT`,
`p_destination_binding_id TEXT`:

| RPC | Extra parameters | Result |
| --- | --- | --- |
| set_helixa_knowledge_sync_v2_enabled | p_enabled BOOLEAN | TRUE on success, including disable; exact tuple required |
| claim_helixa_knowledge_sync_v2_outbox | p_batch_size INTEGER default 10 | v2 rows only; fields below |
| get_helixa_knowledge_sync_manifest | none | One JSONB array of `{kind,id,revision,contentHash}`; no PostgREST row-cap truncation |
| reconcile_helixa_knowledge_sync_v2 | p_apply BOOLEAN default false | `{missing,inserted,applied}`; dry run does not mutate |
| enqueue_helixa_knowledge_sync_v2_resend | p_objects JSONB array of `{kind,id}` | INTEGER queued count; no 1000-object response limit; never advances a revision |

Claim fields: `id,event_id,object_kind,object_id,organization_id,completed_at,
raw_body_base64,attempts,claim_generation,lease_token,binding_id,event_type,
revision,retraction_reason,content_hash,created_at,snapshot`.
`event_id=mc2:<KIND>:<org>:<id>:<COMPLETED|UPDATED|RETRACTED>:<revision>`.
Legacy claims keep their original shape and select only protocol 1. Transport
selects only protocol 2 in v2 mode; legacy backlog resumes when the flag is off.
No legacy bytes or identities are converted. Existing
`freeze_helixa_knowledge_sync_payload` and
`transition_helixa_knowledge_sync_outbox` are reused unchanged.

Pinned snapshots include normalized content/title/language/version, source
descriptors and their `_file`/`_nativeProof` provenance, and optional globally
native `_generationOrigin`/`_jobInstructionSource`. Origin is scoped to the
same producer org and native object, independently of later destination binding.
Source processed/proof/storage metadata does not enter semantic comparison;
actual source versions, text and accepted representations do. Legacy versions
do not acquire an invented SHA256 proof. The SQL content hash matches JavaScript
canonical JSON, including representative numeric and Unicode cases.

The separate scoped atomic RPC is
`delete_helixa_course_downstream_v2(p_course_id UUID,p_organization_id UUID,
p_from_stage INTEGER,p_course_patch JSONB default '{}',
p_expected_course_state JSONB default NULL)`. Stages 4/5 only. It locks the scoped
course, validates patch/prior state before deletion, then performs native
cascades and the final prepared field patch in one transaction. Stage 4 accepts
`analysis_result`; stage 5 accepts `course_structure,generation_metadata`.
Expected state contains exactly `updated_at,analysis_result,course_structure,
generation_metadata`; timestamp comparison casts to timestamptz. Stale state
raises SQLSTATE `40001`. Return is `{deletedLessonsCount,deletedSectionsCount,
deletedStructure}` plus `fieldApplied:true` when patch supplied. Native generation
status/completion are preserved. Consumer owns deep field/schema validation.

All new privileged functions use `SECURITY DEFINER SET search_path=public`,
qualified `extensions.digest`, explicit public/anon/authenticated revocation and
service-role grants. Pure canonical helpers also have restricted execution.

# Verification

Before the migration existed, the same test file ran against the unchanged
original outbox migration and current native visibility policies in a disposable
`postgres:17.10-bookworm` container. Valid red: **21 failed, 1 v1 passed**
(18.19 seconds). Infrastructure-only setup failures were corrected before
counting red evidence.

New supplemental controls ran with `MC2_HELIXA_V2_BASELINE=1`, which loads the same
original migration in this tree and excludes the new migration without touching
other files: **6 failed** (atomic patch, invalid/stale guard, concurrency,
guide recreate, >1000 resend, source processing metadata), then **3 failed**
(warm enable, both org-transfer gate cases), then **1 failed** (historical source
version). Each control failed on missing v2 behavior as expected.

Original focused green after the first implementation and formatting: **32/32 passed**,
exit 0, 34.48 seconds. Command:

```bash
MC2_HELIXA_REAL_PG17=1 \
SUPABASE_URL=http://127.0.0.1:1 \
SUPABASE_SERVICE_KEY=local-disposable-fixture \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/integrations/helixa/knowledge-sync-v2-pg17.test.ts
```

The dummy environment values satisfy the existing unit setup only. All DB
commands use `docker exec psql`; no customer database or WSL published port is
used. Container initialization is checked before readiness to avoid connecting
to PostgreSQL's temporary bootstrap server. Every container was removed.

Local logs: `/tmp/mc2-1iwt9-database-red.log`,
`/tmp/mc2-1iwt9-database-additional-red.log`,
`/tmp/mc2-1iwt9-database-warm-move-red.log`,
`/tmp/mc2-1iwt9-database-legacy-source-red.log`,
`/tmp/mc2-1iwt9-database-green.log`.
These logs are working evidence; root owns integrated acceptance and its receipt.
No broad suite, build or production proof is claimed here.

Review corrections were developed on the assigned branch after initial commit
`219d7075d7b1a37747fa49aa8d35e0b48b752093`. Latest-version controls first ran against
that unchanged v2 snapshot: **3 failed** (6.44 seconds). Normalization and disabled
binding controls then ran before those corrections: **4 failed** (6.46 seconds).
Protocol-switch controls ran before the barrier and claim-lock correction:
**7 failed, 1 delivered/scoped positive passed** (12.26 seconds); an additional
zero-counter frozen-body control failed separately (4.76 seconds). An invalid
synthetic processing fixture was corrected before counting protocol red evidence.
Both race orders use separate real PostgreSQL connections and a transaction
checkpoint before the second call. No customer or provider service is involved.

Review logs: `/tmp/mc2-1iwt9-database-latest-lesson-red.log`,
`/tmp/mc2-1iwt9-database-lesson-normalization-red.log`,
`/tmp/mc2-1iwt9-database-switch-barrier-red.log`,
`/tmp/mc2-1iwt9-database-switch-frozen-red.log`,
`/tmp/mc2-1iwt9-database-review-green.log`.
Final review green after SQL changes and test formatting: **46/46 passed**,
exit 0, 75.39 seconds, using the same focused command above. It covers both lock
race orders, byte-preserving dormant v1 pause/resume, reset history, frozen-body
history, current lesson selection, body/envelope distinction, exact markdown
and disabled binding behavior. All disposable containers were removed.
The model field uses root's recorded launch setting, correcting the earlier
inference from the task's generic "Sol max" routing description.

# Delivery / Cleanup

Local commit on the assigned branch is returned separately to root. No push,
merge, deployment, activation or branch cleanup was performed. Other workers'
files and the Helixa repository were not modified. Missing dependencies were
installed with `pnpm install --frozen-lockfile --offline --ignore-scripts` only.

# Risks / Follow-ups

Root must integrate the agreed RPC consumers and perform its one acceptance set.
The fixture executes the real original outbox/new migration and native read
policies, with minimal disposable native tables and an active-enrollment fixture
helper; it is not a full production schema replay. Production migration/apply
and enablement require the owner's separate authority and Helixa readiness.
The actual enrollment helper is called rather than replaced; its existing body
is absent from versioned migrations, as the lifecycle audit recorded.
No implementation debt is deferred from this worker's assigned scope.
