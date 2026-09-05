# Helixa AIOS bridge: the MegaCampus side

What this repository actually implements for the Helixa integration, and a review of
the database objects the five `2026082*_helixa_*.sql` migrations install on live
tables. Written before any of them had been applied to any database.

Issues: `mc2-gxese`, `mc2-sdjy8.6`. Branch: `codex/helixa-landing`.

## 1. Shape of the thing

Two directions, and they are not symmetric.

**Outbound (knowledge sync) is wired end to end.** A completed course or career
playbook enqueues a row in an outbox table via a database trigger. A timer in the
worker claims rows, builds a package, freezes its bytes, and POSTs them to Helixa
with an HMAC signature.

**Inbound (generation commands) is now an HTTP route.** The command ledger, the
reservation and lease functions, the schema parsing, and the native scheduling RPC
existed first and nothing called them. `src/server/routes/helixa-generation.ts` is the
transport: two POST endpoints mounted in `src/server/index.ts`, authenticated by an HMAC
over the raw body. Section 3 has the contract as implemented. The older course-create
ledger, `executeHelixaCourseCreationCommand` in `course-creation.ts`, still has no
transport and is reachable only from tests.

## 2. Outbound contract as implemented

Package type and version live in `src/integrations/helixa/contract.ts`. The version
constant is `KNOWLEDGE_SYNC_SCHEMA_VERSION`, currently
`2026-06-16.megacampus-knowledge-sync.v1`.

A package carries the completed object, its content, the source documents it was
built from with embedded artifact bytes, evidence segments, candidate claims,
relations, and two hashes. `originCommand` is present only when the object was
itself created by a Helixa generation command.

**Hashing.** `canonicalJson` in `canonical-json.ts` sorts object keys and rejects
non-finite numbers and non-plain objects. `computePayloadHash` hashes the whole
package with `hashes.payloadHash` removed, so the field never hashes itself.
`serializeKnowledgeSyncPackage` in `package-builder.ts` recomputes that hash and
refuses to serialize a package whose stored hash disagrees.

**Signature.** `deliverClaimedKnowledgeSync` in `delivery.ts` computes
`HMAC-SHA256` over the exact frozen bytes and sends four headers:

| Header                        | Value                       |
| ----------------------------- | --------------------------- |
| `Content-Type`                | `application/json`          |
| `X-Helixa-External-System-Id` | `HELIXA_EXTERNAL_SYSTEM_ID` |
| `X-Megacampus-Event-Id`       | the outbox `event_id`       |
| `X-Megacampus-Signature`      | `sha256=<hex>`              |

The bytes signed and the bytes sent are the same object. `createFetchRequest`
copies the frozen `Buffer` into a `Uint8Array` rather than re-serializing, and a
test pins that seam. This was one of the three blockers fixed on
`fix/helixa-blockers`.

**Retry and lease.** `claim_helixa_knowledge_sync_outbox` claims up to 100 rows with
`FOR UPDATE SKIP LOCKED`, stamps a fresh `lease_token`, and bumps `attempts` and
`claim_generation`. A claim is reclaimable after 15 minutes of no progress. The
budget is 8 attempts; beyond it the row moves to `action_required` and waits for an
operator, who can reset it with `reset_helixa_knowledge_sync_intent`. Backoff in
`computeRetryDelayMs` is exponential from 15 seconds, capped at 5 minutes, with
jitter derived from the event id so a retry storm does not synchronize. HTTP 408,
429 and 5xx are retryable; every other status is terminal.

**Freeze-once.** `freeze_helixa_knowledge_sync_payload` writes `raw_body` only when
it is still null and the caller holds the lease. A retry re-sends the original
bytes rather than rebuilding a package that might now hash differently.

## 3. Inbound contract as implemented

Helixa issues two commands, `CREATE_JOB_INSTRUCTION` and
`CREATE_COURSE_FROM_JOB_INSTRUCTION`, parsed by `HelixaGenerationCommandSchema` in
`generation-commands.ts`. A separate, older ledger handles a plain course-create
command in `course-creation.ts` and still has no transport.

### The two endpoints

| URL                                                 | Body                                              | Answers                          |
| --------------------------------------------------- | ------------------------------------------------- | -------------------------------- |
| `POST /api/integrations/helixa/generation/dispatch` | `{ "binding": { "bindingId": … }, "command": … }` | a `…generation-result.v1` object |
| `POST /api/integrations/helixa/generation/lookup`   | `{ "binding": { "bindingId": … }, "query": … }`   | a `…generation-result.v1` object |

Every request carries three headers, and the body is read as raw bytes because the
signature is computed over exactly those bytes. The route mounts its own
`express.raw({ type: 'application/json', limit: '2mb' })`; the server has no global JSON
parser, for the reason recorded next to the CORS block in `src/server/index.ts`.

| Header                        | Value                                      |
| ----------------------------- | ------------------------------------------ |
| `Content-Type`                | `application/json`                         |
| `X-Helixa-External-System-Id` | must equal `HELIXA_EXTERNAL_SYSTEM_ID`     |
| `X-Helixa-Signature`          | `sha256=<hex HMAC-SHA256 of the raw body>` |

**The two directions share one secret.** `HELIXA_KNOWLEDGE_SYNC_HMAC_KEY` signs outbound
packages as `X-Megacampus-Signature` and verifies inbound commands as
`X-Helixa-Signature`. The header names differ deliberately, so a captured signature
cannot be replayed into the other direction by name alone. Both comparisons — the
signature and the external system id — use `crypto.timingSafeEqual`.

### Status mapping

Refusals answer `{"error": "<code>"}` and nothing else: no header value, no expected
signature, no binding, no internal id. Success answers the library's result object
unchanged, so the state is in the body and the status is a summary of it.

| Situation                                                       | Status | Body                        |
| --------------------------------------------------------------- | ------ | --------------------------- |
| dispatch, newly reserved                                        | 202    | result, `state: accepted`   |
| dispatch, replay of a command the ledger already has            | 200    | result, `state: accepted`   |
| dispatch, `state: conflict`                                     | 409    | result                      |
| dispatch, `state: action_required`                              | 200    | result                      |
| any lookup                                                      | 200    | result                      |
| method other than POST                                          | 405    | `method_not_allowed`        |
| `Content-Type` is not `application/json`                        | 415    | `unsupported_media_type`    |
| a required header is absent                                     | 400    | `missing_required_header`   |
| body is not JSON                                                | 400    | `malformed_json`            |
| envelope has no binding locator                                 | 400    | `malformed_body`            |
| body over 2 MB                                                  | 413    | `payload_too_large`         |
| signature does not verify                                       | 401    | `invalid_signature`         |
| external system id does not match                               | 403    | `unknown_external_system`   |
| binding missing, disabled, mismatched, or its principal invalid | 403    | `binding_denied`            |
| command fails `HelixaGenerationCommandSchema`                   | 422    | `invalid_command`           |
| query fails `HelixaGenerationLookupQuerySchema`                 | 422    | `invalid_lookup_query`      |
| `HELIXA_MEGACAMPUS_GENERATION_MODE` is `disabled`               | 503    | `generation_disabled`       |
| the shared secret or the system id is unset                     | 503    | `generation_not_configured` |
| anything else                                                   | 500    | `generation_failed`         |

A 500 is not a lost command. Helixa's worker answers a thrown dispatch by calling
`lookup`, and the ledger row written before the failure is what that call returns.

### Modes

`readHelixaGenerationMode` accepts `disabled`, `fake` and `live`; absent and empty both
mean `disabled`, and anything else throws. `fake` runs the whole protocol — signature,
binding resolution, reservation, lease, replay, conflict — against an in-memory ledger
and a native port that schedules nothing, so the transport can be exercised end to end
without touching MegaCampus generation. `live` uses the PostgreSQL ledger and the
PostgreSQL native port.

Both commands are wired in `live`. `CREATE_COURSE_FROM_JOB_INSTRUCTION` reaches
`schedule_helixa_course_from_role_guide`; `CREATE_JOB_INSTRUCTION` reaches
`schedule_helixa_role_guide`, added 2026-09-05 in
`20260905130000_helixa_schedule_role_guide.sql`.

### Scheduling a career playbook from a command

```
schedule_helixa_role_guide(
  p_binding_id TEXT, p_command_id TEXT, p_playbook_id UUID, p_organization_id UUID,
  p_user_id UUID, p_job_instruction JSONB, p_selected_sources JSONB, p_qa_data JSONB,
  p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN
```

It takes the command row under its lease fence, proves the binding is enabled for
`job_instruction_creation` and its service principal is legitimate, and refuses unless the
`jobInstruction` and `selectedSources` being relayed are byte-equal to the payload the
ledger stored. Then it writes one `career_playbooks` row: status `generating`, the language
and the role title from the command, and the Q&A record as `q_a_data`. It returns true when
the caller must enqueue and false when a playbook with that id already exists in some other
state, which is how a reclaimed lease avoids racing an earlier claim. `object_id` is
assigned once at reservation and never changes, so the function is idempotent on the command.

The course scheduler takes its queue name the same way, as of
`20260905140000_helixa_course_schedule_target_queue.sql`. It used to write
`target_queue = 'course-generation'` as a literal, and the outbox processor claims only rows
whose `target_queue` equals its own `QUEUE_NAME` — which on dev is `course-generation-dev`.
Every row it wrote there was addressed to a queue nothing reads. The name now comes from
the caller, which reads the same `QUEUE_NAME` the FSM initialization handler passes to
`initialize_fsm_with_outbox`, and an empty value is refused rather than defaulted. The
migration drops and recreates the function rather than adding an overload, because two
functions sharing a name make every PostgREST `rpc()` call to it unresolvable.

**It does not enqueue, and that is forced.** `job_outbox.entity_id` is
`REFERENCES courses(id)`, so a career playbook cannot ride the transactional outbox the way
a course does. `createPostgresHelixaRoleGuideScheduler` enqueues afterwards, with the same
job type, queue and deterministic job id the product uses, and calls
`fail_helixa_role_guide_generation` if that throws. Row first, job second, compensate on
failure is exactly the sequence `approveCareerPlaybookGeneration` already follows, so this
path is no less atomic than the product's own. A failed enqueue surfaces as
`megacampus_generation_native_failed`.

**What a `CREATE_JOB_INSTRUCTION` payload must carry** for the row to be valid: a non-empty
`jobInstruction.roleTitle`, a `jobInstruction.language` of `ru` or `en`, a `businessGoal`
and a `context`, and at least one `selectedSources` entry. The schema enforces all of it;
the RPC re-checks the title, the language and the Q&A object because the database is the
last authority on what it stores.

**Where the command text goes.** The business goal and the context become one free-form
answer, which is the field the product uses for prose the requester wrote and the field that
reaches the spec-builder prompt. They used to be assigned to `business_context.digest`,
which cannot hold them: that field is a structured object of signal arrays, so the worker's
own `CareerPlaybookQADataSchema.parse` would have thrown on every command. Nothing caught it
because nothing had ever called the seam. The business context stays `company_specific` with
no digest, a state whose prompt text tells the model to use the explicit free-form context
and invent nothing.

Helixa's `selectedSources` are recorded as provenance only. They name documents in Helixa,
which MegaCampus does not hold, so they are checked against the stored command payload and
not turned into `file_catalog` rows. The command payload in `helixa_generation_commands` is
where they remain readable.

### One shape that had to move

`dispatchHelixaGenerationCommand` used to answer `state: 'native_completed'` from its
reconciliation branch, reached when a reservation is reclaimed with `claim_generation > 1`
and the native object turns out to be finished. Helixa's dispatch schema accepts only
`accepted`, `conflict` and `action_required`, so that answer would not parse and the
worker would record `megacampus_generation_outcome_uncertain`.

The transport does not rewrite shapes, so the library changed instead: that branch now
answers `accepted`, which is also the truer description. The command has been accepted and
the object exists; what is still outstanding is the signed import, and `accepted` is
exactly the state on which Helixa's worker polls lookup and waits for it.
`native_completed` remains a lookup answer, where Helixa's schema does accept it.

The test suite parses every dispatch and lookup result with a transcribed copy of Helixa's
two schemas, held in `tests/unit/integrations/helixa/fixtures/helixa-result-schemas.ts`,
so a shape that stops fitting fails here rather than in Helixa.

Authorization is not a bearer token. It is a database-resident service principal:
the binding row names `generation_service_principal_user_id`, and
`reserve_helixa_generation_command` refuses unless that user exists in both
`auth.users` and `users`, carries `raw_app_meta_data->>'kind' = 'service_principal'`,
has `interactive_login_allowed` explicitly false, and is an `owner`, `admin` or
`instructor` member of the binding's organization. The HTTP route authenticates the
caller separately, by HMAC; the database only proves the principal it acts as is
legitimate.

Command identity is a hash. `command_id` must match
`^megacampus_generation_command:(create_job_instruction|create_course_from_job_instruction):v1:[a-f0-9]{64}$`,
and re-reserving the same `command_id` with a different `command_hash` returns
`conflict` instead of doing anything. Reservations carry a two-minute lease with a
`claim_generation` fence.

Completion is not reported outbound by the command path at all. The command row
moves to `native_completed`, and Helixa learns the object is done through the
ordinary knowledge-sync package, which carries `originCommand` back so the two can
be correlated. `complete_observed_helixa_generation_command` will not mark a command
complete until the matching outbox row exists, so the ledger cannot claim success
the sync has not proved.

## 4. The six triggers on live tables

Dev, staging and production share one Supabase database. The
`HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED` flag gates only the TypeScript timer. All
six triggers below start behaving the moment the migrations are applied, whatever
the flag says. What keeps them inert is that their lookup tables are empty.

| #   | Trigger                                            | Table              | Fires on                                                                 | No-op when tables empty | Blocks core write if it throws | Defect                       |
| --- | -------------------------------------------------- | ------------------ | ------------------------------------------------------------------------ | ----------------------- | ------------------------------ | ---------------------------- |
| 1   | `enqueue_helixa_course_knowledge_sync_trigger`     | `courses`          | AFTER INSERT or UPDATE OF `generation_status`, `generation_completed_at` | yes                     | yes                            | missing index                |
| 2   | `z_mark_helixa_course_generation_completed`        | `courses`          | same                                                                     | yes                     | yes                            | missing index                |
| 3   | `enqueue_helixa_role_guide_knowledge_sync_trigger` | `career_playbooks` | AFTER INSERT or UPDATE OF `status`, `completed_at`                       | yes                     | yes                            | missing index                |
| 4   | `a_capture_helixa_role_guide_generation_proof`     | `career_playbooks` | same                                                                     | yes                     | yes                            | **unresolvable `digest`**    |
| 5   | `z_mark_helixa_role_guide_generation_completed`    | `career_playbooks` | same                                                                     | yes                     | yes                            | missing index                |
| 6   | `file_catalog_helixa_native_source_immutable`      | `file_catalog`     | BEFORE UPDATE or DELETE                                                  | **no**                  | yes                            | **missing SECURITY DEFINER** |

Every one of them is a row-level trigger in the same transaction as the write that
fires it, so any exception aborts the core write. There is no exception-swallowing
anywhere in these functions. That is the right design for an outbox, and it is also
why each of them has to be provably incapable of raising on an ordinary write.

Ordering on `career_playbooks` is deliberate and correct. PostgreSQL fires
same-event triggers in name order, so `a_capture…` writes the provenance proof,
then `enqueue…` builds the sync intent, then `z_mark…` closes the command. The `a_`
and `z_` prefixes exist only to buy that order.

### Trigger 1 and 3, the enqueue pair

Each selects every enabled binding for the row's organization and inserts one outbox
row per binding, with `ON CONFLICT (binding_id, event_id) DO NOTHING`. The event id
is built from the object kind, organization, object id and the completion timestamp
rounded to milliseconds, so a repeated completion of the same object at the same
instant is idempotent. With `helixa_knowledge_sync_bindings` empty the select
returns nothing and the insert does nothing.

### Trigger 2 and 5, the completion markers

`mark_helixa_generation_native_completed` updates any `helixa_generation_commands`
row in `scheduled` or `executing` for this organization and object to
`native_completed`. Empty table, zero rows updated.

### Trigger 4, the provenance capture

This is the one that would break. It looks for a matching generation command and,
if it finds one, hashes the playbook's canonical content with `digest(...)`.
`pgcrypto` is installed in the `extensions` schema on this project, not `public` —
verified directly against the database — and the function pinned
`SET search_path = public`, which overrides the role search path. The call would
have raised `function digest(bytea, unknown) does not exist` and aborted the career
playbook completion write. It is reached only when a command row exists, so an
empty ledger is the only reason it is not a live incident.

Two other functions had the same call and the same search path:
`schedule_helixa_course_from_role_guide` and
`validate_course_job_instruction_native_source`.

The repository already knew the answer. `20260711130000_document_conflict_auto_answers.sql`
calls `extensions.digest(...)` explicitly, and `update_file_catalog_processing`
declares `SET search_path = public, extensions`. Nothing caught it because the only
tests that execute this SQL are the `*-pg17.test.ts` files, which skip without a
live database.

### Trigger 6, the file immutability guard

`prevent_helixa_native_source_file_mutation` fires before every `file_catalog`
update and delete and asks whether the row is a Helixa native source. It was not
`SECURITY DEFINER`, so it ran with the privileges of whoever issued the write. It
reads `course_job_instruction_native_sources`, which is revoked from `anon` and
`authenticated` and has row-level security enabled with no policy at all.

PostgreSQL checks a table's privileges when the query runs, not when it returns
rows. So an `authenticated` write would have failed with `permission denied for
table course_job_instruction_native_sources` regardless of whether any Helixa data
existed — the only trigger of the six that is not gated on empty tables. And
`file_catalog`'s own `file_catalog_all` policy explicitly permits an admin or
instructor JWT to update and delete. `authenticated` does not have `BYPASSRLS`.

What kept this latent is that every `file_catalog` write in the repository today
goes through `getSupabaseAdmin()`, which is `service_role`, and `service_role` does
have `BYPASSRLS`. That is a property of the current call sites, not of the design.

Note also that the guard is partly redundant: `course_job_instruction_native_sources.file_catalog_id`
carries `ON DELETE RESTRICT`, so the foreign key already refuses the delete. The
trigger adds the update half and a clearer message.

## 5. Defects fixed

All in `20260905120000_helixa_triggers_reach_digest_and_their_own_tables.sql`.

1. **`digest` could not resolve.** Four functions now declare
   `SET search_path = public, extensions` and call `extensions.digest(...)`
   explicitly, matching the 2026-07-11 precedent.
2. **`file_catalog` guard had no definer rights.** `prevent_helixa_native_source_file_mutation`
   and `validate_course_job_instruction_native_source` are now `SECURITY DEFINER`,
   as is `validate_course_job_instruction_source` for the same reason.
3. **Three per-write lookups had no index.** Added on
   `helixa_knowledge_sync_bindings(organization_id) WHERE enabled`,
   `helixa_generation_commands(organization_id, object_kind, object_id)`, and
   `helixa_knowledge_sync_outbox(organization_id, object_kind, object_id, completed_at)`.
   None of the existing unique constraints could serve these: each leads with
   `binding_id`, and none of these three call sites has one.
4. **`observe_helixa_native_generation` ignored the organization it was given.** It
   matched an outbox row on object and timestamp alone, so with more than one
   binding it could return another binding's event id, which
   `complete_observed_helixa_generation_command` then rejects as an unavailable
   proof. Now filtered by organization. The signature is deliberately unchanged;
   adding a parameter would leave two same-named functions and make the PostgREST
   `rpc()` call unresolvable.

## 6. Rollback

The five migrations are wrapped in `BEGIN`/`COMMIT` and are **not** re-runnable:
they use plain `CREATE TABLE` and `CREATE TRIGGER`, so a second apply fails. That
is safe rather than dangerous — each is atomic, so a failed apply leaves nothing
behind — but do not expect to replay one.

To disable the feature without dropping anything, set every
`helixa_knowledge_sync_bindings` row to `enabled = false`. All six triggers become
no-ops immediately, since each is data-gated on an enabled binding or on a command
row that only an enabled binding can create.

To remove the database objects entirely, in this order:

```sql
BEGIN;

DROP TRIGGER IF EXISTS file_catalog_helixa_native_source_immutable ON file_catalog;
DROP TRIGGER IF EXISTS z_mark_helixa_course_generation_completed ON courses;
DROP TRIGGER IF EXISTS z_mark_helixa_role_guide_generation_completed ON career_playbooks;
DROP TRIGGER IF EXISTS a_capture_helixa_role_guide_generation_proof ON career_playbooks;
DROP TRIGGER IF EXISTS enqueue_helixa_course_knowledge_sync_trigger ON courses;
DROP TRIGGER IF EXISTS enqueue_helixa_role_guide_knowledge_sync_trigger ON career_playbooks;

DROP TABLE IF EXISTS course_job_instruction_native_sources;
DROP TABLE IF EXISTS course_job_instruction_sources;
DROP TABLE IF EXISTS role_guide_generation_proofs;
DROP TABLE IF EXISTS helixa_course_creation_commands;
DROP TABLE IF EXISTS helixa_generation_commands;
DROP TABLE IF EXISTS helixa_knowledge_sync_outbox;
DROP TABLE IF EXISTS helixa_knowledge_sync_bindings;

DROP FUNCTION IF EXISTS prevent_helixa_native_source_file_mutation();
DROP FUNCTION IF EXISTS validate_course_job_instruction_native_source();
DROP FUNCTION IF EXISTS validate_course_job_instruction_source();
DROP FUNCTION IF EXISTS prevent_helixa_generation_proof_mutation();
DROP FUNCTION IF EXISTS capture_helixa_role_guide_generation_proof();
DROP FUNCTION IF EXISTS mark_helixa_generation_native_completed();
DROP FUNCTION IF EXISTS enqueue_helixa_course_knowledge_sync();
DROP FUNCTION IF EXISTS enqueue_helixa_role_guide_knowledge_sync();
DROP FUNCTION IF EXISTS observe_helixa_native_generation(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS schedule_helixa_course_from_role_guide(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER);
DROP FUNCTION IF EXISTS helixa_role_guide_content_v1(TEXT, JSONB, JSONB);
DROP FUNCTION IF EXISTS helixa_canonical_json_v1(JSONB);
-- plus the remaining claim/freeze/transition/reserve/renew/complete/lookup
-- `*_helixa_*` functions, all of which are free-standing.

ALTER TABLE helixa_knowledge_sync_bindings
  DROP COLUMN IF EXISTS generation_service_principal_user_id,
  DROP COLUMN IF EXISTS job_instruction_creation_enabled,
  DROP COLUMN IF EXISTS course_from_job_instruction_creation_enabled,
  DROP COLUMN IF EXISTS course_creation_enabled,
  DROP COLUMN IF EXISTS source_helixa_organization_id,
  DROP COLUMN IF EXISTS source_helixa_project_id;
-- (only if the table itself is being kept)

COMMIT;
```

Dropping the triggers is the whole of the rollback that matters for the live tables:
courses, career playbooks and file catalog rows are never modified by any of this,
only read.

`DROP TRIGGER` requires ownership of the table, not a privilege. Run the rollback as
the table owner.

## 7. Environment variables

Outbound delivery, all required together. `readKnowledgeSyncRuntimeConfig` in
`runtime-repository.ts` throws if any one is missing, and
`startKnowledgeSyncDeliveryScheduler` validates before creating a timer, so a
half-configured worker fails at startup rather than mid-batch.

| Variable                                  | Meaning                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED` | Must be exactly `true` to start the delivery timer. Anything else, including absent, returns null and starts nothing.                      |
| `HELIXA_KNOWLEDGE_SYNC_ENDPOINT`          | The Helixa URL packages are POSTed to.                                                                                                     |
| `HELIXA_KNOWLEDGE_SYNC_HMAC_KEY`          | Secret for the `X-Megacampus-Signature` HMAC. **Also verifies the inbound `X-Helixa-Signature`.**                                          |
| `HELIXA_EXTERNAL_SYSTEM_ID`               | Sent as `X-Helixa-External-System-Id`; identifies this MegaCampus to Helixa. **Also the value the inbound route requires in that header.** |
| `HELIXA_KNOWLEDGE_SYNC_BINDING_ID`        | Which binding row this worker claims for.                                                                                                  |
| `HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID`   | Organization half of the binding key.                                                                                                      |
| `HELIXA_DESTINATION_BINDING_ID`           | Destination half of the binding key.                                                                                                       |
| `HELIXA_DESTINATION_PROJECT_ID`           | Optional. Becomes `scope.externalProjectId`; null when absent.                                                                             |
| `APP_ENV` or `NODE_ENV`                   | Environment half of the binding key and the package producer field. Falls back to `development`.                                           |

Inbound, both default to disabled:

| Variable                                 | Meaning                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `HELIXA_MEGACAMPUS_GENERATION_MODE`      | `disabled`, `fake` or `live`. Anything else throws. Gates both generation commands and the HTTP route. |
| `HELIXA_MEGACAMPUS_COURSE_CREATION_MODE` | `disabled` or `fake`, gates the older course-create ledger. It still has no transport.                 |

The inbound route needs `HELIXA_KNOWLEDGE_SYNC_HMAC_KEY` and `HELIXA_EXTERNAL_SYSTEM_ID`
even where outbound delivery is off, and refuses with 503 `generation_not_configured`
until it has both. The mode is read per request, so flipping it does not need a redeploy.

Test-only, not runtime:

| Variable                      | Meaning                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| `HELIXA_REAL_PG17`            | Opts the `*-pg17.test.ts` suites into running against a live PostgreSQL 17. |
| `HELIXA_GENERATION_REAL_PG17` | Same, for the generation-command suites.                                    |

The endpoint and the HMAC key are the two secrets. Neither is stored in the
database; the binding rows deliberately hold identity only, which the table comment
says outright.

## 8. Open risks before applying anything

- **One database serves dev, staging and production.** Applying it changes all three at
  the same moment, with no separate gate.
- **The triggers ignore the feature flag.** Once applied they are live. Safety comes
  from empty tables, so the first `helixa_knowledge_sync_bindings` insert is the
  real go-live event, not the migration and not the environment variable.
- **Trigger 4 is one command row away from aborting playbook completions** on any
  database where the fix migration is missing. Apply all six together or none.
- **Every trigger is in-transaction.** An unforeseen exception in any of them fails
  the course or playbook write it rode in on. There is no degraded mode.
- **The inbound half has no test against a real database by default.** The PostgreSQL
  17 suites skip unless `HELIXA_REAL_PG17` is set, which is exactly why the `digest`
  defect survived review. The HTTP route's own tests run entirely in `fake` mode against
  an in-memory ledger, so they prove the transport and prove nothing about the SQL. Run
  the PG17 suites against a real instance before setting the mode to `live`.
- **The role-guide enqueue is not in the row's transaction.** `job_outbox` is keyed to
  `courses(id)`, so the playbook row and its BullMQ job are two steps with a compensating
  write between them. The product's own create path has the same shape. A crash between
  them leaves a `generating` playbook with no job; the command's lease expires and the
  next claim reconciles it.
- **`schedule_helixa_role_guide` has never run against a database.** Like the rest of the
  inbound half it is covered by unit tests against fakes and by the PG17 suites, which skip
  unless `HELIXA_REAL_PG17` is set.
- **Production is the same database.** Dev, staging and production containers all read one
  Supabase project (verified 2026-08-16 by comparing `SUPABASE_URL` digests across
  `megacampus-api-dev`, `megacampus-api-blue` and both workers). Applying these migrations
  once applies them everywhere at once; there is no later production step and no rehearsal.
