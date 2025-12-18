# Subtask 1.1: Research Sub-Agent Patterns & Skills

**Parent Task**: `docs/TASK-MASTER-AGENT-ECOSYSTEM-REFACTORING.md`
**Phase**: Phase 1 - Research & Analysis
**Status**: Not Started
**Priority**: Critical
**Created**: 2025-10-16
**Estimated Duration**: 2-3 hours
**Dependencies**: None (can run in parallel with Subtask 1.3)
**Can Run in Parallel With**: Subtask 1.3 (Analyze Current Architecture)

---

## Objective

Research sub-agent patterns and Skills from community repositories, articles, and official documentation to understand:

1. **Signal Readiness pattern**: How orchestrators coordinate workers without executing tasks
2. **Plan files and signal files**: Formats, naming conventions, content structure
3. **Handoff contracts**: Communication mechanisms between orchestrators and workers
4. **Skills architecture**: When to use Skills vs Agents, integration patterns
5. **Best practices and anti-patterns**: From production implementations

**Output**: Research findings document with:
- Signal Readiness pattern specification
- Plan file / signal file examples
- Skills vs Agents decision criteria
- Code examples from working implementations
- Answers to key architectural questions

---

## Current Problem

Our orchestrators **violate Pattern 3 (Orchestrator-Coordinated)**:

- ❌ They create plan files and signal files correctly
- ❌ BUT then they execute worker tasks themselves instead of waiting
- ❌ Example: `bug-orchestrator` runs `pnpm type-check` directly instead of waiting for `bug-hunter`

**Expected behavior:**
```markdown
1. Create .bug-hunter-plan.json
2. Signal: "bug-hunter will be automatically invoked"
3. WAIT for bug-hunting-report.md to appear
4. Read report and create next plan
```

**Current behavior:**
```markdown
1. Create .bug-hunter-plan.json
2. Signal: "bug-hunter will be automatically invoked"
3. Run pnpm type-check themselves ❌
4. Generate report themselves ❌
```

---

## Research Sources

### Repositories to Study

**1. wshobson/agents**
URL: https://github.com/wshobson/agents
Focus: Working examples of orchestrators and workers coordination

**2. vanzan01/claude-code-sub-agent-collective**
URL: https://github.com/vanzan01/claude-code-sub-agent-collective
Focus: Sub-agent collective patterns and communication

**3. zhsama/claude-sub-agent**
URL: https://github.com/zhsama/claude-sub-agent
Focus: Claude sub-agent implementation patterns

### Articles to Study

**1. "Sub-Agents in Claude Code: The SubAgent Pattern"**
URL: https://typhren.substack.com/p/sub-agents-in-claude-code-the-subagent
Focus: Official sub-agent pattern explanation

**2. "How to Use Claude Code Subagents Tutorial"**
URL: https://goatreview.com/how-to-use-claude-code-subagents-tutorial/
Focus: Practical tutorial on sub-agent usage

### Documentation to Study

**3. Claude Code Skills Documentation**
URL: https://docs.claude.com/en/docs/claude-code/skills
Focus: Understanding Skills feature and evaluating if some functionality should be migrated from agents to skills

**Key questions about Skills:**
- What are Skills in Claude Code?
- How do Skills differ from Sub-Agents?
- When should functionality be a Skill vs. an Agent?
- Can Skills be invoked by agents?
- Can Skills coordinate with agents?
- Should any current worker/orchestrator functionality be moved to Skills?

---

## Task Breakdown

### Phase 1: Research (1-2 hours)

**Step 1.1: Read Articles**
- [ ] Read Typhren's SubAgent Pattern article
- [ ] Read GoatReview tutorial
- [ ] Extract key patterns and anti-patterns
- [ ] Document Signal Readiness pattern details
- [ ] Document handoff contract patterns

**Step 1.2: Study Repository Examples**
- [ ] Clone or examine wshobson/agents repository
- [ ] Study orchestrator implementations
- [ ] Study worker implementations
- [ ] Study command implementations
- [ ] Document how they handle plan files
- [ ] Document how they handle waiting/signaling
- [ ] Extract working code examples

**Step 1.3: Analyze vanzan01/claude-code-sub-agent-collective**
- [ ] Study collective coordination patterns
- [ ] Understand multi-agent communication
- [ ] Document handoff mechanisms

**Step 1.4: Analyze zhsama/claude-sub-agent**
- [ ] Study sub-agent invocation patterns
- [ ] Document plan file formats
- [ ] Document signal file patterns

**Step 1.5: Study Claude Code Skills**
- [ ] Read official Skills documentation
- [ ] Understand Skills vs Sub-Agents differences
- [ ] Identify use cases for Skills
- [ ] Evaluate if any current functionality should be Skills
- [ ] Document Skills invocation patterns
- [ ] Document Skills integration with agents

### Phase 2: Update Architecture Guide (1 hour)

**Step 2.1: Update ai-agents-architecture-guide.md**
- [ ] Add correct Signal Readiness pattern description
- [ ] Add explicit "DO NOT execute worker tasks" warnings
- [ ] Add correct waiting mechanisms
- [ ] Add plan file format examples from research
- [ ] Add signal file examples from research
- [ ] Add handoff contract examples
- [ ] Update Pattern 3 section with correct implementation
- [ ] Add anti-patterns section showing what NOT to do
- [ ] Add Skills section explaining when to use Skills vs Agents
- [ ] Add Skills integration patterns with agents

**Expected sections to add/update:**
```markdown
## Pattern 3: Orchestrator-Coordinated (CORRECT IMPLEMENTATION)

### What Orchestrators MUST Do:
1. Create plan files (.worker-plan.json)
2. Signal readiness to user
3. STOP and return control to main session
4. Main session will automatically invoke worker
5. Wait for worker output files to appear
6. Read worker output files
7. Create next plan or final summary

### What Orchestrators MUST NOT Do:
❌ Execute bash commands (pnpm, npm, grep, etc.)
❌ Use Bash tool directly for worker tasks
❌ Generate worker reports themselves
❌ Use Task tool to invoke workers
```

### Phase 3: Create Refactoring Task (30 minutes)

**Step 3.1: Create Detailed Refactoring Specification**

Create file: `docs/TASK-FIX-ORCHESTRATORS-SIGNAL-READINESS.md`

Contents:
- [ ] List all orchestrators that need fixing
- [ ] For each orchestrator, specify:
  - Current anti-pattern implementation
  - Required changes
  - Expected plan file format
  - Expected signal pattern
  - Expected waiting mechanism
- [ ] List workers that need verification
- [ ] List commands that need verification
- [ ] Acceptance criteria for each fix

### Phase 4: Execute Refactoring (2-3 hours)

**This phase will be in separate task execution**

**Step 4.1: Fix bug-orchestrator.md**
- [ ] Remove direct bash command execution
- [ ] Add proper wait-for-file pattern
- [ ] Update workflow to stop after signaling
- [ ] Test with actual execution

**Step 4.2: Fix security-orchestrator.md**
- [ ] Remove direct bash command execution
- [ ] Add proper wait-for-file pattern
- [ ] Update workflow to stop after signaling
- [ ] Test with actual execution

**Step 4.3: Fix code-health-orchestrator.md**
- [ ] Update to properly coordinate sub-orchestrators
- [ ] Ensure it waits for sub-orchestrator summaries
- [ ] Test parallel coordination

**Step 4.4: Fix dead-code-orchestrator.md**
- [ ] Verify pattern compliance
- [ ] Fix if needed

**Step 4.5: Fix dependency-orchestrator.md**
- [ ] Verify pattern compliance
- [ ] Fix if needed

**Step 4.6: Verify Workers**
- [ ] Ensure workers don't coordinate other agents
- [ ] Ensure workers properly read plan files
- [ ] Ensure workers generate expected output files

**Step 4.7: Update /health Command**
- [ ] Verify command describes tasks, not agents
- [ ] Update if needed based on research

**Step 4.8: Evaluate Skills Migration**
- [ ] Identify functionality that should be Skills instead of Agents
- [ ] Create Skills for simple utility functions if appropriate
- [ ] Update agents to invoke Skills where applicable
- [ ] Document Skills usage patterns
- [ ] Test Skills integration with agent workflows

---

## Expected Deliverables

### 1. Updated Architecture Guide
File: `docs/ai-agents-architecture-guide.md`
- Correct Pattern 3 implementation with examples
- Anti-patterns section
- Explicit waiting mechanisms
- Plan file and signal file formats

### 2. Refactoring Specification
File: `docs/TASK-FIX-ORCHESTRATORS-SIGNAL-READINESS.md`
- Detailed specification for each orchestrator fix
- Acceptance criteria
- Testing procedures

### 3. Fixed Orchestrators
Files:
- `.claude/agents/health/orchestrators/bug-orchestrator.md`
- `.claude/agents/health/orchestrators/security-orchestrator.md`
- `.claude/agents/health/orchestrators/code-health-orchestrator.md`
- `.claude/agents/health/orchestrators/dead-code-orchestrator.md`
- `.claude/agents/health/orchestrators/dependency-orchestrator.md`

### 4. Verification Report
File: `docs/ORCHESTRATORS-REFACTORING-VALIDATION.md`
- Before/after comparison
- Test execution results
- Pattern compliance verification

---

## Acceptance Criteria

### Research Phase Complete When:
- [x] All articles read and key patterns extracted
- [x] All repositories studied and examples documented
- [x] Signal Readiness pattern fully understood
- [x] Handoff contract patterns documented

### Architecture Guide Updated When:
- [x] Pattern 3 section has correct implementation
- [x] Anti-patterns section added
- [x] Wait-for-file mechanisms documented
- [x] Examples from research included

### Refactoring Spec Complete When:
- [x] All 5 orchestrators have detailed fix plans
- [x] Each fix has acceptance criteria
- [x] Testing procedure defined

### Refactoring Complete When:
- [x] All orchestrators properly implement Signal Readiness
- [x] Orchestrators create plan files
- [x] Orchestrators signal and STOP
- [x] Orchestrators wait for worker output files
- [x] Orchestrators do NOT execute bash commands
- [x] Test execution shows proper worker invocation
- [x] Validation report shows 100% pattern compliance

---

## Key Questions to Answer from Research

1. **How do orchestrators properly "wait" for workers?**
   - Do they return control immediately after signaling?
   - How does main session know to invoke workers?
   - What triggers worker invocation?

2. **What is the exact format of plan files?**
   - Required fields?
   - Optional fields?
   - Naming conventions?

3. **What is the exact format of signal messages?**
   - What text indicates readiness?
   - Does main session parse specific keywords?

4. **How do workers know they've been invoked?**
   - Do they read plan files automatically?
   - Is there a standard interface?

5. **What happens if worker fails?**
   - How does orchestrator detect failure?
   - Retry mechanisms?
   - Error reporting?

6. **Can orchestrators use ANY tools?**
   - Or must they be limited to Write tool for plans?
   - Can they use Read tool to check for output files?
   - Can they use Bash tool at all?

7. **What is the relationship between Skills and Agents?**
   - When should functionality be a Skill vs an Agent?
   - Can agents invoke Skills?
   - Can Skills coordinate with agents?
   - What are the performance/context implications?
   - Should simple utility functions be Skills instead of workers?

---

## Anti-Patterns to Avoid (Current Issues)

Based on current implementation analysis:

### ❌ Anti-Pattern 1: Direct Task Execution
```markdown
# WRONG
orchestrator:
  1. Create .bug-hunter-plan.json
  2. Run: pnpm type-check
  3. Run: pnpm build
  4. Generate bug-hunting-report.md
```

### ❌ Anti-Pattern 2: Not Waiting for Workers
```markdown
# WRONG
orchestrator:
  1. Create .bug-hunter-plan.json
  2. Signal: "bug-hunter will be invoked"
  3. Immediately create .bug-fixer-plan.json (doesn't wait!)
```

### ❌ Anti-Pattern 3: Using Task Tool
```markdown
# WRONG (from old pattern)
orchestrator:
  Task(subagent_type="bug-hunter", prompt="Scan for bugs")
```

---

## Success Metrics

### Immediate Success:
- Orchestrators create plan files ✓
- Orchestrators signal readiness ✓
- Orchestrators STOP after signaling (need to verify)
- Main session invokes workers (need to verify)
- Workers execute and generate reports (need to verify)
- Orchestrators resume and read reports (need to verify)

### Long-term Success:
- All health workflows execute end-to-end
- No orchestrator executes worker tasks
- Clean separation of concerns
- Architecture guide is canonical reference
- All patterns documented and validated

---

## Notes

- This task is written in English as a prompt for AI agents
- Task should be executed by a human or AI agent with web access
- Research phase requires reading external websites
- Refactoring phase requires deep understanding of Claude Code sub-agent architecture
- Testing phase requires actual `/health` command execution

---

## Related Files

### Current Files to Review:
- `/home/me/code/megacampus2/docs/ai-agents-architecture-guide.md`
- `/home/me/code/megacampus2/.claude/agents/health/orchestrators/*.md`
- `/home/me/code/megacampus2/.claude/agents/health/workers/*.md`
- `/home/me/code/megacampus2/.claude/commands/health.md`

### Files to Create:
- `/home/me/code/megacampus2/docs/TASK-FIX-ORCHESTRATORS-SIGNAL-READINESS.md`
- `/home/me/code/megacampus2/docs/ORCHESTRATORS-REFACTORING-VALIDATION.md`

### Files to Update:
- All orchestrator markdown files
- Architecture guide
- Possibly worker files
- Possibly health command

---

## Execution Instructions

**When ready to execute this task:**

1. Start with Phase 1: Research
2. Use WebFetch or browser tools to read articles
3. Use GitHub tools or WebFetch to study repositories
4. Document findings in research notes
5. Proceed to Phase 2: Update architecture guide
6. Proceed to Phase 3: Create detailed refactoring spec
7. Phase 4 should be executed as separate task with new context

**Do NOT start execution until explicitly instructed by user.**

---

**Task Created**: 2025-10-16
**Task Owner**: TBD
**Estimated Complexity**: High
**Requires**: Web access, GitHub access, deep understanding of Claude Code sub-agents
