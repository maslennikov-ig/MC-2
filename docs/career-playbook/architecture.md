# Career Playbook Architecture

## Runtime Surfaces

- Web app: `packages/web/app/[locale]/career-playbook/**`
- Web state: `packages/web/stores/use-career-playbook-store.ts`
- Backend tRPC router: `packages/course-gen-platform/src/server/routers/career-playbook/**`
- Generation stage: `packages/course-gen-platform/src/stages/stage-career-playbook/**`
- Department classifier: `packages/course-gen-platform/src/stages/stage-career-playbook/nodes/department-classifier.ts`
- Business context helpers: `packages/course-gen-platform/src/stages/stage-career-playbook/nodes/business-context.ts`
- Business context source processing: `packages/course-gen-platform/src/stages/stage-career-playbook/source-processing.ts`
- Worker handler: `packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts`
- DB migration: `packages/course-gen-platform/supabase/migrations/20260513090000_career_playbook.sql`
- Visibility/access migration: `packages/course-gen-platform/supabase/migrations/20260605150000_career_playbook_visibility.sql`
- Business context source migration: `packages/course-gen-platform/supabase/migrations/20260603110000_add_career_playbook_sources.sql`
- Business context source cleanup migration: `packages/course-gen-platform/supabase/migrations/20260603123000_cascade_career_playbook_source_file_catalog.sql`

## Visibility And Owner-Only Management

Career Playbooks use the same visibility vocabulary as courses:
`private`, `organization`, and `public`. The canonical database field is
`career_playbooks.visibility`; the legacy `is_public` flag remains only as a
compatibility mirror for public-link behavior and is synchronized from
`visibility`.

Read access and management access are separate:

- `private`: readable by the owner only.
- `organization`: readable by the owner and authenticated members of the same
  organization.
- `public`: readable through the public share link when the playbook is
  completed and has generated content.
- Edit, regenerate, delete, visibility changes, public-link management, and
  creating a course from the playbook are owner-only management actions.

Backend library responses include `visibility`, `ownerId`, and
`viewerPermissions`. The production reader uses `viewerPermissions` to hide the
right management inspector and block edit/regenerate controls for organization
members and public/read-only viewers. The library shows owner cards with the
course-style visibility dropdown; non-owner organization-visible cards show a
read-only badge and only open the reader.

Business-context source rows can contain raw private company text, so
`career_playbook_sources` remains owner/superadmin-only even when the generated
playbook is visible to the organization. Organization readers see the generated
Role Guide, not its raw source material.

The compatibility mutation `careerPlaybook.share.shareToggle` maps to
`private`/`public`, while the canonical protected mutation is
`careerPlaybook.library.updateVisibility({ playbookId, visibility })`.

## Department Resolution

The fixed-question flow treats department as required internal context, not a
mandatory standalone user step. The web store first uses local role-title
inference from `role-title-suggestions.ts`. When a role title is unknown or
ambiguous, the page calls `careerPlaybook.session.resolveDepartmentOptions` only
from the Next action, never while the user types.

The backend classifier renders `career_playbook_department_classifier`, calls
the configured model for `stage_career_playbook_department_classifier`, validates
the returned JSON with shared Career Playbook schemas, and keeps only 2-5
allowed department candidates. Runtime LLM calls retry transient provider
failures and can escalate from the configured primary model to the configured
fallback model. Invalid classifier JSON is retried with fallback preference and
larger token budget before the web flow reveals the static department list.

Follow-up generation must receive a saved department answer. The store blocks a
direct follow-up request without department context and sends the user back to
the department question instead of starting generation with incomplete fixed
answers.

## Business Context Intake

The constructor now has an intermediate Business Context phase between fixed
questions and follow-up generation. The web step lives in
`BusinessContextStep.tsx` and uses the document-first constructor shell: category
navigation on the left, an editable digest in the center, and source guidance
plus upload controls on the right.

The shared `CareerPlaybookQADataSchema` stores `business_context` with:

- `mode`: `company_specific` or `universal`
- `status`: collection/readiness state
- `digest`: product, customer, sales/channel, process, metric, organization,
  and constraint signals, plus nested `source_ids`, `missing_signals`,
  `user_edited`, and digest timestamps
- `source_ids`: uploaded source record IDs mirrored at the context level for
  quick access
- `skip_reason`: optional explanation for universal/skipped mode
- `updated_at`: last context edit timestamp

The same `q_a_data` JSON stores `ui_progress`, which is the wizard resume
position persisted by `careerPlaybook.session.saveProgress`. The frontend saves
the active phase plus the current fixed `question_key` or follow-up
`question_id`; indices are retained only as fallback when the question list
changes. Terminal generation statuses still hydrate into the completion phase
even if an older `ui_progress` value points at an earlier wizard step.

`career_playbook_sources` is the domain owner for uploaded Business Context
files and text snippets. It references `career_playbooks`, `organizations`,
`auth.users`, and optional `file_catalog` rows. File storage still goes through
the existing Stage 1 validation, quota, storage, and dedup primitives, but Career
Playbook files use `uploads/<organization>/career-playbooks/<playbookId>/` and
leave `file_catalog.course_id` null. This keeps course uploads unchanged and
avoids creating fake draft courses just to attach Role Guide context.

Business Context also accepts pasted text notes through the freeform answer
path. Saving `freeform_text: ""` is a deliberate clear operation, not a no-op;
it removes stored notes so deleted pasted context does not return after refresh.
`CareerPlaybookAnswerSubmissionSchema` caps pasted notes at 20,000 characters;
the Business Context textarea uses the same shared constant for `maxLength` and
its visible character counter.
Changing pasted notes or the structured business context invalidates stored
follow-up questions, follow-up answers, completeness, and non-user-edited
generated digest data before the next follow-up generation.

Business Context file uploads enqueue `JobType.CAREER_PLAYBOOK` with operation
`PROCESS_SOURCE`. `source-processing.ts` reuses Docling conversion,
processed-document storage, and summarization with the playbook ID as the
markdown namespace instead of creating a fake course. Source rows move through
`uploaded`, `processing`, `ready`, and `failed`; follow-up generation blocks
while any selected source is still uploaded or processing.

The tRPC source lifecycle surface is `careerPlaybook.sources.listSources`,
`uploadFile`, and `removeSource`. Draft reads include
`businessContextSources`, so the web store can render persisted filenames,
source status, source errors, and removal actions across constructor resume.

Follow-up and spec-builder prompts receive the formatted business digest,
processed source excerpts, and missing signals as separate prompt variables.
Company-specific mode may treat the digest and available processed source
excerpts as client-provided facts. If an uploaded source has no processed text
yet, the prompt receives an explicit unavailable-content warning rather than raw
UUIDs. Universal mode explicitly instructs the model not to invent
company/product/channel details; the generated Role Guide is a benchmark guide
that names adaptation areas before operational rollout.

## Course Bridge Sources

`careerPlaybook.courseBridge.createCourseFromPlaybook` creates a draft course
from a completed Role Guide and persists generated markdown sources through the
Career Playbook bridge storage module:

- `course-bridge.service.ts` owns playbook access, course creation, web-research
  selection, and generation start.
- `course-bridge-storage.ts` owns synthetic markdown file writes, `file_catalog`
  rows, and storage-quota accounting.

Bridge sources are still trusted generated markdown and keep
`processing_method = 'career_playbook_bridge'`, `markdown_content`, and
`processed_content` populated for the downstream course pipeline. They now
reserve organization storage quota before writing the source file, release it if
the write or `file_catalog` insert fails, and release quota during bridge course
rollback after the course delete succeeds. If course rollback delete fails, the
files and quota are left intact because database ownership may still exist.

## E2E Harness

`packages/web/playwright.config.ts` derives one web URL from `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_PORT`, `PORT`, or the default `http://localhost:3000`. The same URL is used for Playwright `baseURL`, `webServer.url`, and `NEXT_PUBLIC_APP_URL`; the resolved port is passed into the Next dev server through `PORT`.

When `PLAYWRIGHT_BASE_URL` points at a non-local host, Playwright treats it as an already-running external target and does not start `pnpm run dev`. Use `PLAYWRIGHT_PORT` for managed local Next dev-server runs.

Use a non-default port when another app is already running on `3000`:

```bash
PLAYWRIGHT_PORT=3101 pnpm --filter @megacampus/web test:e2e:career-playbook
```

Local WSL environments that cannot install the exact Playwright browser bundle
can opt into a system Chrome binary for Chromium projects:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
PLAYWRIGHT_DISABLE_VIDEO=1 \
pnpm --filter @megacampus/web exec playwright test tests/e2e/header-dropdown-position.spec.ts --project=chromium
```

`PLAYWRIGHT_DISABLE_VIDEO=1` is only a local fallback for environments missing
Playwright's ffmpeg bundle; default reporting still retains failure videos.

Authenticated browser tests still require a valid `TOKEN` storage-state input. Without `TOKEN`, only unauthenticated/public checks run.

## Backend Read-Only Smoke

The backend preflight command is read-only by design:

```bash
pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target local
```

`blocked` is a deliberate non-zero result for incomplete readiness. Automation should parse the report status rather than treating every non-zero preflight result as a process crash.

It checks:

- required backend env presence without printing secrets
- `SUPABASE_SERVICE_KEY` vs web-only `SUPABASE_SERVICE_ROLE_KEY`
- read-only Supabase schema reachability with head-only selects
- Redis PING and resolved BullMQ queue name
- mutation smoke hard-stop status

It does not create users, write Supabase rows, enqueue jobs, start workers, clean queues, or call LLM-backed generation.

## Staging Smoke Plan

Daily staging smoke should run only after staging has the Career Playbook migration and disposable test fixtures:

1. Run the read-only preflight against staging.
2. Create or reuse a dedicated staging test user and organization.
3. Use a dedicated `BULLMQ_QUEUE_NAME`, not the shared production queue.
4. Generate one `sales-manager-b2b` Role Guide from `docs/job-descriptions/sales-manager-b2b.md`.
5. Compare structure: 26 blocks, 3 Mermaid diagrams, at least 4 anti-goals, at least 4 decision-matrix rows, at least 3 failure modes.
6. Verify viewer, PDF export, public share link, and course bridge against disposable data.
7. Clean up disposable playbooks/courses/files and record cost breakdown.

Staging/prod mutation smoke is blocked unless the current task explicitly approves mutations, cleanup, and expected API cost.

`packages/course-gen-platform/scripts/career-playbook-live-smoke.ts` is the gated live-runner entrypoint. Its default `plan` mode is read-only in practice: it only evaluates gates and prints a report. `mutation-smoke` mode uses real tRPC calls with a disposable bearer token and follows the product flow instead of writing rows directly:

1. `careerPlaybook.session.start`
2. `careerPlaybook.session.submitAnswer` for fixed sales-manager-b2b answers
3. `careerPlaybook.generation.requestFollowups`
4. `careerPlaybook.session.submitAnswer` for follow-up answers/skips
5. `careerPlaybook.generation.approveAndGenerate`
6. `careerPlaybook.generation.getStatus` polling until terminal state
7. `careerPlaybook.library.get`, `exportPdf`, `share.shareToggle`, and `share.getPublicBySlug`
8. optional `careerPlaybook.courseBridge.createCourseFromPlaybook` only with `--include-course-bridge`

The runner refuses production targets, refuses shared/default `course-generation` for staging, and requires a bearer token, expected disposable user/org IDs, cleanup scope, numeric budget, tRPC URL, and `--confirm-live-mutation`. It emits a dry-run cleanup manifest with exact playbook, BullMQ job, job_status, share slug, course, source document, and upload-path targets; it does not delete anything itself.

## Cost And Performance Checks

Career Playbook generation records per-node cost in `cost_breakdown` on `career_playbooks`. The admin evidence surface is:

- Backend: `admin.getCareerPlaybookCostEvidence`
- Web: `/admin/generation/career-playbooks/costs`

The endpoint validates each `cost_breakdown`, marks invalid cost payloads, aggregates the displayed page by playbook and node, and returns stage, node, model, input tokens, output tokens, total tokens, and total USD cost. `totalCount` is the filtered count; cost and token totals are page totals for the returned playbooks. Superadmins may filter across organizations; organization admins are scoped to their own `organization_id` even though the backend reads through the service role. Service-role reads are not RLS proof, so live evidence still needs a real admin session and disposable staging data before it can be used as a mutation-smoke acceptance artifact.

Operator evidence should include a screenshot or exported trace from `/admin/generation/career-playbooks/costs` showing at least one completed Career Playbook with per-node rows and aggregate totals. If staging does not expose `public.career_playbooks`, record the schema blocker instead of running mutation smoke. If the schema is present but live-smoke inputs are incomplete, record the missing auth, fixture, queue, cleanup, or cost-budget gate instead of running LLM-backed generation.

Current runtime cost accounting estimates Career Playbook node costs as `0`, so the admin page proves `cost_breakdown` shape and access control but does not prove real OpenRouter spend. Operator evidence should include provider-side spend or improved runtime cost accounting when the acceptance criterion needs actual cost evidence.

Staging model routing for Career Playbook is moving to the DeepSeek V4 pair through migration `20260523073000_update_career_playbook_v4_pro_routing`: `deepseek/deepseek-v4-pro` for `stage_career_playbook_spec`, `stage_career_playbook_group_5`, `stage_career_playbook_judge`, and `stage_career_playbook_regenerator`; `deepseek/deepseek-v4-flash` for follow-up generation and groups 1-4/6. Migration `20260528193000_add_career_playbook_department_classifier` adds `stage_career_playbook_department_classifier` with Flash primary and Pro fallback. Fallbacks stay within the same V4 pair, with Pro backing Flash phases and Flash backing Pro phases.

The 10-concurrent-generation load test should run against isolated staging resources:

- dedicated test users and organization
- dedicated queue name
- known LLM budget cap
- no shared production Redis queue
- pass criteria: all jobs reach terminal state, no worker readiness degradation, no queue cleanup outside the dedicated queue
