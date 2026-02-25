# NotebookLM: Refresh Server Auth

## Task

Update `storage_state.json` on the production server with a fresh Google login.
Local auth is NOT affected.

## Steps

1. User runs in WSL terminal:
   ```bash
   cd /home/me/code/mc2
   source packages/course-gen-platform/docker/notebooklm-bridge/.venv/bin/activate
   python scripts/notebooklm-export-auth.py -o /tmp/server_storage_state.json
   ```
2. Chrome opens with temp profile. User logs in with the **server** Google account, presses Enter in terminal.
3. Agent copies to server:
   ```bash
   scp /tmp/server_storage_state.json megacampus-prod:/tmp/storage_state.json
   ssh megacampus-prod "sudo cp /tmp/storage_state.json /opt/megacampus/secrets/notebooklm/storage_state.json && sudo chmod 600 /opt/megacampus/secrets/notebooklm/storage_state.json && rm /tmp/storage_state.json"
   rm /tmp/server_storage_state.json
   ```
4. Agent restarts the bridge on server:
   ```bash
   ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.infra.yml restart notebooklm-bridge"
   ```
5. Agent verifies with smoke test:
   ```bash
   ssh megacampus-prod "docker logs megacampus-notebooklm-bridge --tail=20"
   ```

## Notes

- Output is `-o /tmp/...` so local `secrets/notebooklm/storage_state.json` stays untouched.
- Server path: `/opt/megacampus/secrets/notebooklm/storage_state.json`
- SSH host: `megacampus-prod` (user `claude-deploy`, key `~/.ssh/megacampus/claude-deploy`)
