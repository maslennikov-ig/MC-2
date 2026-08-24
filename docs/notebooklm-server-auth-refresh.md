# NotebookLM: Refresh Server Auth

## Task

Replace `storage_state.json` on the production host with a fresh Google login. Both the PROD bridge
(`docker-compose.infra.yml`) and the DEV bridge (`docker-compose.dev.yml`) read that one file.

Cookies expired **2026-03-31**, which is why the last NotebookLM generation is 2026-04-15
(`mc2-3lo22`). Nothing else is broken: the dev bridge `/health` reports `auth_file` passed and
`proxy … reachable`, and only `auth_expiry` fails.

## Before you start

Two things this procedure depends on, both verified 2026-08-24:

- **The login must come from a machine Google serves NotebookLM to.** The owner's WSL laptop egresses
  through Amsterdam (185.200.177.180, NL) and reaches the Google sign-in page rather than a geo
  block. The server's own hop is a different route (SOCKS through `helixa-new`) and is not used for
  login. If the laptop's VPN is off, the login will fail in a way that looks like a broken CLI.
- **The venv is Python 3.12 built by `uv`.** The system python is 3.14 and `python3.14-venv` is not
  installed, so `python3 -m venv` fails on `ensurepip` — recreating it that way is the failure this
  document was written after. Rebuild with `uv venv --python 3.12 .venv`, never `python3 -m venv`.
  The stray `/home/me/code/mc2/.venv-nlm` is dead for the same reason and is not used by anything;
  activating it does nothing but shadow `PATH`.
- **`--storage` must not point into `/tmp`.** `prepare_login_paths` unconditionally runs
  `storage_path.parent.chmod(0o700)`, and `/tmp` is `drwxrwxrwt root root`, so a normal user gets
  `PermissionError: [Errno 1] Operation not permitted: '/tmp'` and the CLI reports only
  `Unexpected error: 1` — no mention of the path, the permission or the directory. The tool also
  writes a `<storage>.browser_profile` directory beside the file. Use a directory the invoking user
  owns; this runbook uses `~/.nlm-auth`.

## Steps

1. **Owner runs in the WSL terminal** (this is the only step that needs a human):

   ```bash
   mkdir -p ~/.nlm-auth && chmod 700 ~/.nlm-auth
   cd /home/me/code/mc2/packages/course-gen-platform/docker/notebooklm-bridge
   .venv/bin/notebooklm login --storage ~/.nlm-auth/server_storage_state.json --fresh
   ```

   If it exits immediately with `Unexpected error: 1`, re-run it with `-vv` before the subcommand
   (`.venv/bin/notebooklm -vv login …`) — the bare message names nothing, and the traceback does.

   A Chromium window opens through WSLg. Sign in with the **server** Google account — `--fresh`
   clears any cached profile, so the account picker starts empty and a previously used personal
   account cannot be picked by accident.

   **Do not press Enter.** From 0.8.0 the CLI detects the login itself and writes the file as soon
   as NotebookLM loads; the older instruction to confirm in the terminal is wrong. Wait until the
   terminal prints that auth was saved, then close the browser if it is still open.

2. **Agent copies it to the host** (`claude-deploy` has NOPASSWD sudo):

   ```bash
   scp ~/.nlm-auth/server_storage_state.json megacampus-prod:/tmp/storage_state.json
   ssh megacampus-prod "sudo cp /opt/megacampus/secrets/notebooklm/storage_state.json /opt/megacampus/secrets/notebooklm/storage_state.json.bak-\$(date +%F) \
     && sudo cp /tmp/storage_state.json /opt/megacampus/secrets/notebooklm/storage_state.json \
     && sudo chmod 600 /opt/megacampus/secrets/notebooklm/storage_state.json \
     && rm /tmp/storage_state.json"
   rm -rf ~/.nlm-auth/server_storage_state.json ~/.nlm-auth/server_storage_state.json.browser_profile
   ```

   The backup line is not decoration: the file is the only copy of that session, and a login that
   captured the wrong account is otherwise unrecoverable without a second browser round.

3. **Agent restarts both bridges:**

   ```bash
   ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.infra.yml restart notebooklm-bridge"
   ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.dev.yml restart notebooklm-bridge-dev"
   ```

4. **Agent verifies against the dependency, not the container state.** A bridge reports `Up` while
   its auth is four months dead, so the check that counts is `auth_expiry`:

   ```bash
   ssh megacampus-prod "curl -s --max-time 30 http://127.0.0.1:8010/health"   # dev bridge
   ```

   All three checks must pass — `auth_file`, `proxy`, `auth_expiry` — and `status` must read `ok`
   rather than `degraded`. Then one read-only call proves the cookies are real and not merely
   unexpired: `notebooks.list()` through the bridge.

## Notes

- Package is `notebooklm-py==0.8.0`, pinned in `requirements.txt`; the CLI is `notebooklm`. The
  browser login needs the extra: `uv pip install --python .venv/bin/python 'notebooklm-py[browser]==0.8.0'`.
- Playwright 1.62.0 wants `chromium-1234`, which is already in `~/.cache/ms-playwright` — no download.
- The flag is `--storage PATH`. An earlier version of this document also said `-o`; that flag does
  not exist.
- Server path: `/opt/megacampus/secrets/notebooklm/storage_state.json`. SSH host `megacampus-prod`
  (user `claude-deploy`, key `~/.ssh/megacampus/claude-deploy`).
- **Which Google account is not recorded anywhere** — not in the docs, not in `bd`, not in the
  runbook. It has to be asked each time. Write it down here once it is known.
- Local diagnostics: `.venv/bin/notebooklm auth check` and `auth check --test` (adds a network call).
- Never print the contents of `storage_state.json` into a terminal, a ticket or a commit.
