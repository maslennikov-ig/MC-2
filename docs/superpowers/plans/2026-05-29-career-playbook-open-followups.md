# Career Playbook Open Followups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining actionable Career Playbook follow-ups that do not require live staging mutations.

**Architecture:** Keep the Career Playbook course bridge behavior intact while adding explicit storage quota accounting around its direct synthetic markdown writes. Fix the master integration CI environment by giving the integration job its own local Qdrant service instead of depending on production-like Qdrant secrets for test setup.

**Tech Stack:** TypeScript, Vitest, tRPC, Supabase client, GitHub Actions service containers, Beads.

---

### Task 1: Career Playbook Bridge Quota Accounting

**Files:**

- Modify: `packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts`
- Test: `packages/course-gen-platform/tests/unit/server/routers/career-playbook-course-bridge.service.test.ts`

- [x] **Step 1: Write failing tests**

Add tests that mock quota helpers and default storage dependencies, then verify:

- a successful synthetic document upload calls `incrementQuota(organizationId, fileSize)`;
- a failed `file_catalog` insert releases the same quota amount;
- bridge rollback through the default course deleter releases quota for files selected from `file_catalog`.

- [x] **Step 2: Run focused test and confirm RED**

Run:

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts
```

Expected: the new quota assertions fail because the bridge currently writes directly to disk and `file_catalog`.

- [x] **Step 3: Implement minimal quota accounting**

Import `incrementQuota` and `decrementQuota`, reserve quota before the direct synthetic write, release it on direct upload failure, and release selected file sizes during bridge course rollback.

- [x] **Step 4: Run focused test and confirm GREEN**

Run the same focused Vitest command. Expected: all tests in the file pass.

### Task 2: Master Integration CI Qdrant Service

**Files:**

- Modify: `.github/workflows/ci-cd.yml`

- [x] **Step 1: Apply CI environment fix**

Add a `qdrant` service container to the `test-integration` job, expose `6333:6333`, add a `/readyz` health check, and set the integration test env to `QDRANT_URL: http://localhost:6333` and `QDRANT_API_KEY: test-qdrant-key`.

- [x] **Step 2: Validate workflow syntax locally**

Run a static YAML parse using Python:

```bash
python3 - <<'PY'
import yaml
with open('.github/workflows/ci-cd.yml', 'r', encoding='utf-8') as f:
    yaml.safe_load(f)
print('workflow yaml parsed')
PY
```

Expected: `workflow yaml parsed`.

### Task 3: Gated Follow-up Truth

**Files:**

- Modify: `.codex/handoff.md`
- Create/modify: `.codex/stages/mc2-db696.16/summary.md`

- [x] **Step 1: Record live-smoke state**

Record that read-only staging preflight passes with a dedicated queue, while mutation mode remains blocked by missing tRPC URL, token, disposable user/org ids, cleanup scope, cost budget, and explicit mutation confirmation.

- [x] **Step 2: Record CI investigation**

Record that repeated master Integration Tests failures share the same Qdrant global setup root cause.

- [x] **Step 3: Update Beads**

Close tasks that have fresh evidence and leave live mutation/load tasks blocked only when the blocker is external and explicit.

### Task 4: Verification And Delivery

- [x] **Step 1: Run focused backend tests**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts
```

- [x] **Step 2: Run repository gates for touched scope**

```bash
pnpm --filter @megacampus/course-gen-platform lint
pnpm type-check
pnpm build
```

- [x] **Step 3: Run orchestration closeout**

```bash
python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.16
```

- [x] **Step 4: Commit and push**

Commit the code, Beads export, and orchestration notes, then push `codex/career-playbook-open-followups`.
