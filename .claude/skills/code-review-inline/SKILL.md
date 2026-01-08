---
name: code-review-inline
description: Inline orchestration workflow for code review with Beads integration. Provides comprehensive code analysis, issue creation, priority-based fixing, and verification cycles.
version: 1.0.0
---

# Code Review (Inline Orchestration)

You ARE the orchestrator. Execute this workflow directly without spawning a separate orchestrator agent.

## Workflow Overview

```
Beads Init → Review → Create Issues → Fix by Priority → Close Issues → Verify → Beads Complete
```

**Max iterations**: 2
**Priorities**: critical → high → medium → low
**Beads integration**: Automatic issue tracking
**Context7**: Use for documentation and examples

---

## Phase 1: Pre-flight & Beads Init

1. **Setup directories**:
   ```bash
   mkdir -p .tmp/current/{plans,changes,backups}
   mkdir -p docs/reports/code-reviews/$(date +%Y-%m)
   ```

2. **Validate environment**:
   - Check `package.json` exists
   - Check `type-check` and `build` scripts exist

3. **Determine review scope**:
   - If user specifies files/dirs → use those
   - If user specifies "recent changes" → `git diff --name-only HEAD~5`
   - If user specifies PR → `gh pr diff {number} --name-only`
   - Default → ask user for scope

4. **Create Beads wisp**:
   ```bash
   bd mol wisp exploration --vars "question=Code review: {scope_description}"
   ```

   **IMPORTANT**: Save the wisp ID (e.g., `mc2-xxx`) for later use.

5. **Initialize TodoWrite**:
   ```json
   [
     {"content": "Code review analysis", "status": "in_progress", "activeForm": "Reviewing code"},
     {"content": "Create Beads issues", "status": "pending", "activeForm": "Creating issues"},
     {"content": "Fix critical issues", "status": "pending", "activeForm": "Fixing critical issues"},
     {"content": "Fix high priority issues", "status": "pending", "activeForm": "Fixing high issues"},
     {"content": "Fix medium priority issues", "status": "pending", "activeForm": "Fixing medium issues"},
     {"content": "Fix low priority issues", "status": "pending", "activeForm": "Fixing low issues"},
     {"content": "Verification", "status": "pending", "activeForm": "Verifying fixes"},
     {"content": "Complete Beads wisp", "status": "pending", "activeForm": "Completing wisp"}
   ]
   ```

---

## Phase 2: Code Review Analysis

**Invoke code-reviewer** via Task tool:

```
subagent_type: "code-reviewer"
description: "Comprehensive code review"
prompt: |
  Perform comprehensive code review of: {scope}

  Use Context7 for documentation and examples where relevant.

  Review checklist:
  - TypeScript patterns and best practices
  - Security vulnerabilities (SQL injection, XSS, auth issues)
  - Performance issues
  - Error handling
  - Code consistency
  - Naming conventions
  - Dead code and debug statements
  - Missing validation
  - Architecture compliance

  For each issue found:
  - Assign priority: critical/high/medium/low
  - Provide file path and line number
  - Explain the problem
  - Suggest fix with code example

  Run validation:
  - pnpm type-check
  - pnpm build

  Generate report: docs/reports/code-reviews/{YYYY-MM}/CR-{date}-{topic}.md

  Return summary with issue counts per priority.
```

**After code-reviewer returns**:
1. Read the generated report
2. Parse issue counts by priority
3. If zero issues → skip to Phase 7 (Final Summary)
4. Update TodoWrite: mark analysis complete

---

## Phase 3: Create Beads Issues

**For each issue found**, create a Beads issue:

```bash
# Critical (P0) - Security, crashes, data loss
bd create "CR: {issue_title}" -t bug -p 0 -d "{file}:{line} - {description}" \
  --deps discovered-from:{wisp_id}

# High (P1) - Correctness, major bugs
bd create "CR: {issue_title}" -t bug -p 1 -d "{file}:{line} - {description}" \
  --deps discovered-from:{wisp_id}

# Medium (P2) - Best practices, consistency
bd create "CR: {issue_title}" -t chore -p 2 -d "{file}:{line} - {description}" \
  --deps discovered-from:{wisp_id}

# Low (P3) - Style, documentation, minor improvements
bd create "CR: {issue_title}" -t chore -p 3 -d "{file}:{line} - {description}" \
  --deps discovered-from:{wisp_id}
```

**Add label**:
```bash
bd update {issue_id} --add-label code-review
```

**Track issue IDs** in a mapping for later closure.

Update TodoWrite: mark "Create Beads issues" complete.

---

## Phase 4: Ask User About Fixing

**Present summary to user**:

```markdown
## Code Review Complete

**Wisp ID**: {wisp_id}
**Report**: docs/reports/code-reviews/{YYYY-MM}/CR-{date}-{topic}.md

### Issues Found
- Critical: {count}
- High: {count}
- Medium: {count}
- Low: {count}

### Beads Issues Created
{list of issue IDs}

**Options**:
1. Fix all issues automatically
2. Fix only critical/high issues
3. Review report first, then decide
4. Skip fixing (keep issues in Beads for later)
```

**If user chooses to fix** → proceed to Phase 5
**If user skips** → proceed to Phase 7

---

## Phase 5: Fixing Loop

**For each priority** (critical → high → medium → low):

1. **Check if issues exist** for this priority
   - If zero → skip to next priority

2. **Update TodoWrite**: mark current priority in_progress

3. **Claim issues in Beads**:
   ```bash
   bd update {issue_id} --status in_progress
   ```

4. **Select appropriate fixer agent**:

   | Issue Type | Agent |
   |------------|-------|
   | TypeScript errors | typescript-types-specialist |
   | Security vulnerabilities | vulnerability-fixer |
   | Dead code | dead-code-remover |
   | Bug/correctness | bug-fixer |
   | Code style/refactor | Direct execution (MAIN) |

5. **Invoke fixer** via Task tool:
   ```
   subagent_type: "{selected_agent}"
   description: "Fix {priority} code review issues"
   prompt: |
     Read code review report: docs/reports/code-reviews/{YYYY-MM}/CR-{date}-{topic}.md

     Fix all {priority} priority issues.

     For each issue:
     1. Backup file before editing
     2. Implement fix as recommended in report
     3. Log change to .tmp/current/changes/code-review-changes.json

     Return: count of fixed issues, count of failed fixes, list of fixed issue IDs.
   ```

6. **Quality Gate** (inline):
   ```bash
   pnpm type-check
   pnpm build
   ```

   - If FAIL → report error, suggest rollback, exit
   - If PASS → continue

7. **Close fixed issues in Beads**:
   ```bash
   bd close {issue_id_1} {issue_id_2} ... --reason "Fixed in code review"
   ```

8. **Update TodoWrite**: mark priority complete

9. **Repeat** for next priority

---

## Phase 6: Verification

After all priorities fixed:

1. **Update TodoWrite**: mark verification in_progress

2. **Run quality gates**:
   ```bash
   pnpm type-check
   pnpm build
   pnpm lint  # if available
   ```

3. **Quick re-check** (optional):
   - Read fixed files
   - Verify fixes match recommendations
   - Check for regressions

4. **Decision**:
   - If all checks pass → Phase 7
   - If issues remain and iteration < 2 → Go to Phase 2
   - If iteration >= 2 → Phase 7 with remaining issues

---

## Phase 7: Final Summary & Beads Complete

1. **Complete Beads wisp**:
   ```bash
   # If all fixed
   bd mol squash {wisp_id}

   # If nothing found
   bd mol burn {wisp_id}
   ```

2. **Create issues for remaining items** (if any):
   ```bash
   bd create "CR REMAINING: {issue_title}" -t chore -p {priority} \
     -d "Not fixed in review. See report: {report_path}"
   bd update {new_issue_id} --add-label code-review
   ```

3. **Generate summary for user**:

```markdown
## Code Review Complete

**Wisp ID**: {wisp_id}
**Iterations**: {count}/2
**Status**: {SUCCESS/PARTIAL}

### Results
- Found: {total} issues
- Fixed: {fixed} ({percentage}%)
- Remaining: {remaining}

### By Priority
- Critical: {fixed}/{total}
- High: {fixed}/{total}
- Medium: {fixed}/{total}
- Low: {fixed}/{total}

### Beads Issues
- Created: {count}
- Closed: {count}
- Remaining: {count}

### Validation
- Type Check: {status}
- Build: {status}
- Lint: {status}

### Artifacts
- Report: `docs/reports/code-reviews/{YYYY-MM}/CR-{date}-{topic}.md`
- Changes: `.tmp/current/changes/code-review-changes.json`
```

4. **Update TodoWrite**: mark wisp complete

5. **SESSION CLOSE PROTOCOL**:
   ```bash
   git status
   git add .
   bd sync
   git commit -m "fix: code review - {fixed} issues fixed ({wisp_id})"
   bd sync
   git push
   ```

---

## Error Handling

**If quality gate fails**:
```
Rollback available: .tmp/current/changes/code-review-changes.json

To rollback:
1. Read changes log
2. Restore files from .tmp/current/backups/
3. Re-run workflow
```

**If worker fails**:
- Report error to user
- Keep Beads wisp open for manual completion
- Suggest manual intervention
- Exit workflow

**If Beads command fails**:
- Log error but continue workflow
- Beads tracking is enhancement, not blocker

---

## Quick Reference

| Phase | Beads Action |
|-------|--------------|
| 1. Pre-flight | `bd mol wisp exploration` |
| 3. After review | `bd create` + `--add-label code-review` |
| 5. Before fix | `bd update --status in_progress` |
| 5. After fix | `bd close --reason "Fixed"` |
| 7. Complete | `bd mol squash/burn` |
| 7. Remaining | `bd create` for unfixed issues |

---

## Issue Categories

| Category | Priority | Agent |
|----------|----------|-------|
| Security vulnerability | Critical/High | vulnerability-fixer |
| Type errors | High | typescript-types-specialist |
| Runtime bugs | High | bug-fixer |
| Dead code | Medium | dead-code-remover |
| Best practices | Medium | Direct execution |
| Documentation | Low | Direct execution |
| Code style | Low | Direct execution |

---

## Report Format

Reports are saved to: `docs/reports/code-reviews/{YYYY-MM}/CR-{date}-{topic}.md`

Standard sections:
1. Executive Summary
2. Key Metrics
3. Detailed Findings (by priority)
4. Best Practices Validation
5. Security Review
6. Validation Results
7. Recommendations Summary
8. Next Steps

---

## Usage Examples

### Review recent changes
```
User: Run code review on recent changes
→ Scope: git diff --name-only HEAD~5
```

### Review specific files
```
User: Review the enrichment handlers
→ Scope: packages/course-gen-platform/src/stages/stage7-enrichments/handlers/
```

### Review PR
```
User: Review PR #123
→ Scope: gh pr diff 123 --name-only
```

### Full review with fixes
```
User: Run code review and fix everything
→ Execute full workflow with automatic fixing
```
