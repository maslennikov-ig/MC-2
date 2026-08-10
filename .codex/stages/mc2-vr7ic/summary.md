# Stage `mc2-vr7ic` — local commit and closeout safety

Status: accepted. Acceptance owner: root.

## Boundary

Fix the two local quality-gate false positives discovered by the accepted formatting stage:
format-only staged source files and intentionally tracked ignored goal snapshots in the normal
pre-commit path, plus intentional debt-marker literals in test fixtures during stage closeout.

## Acceptance intent

- a staged file that is exactly canonical `Prettier(HEAD)` does not inherit legacy lint debt;
- a real staged source change still runs ESLint and a new lint error blocks the hook;
- an already tracked `.codex/goals` snapshot can be formatted and force-restaged safely;
- intentional test-fixture markers do not block closeout, while production markers still do.

## Outcome

- The hook compares staged lintable source with canonical `Prettier(HEAD)`: formatting-only files
  skip inherited ESLint debt, while new and semantic source changes still run ESLint.
- A pre-hook helper formats and force-restages only exact already staged
  `.codex/goals/*/scope-criterion-snapshot.json` paths; lint-staged excludes those ignored files.
- The closeout debt scan skips only the two placeholder-validator fixtures and its own scanner
  regression test. A marker added to production source remains blocking.
- Node and Python red/green tests pass, and the complete staged set passes the normal hook through
  `sh .husky/pre-commit`.

documentation-decision: docs-resolve - `lint-staged@17.0.7` had no L1 entry; the exact installed first-party README and source were used, then persisted as L2.

docs-reviewed: no-change-needed - repository-local code, comments, focused tests and this stage artifact are the durable contract; no product or operator documentation changed.

graph-reviewed: updated - local no-API refresh completed with 61,650 nodes, 88,709 edges and 7,345 communities.
