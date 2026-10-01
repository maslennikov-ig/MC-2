# Code review: Helixa knowledge-sync contract v2

Date: 2026-09-30. Task: `mc2-1iwt9`.
Scope: isolated `codex/helixa-contract-v2` against origin/develop
`c7a000ec6cf387153f94b26d00b5db7c51237d03`, including its root-owned configuration
and documentation diff. Wire authority: Helixa origin/main `3e0a62686`, section C.
Owner's explicit last-reader clarification is recorded in
`docs/helixa/contract-v2-implementation.md`.

Verdict: accepted locally; final integrated checks passed. Root reviewed risky code and history directly;
independent read-only review supported the lifecycle, access and transport checks.

## Corrected findings

| Severity | Original failure                                                                              | Corrected source                                                                                                           | Proof                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Delayed revisionless v1 could overwrite an accepted v2 projection                             | `src/integrations/helixa/runtime-repository.ts:136`, `supabase/migrations/20260930120000_helixa_knowledge_sync_v2.sql:311` | Exclusive protocol claims; persisted-history activation barrier; disposable PG tests exercise both claim/activation lock orders and attempt-reset history |
| P1       | Current snapshots included obsolete versions of a lesson                                      | `supabase/migrations/20260930120000_helixa_knowledge_sync_v2.sql:194`                                                      | Latest usable native version, obsolete edit neutrality and empty/failed fallback controls                                                                 |
| P1       | Native content-envelope telemetry caused semantic updates while rendered markdown was dropped | `src/integrations/helixa/package-builder.ts:447` and matching SQL normalizer                                               | Native envelope/body and rendered-markdown red controls; v1 bytes remain unchanged                                                                        |
| P2       | Mirroring false to an existing disabled binding aborted general-worker startup                | `supabase/migrations/20260930120000_helixa_knowledge_sync_v2.sql:311`                                                      | Exact disabled tuple can be turned off; enabling or wrong tuple still fails closed                                                                        |
| P2       | Maintenance callback receiver was lost                                                        | `src/integrations/helixa/scheduler.ts`, `src/integrations/helixa/service.ts`                                               | Two focused receiver regressions reproduced and fixed                                                                                                     |

Source paths in the table are relative to `packages/course-gen-platform/`.
The table's findings are fixed in this task, not deferred to unrelated tickets.

## Corrected bootstrap race

P1, `supabase/migrations/20260930120000_helixa_knowledge_sync_v2.sql:419`:
object/organization dirty entrypoints read the gate without the setter's binding
lock. Native title edits, hard deletion or last-reader withdrawal can commit while
activation holds an uncommitted true gate after warming an old snapshot. The dirty
trigger sees committed false and loses the event. Both entrypoints must lock
enabled bindings without prefiltering on the gate and check the mode after waiting.
The correction locks both entrypoints in deterministic binding order without
prefiltering the gate. Four two-session controls failed on unchanged `d00672b`
and pass after the correction; the complete disposable PG suite passes 50/50.
Root reviewed the actual correction and its lock order. No confirmed finding
remains open; integrated type-check/build and acceptance below passed.

## Contract and access checks

- Retractions have the exact six-field envelope and five-field object; preparation
  does not read a deleted native row. All four contract reasons are covered.
- Durable `(kind,id)` clocks outlive native rows; tenant transfer withdraws the
  former scope before completing in the new scope. Privileged RPCs are service-only.
- Current objects follow actual organization membership and existing read rules.
  Public-link withdrawal retains objects still readable by an organization member.
- Manifest inventory is one consistent database read, independent of PostgREST
  row limits. Empty manifests, pagination, last-page resend and no revision bump
  are covered. Maintenance uses `apply:true` and sends a manifest after each run.
- The cascade editor validates before deletion and uses one transaction for the
  final edit. V1 retains its previous delete-then-save path.
- The new flag defaults off in example configuration and both environment writers.
  No dependencies, live permissions, receiver source or deployment were changed.

## Validation boundary

Worker evidence is focused red/green development evidence. Root's selected
acceptance passed 142 unique behavior controls (including 50 real PostgreSQL
controls), the CI environment guard, combined production/test ESLint and full
repository type-check/build. Matching unchanged passing checks were retained;
affected tests and failed/unexecuted gates were rerun as recorded in
`.codex/stages/mc2-1iwt9/unit-acceptance.md` and the command selections there.
Root reproduced TS4023 for a local cascade response type missing from exports;
exporting the existing interface fixed router declaration naming without runtime
changes. Final source: `2048b6620e82da08b3e599dc2d44687d4b71890e`, with a clean
source digest in `.codex/stages/mc2-1iwt9/acceptance-receipt-application.json`.
Closeout/publication commits through `73840115f` contain only metadata. The later
migration-catalog correction on `98bf0ce2b` extends the exact filename pin for
the one reviewed new migration (264 files) while preserving all approved source,
history and security-chain pins; six reproduced frontier failures now pass with
script ESLint in canonical bounded acceptance. Application modules and dependency
versions are unchanged. Security Audit in PR 341 remains a release blocker:
14 inherited high findings are tracked in `mc2-bot88`. This is local acceptance;
publication, live schema application and deployment were not performed.
Disposable PostgreSQL tests exercise the checked-in outbox/v2 migrations against
synthetic native fixtures; they do not replay the complete production migration
history or establish a production receiver deployment. Production enablement
requires separate owner confirmation and authorized delivery/schema application.
