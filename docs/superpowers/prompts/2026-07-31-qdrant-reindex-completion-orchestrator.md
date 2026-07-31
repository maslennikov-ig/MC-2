# Finish the Qdrant cutover

Target runtime: Claude Code CLI, stage `mc2-jz6y0`, `/home/me/code/mc2`, branch `develop` at
`6dcc8d874`, `origin/master` at `bee235d77`, server `megacampus-prod`. Use
`orchestration-bridge:orchestrator-stage`. Read `AGENTS.md`, `.codex/orchestrator.toml`,
`.codex/handoff.md` first. Production is healthy and fully deployed — this is not a rescue.

## Goal:

Give the self-hosted Qdrant its vectors back, then restore the backup guarantees that depend on
them, then retire the abandoned Q12 window track. In order:

**1. Reindex.** `reindex plan|execute|verify` refuses without six exact values
(`reindex-course-embeddings.ts:395-412`): `manifestPath`, `journalPath`, `expectedRecoveryRunId`,
`expectedRecoveryManifestSha256`, `expectedCoverageFingerprint`, `acceptedCoverageAuthority`. Only a
completed, accepted source-recovery run produces them. So: run `deploy/qdrant/source-recovery-run.sh
--operation forward` in ordinary mode — **without** `--q12-db-capability-file`, which is what keeps
the barrier, capability and quiesce contract out of it (`:579-586`). Prove the invocation on a small
scope first. Take its coverage decision through acceptance. Then `reindex plan` against
`course_embeddings_v1`, read the gap report honestly, then `execute`, then `verify`.

Roughly 186 catalogued documents have no source on disk and will not come back from a reindex.
Report the number, name which courses lose document-backed search, and do not let exit code 0 stand
in for success.

**2. Backup guarantees — after vectors exist, not before.** Snapshots and drills of an empty
collection prove nothing, which is why the timers are off. Enable
`megacampus-qdrant-snapshot.timer`, prove a run publishes a `.prom` into
`/var/lib/megacampus/qdrant-metrics`, then the same for `megacampus-qdrant-restore-drill.timer`.
Confirm both alerts clear on their own.

Off-host storage is unconfigured (`QDRANT_SNAPSHOT_STORAGE_MODE=local`, `QDRANT_S3_BUCKET`/`_REGION`
unset) — that is `mc2-jz6y0.13.6` and needs credentials you do not have. If a local-only snapshot
clears a _critical_ alert whose text says "off-host", say so loudly: an alert that has stopped being
true is worse than one that is firing.

**3. Retire the Q12 window track.** `mc2-fxlne` and `mc2-i9h3y` serve only the window; `mc2-0ie27`,
`mc2-y5tgw`, `mc2-zls0f`, `mc2-e21lo`, `mc2-1cxna` are window-only hazards. Decide each individually
with a recorded reason — some still bite the scheduled restore drill or the ordinary deploy. Do not
mass-close.

**4. Config debt.** `mc2-x6en2`: `pnpm lint` excludes the test tree while lint-staged lints it, so a
one-line edit to a large test file is blocked by unfixable pre-existing failures and `eslint --fix`
OOMs at the default heap. Make the two agree. `mc2-jz6y0.13.8` is owner-gated; confirm it is tracked.

## Context:

On 2026-07-30/31 the Q12 live-cutover window was abandoned for an ordinary release, on the owner's
decision — the data here is not precious, it only has to work afterwards. It worked: five migrations
applied, 161 commits deployed, production moved off Qdrant Cloud, pipeline green end to end for the
first time since 2026-07-04.

The load-bearing discovery: **every piece of Q12 machinery is opt-in.** Migrations, reindex, deploy
and source recovery each already have an ordinary path, reached by not passing the Q12 flags. Assume
it exists and look for it before concluding anything needs a window.

Measured 2026-07-31 — re-verify rather than trust:

- Qdrant: physical `course_embeddings_v1`, alias `course_embeddings` → it, **0 points**.
- `file_catalog`: 185 `indexed`, 43 `failed`, 25 `pending`, 8 `indexing` = 261. The "indexed" refer
  to Qdrant Cloud vectors that are gone; the column lies.
- `/opt/megacampus/data/uploads`: 75 files, 91 MB, 1 organisation, 47 course directories.
- `/var/lib/megacampus-source-recovery/state/` and `progress/`: empty — no manifest, no journal.
- Both timers installed 2026-07-17, `disabled / inactive`; metrics directory empty, no `.prom` on
  the host.
- `QdrantSnapshotStale` (critical) and `QdrantRestoreDrillStale` (warning) fire on `absent(metric)`.
  Both are true. They reached Telegram only because the deploy recreated Alertmanager.

How this repository fails, so you do not rediscover it:

- **Errors get discarded.** Three times in two days a failure printed only its own name. When
  something fails without a reason, fix the reporting first — it pays for itself within the hour.
  The reindex CLI now carries a scrubbed detail; that redaction is deliberate and pinned by tests.
- **CI overwrites good server values with stale or empty GitHub ones** — it replaced a live Qdrant
  admin key with an April JWT and wrote an empty `QDRANT_METRICS_GID` over a working value. Check
  what a deploy will write before running it; prefer deriving a value from the host that owns it.
- **Prove it on the host as the user that will run it.** All nine deploy defects were found that
  way, and several contradicted what the code implied.
- **Prove a new guard red before trusting it.** A contract added 2026-07-31 matched only half its
  call sites and stayed green with the bug reintroduced.
- The primary worktree carries unrelated local edits (`AGENTS.md` is rewritten by a `bd` hook).
  Stage explicit paths; never `git add -A`.

Authority: all local edits; Beads; commits on `develop` and ordinary push after gates pass and a
fresh fetch shows the remote neither ahead nor diverged; deploying by merging `develop` into
`master` in an isolated worktree, a now-proven green path; read-only diagnostics against production;
the reindex, which writes only to Qdrant; enabling the two timers; restarting the recovery operator.

Reserved to the owner: off-host S3 or any credential change; database password rotation; anything
that stops production writers; force-push or history rewrite; deleting a Qdrant collection holding
points.

Read-only means read-only. Reference credentials by path, never by value; treat `.env*`,
`secrets/**` and credential stores as value-blocked. Run anything long on the server detached — a
dropped ssh has killed a run here. Take every digest from command output, never retyped from prose.

## Stop rules:

Stop and report rather than improvise when: a coverage or data-loss decision is the owner's; a fix
would require opening the Q12 window after all; a true alert could only be cleared by making it
untrue; the remote is ahead or diverged at push time; the ops suite fails **in isolation** —
failures only under parallelism are known and are not a stop (`q12-live-controller`,
`q12-live-cutover`, `q12-retained-barrier-*`, `qdrant-source-recovery-runtime` all pass individually).

## Output:

Lead with the outcome and the command that verifies it. Then what changed and why, the real command
output behind every completion claim, anything bounded or unprovable and on what evidence, and
plainly whatever is unfinished. State the final count of documents with and without vectors, and
name what the owner must decide.
