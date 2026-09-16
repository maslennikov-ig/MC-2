# mc2-qa5th: snapshot continuity during deployment

Status: deployed and verified; owner authorized fix and immediate deployment on 2026-09-16.
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
Released v0.31.48 (tag commit b6ac01431716a02a693d1ba1d4f931994361125a).
Production f1742fe211f17933188eaf892ed02e438b04bb4e accepted on green.
Pipeline 35110102224 passed all tests, builds, deploy and monitoring drift checks.
Real snapshot at 2026-09-16 18:04:52 MSK passed with 6856 points, 103021568 bytes,
and matching server/local SHA256. Prometheus recorded epoch 1789571092; no firing
snapshot freshness alerts. API HTTP 200; Qdrant healthy. Live helper/unit hashes
match the release. See acceptance-receipt.json.

Rollback unit backup: /etc/systemd/system/megacampus-qdrant-snapshot.service.mc2-qa5th.bak.
Restore this file under the host operation lock and daemon-reload if the unit must
be reverted. Application rollback entrypoint, if required:
`bash /opt/megacampus/scripts/rollback_blue_green.sh production f1742fe211f17933188eaf892ed02e438b04bb4e`.
No snapshot restore or data migration was performed.

Delivery closeout synchronizes the verified runtime tree to develop with CI skipped
on the synchronization commit only: production acceptance above covers identical
runtime files, and no separate dev rollout is requested. Documentation-only final
receipt updates do not require another release/build/deploy.
Graph-reviewed: blocked for refresh: isolated release worktree has no owned graph;
used the primary repository graph read-only for orientation, preserving its owner state.
