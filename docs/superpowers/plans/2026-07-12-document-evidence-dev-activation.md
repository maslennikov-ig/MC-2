# Document Evidence 100% Dev Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable document evidence coherently for every eligible local/dev course while preserving fail-closed staging/production behavior and the separate Q12 authorization gate.

**Architecture:** Keep the existing runtime parsers unchanged and express the owner decision only through checked-in development configuration. A static contract test binds both RAG-capable dev workers and the package env example to the same three values and proves non-dev Compose files remain unactivated; E7 operator/artifact truth is then reconciled to the approved decision.

**Tech Stack:** Docker Compose YAML, dotenv examples, TypeScript/Vitest static contract tests, Markdown orchestration artifacts, Beads.

## Global Constraints

- Local/dev activation is exact: `DOCUMENT_EVIDENCE_ENABLED=true`, `DOCUMENT_EVIDENCE_MODE=active`, `DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100`.
- Runtime code remains fail-closed for absent, malformed or non-active values.
- `docker-compose.production.yml`, `docker-compose.infra.yml`, `docker-compose.app.yml` and production environment examples must not receive active defaults.
- Courses without documents remain behavior-compatible; Stage 5 remains baseline-first and advisory; Stage 6 uses the same accepted decisions and refs.
- Hard stops are coverage 100%, baseline preservation 100%, isolation violations 0 and unresolved P0/P1 findings 0.
- No service start/restart, deployment, remote migration, live reindex, secret change, staging/production mutation or Q12 activation is permitted.
- Preserve unrelated `/home/me/code/mc2/.claude/settings.json` changes in the primary worktree.

---

### Task 1: Dev Activation Contract and Configuration

**Files:**

- Create: `packages/course-gen-platform/tests/unit/ops/document-evidence-dev-activation-contract.test.ts`
- Modify: `docker-compose.dev.yml`
- Modify: `packages/course-gen-platform/.env.example`

**Interfaces:**

- Consumes: existing exact-string rollout parser contract and Compose service names `worker-dev` / `worker-stage6-dev`.
- Produces: coherent explicit dev configuration; no application-code API changes.

- [ ] **Step 1: Write the failing static contract test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const ACTIVE_VALUES = [
  'DOCUMENT_EVIDENCE_ENABLED=true',
  'DOCUMENT_EVIDENCE_MODE=active',
  'DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100',
] as const;

function source(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function serviceBlock(compose: string, service: string): string {
  const lines = compose.split('\n');
  const start = lines.findIndex(line => line === `  ${service}:`);
  const end = lines.findIndex((line, index) => index > start && /^ {2}[a-zA-Z0-9_-]+:$/.test(line));
  return start < 0 ? '' : lines.slice(start, end < 0 ? undefined : end).join('\n');
}

describe('document evidence dev activation contract', () => {
  it('activates every eligible course coherently on both dev workers', () => {
    const dev = source('docker-compose.dev.yml');
    const packageEnvironment = source('packages/course-gen-platform/.env.example');

    for (const service of ['worker-dev', 'worker-stage6-dev']) {
      const block = serviceBlock(dev, service);
      for (const value of ACTIVE_VALUES) expect(block).toContain(`- ${value}`);
    }
    for (const value of ACTIVE_VALUES) expect(packageEnvironment).toContain(value);
  });

  it('does not activate staging or production configuration', () => {
    const nonDev = [
      'docker-compose.infra.yml',
      'docker-compose.app.yml',
      'docker-compose.production.yml',
      '.env.production.example',
    ]
      .map(source)
      .join('\n');

    for (const value of ACTIVE_VALUES) expect(nonDev).not.toContain(value);
  });
});
```

- [ ] **Step 2: Run the RED test**

Run:

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=test-service-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/document-evidence-dev-activation-contract.test.ts
```

Expected: the dev-activation `it` fails because the active values are absent from both dev workers and the package env example; the separate production non-activation guard already passes.

- [ ] **Step 3: Add the minimal explicit dev configuration**

Add this comment and exact list to the `environment:` block of both `worker-dev` and `worker-stage6-dev`:

```yaml
# Document evidence is owner-approved for every eligible local/dev course.
- DOCUMENT_EVIDENCE_ENABLED=true
- DOCUMENT_EVIDENCE_MODE=active
- DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100
```

Add this section to `packages/course-gen-platform/.env.example` near the Qdrant/application runtime settings:

```dotenv
# Document evidence is active for every eligible local/dev course.
# Staging/production require an explicit environment decision and Q12 authorization.
DOCUMENT_EVIDENCE_ENABLED=true
DOCUMENT_EVIDENCE_MODE=active
DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100
```

- [ ] **Step 4: Run GREEN and regression tests**

Run:

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=test-service-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/document-evidence-dev-activation-contract.test.ts \
  tests/unit/stages/stage5-generation/document-evidence-rollout.test.ts \
  tests/unit/stages/stage5-generation/advisory-enrichment-handler.test.ts \
  tests/unit/stages/stage6/rag/evidence-loader.test.ts \
  tests/unit/ops/qdrant-runtime-contract.test.ts
```

Expected: all selected files and tests pass; existing invalid/missing rollout cases remain fail-closed, 100 selects every course, and the Q6 Compose runtime contract remains green.

- [ ] **Step 5: Run type and formatting checks**

```bash
pnpm --filter @megacampus/course-gen-platform type-check
pnpm exec prettier --check \
  docker-compose.dev.yml \
  packages/course-gen-platform/tests/unit/ops/document-evidence-dev-activation-contract.test.ts
git diff --check
```

Expected: all commands exit `0`. Prettier does not provide a dotenv parser; the package env example is verified by the static contract and `git diff --check` instead.

- [ ] **Step 6: Commit the configuration checkpoint**

```bash
git add docker-compose.dev.yml \
  packages/course-gen-platform/.env.example \
  packages/course-gen-platform/tests/unit/ops/document-evidence-dev-activation-contract.test.ts
git commit -m "feat(evidence): activate document evidence in dev"
```

### Task 2: Reconcile E7 Operator and Orchestration Truth

**Files:**

- Modify: `docs/operations/document-evidence.md`
- Modify: `docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md`
- Modify: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-stage5-rollout.md`
- Modify: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-acceptance.md`
- Modify: `.codex/handoff.md`
- Modify: `.codex/stages/mc2-jz6y0/summary.md`

**Interfaces:**

- Consumes: owner decision recorded in closed Bead `mc2-jz6y0.24.2` and the dev contract from Task 1.
- Produces: current E7 truth with no stale “0% pending decision” claim; Q10 remains the next task and Q12 remains unauthorized.

- [ ] **Step 1: Update the operator decision and rollback text**

Replace the pending-owner/0% rollout instruction with an explicit local/dev exception:

```markdown
For local/development, the owner approved the exact active gate and a 100% Stage 5 cohort on 2026-07-12. Development has no cohort-promotion step: cost, latency, false-conflict, degradation/failure and enrichment-quality signals are advisory. Coverage and baseline preservation must remain 100%, tenant/course isolation violations and unresolved P0/P1 findings must remain zero. Staging/production activation is not implied and remains Q12-gated.
```

Retain the existing quiesce-first rollback sequence and make `100 -> 0` the documented dev containment action.

- [ ] **Step 2: Reconcile the approved design and E7 artifacts**

Add a superseding decision link to `docs/superpowers/specs/2026-07-12-document-evidence-dev-activation-design.md`. Update the Stage 5 rollout artifact so it records the owner-approved 100% dev value rather than saying no value was selected. Remove `.24.2` from the E7 acceptance artifact's `explicit_defers`, add the dev activation verification evidence after Task 1 passes, and keep `status: blocked` only for the independent Task 3 review gate. The worker must not claim orchestrator acceptance before that review.

- [ ] **Step 3: Update handoff and stage summary**

Record `.24.2` closed, E7 accepted after the dev configuration review, Q10 as next, and Q12 as the only remote authorization boundary. Keep handoff current-state only and under 200 lines.

- [ ] **Step 4: Run stale-decision and artifact checks**

```bash
rg -n 'keep it at `0` until|No numeric product rollout thresholds have been accepted|only remaining E7 blocker|fail-closed Stage 5 cohort remains 0%' \
  docs/operations/document-evidence.md \
  docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-stage5-rollout.md \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-acceptance.md \
  .codex/handoff.md \
  .codex/stages/mc2-jz6y0/summary.md
```

Expected: zero stale active claims; historical RED/GREEN chronology may remain only when explicitly historical.

```bash
python3 scripts/orchestration/validate_artifact.py \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-stage5-rollout.md \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-acceptance.md
pnpm exec prettier --check \
  docs/operations/document-evidence.md \
  docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-stage5-rollout.md \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-acceptance.md \
  .codex/handoff.md \
  .codex/stages/mc2-jz6y0/summary.md
scripts/orchestration/run_process_verification.sh
python3 scripts/orchestration/run_stage_closeout.py --stage mc2-jz6y0 --dry-run
git diff --check
```

Expected: all commands exit `0`; canonical dry-run lists future stage commands without executing Q11.

- [ ] **Step 5: Commit the E7 truth checkpoint**

```bash
git add docs/operations/document-evidence.md \
  docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-stage5-rollout.md \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-acceptance.md \
  .codex/handoff.md \
  .codex/stages/mc2-jz6y0/summary.md
git commit -m "docs(evidence): record full dev activation"
```

### Task 3: Independent Review, Integration and E7 Close

**Files:**

- Modify after acceptance: Beads `mc2-jz6y0.24`
- No production/staging/runtime file mutations.

**Interfaces:**

- Consumes: Tasks 1-2 commits and verification evidence.
- Produces: independently accepted E7, unblocked Q10, and a clean pushed integration branch.

- [ ] **Step 1: Request independent correctness/docs review**

The reviewer must inspect the full diff from plan base and verify coherent dev worker values, non-dev non-activation, no-document/baseline/isolation invariants, rollback text, artifact truth and Q12 boundary. P0/P1 findings block acceptance.

- [ ] **Step 2: Run parent acceptance after review**

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=test-service-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/document-evidence-dev-activation-contract.test.ts \
  tests/unit/stages/stage5-generation/document-evidence-rollout.test.ts \
  tests/unit/stages/stage5-generation/advisory-enrichment-handler.test.ts \
  tests/unit/stages/stage6/rag/evidence-loader.test.ts \
  tests/unit/ops/qdrant-runtime-contract.test.ts
pnpm --filter @megacampus/course-gen-platform type-check
scripts/orchestration/run_process_verification.sh
python3 scripts/orchestration/run_stage_closeout.py --stage mc2-jz6y0 --dry-run
```

Expected: all commands exit `0` with exact totals recorded in the E7 artifact/Beads notes.

- [ ] **Step 3: Close E7 and deliver**

After review and parent reruns pass, update the E7 acceptance artifact to `status: accepted`, remove the Task 3 review defer, and close `mc2-jz6y0.24`. Refresh local Graphify with `graphify update .` and `graphify cluster-only . --no-viz`, confirm the report commit matches HEAD, push Beads, pull-rebase and push `codex/self-hosted-qdrant-platform`.

## Execution Handoff

The user preselected subagent-driven development for this epic. Execute Tasks 1-2 as one cohesive isolated E7 worker stream because they share one decision and acceptance artifact; use a separate read-only reviewer for Task 3, then integrate and proceed automatically to Q10.
