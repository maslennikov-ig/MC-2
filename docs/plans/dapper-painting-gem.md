# Plan: Fix remaining issues after WSL-to-Windows migration

## Context

Migration of mc2 to `C:\code\mc2` was performed by a Windows-side agent. Verification from WSL revealed the migration is ~85% complete with several issues to fix.

## Verification Results

### What was done correctly

- [x] Git clone on develop branch (d4bb9eac matches WSL)
- [x] Secrets transferred (.env.local, course-gen .env, web .env.local, secrets/notebooklm, .claude/local.md)
- [x] `pnpm install` ran (1820 packages in .pnpm store)
- [x] sharp 0.34.5 installed with lib files
- [x] bcrypt 6.0.0 installed with Windows prebuilds (win32-x64)
- [x] shared-types built (dist/ has .d.ts files)
- [x] web built (.next/ exists)
- [x] `start-dev.ps1` created (full PowerShell port of start-dev.sh) -- bonus!

### Issues found

**1. Files with colons (`:`) in names — DELETED on Windows** (NTFS doesn't allow `:`)
8 files in `docs/DeepThink/` and `docs/research/` show as deleted because their filenames contain `:` which is illegal on Windows NTFS. Git can't checkout these files. They need to be renamed in the repo (from WSL).

Files affected:

- `docs/DeepThink/Deep Analysis: Lesson Attachment UI Architecture.md`
- `docs/DeepThink/DeepThink Analysis: Stage 6 Architecture Simplification.md`
- `docs/DeepThink/Follow-up: Contextual Deep-Link Pattern Clarifications.md`
- `docs/DeepThink/Problem: Service Worker causing 502 Bad Gateway after Next.js deployment.md`
- `docs/research/008-generation/Rethinking LLM validation: The case against strict enums alone.md`
- `docs/research/Architecture Decision Report: Adaptive RAG Optimization in Multi-Stage Course Generation Pipelines.md`
- `docs/research/Evidence-Based Pedagogical Architectures for Automated Course Generation: A Systems Engineering Approach.md`
- `docs/research/Optimizing RAG Pre-Screening in Course Generation Pipelines: A Comprehensive Research Report.md`

**2. Shell scripts show as modified (line ending normalization)**
`.gitattributes` `* text=auto eol=lf` is renormalizing .sh files. These are expected diffs and should be committed once to normalize:

- `.claude/scripts/gates/check-bundle-size.sh` (and 2 more gates scripts)
- `.claude copy/scripts/gates/` (same)
- `scripts/download-enrichments.sh`, `migrate-enrichments.sh`, `verify-nginx.sh`
- `packages/course-gen-platform/scripts/test-lesson-generation.example.sh`
- `packages/course-gen-platform/tests/fixtures/run-seed.sh`

**3. `git config` not set on Windows**
`core.autocrlf`, `core.eol`, `core.longpaths` are not configured (returned empty). The global git config wasn't set.

**4. `start-dev.ps1` uncommitted**
Agent created it but didn't commit it to the repo.

---

## Fix Plan (from WSL side)

### Step 1: Rename files with colons in names (WSL)

Rename 8 files that have `:` in their names — illegal on NTFS. Replace `:` with ` -`.

```
docs/DeepThink/Deep Analysis: ...  →  docs/DeepThink/Deep Analysis - ...
docs/DeepThink/DeepThink Analysis: ...  →  docs/DeepThink/DeepThink Analysis - ...
docs/DeepThink/Follow-up: ...  →  docs/DeepThink/Follow-up - ...
docs/DeepThink/Problem: ...  →  docs/DeepThink/Problem - ...
docs/research/008-generation/Rethinking LLM validation: ...  →  ... validation - ...
docs/research/Architecture Decision Report: ...  →  ... Report - ...
docs/research/Evidence-Based Pedagogical ...: ...  →  ... Generation - ...
docs/research/Optimizing RAG ...: ...  →  ... Pipelines - ...
```

### Step 2: Normalize line endings (WSL)

Run `git add --renormalize .` to normalize all line endings per `.gitattributes`, then commit. This fixes the .sh file diffs on Windows.

### Step 3: Commit start-dev.ps1 (WSL via /mnt/c/)

Copy `start-dev.ps1` from Windows clone, add and commit it in WSL, push.

### Step 4: Push all fixes, then `git pull` on Windows

```bash
# WSL
git add . && git commit && git push
```

Then on Windows:

```powershell
cd C:\code\mc2
git pull
```

### Step 5: Set git config on Windows

```powershell
git config --global core.autocrlf false
git config --global core.longpaths true
git config --global core.eol lf
git config --global core.symlinks true
```

## Verification (on Windows after pull)

```powershell
git status         # should be clean (no modified .sh files, no deleted docs)
pnpm type-check    # 0 errors
pnpm --filter web dev  # localhost:3000 loads
```
