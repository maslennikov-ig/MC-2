# Code Review Report: start-dev local NotebookLM bridge option

- Date: 2026-02-20
- Scope: Add optional local NotebookLM bridge startup to `start-dev.sh`

## Problem

`start-dev.sh` started API/workers/web only. Stage 7 NLM handlers require reachable `NOTEBOOKLM_BRIDGE_URL`; without explicit setup devs either hit remote bridge (if URL points remote) or get runtime failures.

## Implemented Change

### File changed

- `start-dev.sh`

### Behavior

- Added CLI flag: `--with-nlm-bridge`
- When enabled, script:
  - resolves bridge vars from env or `packages/course-gen-platform/.env`
  - validates `NOTEBOOKLM_BRIDGE_TOKEN`
  - starts local container `megacampus-notebooklm-bridge-local` on `127.0.0.1:8010`
  - exports `NOTEBOOKLM_BRIDGE_URL=http://127.0.0.1:8010` for local API/workers
  - prints bridge endpoint in startup summary
  - stops the bridge container on shutdown only if script started it

## Verification

- Syntax check:

```bash
bash -n start-dev.sh
```

- Expected usage:

```bash
./start-dev.sh --with-nlm-bridge
```

## Notes

- Default behavior remains unchanged (no bridge startup without flag).
- If token/storage are not configured, script fails fast with actionable message.
