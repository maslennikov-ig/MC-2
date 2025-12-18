# Task: Refactor Code Health System to Modern Claude Code Architecture

**Created:** 2025-10-16
**Status:** Ready for Implementation
**Priority:** HIGH
**Estimated Time:** 3-4 hours

---

## Executive Summary

Refactor the Code Health System (.claude/agents/health/* and .claude/commands/health.md) to align with the **modern Claude Code agent architecture** as documented in the canonical AI Agents Architecture Guide. The current implementation uses an outdated pattern where orchestrators directly invoke subagents using the Task tool. The new pattern requires orchestrators to signal readiness and let the main Claude session automatically invoke subagents based on context.

**Key Changes:**
1. Remove Task tool usage from orchestrators
2. Implement "signal readiness" pattern
3. Fix critical YAML frontmatter issues
4. Add explicit tools configuration to all agents

---

## Problem Statement

### Current Architecture (OLD - Incorrect)

The existing Code Health System uses a 3-tier architecture where:
- **Strategic orchestrator** uses Task tool to invoke domain orchestrators
- **Domain orchestrators** use Task tool to invoke worker agents
- **Workers** execute specific tasks

**Example of OLD pattern:**
```markdown
## Phase 2: Bug Detection

Use Task tool to invoke bug-hunter:
"Launch bug-hunter agent to detect all bugs in the codebase"

Wait for bug-hunter completion...
```

### Modern Architecture (NEW - Correct)

Per the AI Agents Architecture Guide (docs/ai-agents-architecture-guide.md):
- **Orchestrators DON'T invoke subagents directly**
- Main Claude session automatically invokes subagents based on context
- Orchestrators only coordinate, plan, track progress, and validate outputs
- Communication happens through structured artifacts

**Example of NEW pattern:**
```markdown
## Phase 2: Bug Detection

**Create Handoff Artifact:**
- Use Write tool to create: `.bug-detection-plan.json`

**Signal Readiness:**
Report to user:
"Phase 1 complete. Ready for bug detection.

The bug-hunter agent will now be automatically invoked to detect all bugs.
Please confirm to proceed."

Wait for bug-hunter completion (automatic invocation by main session).

**Validate Output:**
- Use Read tool: Load `bug-hunting-report.md`
- Check validation status
```

---

## Reference Documents

### Primary Reference (Canonical)
- **File:** `/home/me/code/megacampus2/docs/ai-agents-architecture-guide.md`
- **Section:** "Orchestration Patterns" (lines 145-256)
- **Section:** "Creating an Orchestrator" (lines 440-606)
- **Section:** "Common Pitfalls" (lines 679-766)
- **Key Principle:** "Orchestrators DON'T invoke subagents directly"

### Current Implementation Documentation
- **File:** `/home/me/code/courseai_n8n/docs/CODE-HEALTH-SYSTEM-COMPLETE.md`
- **Purpose:** Understand current architecture and functionality

### Audit Report (Issues Identified)
- **File:** `/home/me/code/courseai_n8n/docs/CODE-HEALTH-SYSTEM-AUDIT-REPORT.md`
- **Critical Issues:**
  - Missing YAML frontmatter in all 6 slash commands
  - Missing explicit tools configuration in all 13 agents
  - Orchestrators using Task tool (violates new pattern)

### Additional Resources
- **Use Context7 MCP:** For documentation and examples when refactoring
- **Search pattern:** "claude code orchestrator pattern", "claude code subagent invocation"

---

## Objectives

### Primary Objectives
1. ✅ Refactor all 5 orchestrators to use "signal readiness" pattern
2. ✅ Remove Task tool from orchestrator tool configurations
3. ✅ Fix YAML frontmatter in /health command
4. ✅ Add explicit tools configuration to all 13 agents
5. ✅ Update communication pattern to use artifacts and user signals

### Secondary Objectives
6. ✅ Maintain all existing functionality (no feature regression)
7. ✅ Preserve validation gates and retry logic
8. ✅ Keep comprehensive reporting capabilities
9. ✅ Update inline documentation to reflect new pattern

---

## Scope

### Files to Modify

#### Orchestrators (5 files - MAJOR REFACTORING)
```
.claude/agents/health/orchestrators/
├── code-health-orchestrator.md      [REFACTOR: Remove Task usage]
├── bug-orchestrator.md              [REFACTOR: Remove Task usage]
├── security-orchestrator.md         [REFACTOR: Remove Task usage]
├── dead-code-orchestrator.md        [REFACTOR: Remove Task usage]
└── dependency-orchestrator.md       [REFACTOR: Remove Task usage]
```

**Changes for each orchestrator:**
- Remove Task tool from frontmatter tools list
- Replace Task tool invocations with "signal readiness" pattern
- Add artifact creation (plan files)
- Update communication to report to user instead of invoking directly
- Add "Wait for [agent] completion" steps
- Maintain validation and retry logic

#### Commands (1 file - CRITICAL FIX)
```
.claude/commands/
└── health.md                        [FIX: Add YAML frontmatter]
```

**Changes:**
- Add required YAML frontmatter block
- Include `description` field
- Include `allowed-tools: Task` (command can use Task to invoke orchestrators)

#### Workers (8 files - MINOR UPDATE)
```
.claude/agents/health/workers/
├── bug-hunter.md                    [UPDATE: Add tools field]
├── bug-fixer.md                     [UPDATE: Add tools field]
├── security-scanner.md              [UPDATE: Add tools field]
├── vulnerability-fixer.md           [UPDATE: Add tools field]
├── dead-code-hunter.md              [UPDATE: Add tools field]
├── dead-code-remover.md             [UPDATE: Add tools field]
├── dependency-auditor.md            [UPDATE: Add tools field]
└── dependency-updater.md            [UPDATE: Add tools field]
```

**Changes:**
- Add explicit `tools` field to frontmatter
- No changes to system prompts (workers are fine as-is)

---

## Implementation Plan

### Phase 0: Preparation (10 minutes)

**Task 0.1: Review Reference Documents**
- Read architecture guide section "Creating an Orchestrator" (lines 440-606)
- Review pitfall #1: "Orchestrator Tries to Invoke Subagents" (lines 681-707)
- Study example orchestrator template

**Task 0.2: Create Backup**
```bash
# Create backup of current implementation
cp -r .claude/agents/health .claude/agents/health.backup
cp .claude/commands/health.md .claude/commands/health.md.backup
```

### Phase 1: Fix Critical Frontmatter Issues (30 minutes)

**Task 1.1: Fix /health Command Frontmatter**

**File:** `.claude/commands/health.md`

**Current structure (INCORRECT):**
```markdown
---
description: Comprehensive code health check with multiple modes (quick/full/bugs/security/cleanup/deps)
argument-hint: [quick|full|bugs|security|cleanup|deps]
allowed-tools: Task
---
```

**Wait, I see it DOES have frontmatter. Let me re-read the file...**

Actually, looking at the Read output, the file DOES have proper YAML frontmatter (lines 1-5). So this is NOT a critical issue for health.md specifically. However, the audit report mentions OTHER command files are missing frontmatter.

Let me adjust the task to focus on health.md and the health agents only.

**Task 1.1: Verify /health Command Frontmatter**
- Confirm frontmatter is present and correct
- Ensure `allowed-tools: Task` is included (commands CAN use Task)
- Verify description is clear

**Task 1.2: Add Tools Field to All 13 Agents**

**Per Audit Report Requirements:**

**Workers - Hunters (Read-only):**
```yaml
tools: Read, Grep, Glob, Bash
```

**Workers - Fixers (Can modify):**
```yaml
tools: Read, Edit, Bash, Glob
```

**Workers - Auditors:**
```yaml
tools: Read, Bash, Grep
```

**Orchestrators (NO Task tool):**
```yaml
# Most orchestrators:
tools: TodoWrite, Read, Bash, Edit, Glob

# code-health-orchestrator:
tools: TodoWrite, Read, Bash
```

**Specific tool configurations per agent:**

1. `bug-hunter.md`: `tools: Read, Grep, Glob, Bash`
2. `bug-fixer.md`: `tools: Read, Edit, Bash, Glob`
3. `security-scanner.md`: `tools: Read, Grep, Glob, Bash`
4. `vulnerability-fixer.md`: `tools: Read, Edit, Bash, Glob`
5. `dead-code-hunter.md`: `tools: Read, Grep, Glob, Bash`
6. `dead-code-remover.md`: `tools: Read, Edit, Bash, Glob`
7. `dependency-auditor.md`: `tools: Read, Bash, Grep`
8. `dependency-updater.md`: `tools: Read, Edit, Bash`
9. `bug-orchestrator.md`: `tools: TodoWrite, Read, Bash, Edit, Glob`
10. `security-orchestrator.md`: `tools: TodoWrite, Read, Bash, Edit, Glob`
11. `dead-code-orchestrator.md`: `tools: TodoWrite, Read, Bash, Edit, Glob`
12. `dependency-orchestrator.md`: `tools: TodoWrite, Read, Bash, Edit, Glob`
13. `code-health-orchestrator.md`: `tools: TodoWrite, Read, Bash`

### Phase 2: Refactor Orchestrator Architecture (90 minutes)

**Task 2.1: Refactor code-health-orchestrator.md**

**Current Issues:**
- Uses Task tool to invoke domain orchestrators
- Directly manages sub-agent execution

**Required Changes:**
1. Remove Task from tools list
2. Replace Task invocations with "signal readiness" pattern
3. Add artifact creation for each phase
4. Update to report to user instead of invoking directly

**Template to Follow (from architecture guide lines 514-561):**

```markdown
### Phase N: [Phase Name]

**Execute Preparation Actions:**
- Use [Tools]: [Specific actions]

**Create Handoff Artifact:**
- Use Write tool to create: `.[workflow]-plan.json`
```json
{
  "phase": N,
  "config": { ... },
  "nextAgent": "[specialist-name]"
}
```

**Signal Readiness for Specialist:**
- Update TodoWrite: Mark Phase N complete
- Report to user:
```
Phase N complete. Ready for [specialist] invocation.

The [specialist-name] agent will now be automatically invoked to:
- [Action 1]
- [Action 2]

**Note**: You do not need to manually invoke the agent. The main Claude session will handle this automatically based on workflow context.
```

**Wait for Specialist Completion:**
(Main Claude session automatically invokes [specialist-name])

**Validate Specialist Output:**
- Use Read tool: Load `[specialist]-report.md`
- Check validation status in report
- If validation failed:
  * Report errors to user
  * Provide corrective actions
  * Ask: "Continue anyway? (y/N)"

**Update Progress:**
- Use TodoWrite: Mark Phase N complete
- Report to user: "Phase N validated. Proceeding..."
```

**Specific Changes for code-health-orchestrator.md:**

**OLD Pattern (lines would vary):**
```markdown
## Quick Mode Execution

Use Task tool to launch bug-orchestrator and security-orchestrator in parallel:
- Launch @bug-orchestrator --priority=critical
- Launch @security-orchestrator --priority=critical

Wait for completion and aggregate results.
```

**NEW Pattern:**
```markdown
## Quick Mode Execution

**Phase 1: Create Execution Plans**
- Create `.bug-detection-plan.json` with priority=critical
- Create `.security-scan-plan.json` with priority=critical
- Update TodoWrite with phase checklist

**Phase 2: Signal Readiness for Parallel Execution**

Report to user:
"Quick mode preparation complete. Ready for parallel execution.

The following agents will be automatically invoked:
1. bug-orchestrator (critical priority)
2. security-orchestrator (critical priority)

Both agents will run in parallel. This typically takes 15-30 minutes.
Please confirm to proceed."

**Phase 3: Wait for Completion**

The main Claude session will automatically invoke both orchestrators based on the plan files and this context.

Monitor for completion signals:
- bug-hunting-report.md
- security-audit-report.md

**Phase 4: Validate and Aggregate Results**
- Use Read tool: Load both report files
- Validate all checks passed
- Use Write tool: Create unified `code-health-summary.md`
- Report final health score to user
```

**Task 2.2: Refactor bug-orchestrator.md**

**Current Issues:**
- Uses Task tool to invoke bug-hunter and bug-fixer
- Directly manages staged execution

**Required Changes:**
1. Remove Task from tools list
2. Add plan file creation (`.bug-detection-plan.json`)
3. Replace `Launch bug-hunter` with "signal readiness"
4. Replace `Launch bug-fixer` with "signal readiness"
5. Add "Wait for [agent] completion" steps
6. Maintain validation gates and retry logic

**Staged Execution Pattern:**

```markdown
## Stage 1: Critical Priority Bugs

**Prepare Stage:**
- Use Read tool: Check for existing `bug-hunting-report.md`
- Update `.bug-detection-plan.json` with priority=critical

**Signal Readiness:**
Report to user:
"Stage 1 preparation complete. Ready for critical bug detection.

The bug-hunter agent will be automatically invoked to scan for critical priority bugs.
Estimated time: 10-15 minutes."

**Wait for Detection:**
(Main Claude session invokes bug-hunter automatically)

**Validate Detection:**
- Use Read tool: Load `bug-hunting-report.md`
- Verify critical bugs section populated
- Count issues found

**If bugs found, prepare fixes:**
- Update `.bug-fix-plan.json` with critical bugs from report

**Signal Readiness for Fixes:**
Report to user:
"Critical bugs detected: [count]. Ready for automated fixing.

The bug-fixer agent will be automatically invoked to fix [count] critical bugs.
Each fix will be validated with type-check and build."

**Wait for Fixes:**
(Main Claude session invokes bug-fixer automatically)

**Validate Fixes:**
- Use Read tool: Check bug-fixer completion status
- Use Bash tool: Run `pnpm type-check && pnpm build`
- If validation fails: Retry logic (max 3 attempts)
- Use Bash tool: `git add . && git commit -m "fix: [details]"`

**Update Progress:**
- Use TodoWrite: Mark Stage 1 complete
- Report to user: "Stage 1 complete. X critical bugs fixed. Proceeding to Stage 2..."
```

**Task 2.3: Refactor security-orchestrator.md**

Follow same pattern as bug-orchestrator with:
- Plan file: `.security-scan-plan.json`
- Detection agent: security-scanner
- Fix agent: vulnerability-fixer
- Reports: `security-audit-report.md`

**Task 2.4: Refactor dead-code-orchestrator.md**

Follow same pattern with:
- Plan file: `.dead-code-plan.json`
- Detection agent: dead-code-hunter
- Removal agent: dead-code-remover
- Reports: `dead-code-report.md`

**Task 2.5: Refactor dependency-orchestrator.md**

Follow same pattern with:
- Plan file: `.dependency-plan.json`
- Audit agent: dependency-auditor
- Update agent: dependency-updater
- Reports: `dependency-audit-report.md`

### Phase 3: Update Worker Agent Tools Configuration (30 minutes)

**Task 3.1: Add Tools Field to All 8 Workers**

For each worker, add the tools field to the YAML frontmatter at the top of the file.

**Example for bug-hunter.md:**

**Before:**
```yaml
---
name: bug-hunter
description: Use proactively for comprehensive bug detection...
model: sonnet
color: yellow
---
```

**After:**
```yaml
---
name: bug-hunter
description: Use proactively for comprehensive bug detection...
model: sonnet
color: yellow
tools: Read, Grep, Glob, Bash
---
```

**Apply to all 8 workers with appropriate tool lists (see Task 1.2 for specific configurations).**

### Phase 4: Testing and Validation (60 minutes)

**Task 4.1: Dry Run Test - Individual Orchestrator**

Test the new pattern with a single orchestrator:

```bash
# In Claude Code interface:
"Use bug-orchestrator to scan for critical bugs only"
```

**Expected behavior:**
1. bug-orchestrator creates `.bug-detection-plan.json`
2. bug-orchestrator reports: "Ready for bug detection"
3. Main Claude session automatically invokes bug-hunter
4. bug-hunter generates `bug-hunting-report.md`
5. bug-orchestrator validates report
6. If bugs found, orchestrator signals readiness for bug-fixer
7. Main Claude session automatically invokes bug-fixer
8. bug-fixer applies fixes and generates report
9. bug-orchestrator validates fixes with type-check + build
10. Orchestrator reports completion

**Verify:**
- [ ] No explicit Task tool usage in orchestrator output
- [ ] Plan file created successfully
- [ ] Main session automatically invoked subagents
- [ ] Validation gates executed
- [ ] Final report generated

**Task 4.2: Integration Test - Quick Mode**

Test the strategic orchestrator:

```bash
/health quick
```

**Expected behavior:**
1. code-health-orchestrator creates plan files for bug and security
2. code-health-orchestrator signals readiness for parallel execution
3. Main Claude session invokes bug-orchestrator and security-orchestrator in parallel
4. Both orchestrators follow signal readiness pattern for their workers
5. code-health-orchestrator aggregates results
6. Unified health summary generated

**Verify:**
- [ ] Parallel execution works correctly
- [ ] No Task tool usage in orchestrator outputs
- [ ] All validation gates execute
- [ ] Unified report includes both domains
- [ ] Health score calculated correctly

**Task 4.3: Full System Test**

```bash
/health full
```

**Expected behavior:**
- All 4 domain orchestrators invoked (3 parallel, dependencies sequential)
- Each domain orchestrator uses signal readiness pattern
- All workers invoked automatically by main session
- Comprehensive unified report generated

**Verify:**
- [ ] All domains complete successfully
- [ ] Dependencies run last (after other domains)
- [ ] All reports generated
- [ ] No regressions in functionality

**Task 4.4: Regression Testing**

Verify no functionality lost:

```bash
# Test each domain-specific mode
/health bugs
/health security
/health cleanup
/health deps
```

**Verify:**
- [ ] All domain-specific commands work
- [ ] Each generates appropriate reports
- [ ] Validation gates function correctly
- [ ] Git commits created after successful stages

---

## Success Criteria

### Critical Requirements (Must Pass)

- [ ] **No Task tool in orchestrator frontmatter** - All 5 orchestrators have Task removed from tools list
- [ ] **Signal readiness pattern implemented** - All orchestrators use "report to user" instead of Task invocations
- [ ] **Plan files created** - Each orchestrator creates appropriate .json plan files
- [ ] **Automatic invocation works** - Main Claude session invokes subagents based on context
- [ ] **Workers have explicit tools** - All 8 workers have tools field in frontmatter
- [ ] **/health command works** - Command successfully invokes code-health-orchestrator
- [ ] **Validation gates preserved** - Type-check + build validation after each stage
- [ ] **Reports generated** - All report files created successfully
- [ ] **No regressions** - All existing functionality maintained

### Quality Requirements (Should Pass)

- [ ] **Documentation updated** - Inline documentation reflects new pattern
- [ ] **Error handling preserved** - Retry logic and graceful degradation functional
- [ ] **Progress tracking works** - TodoWrite updates visible throughout execution
- [ ] **Git commits created** - Successful stages result in proper commits
- [ ] **Health scoring works** - Overall health score calculated correctly

### Performance Requirements (Nice to Have)

- [ ] **Parallel execution functional** - Quick mode runs bug + security concurrently
- [ ] **Time estimates accurate** - Actual execution time matches documented estimates
- [ ] **Context isolation** - Independent agent contexts prevent token exhaustion

---

## Implementation Guidelines

### Using Context7 for Documentation

When implementing, use Context7 MCP to fetch current best practices:

```markdown
Use mcp__context7__get-library-docs to fetch documentation on:
- "claude code orchestrator patterns"
- "claude code subagent automatic invocation"
- "claude code artifact-based communication"
```

### Maintaining Backward Compatibility

**Preserve these patterns:**
- Staged execution (Critical → High → Medium → Low)
- Validation gates (type-check + build)
- Retry logic (max 3 attempts)
- Comprehensive reporting
- Git commit after successful stages
- Health scoring algorithms

**Change only:**
- Remove Task tool from orchestrator tools list
- Replace Task invocations with signal readiness
- Add plan file creation
- Update communication to report to user

### Code Style and Patterns

**Artifact Naming Convention:**
```
.{domain}-plan.json          # Orchestrator creates for workers
{agent}-report.md            # Workers create for orchestrators
code-health-summary.md       # Strategic orchestrator creates final report
```

**Signal Readiness Template:**
```markdown
**Signal Readiness for [Agent]:**
- Update TodoWrite: Mark Phase [N] complete
- Report to user:
```
Phase [N] complete. Ready for [task description].

The [agent-name] agent will now be automatically invoked to:
- [Action 1]
- [Action 2]
- [Action 3]

Estimated time: [X] minutes.

**Note**: You do not need to manually invoke the agent. The main Claude session will handle this automatically based on workflow context.
```
```

### Validation After Each Change

After modifying each orchestrator:

1. **Syntax check**: Verify YAML frontmatter is valid
2. **Logic check**: Ensure signal readiness pattern correct
3. **Reference check**: Plan files referenced correctly
4. **Documentation check**: Inline docs match new pattern

---

## Testing Checklist

### Unit Tests (Individual Components)

- [ ] Test bug-hunter directly: "Use bug-hunter to scan src/"
- [ ] Test bug-fixer directly: "Use bug-fixer to fix critical bugs from bug-hunting-report.md"
- [ ] Test security-scanner directly
- [ ] Test vulnerability-fixer directly
- [ ] Test dead-code-hunter directly
- [ ] Test dead-code-remover directly
- [ ] Test dependency-auditor directly
- [ ] Test dependency-updater directly

### Integration Tests (Orchestrators)

- [ ] Test bug-orchestrator with signal readiness pattern
- [ ] Test security-orchestrator with signal readiness pattern
- [ ] Test dead-code-orchestrator with signal readiness pattern
- [ ] Test dependency-orchestrator with signal readiness pattern
- [ ] Test code-health-orchestrator quick mode (parallel)
- [ ] Test code-health-orchestrator standard mode (mixed)
- [ ] Test code-health-orchestrator full mode (comprehensive)

### System Tests (End-to-End)

- [ ] Run `/health quick` on real codebase
- [ ] Run `/health full` on real codebase
- [ ] Run `/health bugs` on real codebase
- [ ] Run `/health security` on real codebase
- [ ] Run `/health cleanup` on real codebase
- [ ] Run `/health deps` on real codebase

### Validation Tests (Quality Gates)

- [ ] Verify type-check runs after each stage
- [ ] Verify build runs after each stage
- [ ] Verify git commits created after successful stages
- [ ] Verify retry logic triggers on failures
- [ ] Verify graceful degradation (failed stages don't block others)

---

## Potential Issues and Solutions

### Issue: Main Session Doesn't Auto-Invoke Subagent

**Symptoms:**
- Orchestrator signals readiness
- No subagent is invoked
- Workflow stalls

**Diagnosis:**
- Subagent description doesn't match context
- Missing "proactively" keyword in description
- Context not clear enough for automatic matching

**Solution:**
1. Verify worker descriptions include "Use proactively for [specific task]"
2. Make orchestrator signal more explicit about which agent
3. Include specific keywords from worker descriptions
4. If still fails, verify worker files are in correct location (.claude/agents/health/workers/)

### Issue: Parallel Execution Not Working

**Symptoms:**
- Orchestrators run sequentially instead of parallel
- Quick mode takes as long as standard mode

**Diagnosis:**
- Strategic orchestrator not signaling properly for parallel invocation
- Main session interpreting as sequential based on context

**Solution:**
1. Explicitly state "parallel execution" in orchestrator signal
2. Create all plan files BEFORE signaling (so both agents have context)
3. Report to user: "The following agents will run IN PARALLEL:"
4. List both/all agents in single message

### Issue: Validation Gates Failing

**Symptoms:**
- Type-check or build fails after fixes applied
- Rollback triggered repeatedly

**Diagnosis:**
- Worker agents introducing new issues while fixing others
- Validation criteria too strict
- Build cache issues

**Solution:**
1. Verify worker prompts include validation before reporting success
2. Add "clean build" step: `pnpm clean && pnpm build`
3. Review retry logic to improve fix quality
4. Consider lowering validation threshold (warnings OK, errors not OK)

### Issue: Reports Not Generated

**Symptoms:**
- Orchestrator can't find worker report file
- Validation step fails due to missing report

**Diagnosis:**
- Worker didn't complete successfully
- Worker completed but didn't generate report
- Report generated in wrong location

**Solution:**
1. Verify all workers have explicit "Generate Report" step in prompts
2. Check report file paths match expectations
3. Add error handling in orchestrator: if report missing, ask worker to regenerate
4. Verify worker has Write tool in tools list

---

## Rollback Plan

If refactoring causes critical issues:

### Quick Rollback
```bash
# Restore from backup
rm -rf .claude/agents/health
mv .claude/agents/health.backup .claude/agents/health

rm .claude/commands/health.md
mv .claude/commands/health.md.backup .claude/commands/health.md
```

### Partial Rollback

If only specific orchestrators have issues:

```bash
# Restore individual files
cp .claude/agents/health.backup/orchestrators/bug-orchestrator.md \
   .claude/agents/health/orchestrators/bug-orchestrator.md
```

### Git Rollback

```bash
# If changes committed, revert last commit
git revert HEAD

# Or reset to before refactoring
git log --oneline  # Find commit hash
git reset --hard [commit-hash]
```

---

## Documentation Updates

After successful refactoring, update these documents:

### Update Implementation Guide

**File:** `docs/CODE-HEALTH-SYSTEM-COMPLETE.md`

**Section to update:** "Technical Implementation Details" (lines 157-208)

**Changes:**
- Update "Domain Orchestrators" section to reflect signal readiness pattern
- Remove references to Task tool usage in orchestrators
- Add new section on artifact-based communication
- Update communication protocol diagrams

### Update Audit Report Status

**File:** `docs/CODE-HEALTH-SYSTEM-AUDIT-REPORT.md`

**Add new section:** "Post-Refactoring Audit"

**Changes:**
- Mark critical issues as resolved
- Update compliance checklist
- Update production readiness status
- Add new test results

### Create Refactoring Summary

**New file:** `docs/HEALTH-SYSTEM-REFACTORING-SUMMARY.md`

**Contents:**
- What changed and why
- Before/after comparison
- Performance impact (if any)
- Known limitations
- Future improvements

---

## Acceptance Criteria

### Functional Requirements

✅ System must execute all health check modes (quick, standard, full, domain-specific)
✅ All validation gates must execute (type-check, build, tests)
✅ All reports must be generated in correct format
✅ Health scores must calculate correctly
✅ Git commits must be created after successful stages

### Architectural Requirements

✅ No Task tool in orchestrator tools lists
✅ All orchestrators use signal readiness pattern
✅ All plan files created before signaling readiness
✅ Workers have explicit tools configuration
✅ Communication through artifacts (files, TodoWrite)

### Quality Requirements

✅ No regressions in existing functionality
✅ Execution time within documented estimates
✅ Error handling and retry logic preserved
✅ Comprehensive reporting maintained
✅ Graceful degradation functional

### Documentation Requirements

✅ All inline documentation updated
✅ Architecture guide compliance verified
✅ Implementation summary documents updated
✅ Testing results documented

---

## Timeline Estimate

### Phase 0: Preparation
- **Time:** 10 minutes
- **Tasks:** Review docs, create backups

### Phase 1: Critical Fixes
- **Time:** 30 minutes
- **Tasks:** Add tools field to all agents

### Phase 2: Orchestrator Refactoring
- **Time:** 90 minutes
- **Tasks:** Refactor all 5 orchestrators to new pattern

### Phase 3: Worker Updates
- **Time:** 30 minutes
- **Tasks:** Update worker frontmatter (if needed)

### Phase 4: Testing
- **Time:** 60 minutes
- **Tasks:** Unit, integration, system testing

### Phase 5: Documentation
- **Time:** 30 minutes
- **Tasks:** Update docs and create summary

**Total Estimated Time:** 3.5-4 hours

---

## Final Notes

### Key Success Factors

1. **Follow the architecture guide exactly** - Don't deviate from the patterns
2. **Test incrementally** - Verify each orchestrator works before moving to next
3. **Maintain existing functionality** - Only change invocation mechanism
4. **Document thoroughly** - Update all references to old pattern
5. **Use Context7** - Fetch current best practices for complex patterns

### Red Flags to Watch For

⚠️ If orchestrator taking too long to execute → Probably doing implementation work instead of coordinating
⚠️ If subagent not auto-invoked → Description doesn't match context
⚠️ If validation gates failing → Worker not validating before reporting success
⚠️ If reports missing → Worker doesn't have Write tool or forgot report step
⚠️ If parallel execution not working → Signal not explicit enough about parallelism

### Questions for Implementer

Before starting implementation, ensure you understand:

1. Why orchestrators shouldn't use Task tool?
   - **Answer:** Orchestrators are themselves subagents (invoked via Task). Subagents cannot invoke other subagents directly. The main Claude session must do the invocation.

2. How does automatic invocation work?
   - **Answer:** Main Claude session matches agent descriptions against current context. When orchestrator signals readiness with specific keywords, main session invokes matching agent.

3. What are handoff artifacts?
   - **Answer:** JSON/Markdown files created by orchestrators that contain instructions for workers. Workers read these files to know what to do.

4. How to signal readiness effectively?
   - **Answer:** Report to user with explicit message stating which agent will be invoked, what it will do, and estimated time. Use keywords from target agent's description.

5. What if automatic invocation doesn't work?
   - **Answer:** Verify agent description has "proactively" keyword, ensure context is clear, check agent files in correct location. Worst case: explicitly tell user to invoke agent.

---

## Appendix: Architecture Guide Key Excerpts

### Orchestrator Pattern (Lines 227-236)

```markdown
## What the Orchestrator DOES:
✅ Creates workflow plan with phases
✅ Defines quality gate criteria
✅ Tracks progress via TodoWrite
✅ Validates outputs at each phase
✅ Reports status to user
✅ Handles errors and provides rollback instructions

## What the Orchestrator DOES NOT DO:
❌ Call Task tool to invoke subagents
❌ Execute implementation work itself
❌ Directly manage other agents
```

### Signal Readiness Template (Lines 502-514)

```markdown
**Signal Readiness for Specialist:**
- Update TodoWrite: Mark Phase N complete
- Report to user:
```
Phase N complete. Ready for [phase name].

The [specialist-name] agent will now be automatically invoked to:
- [Action 1]
- [Action 2]
- [Action 3]

**Note**: You do not need to manually invoke the agent. The main Claude session will handle this automatically based on workflow context.
```
```

### Common Pitfall #1 (Lines 681-707)

```markdown
**Problem**:
Orchestrator tries to invoke subagent with Task tool.

**Why it fails**:
Orchestrator is itself a subagent (invoked via Task). Subagents **cannot** invoke other subagents.

**Solution**:
Signal readiness for automatic invocation:

Report to user:
"Phase 1 complete. Ready for AI version updates.

The version-updater agent will now be automatically invoked
to update all version references. Please confirm to proceed."

Wait for version-updater completion signal.
```

---

**END OF TASK SPECIFICATION**

This document contains all necessary information to refactor the Code Health System to the modern Claude Code architecture. Follow phases sequentially, test incrementally, and maintain comprehensive documentation throughout.
