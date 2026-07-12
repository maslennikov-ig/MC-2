# Document Evidence: 100% Dev Activation Design

Date: 2026-07-12  
Status: implementation complete; independent acceptance pending
Scope: local/development configuration only  
Beads: `mc2-jz6y0.24.2`, `mc2-jz6y0.24`

## Decision

Document evidence is enabled for 100% of eligible local/development courses. The project is still in development, so there is no staged dev cohort and no promotion step inside dev. This decision does not authorize staging, production, deployment, live reindex, service changes, secret changes, or any other Q12 mutation.

The exact dev worker environment is:

```dotenv
DOCUMENT_EVIDENCE_ENABLED=true
DOCUMENT_EVIDENCE_MODE=active
DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100
```

Stage 4/5 receives the values on `worker-dev`; Stage 6 receives the same global active gate on `worker-stage6-dev`. The package development environment example exposes the same values for non-Compose local workers.

## Alternatives Considered

1. **Explicit dev configuration — selected.** Add the three values to the two dev worker services and the package development environment example. The activation is visible, testable and isolated from production.
2. **Implicit code default based on `NODE_ENV` — rejected.** The dev Compose workers intentionally run with `NODE_ENV=production`, and an implicit default could activate evidence in an unintended environment.
3. **Documentation-only manual setup — rejected.** It is easy to omit one worker or run Stage 5 and Stage 6 with incoherent settings, so it does not satisfy “enabled for everyone in development.”

## Runtime Boundaries

- The runtime parser remains fail-closed: absent, malformed or non-active values still disable Stage 5 enrichment.
- `docker-compose.production.yml`, staging/deploy assets and production environment examples do not receive active values.
- The setting applies only to courses that reach the evidence-capable path. Courses without documents remain first-class and follow the unchanged baseline behavior.
- Stage 5 remains baseline-first and advisory. Evidence cannot silently replace baseline curriculum structure.
- Stage 6 consumes the current accepted decisions and evidence refs under the existing tenant/course/document/version filters.
- Every uploaded document still requires exactly one durable `assessed`, `degraded` or `failed` outcome.

## Safety and Observation

Because development has no cohort-promotion step, cost, latency, false-conflict rate, degraded/failure rate and enrichment quality are observed as advisory signals rather than numeric promotion gates.

The hard stop thresholds are exact:

- document coverage: 100%;
- baseline preservation: 100%;
- tenant/course isolation violations: 0;
- unresolved P0/P1 findings: 0.

Observation is per run plus the existing aggregate metrics and alerts. The owner and rollback contact is the Beads owner `maslennikov-ig`. Any hard-invariant breach requires quiescing the affected queues, setting the Stage 5 cohort to `0`, restarting both dev workers coherently and verifying a no-document plus a document-backed course before resuming.

Stored evidence, conflicts, decisions and audit rows are retained during rollback. A Stage 5 containment rollback may keep Stage 6 evidence-aware under the exact global active gate; a full audit-only rollback additionally changes mode to `shadow` or disables the global flag.

## Implementation

The implementation is intentionally configuration-only:

- add the exact active values to `worker-dev` and `worker-stage6-dev` in `docker-compose.dev.yml`;
- add the exact development defaults and explanatory comments to `packages/course-gen-platform/.env.example`;
- update the document-evidence operator guide and E7 decision/acceptance artifacts from the old 0% pending-decision state to the approved 100% dev state;
- add a static dev-activation contract test that proves both workers receive coherent values and production Compose remains unactivated;
- retain the existing rollout unit tests that prove invalid/missing values fail closed and 100 selects every deterministic course bucket.

No service is started and no local runtime file is mutated merely by merging the configuration.

## Verification

- RED/GREEN dev activation contract covering both dev workers, the package env example and production non-activation;
- existing Stage 5 rollout/handler and Stage 6 evidence-loader tests;
- Compose config rendering with synthetic local env/secrets through the existing Qdrant runtime contract where applicable;
- package type-check, Prettier, artifact validation, `git diff --check` and process verification;
- independent correctness/docs review;
- local Graphify refresh after accepted integration.

## Delivery and Q12 Gate

This design permits checked-in local/dev configuration only. It does not permit running `/deploy`, changing a staging env file, restarting a remote worker, applying a remote migration, reindexing a live collection, changing a secret, or enabling the feature outside local/dev.

After Q10 and Q11 pass, Q12 must still present exact actions, external effects, required secrets, observation, rollback, downtime and data effects and obtain explicit current-task authorization before any remote mutation.
