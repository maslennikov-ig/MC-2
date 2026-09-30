# Stage mc2-1iwt9: Helixa knowledge-sync v2

Status: in_progress. Level: integration. Acceptance owner: root.
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

All implementation streams integrated and source-reviewed. Pending one root-owned
focused unit/real-DB acceptance plus pnpm type-check and pnpm build. No production actions, Helixa
source writes, feature activation or customer-content access authorized.

Red controls on unchanged baseline: real PG17 21 v2 failures plus 1 passing v1
control, followed by 10 supplemental failures; transport all 39 original v2
controls fail on the unchanged base. Review corrections added current-source
red controls for native lesson selection/normalization, callback receivers,
disabled binding, exclusive protocols, activation history and both race orders.
The final bootstrap correction reproduces four more real dual-session failures.
Atomic backend baseline: 6 failed/2 passed; web baseline: 1 failed/2 passed.
Root CI guard red/green confirms both env writers preserve a default-false flag.
Worker final inner-loop evidence: 50 PG17, 78 transport/v1/scheduler,
11 atomic backend and 3 web tests pass. These are not the root acceptance result.

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
Graph refresh remains pending integrated acceptance; borrowed orientation was stale.
