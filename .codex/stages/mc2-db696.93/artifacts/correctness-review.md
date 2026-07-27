---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: correctness-review
stage_id: mc2-db696.93
agent_type: correctness_reviewer
subagent_model: codex/gpt-5.5
reasoning_effort: high
model_reasoning_rationale: "Correctness review of backend/frontend numeric provenance behavior and verification confidence."
repo: mc2
branch: codex/career-playbook-numeric-review
base_branch: develop
base_commit: 1721a9b482b948f214865ea1bd38cc64d0833929
worktree: /home/me/code/mc2/.worktrees/career-playbook-numeric-review
write_zone:
  - .codex/stages/mc2-db696.93/artifacts/correctness-review.md
success_criteria:
  - Inspect repo truth, Beads mc2-db696.93, git status/diff, changed files, history/usages, and relevant tests.
  - Report material correctness risks only with file:line evidence and concrete fixes.
  - Do not edit implementation files.
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/project-index.md
  - graphify-out/GRAPH_REPORT.md
  - Beads mc2-db696.93
selected_skills:
  - code-review
selected_agents:
  - correctness_reviewer
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
cleanup_notes: "Read-only review; only this artifact was written."
risk_level: medium
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: "Review-only artifact; no durable product docs changed by reviewer."
verification:
  - "SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage-career-playbook/numeric-facts.test.ts: passed"
  - "pnpm --filter @megacampus/web test -- tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx: passed"
  - "pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx -t numeric: passed"
  - "pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer-page-client.test.tsx: passed"
  - "pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx: failed, known baseline quality-warning tests"
  - "pnpm type-check: passed"
  - "SUPABASE_SERVICE_ROLE_KEY=test-service-role-key NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key pnpm --filter @megacampus/web build: passed on retry"
  - "git diff --check: passed"
changed_files:
  - .codex/stages/mc2-db696.93/artifacts/correctness-review.md
explicit_defers:
  - "Full viewer.test.tsx remains red due known mc2-db696.90 baseline not present in this worktree."
---

# Summary

Reviewed the current uncommitted Career Playbook numeric-review diff in `/home/me/code/mc2/.worktrees/career-playbook-numeric-review`.

Verdict: **NEEDS WORK**. The frontend rail/navigation changes are covered by targeted tests, but the backend extractor still falsely verifies low-signal count digits when they appear as substrings inside nearby larger metrics. This violates the task's accepted backend scope.

# Findings

## 1. Medium - Count evidence matching still verifies bare row/list digits from unrelated larger metrics

- **Classification**: must-fix
- **Evidence**:
  - `packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts:129-149` builds evidence windows with `evidence.indexOf(variant)`, so raw count `"1"` matches inside `"18%"`.
  - `packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts:181-195` then accepts that window when it shares context and has business numeric context.
  - `packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts:278-288` allows standalone small counts when the whole surrounding/table line has business context, so a row number in a KPI row is not filtered.
  - Reproduction command run during review:

```bash
TMPDIR=/tmp pnpm --filter @megacampus/course-gen-platform exec tsx -e "import { extractCareerPlaybookNumericFacts } from './src/stages/stage-career-playbook/numeric-facts.ts'; const facts = extractCareerPlaybookNumericFacts({ blockId: 'block_6', content: ['## KPI table','','| № | Metric | Target |','| --- | --- | --- |','| 1 | Win rate | 18% |'].join('\n'), evidenceText: 'Source KPI: Win rate target is 18%.', language: 'ru' }); console.log(JSON.stringify(facts.map(f => ({raw_text:f.raw_text,status:f.status,source:f.source,unit:f.unit})), null, 2));"
```

Output:

```json
[
  { "raw_text": "1", "status": "verified", "source": "source_document", "unit": "count" },
  { "raw_text": "18%", "status": "verified", "source": "source_document", "unit": "percent" }
]
```

- **Impact**: The accepted criterion says the backend should no longer verify bare low-signal table/header/list digits from broad evidence. This still stores a row/list digit as `verified/source_document` because `"1"` is found inside `"18%"`. The current viewer hides `verified` facts, so the row digit is not obvious in the rail, but the persisted provenance is still wrong and downstream consumers would see false source verification.
- **Suggested fix**: Make evidence matching token-aware for count facts. For `kind === 'count'`, match only standalone numeric tokens, not substrings inside percentages, decimals, money, dates, ranges, or larger counts. Also consider table-cell-aware filtering: row-number cells should be skipped even when another cell in the same row contains `%`, `win rate`, `KPI`, etc. Add regression coverage for a business table row like `| 1 | Win rate | 18% |` with source evidence `Win rate target is 18%`, expecting no fact for raw `"1"` and a verified fact for `"18%"`.
- **Expected value**: Prevents false verified provenance while preserving source-backed KPI values.
- **Tradeoff**: Slightly more matching complexity; count facts such as standalone `80 MQL` need explicit coverage to avoid over-filtering.
- **Confidence**: High. The reproduction uses the changed extractor directly and shows the false verification.

# Verification Gaps

- Full `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx` still fails on the known quality-warning baseline from missing `mc2-db696.90`. Numeric-targeted tests pass, but the full viewer suite is not green on this branch.
- The first `pnpm build` run failed transiently with `ENOENT: ... packages/web/.next/build-manifest.json`; rerunning the web build with the same placeholder env passed. This looks environmental/cache-related, not tied to the numeric diff, but it should remain visible in closeout notes.
- No browser/Playwright check was run for actual scroll/focus behavior. Unit tests mock `scrollIntoView` and `focus`; they do not verify real sticky-rail layout or smooth-scroll timing.
- Before the current file state was refreshed, `viewer-page-client.test.tsx` emitted `MISSING_MESSAGE` warnings for the new numeric copy keys. Current test fixture now includes those keys and the rerun passed without those warnings.
- Missing backend regression test for count substring matching: raw count `"1"` must not match evidence value `"18%"`.

# Accepted/Rejected Recommendation

Recommendation: **reject current diff for merge until Finding 1 is fixed**.

Accepted scope:
- Keep the shared schema unchanged.
- Keep the frontend numeric review rail/filtering/navigation direction.
- Keep targeted renderer/viewer tests that cover hidden verified noise, stable DOM ids, and collapsed-block navigation.

Rejected scope:
- Do not accept the backend extractor while it can verify bare count digits via substring matches inside larger metrics.

# Risks / Follow-ups / Explicit Defers

Top risks:

1. False `verified/source_document` numeric facts for low-signal count digits remain possible in KPI/table/list contexts.
2. The branch cannot claim full viewer confidence until either `mc2-db696.90` is integrated or the quality-warning baseline is otherwise reconciled.
3. Scroll/focus behavior is only unit-tested with DOM method mocks, not a real browser layout.

# Exact Commands Run

```bash
pwd && sed -n '1,240p' /home/me/code/mc2/.agents/skills/code-review/SKILL.md
sed -n '1,260p' AGENTS.md
sed -n '1,240p' .codex/orchestrator.toml
sed -n '1,240p' .codex/handoff.md
sed -n '1,260p' .codex/project-index.md
sed -n '1,220p' graphify-out/GRAPH_REPORT.md
bd show mc2-db696.93
git status --short --branch && git diff --name-status 1721a9b4...HEAD && git diff --name-status && git diff --cached --name-status
graphify query "Career Playbook numeric review changed files correctness risks improvement opportunities PlaybookViewer MarkdownRendererFull numeric-facts" --graph graphify-out/graph.json --budget 2000
git diff --stat && git diff -- packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts packages/web/components/career-playbook/viewer/PlaybookViewer.tsx packages/web/components/markdown/MarkdownRendererFull.tsx
git diff -- packages/web/app/[locale]/career-playbook/[id]/page-client.tsx packages/web/messages/en/career-playbook.json packages/web/messages/ru/career-playbook.json packages/course-gen-platform/tests/unit/stages/stage-career-playbook/numeric-facts.test.ts packages/web/tests/unit/components/career-playbook/viewer.test.tsx packages/web/tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx
git log --oneline -10 -- packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts packages/web/components/career-playbook/viewer/PlaybookViewer.tsx packages/web/components/markdown/MarkdownRendererFull.tsx packages/web/app/[locale]/career-playbook/[id]/page-client.tsx packages/web/messages/en/career-playbook.json packages/web/messages/ru/career-playbook.json packages/course-gen-platform/tests/unit/stages/stage-career-playbook/numeric-facts.test.ts packages/web/tests/unit/components/career-playbook/viewer.test.tsx packages/web/tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx
nl -ba packages/web/components/markdown/MarkdownRendererFull.tsx | sed -n '1,220p' && nl -ba packages/web/components/markdown/MarkdownRendererFull.tsx | sed -n '220,820p'
nl -ba packages/web/components/career-playbook/viewer/PlaybookViewer.tsx | sed -n '430,740p' && nl -ba packages/web/components/career-playbook/viewer/PlaybookViewer.tsx | sed -n '1240,1425p' && nl -ba packages/web/components/career-playbook/viewer/PlaybookViewer.tsx | sed -n '1680,1910p'
nl -ba packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts | sed -n '1,460p'
rg -n "numeric_facts|numericFacts|occurrence_index|CareerPlaybookNumericFact|onNumericFactClick|getNumericFactDomId|data-numeric-fact" packages/web packages/course-gen-platform packages/shared-types -g '!**/node_modules/**'
nl -ba packages/course-gen-platform/src/server/routers/career-playbook/library-service.ts | sed -n '780,980p'
nl -ba packages/course-gen-platform/tests/unit/stages/stage-career-playbook/numeric-facts.test.ts | sed -n '1,180p' && nl -ba packages/web/tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx | sed -n '1,130p' && nl -ba packages/web/tests/unit/components/career-playbook/viewer.test.tsx | sed -n '560,870p'
git show 1721a9b4:packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts | nl -ba | sed -n '1,280p' && git show 1721a9b4:packages/web/components/markdown/MarkdownRendererFull.tsx | nl -ba | sed -n '492,720p'
rg -n "numericFactsTitle|numericFactsDescription|numericFactOpenAriaLabel|viewerCopy|ruViewerCopy|enViewerCopy" packages/web/tests packages/web/app packages/web/components packages/web/messages
nl -ba packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx | sed -n '150,220p' && nl -ba packages/web/tests/unit/components/career-playbook/viewer.test.tsx | sed -n '70,130p'
git diff --check
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage-career-playbook/numeric-facts.test.ts
pnpm --filter @megacampus/web test -- tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx
pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx -t numeric
pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer-page-client.test.tsx
git diff -U80 -- packages/web/app/[locale]/career-playbook/[id]/page-client.tsx packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx
git log -p --all -S 'findCareerPlaybookNumericFactOccurrences' -- packages/course-gen-platform/src/stages/stage-career-playbook/numeric-facts.ts packages/course-gen-platform/src/server/routers/career-playbook/library-service.ts | sed -n '1,260p'
pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx
pnpm type-check
git diff --numstat && git rev-parse HEAD && git merge-base HEAD develop || true && git branch --show-current
rg -n "MISSING_MESSAGE|onError|console\\.error|IntlError|NextIntlClientProvider|messages" packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx packages/web/tests -g '*.tsx'
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key pnpm build
git diff -- packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx && nl -ba packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx | sed -n '40,120p' && nl -ba packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx | sed -n '300,340p'
git diff -- .codex/stages/mc2-db696.93 || true && find .codex/stages/mc2-db696.93 -maxdepth 3 -type f -print -exec sed -n '1,220p' {} \;
rg -n "qualityWarnings|qualityIssues|groups structured quality|legacy generation quality|quality-warning|mc2-db696.90" .codex/handoff.md packages/web/components/career-playbook/viewer/PlaybookViewer.tsx packages/web/tests/unit/components/career-playbook/viewer.test.tsx
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key pnpm --filter @megacampus/web build
pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer-page-client.test.tsx
git status --short --branch && find packages/web/.next -maxdepth 2 -name build-manifest.json -o -name app-build-manifest.json 2>/dev/null | sort | xargs -r ls -l
nl -ba packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx | sed -n '170,195p' && nl -ba packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx | sed -n '360,380p'
git status --short --branch && git diff --name-status
git diff -- packages/web/public packages/shared-types packages/shared-logger packages/shared-utils packages/course-gen-platform/dist packages/web/.next 2>/dev/null | sed -n '1,120p'
find .codex/stages/mc2-db696.93 -maxdepth 2 -type d -print && find .codex/stages/mc2-db696.93/artifacts -maxdepth 1 -type f -print 2>/dev/null
rg -n "eslint|no-console|console\\.error" packages/web/tests packages/web/vitest.config* packages/web/eslint.config* eslint.config* package.json packages/web/package.json
TMPDIR=/tmp pnpm --filter @megacampus/course-gen-platform exec tsx -e "import { extractCareerPlaybookNumericFacts } from './src/stages/stage-career-playbook/numeric-facts.ts'; const facts = extractCareerPlaybookNumericFacts({ blockId: 'block_6', content: ['## KPI table','','| № | Metric | Target |','| --- | --- | --- |','| 1 | Win rate | 18% |'].join('\n'), evidenceText: 'Source KPI: Win rate target is 18%.', language: 'ru' }); console.log(JSON.stringify(facts.map(f => ({raw_text:f.raw_text,status:f.status,source:f.source,unit:f.unit})), null, 2));"
TMPDIR=/tmp pnpm --filter @megacampus/course-gen-platform exec tsx -e "import { extractCareerPlaybookNumericFacts } from './src/stages/stage-career-playbook/numeric-facts.ts'; const facts = extractCareerPlaybookNumericFacts({ blockId: 'block_6', content: 'Win rate step 1 should be reviewed. Target win rate: 18%.', evidenceText: 'Source KPI: Win rate target is 18%.', language: 'en' }); console.log(JSON.stringify(facts.map(f => ({raw_text:f.raw_text,status:f.status,source:f.source,unit:f.unit,surrounding:f.surrounding_text})), null, 2));"
sed -n '1,220p' .codex/stage-artifact-template.md
test ! -e .codex/stages/mc2-db696.93/artifacts/correctness-review.md && echo artifact-missing-ok || (echo artifact-exists && sed -n '1,220p' .codex/stages/mc2-db696.93/artifacts/correctness-review.md)
```
