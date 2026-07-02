# Stage Summary: mc2-irt6v

Status: blocked
Date: 2026-07-02
Branch: `develop`
Issue: `mc2-irt6v` Restore dev and staging site availability

## Outcome

Dev and staging are both down because the shared VPS/network perimeter is unreachable. The evidence points below Docker/nginx/application level: `95.81.98.230` does not answer on SSH, HTTP, or HTTPS from local and independent global probes.

## Evidence

- `ai.megacampus.ru` and `dev.ai.megacampus.ru` both resolve to `95.81.98.230`.
- Local `curl -I` to both public URLs timed out.
- `ssh megacampus-prod` timed out on port `22`.
- Ping had `100% packet loss`.
- `nc` to `22`, `80`, and `443` timed out.
- Windows `Test-NetConnection` failed for `22` and `443`.
- check-host global probes timed out for TCP `22`, `80`, `443`, and HTTP checks for both domains.
- Latest `develop` and `master` GitHub Actions CI/CD runs on 2026-06-28 succeeded.

## Blocker

No local provider CLI/API or documented out-of-band reboot path is available. The next required action is provider-panel/console recovery for VPS `95.81.98.230`; repo-level recovery commands require SSH.

## Recovery Path After SSH Returns

```bash
cd /opt/megacampus
docker compose -f docker-compose.infra.yml up -d
docker compose -f docker-compose.app.yml --env-file .env.$(cat active_color) up -d --force-recreate
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.dev.yml up -d
sudo nginx -t && sudo nginx -s reload
```

Then verify localhost and public health endpoints for both environments.

## Closeout Markers

docs-reviewed: updated - `.codex/handoff.md` and this summary record the incident boundary and recovery steps.
project-index: reviewed-no-change - no stable repo navigation or entrypoint changed.
graph-reviewed: no-change-needed - Graphify report was used for orientation; no code/architecture update was made.
