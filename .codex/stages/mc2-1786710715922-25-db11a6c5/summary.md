# Stage mc2-1786710715922-25-db11a6c5 — Role Guide audiences and repetition

Date: 2026-08-29

Status: accepted. Acceptance owner: root.

Level: integration

Delivered implementation: `bf7de071f` on `develop`

## Outcome

One stored Role Guide now projects into employee, manager and HR views plus the unchanged full
document. The canonical section-3 audience map remains unchanged at 20 / 20 / 14 stored blocks;
their union is all 27 ids. `final_markdown` remains the complete document and no schema, migration,
reindex, secret/access setting or canonical topic changed.

`do_not_repeat` no longer trusts model output. Canonical normalization derives it from topic aliases
and shared view membership. Each target block receives only completed prior blocks that share one
of its views. The final-only semantic judge compares block pairs only inside a shared view and
paragraphs only inside their own block at the fixed baseline threshold 0.85. Provider exhaustion
fails closed, and Jina receipts survive in `career_playbooks.cost_breakdown`.

## Measured acceptance

The 14-playbook baseline contained 8 / 6,594 too-close within-view block-pair occurrences (0.12%)
and 18 / 6,829 too-close within-block paragraph pairs (0.26%). On the accepted exact dev playbook,
both fell to zero: 0 / 471 and 0 / 375. Maximum similarity fell from 0.8784 to 0.8316 for view pairs
and from 0.9456 to 0.8096 for within-block paragraphs.

Root read employee, manager, HR and full Markdown from start to finish. The views contain
20 / 20 / 14 / 27 stored blocks and 64,116 / 71,201 / 47,343 / 94,878 bytes. The audience union
equals the full set, the full assembly exactly matches persisted `final_markdown`, Markdown fences
and tables are structurally complete, and no raw template or unfinished-work marker remains. Phase
C was not needed: the manager view is the largest audience document and already
contains the assurance, risk, continuity and implementation material.

The accepted row settled at $0.073384245 across 34 node-cost records. Two
`semanticRepetition` Jina rows contain 49,026 input tokens and $0.0024513; unknown-cost attempts are
zero. Exact-id cleanup then removed the playbook and job-status rows and a read-only follow-up
returned 0 / 0. Gitignored editorial and smoke artifacts remain local.

## Paid-run exception

The first dev generation cost $0.061542307 and passed structural smoke checks, but the separate
exact semantic acceptance found a 0.8855 final maximum. This exposed a real regeneration-window
cap defect, so the result was rejected and the row was removed. Commit `bf7de071f` made the final
semantic verdict fail closed. The owner explicitly authorized the required second paid dev
generation; it passed. No third generation was run. Combined recorded generation cost was
$0.134926552.

## Verification and delivery evidence

- Local root acceptance: `pnpm type-check` and `pnpm test:unit` passed on the accepted code.
- Exact-SHA GitHub Actions run `33255733240` passed lint, type, unit, integration, contract and
  build checks for `bf7de071f`; Deploy to Dev passed.
- Independent correction review found no remaining actionable finding.
- Baseline, final exact measurement and the editorial/cost record are tracked under
  `docs/career-playbook/`.
- The section-3 audience checkboxes were not changed.

docs-reviewed: updated - stable Career Playbook docs now describe audience projections, the
audience-scoped fail-closed gate, the baseline/final measurements, the paid-run exception and exact
cleanup evidence.

project-index: reviewed-no-change - no new package, service, route, operator command or ownership
boundary was added; the existing Career Playbook README remains the stable entrypoint.

Documentation: Context7/first-party fallback for `@radix-ui/react-tabs@1.1.13` was used only after
the lockfile-routed L1 query was missing and was persisted into L1; all remaining behavior is
repository-owned.

graph-reviewed: updated - Graphify 0.9.45 rebuilt the local code graph without external semantic or
label APIs to 61,004 nodes, 94,488 edges and 4,163 communities. A focused query resolves the
audience catalogue, view docs, `audience-scope.ts`, `prior-blocks-digest.ts`,
`semantic-repetition.ts` and `cross-block-judge.ts`; excluded runtime/noise source count is zero.

## Explicit defers

None for this stage.
