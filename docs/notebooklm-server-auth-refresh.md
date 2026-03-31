# NotebookLM: Refresh Server Auth

## Task

Update `storage_state.json` on the production server with a fresh Google login.
Local auth is NOT affected.

## Steps

1. User runs in WSL terminal:
   ```bash
   cd /home/me/code/mc2
   source packages/course-gen-platform/docker/notebooklm-bridge/.venv/bin/activate
   notebooklm login --storage /tmp/server_storage_state.json
   ```
2. Playwright browser opens. User logs in with the **server** Google account, waits for NotebookLM to load, presses Enter in terminal.
3. Agent copies to server:
   ```bash
   scp /tmp/server_storage_state.json megacampus-prod:/tmp/storage_state.json
   ssh megacampus-prod "sudo cp /tmp/storage_state.json /opt/megacampus/secrets/notebooklm/storage_state.json && sudo chmod 600 /opt/megacampus/secrets/notebooklm/storage_state.json && rm /tmp/storage_state.json"
   rm /tmp/server_storage_state.json
   ```
4. Agent restarts both bridges on server:
   ```bash
   ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.infra.yml restart notebooklm-bridge"
   ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.dev.yml restart notebooklm-bridge-dev"
   ```
5. Agent verifies:
   ```bash
   ssh megacampus-prod "docker logs megacampus-notebooklm-bridge --tail=5"
   ssh megacampus-prod "docker logs megacampus-notebooklm-bridge-dev --tail=5"
   ```

## Diagnostics

```bash
# Check local auth status
notebooklm auth check
notebooklm auth check --test   # with network validation
```

## Notes

- Uses `notebooklm login` (Playwright-based) — the official notebooklm-py CLI.
- Output is `-o /tmp/...` so local `~/.notebooklm/storage_state.json` stays untouched.
- Server path: `/opt/megacampus/secrets/notebooklm/storage_state.json`
- SSH host: `megacampus-prod` (user `claude-deploy`, key `~/.ssh/megacampus/claude-deploy`)
- Both PROD bridge (`docker-compose.infra.yml`) and DEV bridge (`docker-compose.dev.yml`) share the same auth file.
