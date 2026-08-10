# Stage `mc2-0ukr6` — dependency security remediation

Status: implementation complete; final release acceptance pending.

## Classification and boundary

Root-owned release stage covering the pinned pnpm dependency graph and the CI audit policy. It may
update root/package manifests, the lockfile, and the security-audit workflow. It excludes unrelated
major upgrades, migrations, reindex, secrets/access changes, and paid or destructive live actions.

## Acceptance intent

- reproduce and classify every advisory from the committed lockfile;
- remove all safely actionable findings, including transitive paths, without blind broad upgrades;
- make CI fail or explicitly bound any remaining advisory rather than hiding audit exit code 1;
- pass one canonical release acceptance, exact-SHA CI, dev deployment, and read-only health checks.

## Implemented result

- The baseline contained 77 advisory entries across 19 packages: 1 critical, 29 high, 38 moderate,
  and 9 low. Independent dependency and security reviews classified production and development
  paths; no exception was justified.
- Direct dependency floors and selector-specific overrides now resolve every affected package to a
  patched version. OpenTelemetry stable packages are aligned at 2.8.0 rather than overriding only
  `core`; Sharp is 0.35.3; Next and its ESLint config are 15.5.21.
- `pnpm audit --json`, `pnpm audit --prod --json`, and `pnpm audit --dev --json` each report zero
  findings and exit 0. `pnpm install --frozen-lockfile` succeeds.
- Security Audit no longer uses `continue-on-error`, and `ci-success` now rejects any security job
  result other than `success`. The focused workflow contract failed before the change and passes
  after it.
- Compatibility evidence is green: Sharp native PNG-to-WebP smoke; Sentry/OpenTelemetry load;
  75 backend Sentry/OLX tests; 35 backend DOMPurify/Mermaid tests; and 47 web Mermaid tests.
- The first release type-check exposed the incomplete TypeScript export map in `sharp@0.35.0`.
  First-party package metadata and Context7 showed corrected ESM/CJS type exports in later 0.35.x;
  `sharp@0.35.3` preserves the required security floor and now passes both the exact type-check and
  the native image smoke.

## Next action

Run the root-owned release closeout, then commit, fetch/prove, push `develop`, and accept only the
exact SHA whose CI/deploy and dev health checks pass.

docs-reviewed: updated - stage and handoff record dependency and fail-closed CI policy truth;
documentation-decision: L1 was queried first for lockfile-routed pnpm 8.15.0, Next 15.5.19, and
Sharp 0.34.5; insufficient topics used Context7, while OpenTelemetry 2.5.0 used explicit-version
L1 then Context7, and reusable fallback findings were persisted where supported.

graph-reviewed: no-change-needed - the task changes the external package graph, not repository code
structure; pnpm lockfile evidence and the parsed workflow contract are authoritative for these paths.
