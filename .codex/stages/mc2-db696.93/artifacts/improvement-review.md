---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: improvement-review
stage_id: mc2-db696.93
agent_type: custom-improvement-reviewer
subagent_model: codex/gpt-5.5
reasoning_effort: high
model_reasoning_rationale: Review task covering backend/frontend correctness, UX, i18n, reuse, and verification risk.
repo: mc2
branch: codex/career-playbook-numeric-review
base_branch: develop
base_commit: 1721a9b4
worktree: /home/me/code/mc2/.worktrees/career-playbook-numeric-review
write_zone:
  - .codex/stages/mc2-db696.93/artifacts/improvement-review.md
success_criteria:
  - Inspect repo truth, Beads, git status/diff, Graphify, changed files, nearby patterns, and tests.
  - Provide Top 3 improvements with Fix now, Track follow-up, or Reject decisions.
  - Do not edit implementation files.
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/project-index.md
  - graphify-out/GRAPH_REPORT.md
selected_skills:
  - code-review
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Read-only review; no implementation cleanup performed.
risk_level: medium
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: Review-only artifact; no durable user/API/operator docs changed.
verification:
  - "pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer-page-client.test.tsx: passed"
  - "SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage-career-playbook/numeric-facts.test.ts: passed"
  - "pnpm --filter @megacampus/web test -- tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx: passed"
  - "pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx -t numeric: passed"
  - "pnpm type-check: passed"
  - "git diff --check: passed"
  - "SUPABASE_SERVICE_ROLE_KEY=test-service-role-key NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key pnpm build: failed"
changed_files:
  - .codex/handoff.md
  - packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/numeric-facts.test.ts
  - packages/web/app/[locale]/career-playbook/[id]/page-client.tsx
  - packages/web/components/career-playbook/viewer/PlaybookViewer.tsx
  - packages/web/components/markdown/MarkdownRendererFull.tsx
  - packages/web/messages/en/career-playbook.json
  - packages/web/messages/ru/career-playbook.json
  - packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx
  - packages/web/tests/unit/components/career-playbook/viewer.test.tsx
  - packages/web/tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx
explicit_defers:
  - Full viewer test baseline remains outside this branch until mc2-db696.90 is integrated.
  - Build failure in reviewer run needs resolution or explanation before delivery.
review_type: improvement_reviewer
---

# Career Playbook Numeric Review - Improvement Review

## Summary

Reviewed the current uncommitted numeric-review implementation in the target worktree. The approach is directionally sound: it keeps the shared schema unchanged, reuses existing viewer/editor contracts, filters legacy low-signal facts at display time, and adds targeted unit coverage for backend extraction, markdown annotation, and viewer navigation.

No new dependency, migration, or broad rewrite is warranted for this stage. The main high-value improvement is to make the backend table filter less coarse: it currently suppresses useful timeline/duration values in tables while trying to remove row-number noise.

Verification status from this review:

- Targeted backend numeric test: passed.
- Targeted markdown numeric test: passed.
- Targeted viewer numeric tests: passed.
- `viewer-page-client.test.tsx`: passed.
- `pnpm type-check`: passed.
- `git diff --check`: passed.
- `pnpm build`: failed in this reviewer run at Next page-data collection with missing `.next/server/pages-manifest.json`; handoff records a prior passing build with placeholder Supabase env. Treat as a verification gap to resolve before delivery, not as evidence of a numeric-review code defect.

## Top 3 improvements

1. **Fix now - Preserve actionable table timelines while suppressing row-number noise**
   - **Severity**: Medium user-facing correctness.
   - **Current approach**: `shouldSkipNumericMatch` skips every numeric match on a markdown table row when `hasBusinessNumericContext(line)` is false (`packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts:278`).
   - **Evidence**: Probe command returned `[]` for `| Инициатива | Срок | ... | Запуск пилота | 2 недели |`, even though viewer copy explicitly tells users to review "timelines"/"сроки". KPI table rows such as `Win rate | 18%` are retained because the line contains KPI context.
   - **Suggested alternative**: Make table filtering cell-aware or at least context-aware for duration/timeline terms. Keep suppressing row-number cells like `| 1 |`, separator rows, and checklist ordinals, but retain duration/range/money/percent values when the row or header indicates `срок`, `timeline`, `deadline`, `SLA`, `период`, `duration`, etc. Add a regression test beside the current noisy-table test.
   - **Expected value**: Prevents missed review items in generated implementation-plan tables, which are likely places for risky timelines.
   - **Tradeoff/cost**: Small backend heuristic expansion plus tests; slightly more nuanced false-positive balancing.
   - **Affected files**: `packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts`, `packages/course-gen-platform/tests/unit/stages/stage-career-playbook/numeric-facts.test.ts`.
   - **Confidence**: High.
   - **Decision**: Fix now.
   - **Classification**: high-value improvement.

2. **Track follow-up - Share the numeric fact DOM-id helper instead of duplicating it**
   - **Severity**: Low to Medium reliability/maintainability.
   - **Current approach**: `getNumericFactDomId` is duplicated in `PlaybookViewer.tsx:1909` and `MarkdownRendererFull.tsx:710`. Navigation correctness depends on both implementations staying byte-for-byte compatible.
   - **Suggested alternative**: Move the helper to a local shared utility in the Career Playbook/markdown boundary, for example `packages/web/components/career-playbook/viewer/numeric-facts.ts` or a small `packages/web/lib/career-playbook/numeric-facts.ts`, and import it from both files.
   - **Expected value**: Removes a hidden coupling in the new rail-to-inline navigation and makes future changes to id sanitization safer.
   - **Tradeoff/cost**: Very small abstraction. Worth doing if this feature gets another pass; not worth blocking if the stage needs minimal churn.
   - **Affected files**: `packages/web/components/career-playbook/viewer/PlaybookViewer.tsx`, `packages/web/components/markdown/MarkdownRendererFull.tsx`.
   - **Confidence**: High.
   - **Decision**: Track follow-up unless touching this area again before delivery.
   - **Classification**: optional/nit with real reliability value.

3. **Track follow-up - Replace status-label string parsing with explicit short labels**
   - **Severity**: Low i18n/accessibility maintainability.
   - **Current approach**: `getNumericFactReviewStatusLabel` derives compact badge labels by calling plural/count labels and stripping `:\s*1` (`PlaybookViewer.tsx:1427`). This assumes all locales keep the count at the end after a colon.
   - **Suggested alternative**: Add explicit short-label copy keys such as `numericFactStatusBenchmark`, `numericFactStatusNeedsReview`, `numericFactStatusSuggested`, `numericFactStatusConflict`, or a local status-label map separate from count text.
   - **Expected value**: Avoids fragile locale coupling and keeps rail button labels stable when translators change sentence structure.
   - **Tradeoff/cost**: Adds four message keys in `en` and `ru` plus page-client copy plumbing. This is more i18n surface, so it should be tracked rather than rushed if current strings are acceptable.
   - **Affected files**: `packages/web/components/career-playbook/viewer/PlaybookViewer.tsx`, `packages/web/app/[locale]/career-playbook/[id]/page-client.tsx`, `packages/web/messages/en/career-playbook.json`, `packages/web/messages/ru/career-playbook.json`, `packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx`.
   - **Confidence**: Medium-high.
   - **Decision**: Track follow-up.
   - **Classification**: optional/nit.

## Findings

### 1. Coarse table filtering hides useful timeline facts

- **Severity**: Medium.
- **Decision**: Fix now.
- **Classification**: high-value improvement.
- **Current approach**: `isMarkdownTableLine` plus `!hasBusinessNumericContext(line)` suppresses the whole row before classification.
- **Evidence**: `numeric-facts.ts:250`, `numeric-facts.ts:278`, and reviewer probe output for a deadline table returned no facts.
- **Suggested alternative**: Filter markdown table row-number cells rather than all non-KPI table rows, or extend the context detector to retain actionable timeline/duration table cells.
- **Expected value**: Users keep seeing risky durations in implementation tables while legacy checklist digits stay quiet.
- **Tradeoff/cost**: More heuristic code and one or two extra tests.
- **Affected files**: Backend extractor and numeric unit tests.
- **Confidence**: High.

### 2. Numeric fact DOM id contract is duplicated across components

- **Severity**: Low to Medium.
- **Decision**: Track follow-up.
- **Classification**: optional/nit.
- **Current approach**: The viewer computes `document.getElementById(getNumericFactDomId(fact.id))`; the markdown renderer independently assigns the same id.
- **Evidence**: `PlaybookViewer.tsx:536`, `PlaybookViewer.tsx:1909`, `MarkdownRendererFull.tsx:656`, `MarkdownRendererFull.tsx:710`.
- **Suggested alternative**: Export one helper used by both sides.
- **Expected value**: Lower drift risk in the central new navigation behavior.
- **Tradeoff/cost**: Adds one small shared file/import. Avoid if the team wants zero nonessential churn before commit.
- **Affected files**: Viewer, markdown renderer, possibly a new local utility file.
- **Confidence**: High.

### 3. Badge status labels are derived from count labels with regex stripping

- **Severity**: Low.
- **Decision**: Track follow-up.
- **Classification**: optional/nit.
- **Current approach**: `labels.numericFactBenchmark(1).replace(/:\s*1$/, '')` and equivalent calls for other statuses.
- **Evidence**: `PlaybookViewer.tsx:1427`.
- **Suggested alternative**: Use explicit short status-label messages.
- **Expected value**: Better i18n resilience and clearer copy ownership.
- **Tradeoff/cost**: Adds translation keys and test fixtures; current strings work in `ru` and `en`.
- **Affected files**: Viewer, page-client copy mapping, locale JSON, page-client/viewer tests.
- **Confidence**: Medium-high.

### 4. The right rail can become long with many actionable numbers

- **Severity**: Low UX/performance.
- **Decision**: Track follow-up.
- **Classification**: optional/nit.
- **Current approach**: `summary.items.map(...)` renders every actionable fact directly in the sticky inspector (`PlaybookViewer.tsx:1385`).
- **Suggested alternative**: Cap the first view by severity, group by block/status, or reuse existing `ScrollArea` for a bounded list if generated playbooks commonly produce many actionable numbers.
- **Expected value**: Keeps the inspector scannable and avoids a very tall sticky rail on number-heavy role guides.
- **Tradeoff/cost**: Adds UI state or scrolling behavior. Not necessary until real snapshots show long lists.
- **Affected files**: `PlaybookViewer.tsx`, viewer unit tests if behavior changes.
- **Confidence**: Medium.

### 5. Do not introduce a numeric parsing dependency or schema migration for this stage

- **Severity**: Low.
- **Decision**: Reject.
- **Classification**: rejected optional polish.
- **Current approach**: Local regex/context heuristics and existing `CareerPlaybookNumericFact` schema.
- **Suggested alternative considered**: Bring in a numeric/date/entity extraction library or add schema-level fields for review display state.
- **Expected value if accepted**: Potentially richer extraction later.
- **Reason to reject now**: The stage goal is noise reduction and navigation, not general NER. Existing schema already supports status/source/confidence/explanation, and no new package/API behavior is needed.
- **Affected files**: None recommended.
- **Confidence**: High.

## Reuse/build-vs-buy notes

- Reuse is mostly good: the implementation keeps `CareerPlaybookNumericFact` unchanged, uses existing `MarkdownRendererFull`, `PlaybookViewer`, copy plumbing, and existing update flow.
- The one reuse gap worth tracking is the duplicated DOM-id sanitizer between viewer and markdown renderer.
- Build-vs-buy: keep the current local heuristic approach. A library would add dependency and tuning cost without clear value for the current Career Playbook-specific review workflow.
- No external docs lookup was needed: no new dependency, framework API, CLI, model, or platform behavior was introduced.

## Verification gaps

- `pnpm build` failed in this reviewer run after successful compile during page-data collection:
  - Error: `ENOENT: no such file or directory, open '.../packages/web/.next/server/pages-manifest.json'`.
  - The build also warned that Next inferred `/home/me/code/mc2/pnpm-lock.yaml` as workspace root while running inside nested `.worktrees/career-playbook-numeric-review`.
  - Handoff records a prior passing build with placeholder Supabase env, so this should be resolved or explained before delivery rather than treated as a numeric code failure.
- Full `packages/web/tests/unit/components/career-playbook/viewer.test.tsx` was not rerun in full by this reviewer because handoff already records known baseline failures from missing closed `mc2-db696.90`; numeric-scoped viewer tests passed.
- No browser/E2E check was run for actual scroll/focus behavior in a rendered page. Unit tests cover the callbacks and DOM calls, but not sticky rail layout, reduced-motion preferences, or mobile inspector ergonomics.
- Missing regression: table-based timeline/duration values should be covered once the table filter is refined.

# Risks / Follow-ups

- Fix now: refine backend table filtering so useful timeline/duration values in tables are retained while row-number/checklist noise stays suppressed.
- Track follow-up: share the numeric fact DOM-id helper between `PlaybookViewer` and `MarkdownRendererFull`.
- Track follow-up: replace regex-derived compact status labels with explicit short i18n labels.
- Track follow-up: bound or group the right-rail numeric review list if real playbooks produce many actionable numbers.
- Verification follow-up: reconcile the reviewer `pnpm build` failure with the prior passing handoff build before delivery.

## Exact commands run

```bash
sed -n '1,260p' /home/me/code/mc2/.agents/skills/code-review/SKILL.md
sed -n '1,240p' /mnt/c/Users/masle/.codex/superpowers/skills/using-superpowers/SKILL.md
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git diff --stat
git diff --name-only
git diff --cached --name-only
bd show mc2-db696.93
sed -n '1,260p' AGENTS.md
sed -n '1,260p' .codex/orchestrator.toml
sed -n '1,260p' .codex/handoff.md
sed -n '1,260p' .codex/project-index.md
sed -n '1,260p' graphify-out/GRAPH_REPORT.md
ls -la .codex/stages/mc2-db696.93
git rev-parse HEAD
graphify query "Career Playbook numeric review changed files correctness risks improvement opportunities PlaybookViewer MarkdownRendererFull numeric-facts" --graph graphify-out/graph.json --budget 2000
git log --oneline -10 -- packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts packages/course-gen-platform/tests/unit/stages/stage-career-playbook/numeric-facts.test.ts packages/web/app/[locale]/career-playbook/[id]/page-client.tsx packages/web/components/career-playbook/viewer/PlaybookViewer.tsx packages/web/components/markdown/MarkdownRendererFull.tsx packages/web/messages/en/career-playbook.json packages/web/messages/ru/career-playbook.json packages/web/tests/unit/components/career-playbook/viewer.test.tsx packages/web/tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx
git diff -- packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts
git diff -- packages/web/components/career-playbook/viewer/PlaybookViewer.tsx
git diff -- packages/web/components/markdown/MarkdownRendererFull.tsx
git diff -- packages/course-gen-platform/tests/unit/stages/stage-career-playbook/numeric-facts.test.ts
git diff -- packages/web/app/[locale]/career-playbook/[id]/page-client.tsx
git diff -- packages/web/messages/en/career-playbook.json packages/web/messages/ru/career-playbook.json
git diff -- packages/web/tests/unit/components/career-playbook/viewer.test.tsx
git diff -- packages/web/tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx
rg -n "numeric_facts|CareerPlaybookNumericFact|numericFact" packages/shared-types packages/web packages/course-gen-platform/src/stages/stage-career-playbook packages/course-gen-platform/tests/unit/stages/stage-career-playbook -g '!**/node_modules/**'
nl -ba packages/web/components/career-playbook/viewer/PlaybookViewer.tsx | sed -n '340,390p'
nl -ba packages/web/components/career-playbook/viewer/PlaybookViewer.tsx | sed -n '500,545p'
nl -ba packages/web/components/career-playbook/viewer/PlaybookViewer.tsx | sed -n '1290,1455p'
nl -ba packages/web/components/career-playbook/viewer/PlaybookViewer.tsx | sed -n '1688,1912p'
nl -ba packages/web/components/markdown/MarkdownRendererFull.tsx | sed -n '480,725p'
nl -ba packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx | sed -n '150,215p'
nl -ba packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx | sed -n '1,150p'
pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer-page-client.test.tsx
nl -ba packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts | sed -n '1,460p'
nl -ba packages/shared-types/src/career-playbook.ts | sed -n '440,490p'
pnpm --filter @megacampus/course-gen-platform exec tsx -e "import { extractCareerPlaybookNumericFacts } from './src/stages/stage-career-playbook/numeric-facts'; const facts = extractCareerPlaybookNumericFacts({ blockId: 'block_6', content: '| Инициатива | Срок |\\n| --- | --- |\\n| Запуск пилота | 2 недели |', evidenceText: '' }); console.log(JSON.stringify(facts, null, 2));"
pnpm --filter @megacampus/course-gen-platform exec tsx -e "import { extractCareerPlaybookNumericFacts } from './src/stages/stage-career-playbook/numeric-facts'; const facts = extractCareerPlaybookNumericFacts({ blockId: 'block_6', content: '| KPI | Value |\\n| --- | --- |\\n| Win rate | 18% |', evidenceText: '' }); console.log(JSON.stringify(facts, null, 2));"
rg -n "aria-label=.*Open|scrollIntoView|focus\\(|get.*DomId|data-.*id|SkipNumeric|isMarkdownTableLine|numericFact.*Label|review list|ScrollArea" packages/web/components packages/web/tests packages/course-gen-platform/src packages/course-gen-platform/tests -g '!**/node_modules/**'
TMPDIR=/tmp pnpm --filter @megacampus/course-gen-platform exec tsx -e "import { extractCareerPlaybookNumericFacts } from './src/stages/stage-career-playbook/numeric-facts'; const facts = extractCareerPlaybookNumericFacts({ blockId: 'block_6', content: '| Инициатива | Срок |\\n| --- | --- |\\n| Запуск пилота | 2 недели |', evidenceText: '' }); console.log(JSON.stringify(facts, null, 2));"
TMPDIR=/tmp pnpm --filter @megacampus/course-gen-platform exec tsx -e "import { extractCareerPlaybookNumericFacts } from './src/stages/stage-career-playbook/numeric-facts'; const facts = extractCareerPlaybookNumericFacts({ blockId: 'block_6', content: '| KPI | Value |\\n| --- | --- |\\n| Win rate | 18% |', evidenceText: '' }); console.log(JSON.stringify(facts, null, 2));"
git diff --check
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage-career-playbook/numeric-facts.test.ts
pnpm --filter @megacampus/web test -- tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx
pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx -t numeric
pnpm type-check
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key pnpm build
git status --short --branch
find .codex/stages/mc2-db696.93 -maxdepth 2 -type f -print
git diff -- packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx
git ls-files packages/web/.next packages/shared-types/dist packages/shared-logger/dist packages/shared-utils/dist packages/course-gen-platform/dist
git diff --name-only
git diff --stat
git diff -- packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx
git status --porcelain=v1 --untracked-files=all .codex/stages/mc2-db696.93
sed -n '1,240p' .codex/stages/mc2-db696.93/summary.md
mkdir -p .codex/stages/mc2-db696.93/artifacts
```
