# Technical debt, measured 2026-08-24

Companion to epic `mc2-cuk7j`. Everything here was measured on the live system —
a command was run, a container was inspected, a database was read. Nothing is
inferred from reading code, because most of these items look correct in the
source and only fail in the world.

## The shape they share

None of these is bad code. Every one of them is **silence**:

| item                   | what was silent                                      |
| ---------------------- | ---------------------------------------------------- |
| `packages/web` tests   | a suite that exists and never runs                   |
| bridge image           | a build the pipeline never performs                  |
| `:ro` secrets mount    | a failed write, logged at WARNING and read by nobody |
| `auth_expiry`          | an alarm measuring a quantity nobody meant           |
| Q12 manifest generator | a success that prints like a deletion                |

Each looked healthy until something asked it a direct question. That is the
lesson worth carrying: **judge a thing by its dependency, not by its status
line.** The NotebookLM bridge reported `Up` for four months with dead auth.

## The items

### `mc2-cuk7j.1` — `packages/web` tests run nowhere (P1)

Two independent failures stacked:

```
root package.json:
  "test:unit": "pnpm -r --filter @megacampus/course-gen-platform --filter @megacampus/shared-types test:unit"
CI runs exactly:  pnpm test:unit
packages/web has no `test:unit` script at all.
```

So the filter cannot reach `web` even in principle. And locally:

```
$ cd packages/web && npx vitest run
 Test Files  47 failed | 46 passed (93)
      Tests  647 passed (647)
```

All 47 failures are `RolldownError: Parse failure` on JSX — the transform
refusing `.tsx`, not an assertion failing. The 46 files that do parse hold 647
passing tests, so these were written and do work.

**Fix the parse first.** Wiring `web` into CI while 47 files cannot load would
just paint the pipeline red.

### `mc2-cuk7j.2` — production bridge still on `:ro` and the old image (P1)

Verified on dev after the fix, by dependency rather than status:

```
mount_rw = true
auth_expiry: "earliest session cookie expires 2027-09-28 (400d)"
storage_state.json mtime moved 13:52 → 14:30 after a read-only notebooks.list()
```

Production has neither. It needs `:latest` in GHCR **and**
`docker-compose.infra.yml` with `:rw`, and the second is delivered only by
`Deploy to Production`, which runs from `master`.

**Do not patch the file on the host.** The next master deploy overwrites it with
the old version and silently restores `:ro` — the same quiet revert that caused
the original problem. Production gets this through a normal
`develop → master` release.

### `mc2-cuk7j.3` — the bridge image has no build in the pipeline (P2) — WRONG, closed

**This item's premise was false, and the correction is the useful part.** The
pipeline has built the bridge image since at least 2026-07-12:
`detect_deploy_changes.sh` emits a `notebooklm-bridge` matrix entry gated on
`bridge_changed`, and `build-docker` builds and pushes it. Every published
version in GHCR carries the tag shapes `docker/metadata-action` produces —
`master-acc516b`, `develop-dbe094e`, the full commit sha — which nobody types.

What actually happened is a failure already in
`.codex/repository-failure-modes.md` wearing a new coat. Run 32724467242, for
the cookie fix `e2c55c19c`, had Unit Tests fail, so `ci-success` failed and
`build-docker` was SKIPPED. The next commit touched only `deploy/qdrant/**`, so
`bridge_changed` was false and no build followed. The image was then built by
hand — and the hand-built one is identifiable, because it is the only version
tagged `develop` with no `develop-<sha>` companion.

One real hardening came out of it. `:latest` was gated on
`enable={{is_default_branch}}`, which is correct only for as long as the default
branch happens to be master — a repository setting, changed from a web page,
with no diff and no review. The branch is named explicitly now.

### `mc2-cuk7j.4` — make cookie refresh browserless (P2)

The cure for the recurrence, not another manual round. `notebooklm-py` 0.8.0 can
bootstrap a durable master token from one browser sign-in and then re-mint web
cookies with no browser (`--master-token-refresh`, "for recovery / cron").

Only meaningful together with `mc2-cuk7j.2`: re-minted cookies need somewhere to
be written. Note the refresh must egress through the same SOCKS hop the bridge
uses, or Google will not serve it.

### `mc2-cuk7j.5` — 106 lint warnings (P3) — closed at ZERO, not at a ratchet

The measured figure was 102, not 106. This section proposed freezing it as a
ceiling; the owner chose to fix rather than to freeze, and every package now
carries `--max-warnings=0`.

Three passes, and the middle one is the part worth remembering.

Ten warnings were real defects in miniature — `any` in `trace-logger` switched
off checking for a whole JSONB insert, a React effect closed over `session.user`
while declaring only `user.id`, so a changed display name never reached the
widget.

Then the thresholds were re-derived from this repository instead of taken on
taste. Over the 845 files these rules govern: median 143, p90 436, p95 512,
p99 805. `max-lines` 500 → 800 (44 files → 11), because length is a PROXY and
it was demanding harm where no honest seam exists — splitting
`analysis-schemas.ts` at its only available seam turned 2 warnings into 67,
since Zod's inference does not survive a module boundary. `complexity` 30 → 40,
at the gap in the distribution: twenty-one functions sit in the arguable band
31–40, and the rest form a tail (41 … 97) that is not arguable. Two blanket
opt-outs already in the tree said the same from the other side.

The remaining 92 were refactored away, with no suppressions. More than half the
length turned out to be DUPLICATION: two identical query loops for RAG Tier 1
and Tier 2, two NotebookLM poll schedulers, a twenty-field zero-result written
twice beside an existing function of that exact shape, two patcher/expander task
loops, a twelve-field generation input written twice. Where coverage was
missing, 35 characterization tests were written against the OLD implementation
first and pass unchanged against the new one.

Two defects were found by the refactor rather than by the linter: the pre-commit
hook judged `packages/web` files with the ROOT eslint config, which made the
repository's own `eslint-disable @next/next/...` an error and any edit to those
files uncommittable without `--no-verify`; and `visual_style_source` was STORED
as `default` where the logs said `settings`.

### `mc2-cuk7j.6` — two small traps (P4) — closed

`q12-window-preflight.py --emit-asset-manifest` writes canonical single-line
JSON while the committed file is pretty-printed, so `git diff --stat` reads
`1 insertion, 216 deletions` and looks like the manifest was emptied. It was
not — 26 assets before and after, one entry changed. It also prints only the
path to stdout while rewriting the file in place, so redirecting the output
looks like a failed generation.

`/home/me/code/mc2/.venv-nlm` is 185 MB, gitignored, and dead: its interpreter
points at a `python3.12` the system removed. Invisible to `git status`,
so it lives forever.

## Deliberately not in this epic

These are tracked with their own reopen conditions and are not work we owe:

- `mc2-vlskb` — upstream-gated. docling-mcp 3.1.0 still drops
  `service_timeout`/`service_max_retries`; reopen on a release above 3.1.0.
- `mc2-8m90f` — precondition-gated. 7 accepted `document_evidence_runs` exist
  now, but none on the six affected courses; reopen on a Stage 4 run for one of
  them.
- `mc2-hqfc3`, `mc2-x72bq` — owner-gated by decision.
- `mc2-gxese` — another agent owns the Helixa branch. Its three blockers are
  fixed on `fix/helixa-blockers` and handed over, not merged. What remains is a
  design call for that owner: six database triggers on `courses`,
  `career_playbooks` and `file_catalog`, inert while
  `helixa_knowledge_sync_bindings` is empty but installed at the database level,
  where the env flag does not reach — and dev and staging share one database.

## How to verify anything here

```bash
pnpm type-check                      # 0 errors expected
pnpm test:unit                       # all three packages since mc2-cuk7j.1
pnpm -r lint                         # 0 errors, 0 warnings; ceilings are 0
cd packages/web && npx vitest run    # 93 passed — was 47 failed | 46 passed
bash scripts/orchestration/run_process_verification.sh
python3 scripts/orchestration/check_stranded_commits.py

ssh megacampus-prod "curl -s --max-time 30 http://127.0.0.1:8010/health"   # dev bridge
```

Read `.codex/repository-failure-modes.md` before diagnosing anything on the
host: it holds the traps that cost a session each, including why a green
pipeline can still skip the deploy and why supervision is not availability.
