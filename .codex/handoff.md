# Orchestrator Handoff

Updated: 2026-07-02
Stage: `mc2-irt6v` Restore dev and staging site availability
Branch: `develop`
Beads: `mc2-irt6v` blocked

## Current State

- `mc2-irt6v`: `https://ai.megacampus.ru` and `https://dev.ai.megacampus.ru` are both unavailable. DNS for both domains resolves to `95.81.98.230`.
- Root-cause boundary found: the VPS/network perimeter is unreachable, not a known application/container/CI failure. Local checks timed out for both public URLs; `ssh megacampus-prod` to `95.81.98.230:22` timed out; ping had 100% packet loss; TCP probes to `22`, `80`, and `443` timed out.
- Independent global check-host nodes timed out for TCP `22`, `80`, `443`, and HTTP checks against both stage and dev domains.
- Latest GitHub Actions CI/CD runs for `develop` and `master` on 2026-06-28 were successful, so there is no current evidence of a failed deploy causing this outage.
- Blocker: no documented out-of-band provider/API reboot path is available locally. All repo recovery commands require SSH access to `megacampus-prod`, which is currently unreachable.

## Verification

- `curl -sS -I --max-time 12 https://ai.megacampus.ru`: timed out.
- `curl -sS -I --max-time 12 https://dev.ai.megacampus.ru`: timed out.
- `ssh -o BatchMode=yes -o ConnectTimeout=10 megacampus-prod 'hostname && uptime'`: timed out connecting to `95.81.98.230:22`.
- `ping -c 4 -W 3 95.81.98.230`: 100% packet loss.
- `nc -vz -w 5 95.81.98.230 22 80 443`: all timed out.
- Windows `Test-NetConnection 95.81.98.230 -Port 443` and `-Port 22`: failed via `AmneziaVPN`.
- check-host TCP `443`: Germany, Indonesia, Moldova, Romania, USA all timed out.
- check-host TCP `22`: UAE, Brazil, India, Netherlands, Ukraine all timed out.
- check-host TCP `80`: Switzerland, Netherlands, Russia, Slovenia, USA all timed out.
- check-host HTTP `https://ai.megacampus.ru`: Germany, Hungary, Netherlands, Serbia, USA all timed out.
- check-host HTTP `https://dev.ai.megacampus.ru`: Austria, Bulgaria, Hungary, Iran, Russia all timed out.
- `gh run list --workflow "CI/CD Pipeline" --limit 10`: latest `develop` and `master` deploy-relevant runs from 2026-06-28 are successful.

## Explicit defers

- Actual server recovery is deferred until provider console access, VPS reboot, or SSH/network restoration is available.
- No code/config changes were made because the failure is below the application layer.

## Next recommended

Next stage id: continue `mc2-irt6v`.
Recommended action:

1. Reboot/check VPS `95.81.98.230` from the FVDS/CLODO provider panel or obtain console access.
2. Once SSH returns, run the documented recovery sequence:
   - `cd /opt/megacampus`
   - `docker compose -f docker-compose.infra.yml up -d`
   - `docker compose -f docker-compose.app.yml --env-file .env.$(cat active_color) up -d --force-recreate`
   - `docker compose -f docker-compose.production.yml up -d`
   - `docker compose -f docker-compose.dev.yml up -d`
   - `sudo nginx -t && sudo nginx -s reload`
3. Verify local and public endpoints:
   - `curl -f http://localhost:3010`
   - `curl -f http://localhost:4010/health`
   - `curl -f http://localhost:4001/health` or `4002` according to `active_color`
   - `curl -f https://ai.megacampus.ru/api/health`
   - `curl -f https://dev.ai.megacampus.ru/health`

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2` to continue `mc2-irt6v`. The issue is blocked because VPS `95.81.98.230` is globally unreachable on `22/80/443`; do not start with app debugging until SSH or provider console access is restored. After provider reboot/network recovery, run the documented Docker Compose/nginx recovery sequence and smoke both dev and stage.

## Closeout Markers

docs-reviewed: updated - handoff and stage summary record the ops blocker and recovery path.
project-index: reviewed-no-change - no stable repo entrypoints, routes, integrations, or verification commands changed.
graph-reviewed: no-change-needed - Graphify report was read for repo orientation; no code, architecture, contract, route, or durable workflow change was made.
