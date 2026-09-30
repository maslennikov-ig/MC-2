# Stage mc2-1iwt9: Helixa knowledge-sync v2

Status: accepted locally; remote delivery pending approval. Level: integration.
Acceptance owner: root. Tested source: 2048b6620e82da08b3e599dc2d44687d4b71890e.
Base: origin/develop c7a000ec6cf387153f94b26d00b5db7c51237d03.

## Owner decision

The manifest contains all completed objects readable by at least one actual
producer-organization member under the existing application rules. Publication
or visibility changes retract only after the LAST member loses read access;
turning off a public link alone does not retract. This explicit 2026-09-30 owner
clarification resolves the earlier publication/current-set contradiction.
Wire schema and tombstone/manifests remain exactly section C of Helixa origin/main
3e0a62686611eafaf0261e669c21a27bd2c18fb7.

## Ownership and routing

Database persistence/capture: codex/helixa-v2-database, GPT-6.1 Sol max, isolated.
Transport/builders/runtime: codex/helixa-v2-transport, GPT-6.1 Sol max, isolated.
Atomic cascade + field edit: codex/helixa-v2-atomic-edit, GPT-6.1 Sol max, isolated.
Read-only lifecycle and transport maps: GPT-6 Luna max.
Root owns interface decisions, integration,
runtime config forwarding, documentation and final acceptance.

## Acceptance

All implementation streams integrated, source-reviewed and accepted. Root-owned
acceptance passed 142 unique behavior controls, the CI environment guard, combined
production/test ESLint, pnpm type-check and pnpm build. Build and database tests
used explicit synthetic local configuration. No live schema apply, deployment,
feature activation, Helixa source writes or customer-content access occurred.

| Root evidence | Source | Passing result |
| --- | --- | --- |
| Initial focused backend/web | d839652b1 | 89 backend + 3 web; retain unchanged v1/scheduler/editing 44 + web 3 |
| CI environment guard | f4cb79f9f | 1/1; default-false flag in both environment writers |
| Corrected v2 fixtures and combined lint | b6d6f85f5 | 45 unit + 50 disposable PG17; combined ESLint clean |
| Type-only export correction and final gates | 2048b6620 | changed-module ESLint, full repository type-check/build, process verification; exit 0 |

The final receipt is `acceptance-receipt.json`, bound to the clean tested source
above. It covers the final three commands, not earlier cached test executions.
`unit-acceptance.md` records the retained proofs and exact command selections;
only an erased type export changed application source after the 142 passing
controls. Subsequent closeout commits contain evidence/documentation only.
Final private log: `/tmp/mc2-1iwt9-root-acceptance.log`.

| Criterion | Acceptance |
| --- | --- |
| AC-1 | Durable clocks, hard delete/recreate and concurrent allocation controls pass |
| AC-2 | Semantic title/lesson/text/document updates and service-field neutrality pass; atomic cascade captures one final edit |
| AC-3 | All four exact tombstone reasons pass; deleted-row preparation never loads native content |
| AC-4 | Exact last-reader current inventory, consistent read, empty page and 1000-item pagination controls pass |
| AC-5 | Current-revision resend, lists larger than one page, hourly maintenance and every-run manifest controls pass; reconciliation applies repairs |
| AC-6 | Default-off v1 parity, off/on/off, immutable protocol-pinned retry and both activation lock orders pass |
| AC-7 | Meaningful reds precede behavior greens; root checks above pass; Russian owner report and rollout guide prepared |

Red controls on unchanged baseline: real PG17 21 v2 failures plus 1 passing v1
control, followed by 10 supplemental failures; transport all 39 original v2
controls fail on the unchanged base. Review corrections added current-source
red controls for native lesson selection/normalization, callback receivers,
disabled binding, exclusive protocols, activation history and both race orders.
The final bootstrap correction reproduces four more real dual-session failures.
Atomic backend baseline: 6 failed/2 passed; web baseline: 1 failed/2 passed.
Root CI guard red/green confirms both env writers preserve a default-false flag.
Worker inner-loop evidence: 50 PG17, 78 transport/v1/scheduler,
11 atomic backend and 3 web tests pass. Root results are recorded separately above.
Root type-check additionally reproduced TS4023 for the unexported cascade response;
exporting the existing interface fixed router declaration naming without runtime changes.

## Risk and recovery

See docs/helixa/contract-v2-implementation.md. V2 defaults off. Turning it off
must restore v1 delivery/capture without deleting revisions or frozen intents.
Activation waits for every previously claimed/frozen v1 intent to be delivered;
native capture shares the binding lock to preserve concurrent edits and withdrawals.

## Explicit defers

None inside implementation scope. Deployment, live schema apply and v2 activation
are separate authority boundaries, with activation after owner receiver confirmation.

docs-reviewed: updated - wire/access authority, default-off env forwarding,
local PG test entrypoint and receiver-first rollout in docs/helixa and project index.
graph-reviewed: updated - root-owned local graph refreshed with
`graphify update . --no-cluster` and `graphify cluster-only . --no-viz --no-label`,
both exit 0. Final graph: 62,214 nodes, 96,897 edges, 4,248 communities. External
semantic/model extraction and hooks stayed off. Five existing AST parser limitations
are outside the v2 changed files; they do not invalidate compilation or acceptance.

## Delivery boundary

Local branch: codex/helixa-contract-v2. Publishing/PR needs approval under
orchestrator.toml delivery.push_after_closeout=ask; no push or merge occurred.
Four task branches are explicitly parked in the stranded-commit allowlist and
their worktrees remain preserved. The read-only stranded audit against
origin/develop exited 1 for one unrelated commit on codex/price-sync-35431236055;
no cleanup or changes to that owner's branch were made. This is not a delivery claim.

Production activation follows section 11 of docs/helixa/megacampus-side.md:
receiver confirmation, authorized code/schema delivery with flag false, successful
completion of previously claimed/frozen v1, no old in-flight API/worker operations,
consistent flags for all writers sharing this organization's database, then
first complete manifest and resend/edit/retraction proof. Owner confirmation
that Helixa v2 is live on helixa.ru has not been received; the flag stays false.
