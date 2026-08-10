# Stage `mc2-ve1eq` — pnpm Node 24 deprecation removal

Status: accepted. Acceptance owner: root.

## Boundary

Replace the pinned pnpm 8.15.0 toolchain with the smallest compatible maintained major that removes
the measured Node 24 `DEP0169` warning. Keep the packageManager pin, active CI and lockfile format
aligned, and make any pnpm 10 lifecycle-script policy explicit so clean installs preserve required
native builds and the prior explicit-script-only project behavior.

## Acceptance intent

- `pnpm install --frozen-lockfile` and `pnpm audit --json` emit no `DEP0169` under Node 24;
- packageManager, engine requirement, active CI and lockfile agree on pnpm 10.34.5;
- type-check and production build remain green;
- disabled historical workflows and immutable prior evidence remain untouched.

## Outcome

- pnpm 8.15.0 and the last v9 release, 9.15.9, both reproduce `DEP0169` from the bundled
  `toNerfDart()` call during frozen install under Node 24.18.0. pnpm 10.34.5 completes frozen
  install and audit with deprecations promoted to errors.
- `packageManager`, the pnpm engine, active CI and lockfile now agree on pnpm 10.34.5. Historical
  disabled workflows and prior evidence were not rewritten.
- A clean temporary clone proved the pnpm 10 install boundary. Six required native/transpiler
  packages are explicitly allowed to build, while `strictDepBuilds` makes any future unreviewed
  install script fail closed. No dependency build remains ignored.
- `enablePrePostScripts: false` preserves the accepted pnpm 8 explicit-script-only behavior. This
  avoids implicitly running the existing `prebuild`, whose generator source is intentionally
  ignored and unavailable in a clean checkout; the explicit `generate:config-seed` command remains.
- The clean backend and web production builds pass. The active CI contract test binds every pnpm
  setup step to the shared version pin and protects the build allowlist/settings.

documentation-decision: docs-resolve - pnpm 8.15.0 L1 did not cover the Node 24 parser boundary and pnpm 10.34.5 L1 was missing; official pnpm compatibility/settings/approve-builds documentation plus direct Node 24 measurements selected the latest v10 patch, pnpm 10.34.5. The exact migration facts were persisted as L2 for pnpm 10.34.5.

docs-reviewed: no-change-needed - packageManager, workspace settings, CI contract test and this tracked artifact are the durable repository contract.

graph-reviewed: no-change-needed - package-manager and CI configuration do not change application architecture.
