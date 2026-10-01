---
schema_version: orchestration-artifact/v1
task_id: security-patch
stage_id: mc2-v9c3k
repo: mc2
branch: codex/price-notice-security
base_branch: origin/develop
base_commit: 67c71c999cdc7412d6c0fba778087c6f4c6c03e4
worktree: /home/me/code/mc2/.worktrees/price-notice-security
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: clean task-owned worktree removed; source branch retained for recovery because delivery is cherry-pick 342f0381a, not ancestry merge; dependency patch-id equals ee399168a and 342f0381a is contained in origin/develop
risk_level: medium
verification:
  - "pnpm install --frozen-lockfile: passed"
  - "pnpm audit --audit-level=high: passed; 0 high and 0 critical"
  - "pnpm audit --json: 1 low and 11 moderate remain; exit 1 reflects the default lower threshold"
  - "pnpm --filter @megacampus/course-gen-platform list axios --depth 0: resolved axios@1.20.0"
  - "pnpm why undici brace-expansion: resolved patched versions in the dependency graph"
  - "git diff --check: passed"
changed_files:
  - package.json
  - packages/course-gen-platform/package.json
  - pnpm-lock.yaml
  - .codex/stages/mc2-v9c3k/artifacts/security-patch.md
explicit_defers:
  - "mc2-5hqt3: unrelated low/moderate advisory debt remains for follow-up"
---

# Summary

The saved pre-change audit had 5 low, 22 moderate, 16 high, and 0 critical findings. The exact
release blockers came from four dependency families: `fast-uri`, both major lines of `undici`, both
major lines of `brace-expansion`, and direct `axios`. Existing root overrides pinned vulnerable
patches; the platform's `axios@^1.18.0` resolved to vulnerable `1.19.0`.

Pinned the patched releases: `fast-uri@3.1.7`; `undici@6.28.1` and `7.29.1`; `brace-expansion@1.1.20`
and `2.1.6`; and direct `axios@^1.20.0` resolving to `1.20.0`. The current audit is 1 low,
11 moderate, 0 high, and 0 critical. High blockers are cleared; the remaining 12 findings are
outside the changed versions or are separate lower-severity advisories.

Compatibility: all updates stay within their existing major lines. `undici@7.29.1` retains the
existing `node >=20.18.1` requirement of `7.29.0`; CI uses Node 22. No API migration was needed.
The repo-wide `engines.node >=20.0.0` declaration remains broader than this existing transitive
requirement and merits a separate policy review.

Advisory sources: [fast-uri GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3),
[fast-uri GHSA-58mr-gqgx-xq4g](https://github.com/advisories/GHSA-58mr-gqgx-xq4g),
[undici GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5),
[undici GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3),
[brace-expansion GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7),
[brace-expansion GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p),
[Axios GHSA-c29m-xwm3-cm6r](https://github.com/advisories/GHSA-c29m-xwm3-cm6r),
[GHSA-mghh-pgcx-3jjj](https://github.com/advisories/GHSA-mghh-pgcx-3jjj),
[GHSA-x97p-jq2g-jp4f](https://github.com/advisories/GHSA-x97p-jq2g-jp4f),
[GHSA-3pq3-5fj3-cg6v](https://github.com/advisories/GHSA-3pq3-5fj3-cg6v),
[GHSA-542g-h47m-68v8](https://github.com/advisories/GHSA-542g-h47m-68v8),
[GHSA-m8m8-qj5v-23w3](https://github.com/advisories/GHSA-m8m8-qj5v-23w3),
[GHSA-r4gj-5m52-g5wh](https://github.com/advisories/GHSA-r4gj-5m52-g5wh). Exact release metadata was checked through the npm registry.

# Verification

The frozen install accepted the generated lockfile. The unchanged high/critical audit gate passed.
The machine-readable audit exits 1 because lower-severity findings remain; it reports zero high and
critical findings. The dependency graph confirms direct Axios 1.20.0 and the patched transitive
versions. The lockfile diff changes only the four target dependency families, the Axios importer, and
the corresponding snapshots.

Documentation decision: record patch/minor security updates in manifests and lockfile; no API
migration and no security-gate weakening. Root owns final CI acceptance and deployment.

# Risks / Follow-ups

The remaining 11 moderate findings and 1 low finding are unchanged debt tracked under `mc2-5hqt3`;
four moderate `ip-address` advisories remain on the platform path through `express-rate-limit` and
deserve priority review for runtime exposure. No unrelated packages were upgraded. Root must run
the release acceptance before deployment.
