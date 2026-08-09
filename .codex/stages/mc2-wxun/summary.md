# Stage `mc2-wxun` — Tier 1 shadow retrieval observability

Status: accepted locally; commit pending.

## Classification and boundary

Root-owned Stage 6 instrumentation shared by `mc2-wxun` and `mc2-vjbb`. The boundary stops before
any live cohort, production measurement, threshold calibration, or retrieval-output change.

## Acceptance intent

- fail closed to a zero shadow rate unless an operator explicitly configures a valid bounded rate;
- select a stable lesson cohort only after a genuine Tier 1 exit;
- record an unthresholded raw dense Tier 1 max score and exact active-hybrid Tier 2 result count
  without logging content;
- preserve tenant/evidence filters and keep shadow failures non-influential;
- prove behavior deterministically and pass focused checks, type-check, and build.

## Evidence

- red: the enabled test cohort made only the two active Tier 1 queries and emitted no shadow trace;
- green: 5 Stage 6 RAG test files / 56 tests passed;
- focused formatting and lint passed with no errors; `pnpm type-check` and `pnpm build` passed;
- the documented default remains `RAG_SHADOW_RETRIEVAL_RATE=0`.

## Next action

Commit the instrumentation, then begin overall delivery closeout. Do not enable the cohort.

project-index: reviewed-no-change — no stable navigation entrypoint changes.

docs-reviewed: updated - the backend environment example and Stage 6 README define the zero-default
rollout, query modes, trace fields, and live authorization boundary.

documentation-decision: no external/versioned boundary - all behavior and configuration are owned
by this repository; the operator contract still requires a tracked local documentation update.

graph-reviewed: updated - local Graphify refresh completed at 61489 nodes and 7333 communities; no
external semantic/model backend was used.
