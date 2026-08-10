# Stage `mc2-p2908.1` — Node DEP0169 production-build trace

Status: accepted. Acceptance owner: root.

## Boundary

Trace the repeated Node 24 `DEP0169 url.parse()` warning from the successful Next 15.5.21 web
production build to an exact package and call site. Do not upgrade or override a dependency until
the trace and first-party version evidence identify a compatible fix.

## Acceptance intent

- accept a warning-free production build after a compatible proven change; or
- accept a measured reclassification naming the exact owner/call site and explicit upstream or
  version gate;
- preserve the already green production build and avoid unrelated dependency churn.

## Outcome

- `NODE_OPTIONS=--trace-deprecation pnpm --filter @megacampus/web build` traced the repeated warning
  to `ioredis@5.8.2` in `built/utils/index.js:201-208`, where `parseURL()` called Node's legacy
  `url.parse()` while Redis clients were constructed during Next page-data collection.
- ioredis 5.11.0 is the first upstream release that replaces the legacy parser with the WHATWG URL
  API; 5.11.1 also fixes protocol-relative URL parsing. Both direct application dependencies now
  use 5.11.1.
- The initial direct-only update correctly failed type-check because `bullmq@5.66.3` pinned
  ioredis 5.8.2 and exposed a second nominal Redis type. `bullmq@5.80.4` is the first same-major
  release that pins ioredis 5.11.1, so the backend now uses that aligned pair.
- The lockfile contains one ioredis version. Type-check passes, a lazy Redis URL/options smoke test
  passes, the web production build passes with `--throw-deprecation`, and the dependency audit is
  zero.
- A separate warning in `pnpm install`/`pnpm audit` was traced to Corepack's pnpm 8.15.0 bundle,
  before workspace code runs. It is recorded as `mc2-ve1eq` instead of being conflated with the
  application warning.

documentation-decision: docs-resolve - L1 entries for `ioredis@5.8.2` and `bullmq@5.66.3` did not cover the traced parser/version boundary; exact official ioredis v5.11.0/v5.11.1 and BullMQ v5.80.4 release notes plus tagged source were used. Persistence was skipped because both packages already have L1 entries.

docs-reviewed: no-change-needed - manifests, lockfile and this tracked stage artifact record the compatible version boundary; no operator or product workflow changed.

graph-reviewed: updated - local no-API refresh completed with 61,659 nodes, 88,716 edges and 7,353 communities.
