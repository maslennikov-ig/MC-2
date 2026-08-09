# Stage `mc2-jz6y0.13.6` — off-host Qdrant recovery

Status: accepted locally; repository delivery and owner-authorized deploy pending.

## Classification and boundary

High-risk, root-owned infrastructure integration. The boundary is one encrypted pull from the
latest verified production snapshot to `helixa-new`, bounded retention and resource use there, one
exact-version isolated restore, and success-only monitoring evidence returned to production.

The owner selected the existing second host instead of provisioning S3. That changes the transport,
not the checksum, retention, restore, alerting, or rollback requirements.

## Acceptance intent

- restricted root-owned pull credential; production holds no key to the backup host;
- daily off-peak copy, at most 14 days and 14 generations, 10 GiB free-space floor;
- hidden incoming copy promoted only after exact size and SHA-256 verification;
- Qdrant 1.18.2 exact-digest isolated restore with matching point count;
- independent off-host freshness alerts through the existing Telegram route;
- reversible installation and one measured live proof without reindex or application-data mutation.

## Next action

Create the canonical closeout receipt, commit explicit task-owned paths, deliver `develop`, wait
for green CI, then merge and deploy through the repository commands.

## Measured live evidence

- Production Qdrant: 1.18.2, alias `course_embeddings` -> `course_embeddings_v1`, 13,712 points.
- Restricted key: root-owned private key mode 0600 on `helixa-new`; an attempted `whoami` was
  rejected by the forced command.
- Hardened backup: 142,585,344 bytes, source SHA-256 matched after transfer, and free space remained
  about 48 GiB. Three generations use 409 MiB.
- Restore: exact image digest
  `sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c`,
  Qdrant 1.18.2, green collection, 13,712 points, 6 seconds, no residual container.
- Schedules: daily backup at 04:20 local plus jitter; monthly restore; both enabled and active.
- Limits: CPU/IO weight 10, unit CPU quota 25% of one core, nice 15, idle I/O class, unit memory
  high/max 256/512 MiB; restore container additionally caps CPU, memory, and process count.
- Monitoring: production Prometheus scraped both success timestamps; both new rules are inactive,
  healthy, and routed through the existing Alertmanager configuration.
- Capacity/load hardening: preflight reserves the incoming manifest size above the 10 GiB floor,
  the floor is rechecked before promotion, and a concurrent source export is rejected.
- Metric integrity: the root-owned sticky directory still lets UID 1001 write its own metric, but
  a live probe proved it cannot unlink root-owned off-host evidence.

## Verification evidence

- Focused contract test: 4/4 red before implementation, then green.
- Review-fix contracts: 3/3 red before hardening.
- Selected backup/observability/operator/snapshot/restore tests: 51/51 green.
- Pinned `promtool check rules`: 17 rules, success.
- Pinned `promtool test rules`: success.
- `systemd-analyze verify` on the installed systemd 255 host: success.
- Independent security re-review: PASS, no remaining must-fix or high-value finding.
- `pnpm type-check`: exit 0.
- `pnpm build`: exit 0.
- docs-reviewed: updated Qdrant runbooks and project index.
- graph-reviewed: updated locally with Graphify 0.9.14, code/local mode only.
