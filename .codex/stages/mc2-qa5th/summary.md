# mc2-qa5th: snapshot continuity during deployment

Status: local acceptance passed; rollout pending; owner authorized fix and immediate deployment on 2026-09-16.
Base: origin/master ce8f269fa049e24f6c055fedbe2fff93c95251f8.

## Evidence and scope

Snapshot at 09:16 MSK succeeded. At 13:15 the operator preflight rejected its image
digest; the production env file was refreshed at 13:15:48. The CI workflow writes
that file without the digest before deploy_blue_green.sh resolves it. At 17:21 the
next timer run succeeded with 6856 points and a verified 103021568-byte snapshot.

Preserve the accepted operator digest and metrics GID while atomically publishing
new env content. Retry snapshot failures after five minutes, at most three starts
within 210 minutes. Even three 55-minute timeouts fit inside that bound, and it
expires before the next four-hour calendar run (ten-minute randomization).

## Technical premortem

Verdict: GO WITH CONDITIONS. Env publication affects scheduled recovery consumers;
retry policy affects only the snapshot service. Preserve the recovery lock, secret
file permissions, operator validation, snapshot retention and alert thresholds.

- Confirmed: partial env publication prevents backups. Test atomic replacement and
  retention of valid host-derived values; fail closed without changing the live file.
- Plausible: unbounded retries overload recovery after persistent errors. Bound
  starts across the worst-case service timeouts; verify unit with host systemd.
- Executor error: deploying the dirty primary tree would ship unrelated work. Use
  isolated branch from current master and inspect the release diff before push.
- Recovery: retain the previous installed unit, restore it and daemon-reload on
  unit failure. Application rollout retains repository blue/green rollback with
  the exact failed release SHA. Never restore a snapshot over the live collection.

## Acceptance and delivery

Passed: env publication regressions (including held descriptor/inode proof), CI/CD
workflow gates, color env contract and tests; host systemd-analyze verify; diff check.
Pending: tagged release, pipeline completion, live unit/hash and successful snapshot proof.
Graph-reviewed: blocked for refresh: isolated release worktree has no owned graph;
used the primary repository graph read-only for orientation, preserving its owner state.
