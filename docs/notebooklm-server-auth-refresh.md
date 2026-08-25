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

## Which route

`--browser chrome` does **not** reuse your logged-in Chrome. Playwright runs
`launch_persistent_context` against a profile directory the tool creates next to `--storage`, so
that flag only swaps the binary (bundled Chromium → system Chrome) and still starts signed out.
The only flag that reuses an existing session is `--browser-cookies`, and it reads a browser on the
**same OS as the CLI**.

That splits into two real routes, and the choice is about where you are already signed in:

- **Route 1 — sign in fresh (WSL).** No admin, nothing to install. Costs one password entry, and
  `--fresh` empties the account picker so the right account is chosen explicitly rather than
  inherited. This is also the cleaner credential: a server session that is not a copy of a personal
  desktop session does not die when that person changes their password.
- **Route 2 — reuse the Windows Chrome login. TRIED 2026-08-24, DOES NOT WORK. Do not spend time
  here again.** Admin turned out to be necessary but not sufficient. Unelevated, `rookiepy` refuses
  up front: `Chrome cookies from version v130 can be decrypted only when running as admin due to
appbound encryption!`. From an elevated PowerShell 7.6.5 that check passes and decryption still
  fails: `Could not decrypt chrome cookies.` — followed by advice about a macOS Keychain, which is
  its own error text taking the wrong branch and is not a hint about this machine. Chrome 151 with
  `app_bound_encrypted_key` in `Local State`; `rookiepy` 0.5.6 handles the older DPAPI key, while
  App-Bound Encryption requires impersonating Chrome's own elevation service. WSL cannot do it
  either — the cookies are bound to the Windows user.

## Route 1 — sign in fresh, from WSL

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

## Route 3 — attach to the running Chrome over CDP. ALSO CLOSED, and closed by design

`run_cdp_capture` in `_auth/browser_capture.py` attaches to a Chrome the operator is already running
(`connect_over_cdp`, loopback only), reuses its existing context, captures `storage_state()` and
closes only the page it opened. No decryption is involved, so App-Bound Encryption should be
irrelevant. It was tried end to end on 2026-08-24 and it cannot work on Chrome 151. **Do not
rebuild it.**

The two halves are the same gate seen from two sides, and you get one or the other, never both:

- Launched **without** `--user-data-dir`, Chrome refuses the debugging port outright — nothing ever
  answers on 9222. That is the Chrome 136+ rule against remote debugging on the default profile.
- Launched **with** `--user-data-dir`, even when the path given is exactly the default one, the port
  opens (`Chrome/151.0.7922.170` answered) — and Chrome then treats the profile as non-default and
  never unlocks the App-Bound-Encrypted cookie store. The attached context reports **0 cookies of
  any kind**, and a tab pointed at NotebookLM lands on
  `accounts.google.com/v3/signin/identifier`.

The profile is not the problem, and neither is geo. Read directly with `sqlite3`, the cookie DB
holds 2498 rows, 104 of them for `google.com`, including `SID`, `SAPISID`, `HSID`,
`__Secure-1PSID` and `__Secure-3PSID` — a complete live session. Windows egress is Amsterdam
(185.200.177.180, NL), the same as WSL. Chrome is simply declining to hand over a session to a
process that asked for a debugging port, which is exactly what App-Bound Encryption was built to do.

Copying the profile to another directory does not help either, and fails one step earlier: the
copied `Local State` key does not decrypt from a new path, so that Chrome comes up signed out and
lands on the same sign-in page.

## Route 4 — master token. BUILT AND LIVE since 2026-08-25. Prefer this.

One browser sign-in, ever; after that the web cookies are re-minted with no browser at all. This is
the cure for an expiry nobody noticed for four months, and the routes above are now only for the
day the master token itself is revoked.

The single sign-in yields a **single-use `oauth_token` cookie**, and it cannot be derived from the
cookies already on the host — different flow, different artifact. There is no unattended headless
Google login, by design.

1. **Owner**, in a browser on a machine Google serves (VPN on): go to
   `https://accounts.google.com/EmbeddedSetup` and sign in as `djbkk68@gmail.com`.

   **The page will appear to hang after "I agree". That is the success state, not a failure.**
   `EmbeddedSetup` is the web half of Android device setup: after consent it tries to hand the
   session to a device that does not exist in a desktop browser, so it simply sits there. The
   library's own capture never waits for that navigation either — `capture_oauth_token` polls the
   cookie jar while the page stays open. At that stalled moment, DevTools → Application → Cookies →
   `https://accounts.google.com` → copy the value of `oauth_token`.

   Incognito is optional. It only empties the account picker so the server account is chosen
   explicitly rather than inherited from a personal session.

2. **Agent** runs the exchange **inside the dev bridge container**, feeding the token on stdin so it
   never reaches argv, the host process list or a shell history. Inside the container the SOCKS
   proxy, the read-write mount and `NOTEBOOKLM_HOME` are all already correct; the host has none of
   python3-venv, uv or a usable pip module.

   The token is short-lived as well as single-use — capture it and spend it in the same few minutes,
   or it comes back `exchange_token rejected the oauth_token`.

3. After that, nothing needs a person. The bridge re-mints on its own schedule
   (`app/master_token_refresh.py`), and a hand-run recovery is
   `notebooklm --storage /app/secrets/notebooklm/storage_state.json login --master-token-refresh`
   — with `--storage` **before** the subcommand. See the runbook for why the position matters.

Note that `login --cdp-url` is read **only** inside the `master_token or master_token_refresh`
branch of `session_cmd.py`, so its oauth capture would hit the same App-Bound-Encryption wall as
route 3; the sign-in half has to happen in a real browser regardless.

## Deployment (either route)

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
- **The server account is `djbkk68@gmail.com`** (owner, 2026-08-24). It had been recorded nowhere —
  not in the docs, not in `bd`, not here — so every refresh started by asking. Both routes take it:
  `--account` for the cookie route, and it is what to type into the sign-in form for the fresh one.
- Local diagnostics: `.venv/bin/notebooklm auth check` and `auth check --test` (adds a network call).
- Never print the contents of `storage_state.json` into a terminal, a ticket or a commit.
