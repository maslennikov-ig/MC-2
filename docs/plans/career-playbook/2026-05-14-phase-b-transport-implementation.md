# Career Playbook Phase B Transport Implementation Plan

**Goal:** Replace the Phase B optional frontend seam and local generation handoff fallback with concrete backend tRPC transport.

**Architecture:** Keep this slice on ordinary tRPC mutations/queries because the current Next tRPC proxy consumes JSON and the browser client uses `httpBatchLink`, so SSE/subscriptions need a separate transport change. Follow-up generation is a mutation that returns and persists adaptive questions. Role Guide generation is a backend handoff mutation that stores `generating` without billing/payment scope; worker completion and SSE streaming remain separate follow-up integration points.

**Tech Stack:** tRPC v11, Zustand, Vitest, Supabase admin client, existing Career Playbook LangGraph service.

## Steps

1. Add RED backend router tests for `careerPlaybook.generation.requestFollowups`, `approveAndGenerate`, and `getStatus`.
2. Add RED frontend store/page tests for production tRPC adapter, successful generation handoff, and failed/unavailable handoff.
3. Implement backend input schemas, data helpers, follow-up mutation, generation handoff mutation, and status query.
4. Implement frontend store `approveCareerPlaybookGeneration`, production adapter wiring, and completion UI states.
5. REFACTOR small helpers and copy, then run targeted tests and repo quality gates.
6. Run requesting-code-review, verification-before-completion, stage closeout, Beads close/push, and create the stacked PR.

## Explicit Non-Goals

- No billing/payment/quota changes.
- No direct push to `develop` or `master`.
- No pretend SSE until the proxy and client support streaming.
