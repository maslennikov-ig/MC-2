# Q12 Full Completion — orchestrator prompt (2026-07-16)

Copy everything below the line into a fresh Claude Code (Fable) session opened
in `/home/me/code/mc2/.worktrees/self-hosted-qdrant-platform`. It is a
boundary-crossing launch card for a new orchestrator that runs the entire
remaining Q12 program to a live product.

---

Target: Claude fable-5 completion orchestrator.
Audience: fresh Claude Code session (you launch and coordinate visible subagents).

Use `orchestration-bridge:orchestrator-stage`, complex tier, for epic
`mc2-jz6y0` on branch `codex/self-hosted-qdrant-platform`.

**Goal:** take the self-hosted Qdrant platform from the delivered `.13.7` backup
gate to a live staging product — implement D6 `.13.19` and Root `.13.13`,
publish the operator image, run the live cutover (guarded migrations, source
recovery, reindex, blue/green deploy, nginx switch, barrier activation), bring
up monitoring, run the live smoke, and close out. Nothing skipped; do the whole
program, stopping only at the owner gates below.

**Success criteria:** the nine "done product" criteria in the spec §1 hold on
`megacampus-prod`; every `mc2-jz6y0` lineage Beads item is closed or an
owner-ratified explicit defer in `.codex/handoff.md`; docs, runbook, handoff,
summary, and the Graphify graph are current; branches in sync with origin.

**Context — read first, in order:**

1. `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`.
2. `docs/superpowers/specs/2026-07-16-q12-full-completion-design.md` (umbrella
   spec: goal, phases A–D, task inventory, safety invariants, stop conditions).
3. `docs/superpowers/plans/2026-07-16-q12-full-completion.md` (this program's
   phased, bite-sized plan with write zones and verification).
4. `.codex/stages/mc2-jz6y0/summary.md`, `graphify-out/GRAPH_REPORT.md`.
5. Frozen D6 contract `docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md`
   (byte-identity `2a2251ac…`) and reviewed D6 plan
   `docs/superpowers/plans/2026-07-15-q12-d6-activation-truth.md`.

Resolve `origin/codex/self-hosted-qdrant-platform` at start and trust the
delivered baseline: `.13.7` gate green (daily backup timer + proven isolated
PG17 restore), PG17 document-evidence digests integrated (`b8204cde`), W-tuple
field 11 provisionally frozen (`5836927e`). Do not redo accepted work.

**Constraints:**

- Follow the plan's four phases in order (A local → B publish → C live cutover →
  D closeout); do not begin a phase before its predecessor's acceptance gate.
- Build a compact PDM for Phase A's two disjoint D6 code streams and isolate them
  with `--worktree`; keep the Root join and all live/cutover work in the
  accepted stream. Everything else follows the plan's write zones.
- Superpowers: `test-driven-development` (RED→GREEN→commit) for every code task,
  `systematic-debugging` for failures, `verification-before-completion` before
  any completion claim, `writing-plans` for task-level detail the plan defers.
- Use `orchestration-bridge:prompt-authoring` + `prompt-check` for every
  worker/reviewer prompt; a worker that must author a further prompt uses the
  same gate and reports whether `prompt-check` ran.
- Beads is the only tracker (`.13.19`, `.13.13`, `.13.4.1`, `.13.6`, `.13.8`,
  `.25`, epic `mc2-jz6y0`); no TodoWrite/markdown task lists; `bd dolt push`
  alongside `git push`.
- Safety invariants apply every phase (spec §5): never mutate/recover Qdrant
  Cloud; never expose credentials in prompts/git/argv/logs/env (owner secrets
  stay owner-only 0600 on the server, ingested via stdin); import shared
  contracts only from `@megacampus/shared-types`; do not weaken strict/recovery
  tests, the barrier, or the guarded rollback to force green — a real defect
  gets a real TDD fix plus review (expect this: `.13.7` uncovered 20+
  never-executed operator defects). Provider-plane roles are the accepted
  `.13.14` trusted residual boundary. Preserve the mandated local
  `.claude/settings.json`; do not touch unrelated worktrees.
- Delivery: ordinary push to the integration branch is allowed after fresh
  verification/closeout (fetch first, stop if remote diverged); subagents
  commit/push only their own worktree/branch, never a protected/base branch.

Within Phase A (local, reversible) proceed autonomously — read, edit tracked
files, run local verification, spawn visible worktree subagents, update Beads —
without intermediate confirmations. The one read-only live touch allowed in
Phase A is re-sampling `pg_stat_activity` over the verify-full DSN if field-11
ratification needs it (read-only, no mutation).

**Output:** commit and push each accepted integration slice; keep
`.codex/handoff.md`, the stage summary, and Beads current as you go. End with a
Russian final report: exact commits, live cutover receipts, the monitoring/
eight-alert scrape proof, the `reindex.verify` result, remaining defers with
their owner ratification, and the remote/closeout gate status.

**Stop:** present exact effects, secrets, observation, rollback, and
downtime/data impact, then wait for the owner, at — any remote/live boundary
before its approved packet, the entire Phase C window (Task C0 packet first) and
the
Phase D live smoke/observation; any credentialed action — the GHCR PAT (B1),
off-host S3 credentials (D3), and database password rotation (D2, which the
owner deferred on 2026-07-16 — re-confirm, do not rotate on the strength of a
general "finish it" instruction); a genuine new product-truth gap; an ownership
conflict you cannot isolate to a worktree; or a required gate that keeps failing
after in-scope systematic debugging.

Begin with Phase A, Task A0 (rehydrate and baseline). Start working; do not
preface with a recap.
