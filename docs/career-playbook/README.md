# Career Playbook

Career Playbook is the Role Guide generation track for MC2. The MVP flow is:

1. Authenticated user answers fixed and adaptive wizard questions.
2. Backend generates the 26-block Role Guide through the Career Playbook LangGraph stage.
3. User reviews, edits/regenerates blocks, exports PDF, shares a public viewer link, or starts course generation from a completed playbook.

## Product UI Direction

As of 2026-05-25, the working Career Playbook zone uses a document-first milk
design direction. The constructor shows the future role guide as the central
surface, with question navigation on the left and the current question/action
panel on the right. The review step is a final document check with the
generation CTA, not another pass through the questions.

The redesign covers the constructor, library, private viewer, public share,
loading/error states, and auth-required states. The marketing landing remains
only softly aligned. Backend contracts, generation, and role-source data are not
part of this UI redesign.

Implementation notes are in
[`docs/plans/career-playbook/2026-05-25-document-first-zone-redesign.md`](../plans/career-playbook/2026-05-25-document-first-zone-redesign.md).

## Role Title Suggestions

As of 2026-05-27, constructor role suggestions use a local ESCO-backed subset plus
an MC2 overlay. The runtime does not call the ESCO live API and does not bundle
the full ESCO dataset. Russian is not an ESCO source language, so Russian labels,
aliases, and keywords are MC2-maintained fallback copy mapped to ESCO occupation
URIs.

Source details, import script, and verification notes are documented in
[`docs/plans/career-playbook/2026-05-27-esco-role-title-suggestions.md`](../plans/career-playbook/2026-05-27-esco-role-title-suggestions.md).

## Verification Entrypoints

Local read-only checks:

```bash
pnpm --filter @megacampus/web test:e2e:career-playbook -- --list
pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target local
```

`blocked` is an expected non-zero preflight outcome when required env or schema is missing; pnpm reports it as a lifecycle failure while preserving the human-readable smoke report.

Targeted unit checks:

```bash
pnpm --filter @megacampus/web exec vitest run tests/unit/playwright-config.test.ts
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx tests/unit/components/career-playbook/page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/public-playbook-viewer.test.tsx
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key REDIS_URL=redis://127.0.0.1:6379 NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/smoke/career-playbook-preflight.test.ts
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/admin-cost-evidence.test.tsx
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/admin-career-playbook-costs.test.ts
```

Mutation smoke is intentionally not part of the default command. It requires explicit approval, disposable staging fixtures, a dedicated queue, cleanup authorization, and cost-aware LLM credentials.

Live-smoke preparation command:

```bash
pnpm --dir packages/course-gen-platform smoke:career-playbook:live --target staging --json
```

The default `plan` mode is non-mutating: it does not call tRPC, enqueue jobs, start workers, write Supabase rows, clean Redis, or call LLMs. A real staging run requires explicit gates:

```bash
TOKEN="$TOKEN" \
BULLMQ_QUEUE_NAME=career-playbook-smoke-YYYYMMDD \
pnpm --dir packages/course-gen-platform smoke:career-playbook:live \
  --target staging \
  --mode mutation-smoke \
  --trpc-url "$CAREER_PLAYBOOK_SMOKE_TRPC_URL" \
  --expected-user-id "$CAREER_PLAYBOOK_SMOKE_USER_ID" \
  --expected-organization-id "$CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID" \
  --cleanup-scope playbook-and-course \
  --max-cost-usd 3 \
  --confirm-live-mutation \
  --json
```

Use `--include-course-bridge` only when cleanup covers the created course, generated source documents, upload paths, outbox/jobs, and downstream generation artifacts.

## Admin Cost Evidence

Career Playbook per-node cost evidence is available to admins at `/admin/generation/career-playbooks/costs`. The page reads `admin.getCareerPlaybookCostEvidence` and shows the filtered playbook count plus page totals and stage/node/model/token/USD rows from `career_playbooks.cost_breakdown`. Invalid cost payloads are marked instead of being treated as verified evidence.

## Current Live Readiness

As of 2026-05-20, the Career Playbook migration has been applied to the Supabase project and read-only staging preflight passes when a dedicated non-default queue name is provided. Full mutation smoke is still intentionally gated on disposable staging fixtures, auth token/storage state, queue alignment between enqueuer and worker, cleanup scope, and an accepted numeric LLM/API cost budget.

As of 2026-05-23, the target model routing is encoded in migration `20260523073000_update_career_playbook_v4_pro_routing`: DeepSeek V4 Pro for spec, group 5, judge, and block regeneration; DeepSeek V4 Flash for follow-up and groups 1-4/6. Career Playbook fallbacks now stay within the DeepSeek V4 Flash/Pro pair instead of MiniMax.

As of 2026-05-21, `smoke:career-playbook:live` provides the gated runner, deterministic evidence validator, and dry-run cleanup manifest needed to run a single live staging smoke once auth fixtures, shared queue alignment, cleanup authorization, and budget are explicit. It does not remove the need for operator approval before live mutation.

See [architecture.md](./architecture.md) for the system map and staging smoke plan.
