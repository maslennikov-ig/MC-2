# Career Playbook Live Smoke Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gated Career Playbook live-smoke runner, evidence validator, and dry-run cleanup manifest so `mc2-db696.11.5` can be safely run when staging credentials, fixtures, queue alignment, cleanup scope, and budget are explicit.

**Architecture:** Keep live orchestration in `packages/course-gen-platform/src/smoke/career-playbook-live-smoke.ts`, deterministic content checks in `career-playbook-validation.ts`, and the CLI wrapper in `packages/course-gen-platform/scripts/career-playbook-live-smoke.ts`. The default command is non-mutating; mutation mode requires explicit gates and uses tRPC with a real bearer token rather than direct Supabase row creation.

**Tech Stack:** TypeScript, Vitest, tRPC v11 `createTRPCClient`/`httpBatchLink`, BullMQ v5 read-only job lookup, existing Career Playbook validation helpers.

---

### Task 1: RED Tests

**Files:**

- Create: `packages/course-gen-platform/tests/unit/smoke/career-playbook-live-smoke.test.ts`

- [ ] **Step 1: Write failing tests**
  - plan mode reports required gates without calling mutation client methods
  - staging mutation mode blocks missing token, expected user/org, dedicated queue, cleanup scope, and numeric budget
  - staging mutation mode rejects the shared `course-generation` queue
  - validator requires `header` plus `block_1` through `block_26`, required Mermaid diagrams, anti-goals, decision rows, and failure modes
  - cleanup manifest masks secrets and lists exact playbook/job/course IDs only

- [ ] **Step 2: Verify RED**
      Run:
      `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/smoke/career-playbook-live-smoke.test.ts`

### Task 2: Runner And Validator

**Files:**

- Create: `packages/course-gen-platform/src/smoke/career-playbook-validation.ts`
- Create: `packages/course-gen-platform/src/smoke/career-playbook-live-smoke.ts`

- [ ] **Step 1: Implement deterministic validation**
      Reuse `CAREER_PLAYBOOK_FINAL_BLOCK_ORDER` and `runCareerPlaybookDeterministicChecks`.

- [ ] **Step 2: Implement gate planner**
      Default to `plan`; require explicit gates for `mutation-smoke`.

- [ ] **Step 3: Implement injectable mutation runner**
      Use an injected client interface in tests; the real adapter is only created by the CLI.

### Task 3: CLI And Docs

**Files:**

- Create: `packages/course-gen-platform/scripts/career-playbook-live-smoke.ts`
- Modify: `packages/course-gen-platform/package.json`
- Modify: `docs/career-playbook/README.md`
- Modify: `docs/career-playbook/architecture.md`

- [ ] **Step 1: Add CLI parser**
      Support `--target`, `--mode`, `--trpc-url`, `--expected-user-id`, `--expected-organization-id`, `--max-cost-usd`, `--cleanup-scope`, `--confirm-live-mutation`, `--json`. Read the bearer token only from `TOKEN` or `CAREER_PLAYBOOK_SMOKE_TOKEN` so package-manager command echo cannot leak it.

- [ ] **Step 2: Add package script**
      Add `smoke:career-playbook:live`.

- [ ] **Step 3: Document safe usage**
      State that default mode is non-mutating and live mode needs explicit approval.

### Task 4: Verification And Handoff

**Files:**

- Modify: `.codex/handoff.md`
- Create/update: `.codex/stages/mc2-db696.11/artifacts/mc2-db696.11.5-live-runner.md`
- Modify: `.codex/stages/mc2-db696.11/summary.md`

- [ ] **Step 1: Run targeted unit tests**
- [ ] **Step 2: Run `git diff --check`, process verification, and stage artifact validation**
- [ ] **Step 3: Update Beads and handoff**
- [ ] **Step 4: Commit and push the feature branch**
