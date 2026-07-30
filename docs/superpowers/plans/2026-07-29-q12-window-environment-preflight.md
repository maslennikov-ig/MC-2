# Q12: establish the window's environment before opening it, not by opening it

Date: 2026-07-29
Stage: `mc2-jz6y0`
Beads: `mc2-bh3ef` (P0), `mc2-rjy9k` (P1), `mc2-urw5d` (P3); blocker in flight `mc2-1cxna`;
window `mc2-i9h3y` (owner-gated).

## The problem this plan exists to fix

On 2026-07-29 the live window was opened five times. It advanced from C1 to C4 and produced five
defects. **None of them was logic.** All five were the environment the code runs in:

| #   | Bead            | Where | Cause                                                                                                                                                  |
| --- | --------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `mc2-awi6q`     | C2    | the child demanded `0×64` where the controller carries the predecessor digest; and the controller never published two checkpoint files the child reads |
| 2   | `mc2-1kcbv`     | C2    | writer selection swept whole compose projects — 17 containers instead of 10                                                                            |
| 3   | `mc2-1cxna` (a) | C3    | `HOME=/root` unreadable → libpq cannot stat its default client certificate → every connection refused                                                  |
| 4   | `mc2-1cxna` (b) | C3    | `/proc/self/fd/N` argv paths do not survive the manifest generator's spawn chain                                                                       |
| 5   | `mc2-1cxna` (c) | C4    | `HOME=/root` unreadable → the docker CLI never discovers its buildx plugin → `imagetools inspect --raw` degrades to `unknown flag`                     |

Three of the five are the SAME cause in three different consumers. The frozen
`q12-command-manifest.json` pins `HOME=/root` for every command while the commands run as the
deploy operator, and `/root` is `0700 root-owned`. Any child resolving something under `$HOME`
fails with `EACCES` — which is not the same as "absent", so nothing falls back.

Every one of them was diagnosed **read-only, after the fact, in minutes**. The expensive part was
never the diagnosis; it was the way we reached it.

## What each discovery actually cost

- ~40 minutes of waiting per attempt: CI (11–13 min) → Deploy to Dev → the 30-minute H4 quiet
  window that the dev deploy resets.
- 4–16 minutes of **real production downtime** per attempt past C2, because C2 stops the ten
  writers. Attempt #15 ran both real dumps to completion, so its outage was ~16 minutes.
- One burnt run-id and a full manual unwind each time: the barrier's own `$restore$`, then the ten
  writers replayed from that run's own manifest.

Resuming from the failure point is not available: the controller has seven recover heads and they
all sit on completed-command boundaries (`_RECOVER_RESUME_FROM`, design §6b.2). Every failure so
far landed mid-group, so every failure meant a full unwind.

## The approach

Move this whole class of failure to where it can be established for free.

### Phase 1 — probe the frozen-env surface (`mc2-bh3ef`, P0)

Add a probe group to `deploy/qdrant/q12-window-preflight.py` that measures, for **every** command in
the frozen manifest — not only the ones we have happened to run — under **its exact frozen env** and
as the user that will run it:

1. **`$HOME` is stat-able.** Catches defects 3 and 5 outright, and every future instance.
2. **The docker CLI loads its config and discovers its CLI plugins** under that env.
3. **A libpq client connects** through the pooled DSN under that env.
4. **Argv paths resolve in a child process** — the `/proc/self/fd/N` class (defect 4).

Contract, unchanged from the existing 25 probes: `pass`, `fail`, or `unprovable` **with a named
evidence pointer**; folded into `--scope all` so the gate refuses `live` when any fails.

**Acceptance:** each probe must FAIL against the state that produced the 2026-07-29 defects.
Reinstate the old `HOME` or the old fd path in a scratch copy and prove the probe refuses. A probe
that cannot be shown red is not evidence — that is exactly how `mc2-lzft4` slipped through, where
the probe carried the substitution it was meant to catch.

Extend `docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md`.

### Phase 2 — dry-run the children against the plan's isolate (`mc2-rjy9k`, P1)

Phase 1 catches "this child cannot start in its environment". It does not catch "this child starts
and then fails on its own inputs" — defect 4's shape, and the generation's exact-four-files rule
that the operator suite caught locally.

`plan` already restores the source into a disposable PostgreSQL isolate in docker (`_drill_flow` →
`_restore_via_drill`, with a persist seam). Reuse that isolate as a **target** and drive the real
data-movement children against it: `pg.restore`'s drill, `source.forward`, `reindex.*`,
`deploy.prepare`. No writer stopped, no guard installed, no run-id burnt.

**Bound it honestly.** Anything that depends on production state or on the guard being installed
stays an in-window residual: the barrier's dual-bind, `quiesce_client_backends`, and
`probe_closed_inbound`'s real nginx 502/503 (which needs the api/web writers down). State the bound;
do not paper over it. `q12-w5-production-rehearsal-runner.py`'s docstring already frames this as
residual "#21, bounded to W7" — this phase closes the part of it that does not need the window.

### Phase 3 — stop paying the waiting tax (`mc2-urw5d`, P3)

Pick one: land deliveries the day before and touch nothing under `deploy/**` on window day; or gate
Deploy to Dev while a window is open; or schedule around the deploy cadence. Also batch: open the
window once behind a clean pre-flight, not once per fix.

## Sequencing

1. Phase 1 to green, with each probe shown red against the 2026-07-29 states.
2. Phase 2 for the children the isolate can carry.
3. One window attempt. If it fails, the failure should be something Phases 1–2 genuinely could not
   reach — and that is worth knowing.
4. Hold at `--stop-after deploy.prepare`; C9 and everything past it is the owner's, in person.

## What is already true and must not be re-litigated

- C1, C2 and C3 pass in production. C4's cause is fixed and deployed but **not yet proven in a
  window**.
- The window argv is settled (`.codex/handoff.md` § "Window argv"); the capability is re-minted per
  run root; `--expected-catalog-sha256` is always the `sha256sum` of that root's own catalog file.
- The plan is perishable (`mc2-0ie27`): Supabase Realtime rotates daily `realtime.messages_*`
  partitions on its own timer, which moves the structural catalog the barrier re-measures at C1.
  Keep plan → open to minutes. D1 is the detector and it works.
- Recovery after a failed attempt is routine and proven: barrier `$restore$` (`2f11b8ed…`), then the
  ten writers replayed from that run's own `writer-quiesce-<run-id>.json`.

## The rule behind all of it

The checked environment kept substituting for the consuming one — a probe carried it in
`mc2-lzft4`, a test fixture in `mc2-awi6q` and `mc2-1kcbv`, and a frozen env variable in
`mc2-1cxna`. Model the constraint, never the convenience.
