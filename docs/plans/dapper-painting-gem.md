# Plan: Migrate mc2 from WSL to Windows (C:\code\mc2)

## Context

Project currently lives at `/home/me/code/mc2` (WSL Ubuntu). User wants to work via VS Code and AntiGravity directly from Windows filesystem (`C:\code\mc2`). The project is a pnpm monorepo (5 packages: web, course-gen-platform, shared-types, shared-utils, shared-logger) with native dependencies (bcrypt, sharp), 16 bash scripts, and Docker-based infrastructure (Redis, Docling). Latest: v0.31.0 on `develop`.

**Approach**: Fresh `git clone` on Windows + transfer only secrets. Never copy `node_modules/` (Linux binaries won't work on Windows). WSL copy stays as fallback.

---

## Phase 0: Prepare in WSL (ensure remote is up to date)

```bash
cd /home/me/code/mc2
git status                    # all clean after v0.31.0 release
git push origin develop       # ensure remote has everything
```

Create secrets archive for transfer:

```bash
tar czf /mnt/c/Users/$USER/Desktop/mc2-secrets.tar.gz \
  .env.local \
  packages/course-gen-platform/.env \
  packages/web/.env.local \
  secrets/ \
  .claude/local.md
```

Files being transferred:

- `.env.local` (root Supabase/MCP config)
- `packages/course-gen-platform/.env` (backend API keys)
- `packages/web/.env.local` (Next.js env)
- `secrets/notebooklm/` (auth state)
- `.claude/local.md` (SSH details)

---

## Phase 1: Install tools on Windows (if missing)

Check and install in PowerShell:

| Tool            | Check              | Install                                                   |
| --------------- | ------------------ | --------------------------------------------------------- |
| Git for Windows | `git --version`    | https://git-scm.com/download/win                          |
| Node.js 22 LTS  | `node -v`          | https://nodejs.org/ or `winget install OpenJS.NodeJS.LTS` |
| pnpm 8.15.0     | `pnpm -v`          | `npm install -g pnpm@8.15.0`                              |
| Docker Desktop  | `docker --version` | https://docker.com/products/docker-desktop/               |

**Git for Windows install options** (critical):

- Line ending: "Checkout as-is, commit as-is" (`core.autocrlf = false`)
- Enable long paths: YES
- Terminal: MinTTY (provides Git Bash for .sh scripts)

**Node.js install**: check "Automatically install necessary tools" (installs VS Build Tools for bcrypt/sharp native compilation)

**Windows Developer Mode**: Settings > Privacy & Security > For developers > ON (allows symlinks without admin)

Configure git:

```powershell
git config --global core.autocrlf false
git config --global core.longpaths true
git config --global core.eol lf
git config --global core.symlinks true
```

---

## Phase 2: Clone from GitHub

```powershell
mkdir C:\code
cd C:\code
git clone https://github.com/maslennikov-ig/MC-2.git mc2
cd mc2
git checkout develop
git log --oneline -3     # verify matches WSL
```

Why clone, not copy:

- `node_modules/` has Linux ELF binaries (bcrypt, sharp) -- won't run on Windows
- Git symlinks in WSL may not translate to NTFS
- Clean clone guarantees correct file state

---

## Phase 3: Update `.gitattributes` (one-time repo change)

**File**: `.gitattributes`

Current content: only Beads merge strategy. Add cross-platform line ending rules:

```gitattributes
# Beads merge strategy (existing)
.beads/issues.jsonl merge=beads

# Normalize all text to LF in repo, checkout as LF
* text=auto eol=lf

# Shell scripts must always be LF
*.sh text eol=lf

# Binary files
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.webp binary
*.mp3 binary
*.mp4 binary
*.webm binary
*.wav binary
*.woff binary
*.woff2 binary
*.ttf binary
*.pdf binary
pnpm-lock.yaml -diff
```

Commit and renormalize:

```powershell
git add .gitattributes
git commit -m "chore: add cross-platform line ending rules to .gitattributes"
git rm --cached -r .
git reset --hard
```

---

## Phase 4: Transfer secrets

```powershell
cd C:\code\mc2
tar xzf $env:USERPROFILE\Desktop\mc2-secrets.tar.gz
```

Verify:

```powershell
Test-Path .env.local                             # True
Test-Path packages\course-gen-platform\.env      # True
Test-Path packages\web\.env.local                # True
Test-Path secrets\notebooklm                     # True
Test-Path .claude\local.md                       # True
```

Check .env files for any absolute Linux paths (`/home/me/...`) -- most use relative paths or URLs, so should be fine. Delete archive: `Remove-Item $env:USERPROFILE\Desktop\mc2-secrets.tar.gz`

---

## Phase 5: Install dependencies and build

```powershell
cd C:\code\mc2
pnpm install              # fetches Windows-native binaries for sharp, bcrypt
pnpm type-check           # tsc --noEmit across all packages
pnpm -r build             # build shared packages + web + api
```

If bcrypt/sharp fails: install Visual Studio Build Tools with "Desktop development with C++" workload, then `pnpm rebuild`.

---

## Phase 6: Start infrastructure

```powershell
docker compose up redis -d
docker compose ps          # verify healthy
```

---

## Phase 7: Verify

| Check      | Command (PowerShell)          | Expected             |
| ---------- | ----------------------------- | -------------------- |
| Type check | `pnpm type-check`             | 0 errors             |
| Build      | `pnpm -r build`               | All pass             |
| Tests      | `pnpm test`                   | All pass             |
| Frontend   | `pnpm --filter web dev`       | localhost:3000 loads |
| Sharp      | `node -e "require('sharp')"`  | No error             |
| Bcrypt     | `node -e "require('bcrypt')"` | No error             |

---

## Known Limitations

| What                         | Status on Windows               | Workaround                                                               |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `start-dev.sh` (530 lines)   | Won't work (pkill, lsof, pgrep) | Start services separately in terminal tabs                               |
| `pkill`-based npm scripts    | Won't work                      | `Get-Process node \| Where CommandLine -like "*worker*" \| Stop-Process` |
| NLM preflight scripts        | Partial (Git Bash)              | Run from Git Bash terminal in VS Code                                    |
| Deploy scripts (deploy\*.sh) | N/A locally                     | These are for server, not local dev                                      |
| `redis-cli`                  | Not installed                   | `docker exec megacampus-redis redis-cli`                                 |

**Starting dev services without start-dev.sh** (separate PowerShell tabs):

```powershell
# Tab 1 - API:    pnpm --filter course-gen-platform dev
# Tab 2 - Worker: pnpm --filter course-gen-platform dev:worker
# Tab 3 - Web:    pnpm --filter web dev
```

---

## Coexistence: WSL + Windows

Both copies share the same git remote. Rules:

1. Push from ONE environment at a time
2. `git pull` before switching environments
3. Never copy `node_modules/` between them
4. Secrets synced manually if changed (rare)

---

## Summary of Steps

1. `git push` from WSL (ensure remote is current)
2. `tar` secrets to Windows Desktop
3. Install Git, Node 22, pnpm 8.15.0, Docker Desktop on Windows (if missing)
4. `git clone` to `C:\code\mc2`
5. Update `.gitattributes`, commit
6. Extract secrets archive
7. `pnpm install && pnpm type-check && pnpm -r build`
8. `docker compose up redis -d`
9. Verify: frontend, type-check, tests, native modules
10. Open in VS Code: `code C:\code\mc2`
