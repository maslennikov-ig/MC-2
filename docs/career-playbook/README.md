# Career Playbook

Career Playbook is the Role Guide generation track for MC2. The MVP flow is:

1. Authenticated user answers fixed and adaptive wizard questions.
2. Backend generates the 26-block Role Guide through the Career Playbook LangGraph stage.
3. Owner reviews, edits/regenerates blocks, exports PDF, manages visibility, shares a public viewer link, or starts course generation from a completed playbook.
4. Organization members can read `organization` Role Guides in read-only mode without owner management controls.

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

As of 2026-05-27, constructor role suggestions use a local ESCO-backed subset, a
small allowlisted Wikidata RU layer, and an MC2 overlay. The runtime does not
call ESCO, Wikidata, HH, Faker, or other live role-title APIs, and it does not
bundle full external datasets. Russian is not an ESCO source language, so ESCO
Russian labels, aliases, and keywords are MC2-maintained fallback copy mapped to
ESCO occupation URIs. Wikidata records are imported only from reviewed QIDs under
the CC0 policy and are used for Russian operational roles that ESCO/overlay do
not cover well.

Source details, import script, and verification notes are documented in
[`docs/plans/career-playbook/2026-05-27-esco-role-title-suggestions.md`](../plans/career-playbook/2026-05-27-esco-role-title-suggestions.md)
and
[`docs/plans/career-playbook/2026-05-27-wikidata-role-title-suggestions.md`](../plans/career-playbook/2026-05-27-wikidata-role-title-suggestions.md).

## Functional Area Resolution

As of 2026-05-28, the constructor no longer asks every user a static
"department or functional area" question. Known role titles infer and save the
functional area locally, show a compact "Functional area" chip, and move the
user directly to role level. Ambiguous titles resolve on the Next action through
`careerPlaybook.session.resolveDepartmentOptions`, which returns 2-5 relevant
candidates. If the LLM classifier cannot return valid candidates after retries,
the wizard reveals the full static department list as an emergency fallback.

The department remains required generation context: follow-up generation is
blocked unless a saved department value is present. The classifier uses
`stage_career_playbook_department_classifier` model routing with retry and
fallback-model escalation from `llm_model_config`.

## Business Context Intake

As of 2026-06-03, the constructor inserts a guided Business Context step after
the fixed questions and before adaptive follow-ups. Users can describe the
company manually, attach helpful files, or explicitly choose a universal
benchmark Role Guide.

The step collects product, customer, sales/channel, process, metric,
organization, and constraint signals. It reuses the shared course `FileUpload`
component with Career Playbook-specific copy. Uploaded files are stored as
Career Playbook sources tied to `career_playbooks` through
`career_playbook_sources`; they do not require a fake draft course or a
`course_id`.

Plain text and markdown sources are processed directly as UTF-8 content and do
not require Docling conversion. The owner UI/API exposes source processing
state, blocks generation while sources are still pending, and lets owners retry
or remove failed sources.

Generation receives the user-editable business-context digest separately from
external web research. Company-specific mode may use the digest as client facts.
Universal mode must not invent company details and should produce a benchmark
guide with explicit adaptation notes.

## Numeric Provenance And Output Quality

As of 2026-06-09, generated Career Playbook blocks may include
`numeric_facts` metadata. The metadata classifies numeric claims as verified
source values, external benchmarks, structural methodology numbers, model
suggestions, conflicts, or values that need review. Business-context evidence is
the preferred source for company-specific KPI targets and deadlines; unsupported
precise values should not be presented as verified company facts.

The private viewer surfaces a numeric provenance summary and lets owners correct
a numeric value for one occurrence or the whole block. Regenerated blocks refresh
numeric provenance from the current role profile and surrounding block context.

Final assembly also applies deterministic output cleanup: auto-added Mermaid
sections are localized to the target content language, Mermaid fences are parsed
through the shared Stage 6 Mermaid validator/remediation pipeline before
persistence, and raw fill-in placeholders such as `[Имя]`, `[дата]`, `[число]`,
and `[url]` are converted into explicit fields to fill while preserving markdown
checkboxes and fenced code. If a Mermaid diagram still cannot parse, the final
assembler replaces it with safe markdown fallback text and records a structured
quality issue instead of leaving a frontend `Syntax error in text`.

Russian follow-up validation checks unexpected writing systems while allowing
common Latin product, channel, and KPI terms such as B2B, SaaS, MQL, SQL, CVR,
VK, Telegram, and YouTube. Cross-block judge degradation is explicit: empty or
invalid judge output is retried once, then recorded as both a legacy
`generation_warnings[]` string and structured `quality_issues[]` records that
the private viewer groups by block with open/edit/regenerate actions.

## Visibility And Permissions

As of 2026-06-05, Career Playbook visibility matches course visibility:
`private`, `organization`, and `public`.

`career_playbooks.visibility` is the source of truth. `is_public` remains a
legacy compatibility mirror for public links and is synchronized from
`visibility` by migration `20260605150000_career_playbook_visibility.sql`.
Public links use the same organization-scoped rule as courses:
`/career-playbooks/{orgSlug}/{playbookSlug}`. The playbook slug is derived from
the position title and only gets a short suffix when the base slug collides.
Legacy `/share/career-playbook/{slug}` URLs redirect to the canonical path when
the organization slug is known.

Access model:

- `private`: only the creator/owner can read.
- `organization`: the owner and organization members can read.
- `public`: the public share route can read completed playbooks with generated
  content.
- Management is owner-only: edit/regenerate/delete, visibility changes, public
  link management, PDF/export actions exposed in the management inspector, and
  course creation from the Role Guide.
- Business-context source rows remain owner/superadmin-only because they may
  contain raw private company text; organization readers see the generated Role
  Guide, not uploaded/source material.

Backend viewer/library payloads include `visibility`, `ownerId`, and
`viewerPermissions`. The web library renders the same visibility dropdown style
as course cards for owners, while non-owner organization cards render a
read-only state. The production reader hides the right management inspector and
block edit controls when `viewerPermissions.canEdit` and the related management
permissions are false.

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
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx tests/unit/components/career-playbook/page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/public-playbook-viewer.test.tsx tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx
pnpm --filter @megacampus/shared-types exec vitest run tests/career-playbook.test.ts
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/career-playbook-library-service.test.ts tests/unit/career-playbook-visibility-migration.test.ts tests/unit/stages/stage-career-playbook/group-generator.test.ts tests/unit/stages/stage-career-playbook/final-assembler.test.ts tests/unit/stages/stage-career-playbook/numeric-facts.test.ts
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/stages/stage-career-playbook/followup-questions.test.ts tests/unit/stages/stage-career-playbook/spec-builder.test.ts
pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/page-client.test.tsx tests/unit/api/career-playbook/upload.test.ts
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

As of 2026-06-03, Business Context file uploads require migrations `20260603110000_add_career_playbook_sources` and `20260603123000_cascade_career_playbook_source_file_catalog` in addition to the base Career Playbook schema. Before enabling uploads in staging/dev, verify `career_playbook_sources` RLS, `file_catalog.course_id IS NULL` for Career Playbook files, and explicit source removal cascades source rows when their `file_catalog` metadata is deleted.

As of 2026-05-23, the target model routing is encoded in migration `20260523073000_update_career_playbook_v4_pro_routing`: DeepSeek V4 Pro for spec, group 5, judge, and block regeneration; DeepSeek V4 Flash for follow-up and groups 1-4/6. Career Playbook fallbacks now stay within the DeepSeek V4 Flash/Pro pair instead of MiniMax.

As of 2026-05-21, `smoke:career-playbook:live` provides the gated runner, deterministic evidence validator, and dry-run cleanup manifest needed to run a single live staging smoke once auth fixtures, shared queue alignment, cleanup authorization, and budget are explicit. It does not remove the need for operator approval before live mutation.

See [architecture.md](./architecture.md) for the system map and staging smoke plan.
