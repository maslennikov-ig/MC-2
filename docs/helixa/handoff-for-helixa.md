# MegaCampus → Helixa: handoff for the Helixa side of the bridge

> **Для владельца (по-русски).** Это готовый промт для агента-оркестратора в репозитории
> `helixa-2-lab`. Наша сторона моста доделана и доставлена в `develop` и production (см. §1).
> Всё, что ниже §0, написано по-английски, потому что в Helixa код и долговременные документы
> ведутся на английском. Передавать целиком, без правок, когда там закончится текущая работа.
> Единственное, что нельзя сделать без вас: выпустить общий HMAC-секрет и назвать
> `externalSystemId` (§4). Предложенные значения по умолчанию там указаны.

---

## 0. How to use this document

You are the orchestrator in `helixa-2-lab`. Work against `origin/main` (not the detached
checkout at `helixa-2-lab-main`, which is 800+ commits behind). Task truth is Beads, prefix
`helixa-2-lab-`; the work below is already filed as epic **`helixa-2-lab-j149`** (0 of 7
complete) and the operational gap as **`helixa-2-lab-slowt`**. Do not renegotiate the wire
contract: every schema version, header, hash rule and enum was checked on 2026-09-05 against
the MegaCampus source and matches exactly. Communicate with the owner in Russian; keep code and
durable docs in English; tests are `node --test` on `tests/*.test.mjs`.

## 1. What MegaCampus delivered (the other half is done)

Delivered to `develop` and released as `v0.31.44` (commit `eeb056d9c`) on
2026-09-05. The full description with file references is
`docs/helixa/megacampus-side.md` in the MegaCampus repository (`maslennikov-ig/MC-2`).

**Outbound, knowledge sync (MegaCampus → Helixa).** Complete and running in the worker.
A completed course or role guide (Career Playbook) enqueues an outbox row through a
database trigger; a worker timer claims rows, builds a `KnowledgeSyncPackage`
(`2026-06-16.megacampus-knowledge-sync.v1`), freezes the exact bytes and POSTs them with:

| Header                        | Value                                        |
| ----------------------------- | -------------------------------------------- |
| `Content-Type`                | `application/json`                           |
| `X-Helixa-External-System-Id` | the agreed `externalSystemId` (§4)           |
| `X-Megacampus-Event-Id`       | the outbox `event_id`                        |
| `X-Megacampus-Signature`      | `sha256=<hex HMAC-SHA256 over the raw body>` |

Retry on 408/429/5xx with exponential backoff (15 s → 5 min, jitter), 8 attempts, then
`action_required` for an operator. Your receiver at
`apps/console/src/app/api/integrations/megacampus/knowledge-sync/route.ts` already enforces
exactly this. When the object was created by one of your generation commands, the package
carries `originCommand` (`helixa.megacampus-generation-origin.v1`) so you can correlate it.

**Inbound, generation commands (Helixa → MegaCampus).** New on 2026-09-05: the HTTP
transport your `MegaCampusGenerationCommandPort` needs.

```
POST https://ai.megacampus.ru/api/integrations/helixa/generation/dispatch
     body: {"binding": {"bindingId": "<binding id>"}, "command": <MegaCampusGenerationCommandV1>}

POST https://ai.megacampus.ru/api/integrations/helixa/generation/lookup
     body: {"binding": {"bindingId": "<binding id>"}, "query": <MegaCampusGenerationLookupQueryV1>}

Content-Type: application/json
X-Helixa-External-System-Id: <externalSystemId>
X-Helixa-Signature: sha256=<hex HMAC-SHA256 over the raw body, same shared secret as outbound>
```

Dev environment: the same paths on `https://dev.ai.megacampus.ru`. The response body is the
`helixa.megacampus-generation-result.v1` result and parses under your
`MegaCampusGenerationDispatchResultV1Schema` / `MegaCampusGenerationLookupResultV1Schema`
unchanged (a MegaCampus unit test embeds a copy of both schemas and proves it).

| Situation                                                              | HTTP      | Body                                                                                             |
| ---------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| dispatch, new reservation                                              | 202       | result, `state: accepted`                                                                        |
| dispatch, exact replay (same `commandId`, same `payloadHash`)          | 200       | result, `state: accepted`                                                                        |
| dispatch, same `commandId`, different payload                          | 409       | result, `state: conflict`                                                                        |
| dispatch, terminal refusal                                             | 200       | result, `state: action_required` with a safe `error.code`                                        |
| lookup (any)                                                           | 200       | result: `scheduled`, `executing`, `native_completed`, `not_found`, `conflict`, `action_required` |
| not POST / not `application/json`                                      | 405 / 415 | `{"error":"method_not_allowed"}` / `unsupported_media_type`                                      |
| missing header / body not JSON / no `binding` envelope                 | 400       | `missing_required_header` / `malformed_json` / `malformed_body`                                  |
| body over 2 MB                                                         | 413       | `payload_too_large`                                                                              |
| signature mismatch                                                     | 401       | `invalid_signature`                                                                              |
| unknown external system id                                             | 403       | `unknown_external_system`                                                                        |
| binding missing, disabled, mismatched or its service principal invalid | 403       | `binding_denied`                                                                                 |
| command / query fails schema                                           | 422       | `invalid_command` / `invalid_lookup_query`                                                       |
| MegaCampus generation mode is `disabled`                               | 503       | `generation_disabled`                                                                            |
| MegaCampus not configured (no secret / system id)                      | 503       | `generation_not_configured`                                                                      |

Note for your worker: a dispatch whose native object already completed answers `accepted`,
not `native_completed`; your worker then polls lookup, sees `native_completed`, and waits for
the signed import through the knowledge-sync package. That is the flow your worker already
implements, so nothing on your side changes.

Three operations run end to end on the MegaCampus side: `CREATE_COURSE_FROM_JOB_INSTRUCTION`
schedules a course from an existing role guide; `CREATE_JOB_INSTRUCTION` creates and
generates a role guide (Career Playbook) from the command's `jobInstruction` fields
(`roleTitle`, `businessGoal`, `context`, `language: ru|en`) and `selectedSources`; and
`CREATE_COURSE` creates a course from the same `course` fields plus canonical
`selectedSources`, with no `sourceJobInstruction`.
Completion is never pushed by the command path itself: the command row moves to
`native_completed`, and the ordinary knowledge-sync package carries the result back with
`originCommand`.

**Idempotency and identity.** `commandId` must match
`^megacampus_generation_command:(create_job_instruction|create_course_from_job_instruction|create_course):v1:[a-f0-9]{64}$`.
Re-dispatching the same `commandId` with a different `payloadHash` is a `conflict`; an exact
replay is a no-op. Reservations carry a two-minute lease with a `claim_generation` fence.

## 2. What is missing on the Helixa side (already filed as `j149`)

Read `helixa-2-lab-j149` and its seven children first; they describe the gap in your own
vocabulary and are accurate. In dependency order:

1. **`j149.1` — record the transport decision.** The decision is above: HTTP with HMAC,
   mirroring the ingress direction, same shared secret, headers `X-Helixa-External-System-Id`
   and `X-Helixa-Signature`. Write the spec/ADR; nothing in the payloads changes.
2. **Provisioning (not filed; file it under `xp1g` or `j149`, ahead of `j149.3`).** Every
   `integration_megacampus_*` table is empty in production (`slowt`). Binding rows are written
   only by two test shell scripts. You need a real path (operator CLI or admin action) that
   creates, for the MegaCampus organization: an active `integration_connector_installations`
   row with `acquisition_enabled`, an `integration_connector_all_resources_approvals` row with
   `transport='local_import'`, an active `integration_connector_releases` row, a
   `state='selected'` resource, an active organization-scoped
   `integration_connector_credential_bindings` row, and the
   `integration_megacampus_knowledge_binding_history` + `_current` pair with `import_allowed`,
   with mutually consistent revision numbers (`CURRENT_BINDING_SQL` joins on all of them).
   Store the shared HMAC secret in OpenBao under the connector credential for
   `(organizationId, connectorId: "megacampus")`. Publish the receiver URL (§4).
3. **`j149.2` — wire binding and source authorities** to the existing megacampus SQL so
   `bindingAuthority.readCurrent` and `sourceAuthority.readCurrent` stop throwing.
4. **`j149.3` — the command port.** Implement `MegaCampusGenerationCommandPort.dispatch/lookup`
   as an HTTP client to the two URLs above: sign the raw body, send the three headers, treat
   202/200 as a result to parse, 409 as a result with `state: conflict`, 401/403/422/503 as
   terminal safe errors, network/5xx/timeouts as retryable. Acceptance from the issue: an
   approved proposal creates exactly one native object, an exact replay none, a changed
   payload conflicts.
5. **`j149.4` — a host for the worker loop** (owner decision 2026-08-23: the Operational
   Work scheduler lives in the Console image, shared with Competitive Intelligence,
   `helixa-2-lab-11di`).
6. **`j149.5` — the signed result import and the `completed` state.** Your
   `importedResultAuthority.readCurrent` and `resolveResultAssetId` return `null` by design;
   `completed` is unreachable until the knowledge-sync package with `originCommand` is
   correlated back to the operation.
7. **`j149.7` — a `live` value** for `resolveMegaCampusGenerationMode` and controlled
   activation. Activation stays an owner decision.

UI is already built (`/[locale]/courses`, both forms, Submit/Approve, backoff polling) and is
only starved of data. Two small items: the Console has no "Career Playbook" wording, the
object arrives as `kind: "ROLE_GUIDE"`; and opening a fresh result needs `j149.5` first.

## 3. Cross-repo verification you must re-point

Both cross-repo proofs (`scripts/testing/run-megacampus-course-platform-proof.sh`,
`run-megacampus-sync-postgres-proof.sh`) bundle MegaCampus source and default to worktrees
frozen on 2026-08-23. Point `MC2_GENERATION_PROOF_ROOT` and `MC2_KNOWLEDGE_FIXTURE_ROOT` at a
checkout of MegaCampus `develop` at `eeb056d9c` or later before trusting a green run.
The MegaCampus PostgreSQL 17 suites (`HELIXA_REAL_PG17=1`, `HELIXA_GENERATION_REAL_PG17=1`)
exercise the same SQL the production database now runs.

## 4. Joint decisions, with defaults (the only owner input needed)

| Decision                       | Default proposed by MegaCampus                                                                                                                                | Where it lands                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `externalSystemId`             | `megacampus-production` (dev: `megacampus-dev`)                                                                                                               | mc2 env `HELIXA_EXTERNAL_SYSTEM_ID`; Helixa binding row `external_system_id` |
| Shared HMAC secret             | MegaCampus mints 32 random bytes (hex) per environment and hands it over out of band; Helixa stores it in OpenBao under the `megacampus` connector credential | mc2 env `HELIXA_KNOWLEDGE_SYNC_HMAC_KEY`; Helixa OpenBao                     |
| Helixa receiver URL            | `https://<console-host>/api/integrations/megacampus/knowledge-sync`                                                                                           | mc2 env `HELIXA_KNOWLEDGE_SYNC_ENDPOINT`                                     |
| MegaCampus command URLs        | `https://ai.megacampus.ru/api/integrations/helixa/generation/{dispatch,lookup}`                                                                               | Helixa command port configuration                                            |
| Binding id and destination ids | one binding per (organization, environment); values agreed together                                                                                           | mc2 `helixa_knowledge_sync_bindings`; Helixa binding pair                    |
| Service principal              | MegaCampus creates a non-interactive `service_principal` user, owner/admin/instructor member of the organization; its id goes into the binding row            | mc2 only                                                                     |

Until the secret and the ids are exchanged, MegaCampus runs with
`HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED` unset and `HELIXA_MEGACAMPUS_GENERATION_MODE=disabled`:
the database objects are live but data-gated, and both directions answer as not configured.

## 5. Stop conditions

Stop and ask the owner only for the two values in §4 that need minting or naming. Everything
else is decided. If the MegaCampus route answers something this document does not list, file
it in `helixa-2-lab` with the exact request, headers minus the signature, and the response;
MegaCampus owns that defect.
