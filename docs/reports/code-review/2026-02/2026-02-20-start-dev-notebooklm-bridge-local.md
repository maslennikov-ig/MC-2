# Code Review Report: start-dev always-on local NotebookLM bridge

- Date: 2026-02-20
- Scope: Make local NotebookLM bridge startup mandatory in `start-dev.sh`

## Problem

`start-dev.sh` started API/workers/web only. Stage 7 NLM handlers require reachable `NOTEBOOKLM_BRIDGE_URL`; without explicit setup devs either hit remote bridge (if URL points remote) or get runtime failures.

## Implemented Change

### File changed

- `start-dev.sh`

### Behavior

- `start-dev.sh` now always starts local bridge container `megacampus-notebooklm-bridge-local` on `127.0.0.1:8010`.
- Script resolves bridge vars from env or `packages/course-gen-platform/.env`.
- Script validates `NOTEBOOKLM_BRIDGE_TOKEN` and fails fast if missing.
- Script forces local runtime routing:
  - `NOTEBOOKLM_BRIDGE_URL=http://127.0.0.1:8010`
  - `NOTEBOOKLM_BRIDGE_TOKEN=<resolved token>`
- Bridge endpoint is always printed in startup summary.
- On shutdown, script stops bridge container only if it started it during this session.

## Verification

- Syntax check:

```bash
bash -n start-dev.sh
```

- Expected usage:

```bash
./start-dev.sh
```

## Notes

- Startup now enforces full local Stage 7 path by default.
- If token/storage are not configured, script fails fast with actionable message.
