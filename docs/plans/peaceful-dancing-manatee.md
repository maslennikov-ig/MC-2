# Plan: Bug Health Check (health-bugs)

**Date**: 2026-02-06
**Branch**: develop
**Version**: v0.28.53
**Last health check**: 2026-01-22 (21 issues, 0 critical, 4 high fixed)

---

## Phase 1: Pre-flight & Beads Init

```bash
mkdir -p .tmp/current/{plans,changes,backups}
bd mol wisp healthcheck   # → save WISP_ID
```

- Validate `pnpm type-check`, `pnpm build` scripts exist
- Init TaskCreate (8 tasks: detection → fix by priority → verify → complete)

---

## Phase 2: Detection

**Subagent**: `bug-hunter`

Scan all packages:

1. `pnpm type-check` + `pnpm build` (static analysis)
2. Security: XSS, SQL injection, hardcoded credentials
3. Debug code: console.log, TODO/FIXME
4. Dead code, unused imports
5. Type safety: explicit `any`, `@ts-expect-error`

**Output**: `docs/reports/bug-health/2026-02/bug-hunting-report.md`

**Exclusions** (false positives):

- `database.types.ts` (auto-generated)
- `node_modules/`, `dist/`, `.next/`
- console.log in `*.test.ts` files

**Expected**: 0 critical, 0-2 high, 40-60 medium, 10-20 low

If 0 bugs → skip to Phase 7.

---

## Phase 2.5: History Enrichment (CRITICAL/HIGH only)

Skip if no CRITICAL/HIGH bugs. Otherwise:

```bash
bd search "{keywords}" --status closed --limit 5
```

Save to `.tmp/current/history-enrichment.json`.

---

## Phase 3: Create Beads Issues

For each bug:

```bash
bd create "BUG: {title}" -t bug -p {1-4} -d "{description}" --deps discovered-from:{WISP_ID}
```

Track mapping: bug → issue ID.

---

## Phase 4: Quality Gate (Pre-fix baseline)

```bash
pnpm type-check && pnpm build
```

Both must PASS before fixing. If FAIL → report to user, EXIT.

---

## Phase 5: Fixing Loop (critical → high → medium → low)

For each priority level:

1. `bd update {ids} --status in_progress`
2. Invoke `bug-fixer` subagent with report + history context
3. Quality gate: `pnpm type-check && pnpm build`
4. If FAIL → rollback from `.tmp/current/backups/`, EXIT
5. If PASS → `bd close {ids} --reason "Fixed in health check"`

### Medium bugs strategy (bulk of work):

- **Group A**: console.log → replace with logger (batch)
- **Group B**: TODO/FIXME → convert to issues or remove stale
- **Group C**: `any` types → add proper types (web package focus)
- **Group D**: Complex refactoring → DEFER to follow-up issues

### Low bugs strategy:

- Missing alt text, unused vars, minor lint warnings

---

## Phase 6: Verification

**Subagent**: `bug-hunter` (verification mode)

Re-scan and compare with Phase 2 results:

- Bugs fixed, remaining, new regressions
- If remaining > 0 AND iteration < 3 → repeat from Phase 2
- If iteration >= 3 → proceed to Phase 7

---

## Phase 7: Final Summary & Close

1. `bd mol squash {WISP_ID}`
2. Create follow-up issues for deferred bugs
3. Generate summary report
4. Session close:
   ```bash
   git add . && git commit -m "fix: health check - N bugs fixed (WISP_ID)" && git push
   ```

---

## Error Handling

- **Quality gate fail**: Rollback from `.tmp/current/backups/`, report to user
- **Worker fail**: Report error, keep wisp open, suggest manual intervention
- **Beads fail**: Log error, continue (tracking is enhancement, not blocker)

---

## Verification Checklist

- [ ] `pnpm type-check` passes
- [ ] `pnpm build` succeeds
- [ ] Lint warnings reduced
- [ ] Git clean, changes committed & pushed
- [ ] Beads wisp completed
- [ ] Follow-up issues created for deferred work

---

## Key Files

| File                               | Purpose                                |
| ---------------------------------- | -------------------------------------- |
| `package.json`                     | Root scripts (type-check, build, lint) |
| `.beads/config.yaml`               | Beads configuration                    |
| `docs/reports/bug-health/2026-02/` | New report location                    |
| `.tmp/current/`                    | Working dir (backups, changes, plans)  |
| `bug-hunting-report.md` (root)     | Previous report baseline (Jan 22)      |

## Estimated Duration

~90-110 minutes total. Bulk of time in Phase 5 (fixing).
