# Career Playbook 10-Concurrent Load Test Plan

**Goal:** Complete `mc2-db696.11.6` with a fail-closed load harness and one isolated, budgeted live run of exactly ten concurrent Career Playbook generations.

**Approach:** Reuse the accepted single-run Career Playbook smoke contract instead of duplicating generation logic. The new harness first builds a non-mutating plan, then starts ten isolated runs together only when every fixture, queue, cleanup, confirmation, and total-budget gate is present. Local implementation and tests perform no live mutations or paid calls; live execution is a separate authorization boundary.

**Non-goals:** Production execution, shared queues, schema migrations, reindexing, secrets in tracked files, automatic deletion outside exact run manifests, and Career Playbook-to-course Stage 4/5 validation.

## Scope ledger

- Safe plan and all mutation gates -> Task 1.
- Exactly ten concurrent isolated terminal runs with per-run evidence -> Task 1.
- Aggregate duration/cost/failure/queue evidence and cleanup proof -> Task 1 plus live authorization gate.
- Numeric live budget, disposable token/user/org, and isolated API/worker queue -> external authorization gate owned by the user.

### Task 1: Fail-closed 10-run load harness and acceptance

**Files:**

- `packages/course-gen-platform/src/smoke/career-playbook-load-test.ts`
- `packages/course-gen-platform/scripts/career-playbook-load-test.ts`
- `packages/course-gen-platform/tests/unit/smoke/career-playbook-load-test.test.ts`
- `packages/course-gen-platform/package.json`
- `docs/career-playbook/live-smoke-dev-run.md`
- `.codex/goals/mc2-db696.11.6/scope-criterion-snapshot.json`
- `.codex/stages/mc2-db696.11.6/**`
- `.codex/orchestrator.toml`
- `.codex/handoff.md`

**Boundary:** Root owner; Career Playbook smoke tooling; rollback removes the load harness, package command, tests, and operator docs together. Live-created resources are rolled back only by exact IDs from all ten cleanup manifests.

**Interfaces:** Consumes the existing single-run smoke runner and queue-state probe; produces a JSON/text load report with ten run records, aggregate timing/cost/failure data, queue snapshots, and cleanup manifests.

**Verification lane:** `tdd-required` — concurrency, paid calls, queue isolation, cleanup, and aggregate evidence are high-risk behavior.

- [x] RED: plan mode stays non-mutating and blocks any count other than ten or missing queue/fixture/cleanup/confirmation/total-budget gates.
- [x] RED: mutation mode starts ten isolated runs before awaiting completion, assigns unique run IDs, and aggregates terminal results.
- [x] RED: one failed/non-terminal run or degraded post-run queue state fails the load report without hiding successful-run cleanup manifests.
- [x] GREEN: implement the smallest core and CLI using the existing single-run runner and queue APIs.
- [x] Run the focused unit target, then `pnpm type-check` and `pnpm build` once at task acceptance.
- [x] Before live execution, obtain a numeric total USD ceiling and locally configured disposable JWT/user/org; start a dedicated API and worker on one unique queue.
- [x] Run exactly ten concurrent generations, record provider/runtime cost and queue evidence, execute exact-ID cleanup, and verify zero residue.
- [ ] Self-review the diff and evidence, update Beads/handoff, then perform stage closeout and delivery only when the live acceptance boundary is complete.

## Live outcome — 2026-08-11

- Ten main generation jobs were picked up within 1,359 ms and all ten reached `completed`.
- Runtime cost was measured for every run: total USD 1.19633817, maximum single-run USD
  0.160969265, below the approved USD 5.00 / USD 0.50 ceilings.
- The longest run crossed the one-hour access-token lifetime. The original observer recorded a
  false authentication failure after nine results; direct server evidence and a refreshed
  post-generation read recovered the tenth result without another LLM call.
- The load client now rotates Supabase access and refresh tokens on an unauthorized response and
  retries the affected tRPC operation once. Dynamic headers read the current token per request.
- All ten best-effort image child jobs exposed a separate Node/JSDOM OpenAI SDK configuration bug.
  The server-side image client now explicitly permits this browser-like Node process, matching the
  existing text LLM client behavior.
- Cleanup removed the exact fixture user, organization, ten playbooks, job/error rows, and the
  dedicated queue. Database, auth, queue, file, course, and Qdrant residue are all zero.

## Premortem conditions

- Shared or mismatched queue: block before starting; API, worker, probe, and report must name the same unique queue.
- Partial start: retain every created run ID and cleanup manifest; do not retry the entire batch automatically.
- Worker degradation: fail if runs do not all reach terminal state or the post-run queue retains active/waiting jobs attributable to the batch.
- Cost overrun: the declared total ceiling is a planning hard stop, not a provider-side spending lock; no run starts without an owner-approved numeric ceiling.
- Cleanup failure: preserve artifacts and exact IDs, stop closeout, and clean only those IDs before any retry.
