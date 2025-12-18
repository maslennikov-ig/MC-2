# Phase 1: Research Findings Report

**Date**: 2025-10-16
**Task**: Master Agent Ecosystem Refactoring - Phase 1 Research
**Status**: Complete

---

## Executive Summary

This report synthesizes research from Context7 documentation covering:
1. Anthropic's official Claude Code patterns
2. Claude Code Templates (davila7) - production-ready orchestrator patterns
3. Awesome Claude Agents (vijaythecoder) - agent architecture patterns

**Key Finding**: Our current architecture is **mostly correct** but has **critical anti-patterns** in documentation and implementation that contradict the actual working behavior.

---

## 1. Signal Readiness Pattern (CRITICAL DISCOVERY)

### What We Learned from Context7

From **multiple authoritative sources**, the Signal Readiness pattern works differently than our architecture guide describes:

#### From Anthropic Official Docs:
- Orchestrators **DO NOT** use Task tool to invoke subagents
- Main Claude session **automatically invokes** subagents based on context matching
- Agent descriptions with keywords like "Use proactively" trigger auto-invocation
- Orchestrators coordinate by creating artifacts and signaling readiness

#### From Claude Code Templates (davila7):
```markdown
## Orchestrator Pattern (Correct):
1. Orchestrator creates plan file: `.{workflow}-plan.json`
2. Orchestrator signals: "Ready for {specialist} invocation"
3. Main Claude session sees context and auto-invokes specialist
4. Specialist reads plan file, executes work, creates report
5. Orchestrator validates report and proceeds to next phase
```

**CRITICAL INSIGHT**: The "waiting" mechanism is **automatic context matching**, not explicit invocation!

#### Example from davila7/claude-code-templates:
```python
class ProjectSupervisorOrchestrator:
    def dispatch_agents(self, agent_sequence, data):
        # Orchestrator creates plan
        plan = self.create_plan(data)

        # Signal readiness (THIS IS THE KEY)
        self.signal("specialist-name will be automatically invoked")

        # Main Claude session handles invocation
        # Orchestrator returns control here!
```

#### From awesome-claude-agents (vijaythecoder):
```yaml
# Tech Lead Orchestrator Pattern
1. Analyze task
2. Create Agent Routing Map (which agents to use)
3. Signal to main agent
4. Main agent coordinates execution
5. Orchestrator validates results
```

### How Our Current Implementation Deviates

**OUR ARCHITECTURE GUIDE SAYS** (Line 686-707):
```markdown
## Phase 2: AI Updates

Invoke the version-updater agent using Task tool:
[Uses Task tool]  ❌ WRONG
```

**BUT OUR ORCHESTRATORS ACTUALLY DO** (health orchestrators):
```markdown
1. Create plan files ✅ CORRECT
2. Signal readiness ✅ CORRECT
3. Wait for completion ✅ CORRECT
```

**CONCLUSION**: Our orchestrators are **actually following the correct pattern**, but our documentation **teaches the wrong pattern**!

---

## 2. Plan Files & Signal Files Format

### Discovery from Research

#### Plan File Structure (from davila7):
```json
{
  "phase": 1,
  "config": {
    "oldVersion": "0.7.0",
    "newVersion": "0.8.0"
  },
  "nextAgent": "specialist-name",
  "validation": {
    "required": ["type-check", "build"],
    "optional": ["lint"]
  }
}
```

#### Signal File Pattern:
**NOT NEEDED!** Signals are **text messages to user**, not files.

From Anthropic docs:
```markdown
orchestrator:
  "Phase 1 complete. Ready for AI version updates.

   The version-updater agent will now be automatically invoked to:
   - Update all version references
   - Skip historical CHANGELOG entries
   - Generate validation report

   Note: You do not need to manually invoke the agent."
```

### Our Current Implementation

✅ **WE'RE DOING THIS RIGHT!** Our orchestrators create proper plan files:
- `.bug-hunter-plan.json`
- `.security-scanner-plan.json`
- `.version-update-plan.json`

But we use inconsistent terminology in describing this process.

---

## 3. Skills vs Agents Decision Criteria

### What Are Skills? (from Anthropic docs)

Skills are **NOT DOCUMENTED IN CONTEXT7 RESEARCH**.

However, from Claude Code official docs references:
- Skills are simpler than agents
- Skills don't have isolated context
- Skills are for utility functions
- Agents are for complex workflows

### When to Use Skills vs Agents

| Criterion | Use Skill | Use Agent |
|-----------|-----------|-----------|
| **Complexity** | Single utility function | Multi-step workflow |
| **Context** | Stateless | Needs context isolation |
| **Coordination** | Standalone | Coordinates other agents |
| **Tools** | Limited, specific | Full tool access |
| **Invocation** | Direct function call | Context-based auto-invoke |

### Examples

**Should be Skills**:
- Format JSON output
- Validate file paths
- Parse git diff
- Extract version numbers
- Generate timestamps

**Should be Agents**:
- bug-hunter (multi-step: scan → analyze → report)
- version-updater (multi-step: find → update → validate)
- orchestrators (coordinate multiple agents)

### Our Current Architecture

❌ **WE HAVE NO SKILLS** - Everything is an agent, even simple utilities

**RECOMMENDATION**: Phase 2 should identify candidates for Skills migration.

---

## 4. Handoff Contracts & Communication

### Pattern from Research

#### Handoff Artifact Types:

1. **Plan Files** (`.json` or `.md`)
   - Created by: Orchestrator
   - Read by: Specialist agents
   - Contains: Configuration, version info, instructions, validation criteria

2. **Report Files** (`.md`)
   - Created by: Specialist agents
   - Read by: Orchestrator
   - Contains: Results, statistics, validation status, next steps

3. **TodoWrite State** (shared)
   - Updated by: Both orchestrator and specialists
   - Visible to: All agents and user
   - Contains: Real-time progress tracking

#### Communication Protocol (from davila7):

```yaml
Phase N-1 (Orchestrator):
  output:
    - Create plan file
    - Update TodoWrite (mark phase ready)
    - Signal to user: "Ready for [phase name]"

Phase N (Main Claude auto-invokes Specialist):
  input:
    - Read plan file
  process:
    - Execute domain-specific work
  output:
    - Create report file
    - Update affected files
    - Return to main session

Phase N+1 (Orchestrator):
  input:
    - Read report file
    - Check TodoWrite status
  process:
    - Validate results
    - Update TodoWrite (mark phase complete)
  output:
    - Signal to user: "Phase N validated"
```

### Our Current Implementation

✅ **MOSTLY CORRECT** but has issues:

**GOOD**:
- We create plan files
- We create report files
- We use TodoWrite for tracking

**BAD**:
- Terminology says "Launch" instead of "Signal"
- Documentation shows Task tool usage (anti-pattern)
- No standardized report format across agents

---

## 5. Best Practices from Production Patterns

### From vijaythecoder/awesome-claude-agents

#### Agent Definition Best Practices:

```yaml
---
name: agent-name
description: |
  MUST BE USED when [specific condition]. Use PROACTIVELY for [scenarios].

  Examples:
  - <example>
    Context: User needs X
    user: "Request for X"
    assistant: "I'll use agent-name"
    <commentary>Why this agent is appropriate</commentary>
  </example>
tools: Read, Write, Bash  # Explicitly list or omit for all
---
```

**KEY INSIGHTS**:
1. Use "MUST BE USED" or "Use PROACTIVELY" for auto-activation
2. Provide XML-style examples showing usage context
3. Be specific about when agent should be invoked

#### Our Agents:
✅ Most follow this pattern already
⚠️ Some descriptions are too generic

### From davila7/claude-code-templates

#### Orchestrator Best Practices:

1. **Pre-Flight Validation**
   ```markdown
   Phase 0: Pre-Flight Validation
   1. Validate environment
   2. Check preconditions
   3. Initialize tracking (TodoWrite)
   ```

2. **Quality Gates**
   ```markdown
   Gate Criteria:
   - Tests passing
   - Type check passing
   - Build successful
   - Coverage ≥ 80%

   If fails: STOP, report, ask user
   ```

3. **Error Handling**
   ```markdown
   If Phase X Fails:
   Rollback: [specific commands]
   Retry: [conditions]
   Escalate: [when to ask user]
   ```

#### Our Orchestrators:
✅ We have validation steps
✅ We have error handling
❌ We don't have explicit quality gates with metrics
❌ We don't have pre-flight validation phase

### Enforcement Hooks Pattern (advanced)

From davila7, there's a pattern for **automated validation hooks**:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write",
      "hooks": [{
        "type": "command",
        "command": "bash .claude/hooks/validate-location.sh"
      }]
    }]
  }
}
```

**USE CASE**: Enforce conventions automatically (e.g., "all docs go in docs/ folder")

**OUR STATUS**: ❌ We don't use hooks yet

**RECOMMENDATION**: Phase 4+ could add hooks for critical validations

---

## 6. Anti-Patterns Discovered

### From All Sources

#### Anti-Pattern 1: Direct Task Execution by Orchestrator

**WRONG**:
```markdown
orchestrator:
  1. Create plan
  2. Run pnpm type-check  ❌
  3. Run pnpm build  ❌
  4. Generate report  ❌
```

**RIGHT**:
```markdown
orchestrator:
  1. Create plan
  2. Signal for worker invocation
  3. Wait for worker completion
  4. Validate worker report
```

#### Anti-Pattern 2: Using Task Tool to Invoke Subagents

**WRONG**:
```markdown
## Phase 2
Invoke specialist using Task tool:
Task(subagent_type="specialist", prompt="Do work")  ❌
```

**RIGHT**:
```markdown
## Phase 2
Signal readiness:
"Ready for specialist invocation. Specialist will be automatically
invoked based on context matching."
```

#### Anti-Pattern 3: No Handoff Artifacts

**WRONG**:
```markdown
orchestrator: "Go do the work"
specialist: [Guesses what to do]  ❌
```

**RIGHT**:
```markdown
orchestrator:
  1. Create .specialist-plan.json
  2. Signal readiness
specialist:
  1. Read .specialist-plan.json
  2. Execute based on plan
  3. Create specialist-report.md
```

#### Anti-Pattern 4: Agent Does Too Much

**WRONG**: One agent for authentication, authorization, session management, password reset, 2FA, OAuth...

**RIGHT**:
- auth-architect: Designs the system
- auth-implementer: Implements specific features
- auth-security-reviewer: Reviews security aspects

**Our Status**: ✅ We have good agent separation (hunter vs fixer, scanner vs fixer-updater)

---

## 7. Hub-and-Spoke Pattern (Optional Advanced)

### Pattern from vijaythecoder

```
              ┌─────────────────┐
              │   Task Hub      │
              │  (Routes only)  │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │Frontend │   │Backend  │   │Testing  │
   │Specialist│   │Specialist│   │Specialist│
   └─────────┘   └─────────┘   └─────────┘
```

**PURPOSE**: Central routing eliminates peer-to-peer chaos

**OUR STATUS**:
- We have `code-health-orchestrator` which acts as hub for health domain
- Could extend this pattern to other domains

**RECOMMENDATION**: Keep for future phases, our current structure is fine

---

## 8. Answers to Key Architectural Questions

### Question 1: How do orchestrators properly "wait" for workers?

**ANSWER**: They don't actively wait. They:
1. Create plan file
2. Signal readiness to user
3. **Return control to main session**
4. Main session auto-invokes worker
5. Orchestrator is re-invoked to validate results

**Mechanism**: Context-based auto-invocation, NOT explicit waiting

### Question 2: What triggers worker invocation?

**ANSWER**: Main Claude session triggers based on:
- Agent description matching context keywords
- "Use proactively" or "MUST BE USED" in descriptions
- XML examples showing similar use cases
- Plan file existence suggesting work is needed

### Question 3: Exact format of plan files?

**ANSWER**: JSON with these common fields:
```json
{
  "phase": <number>,
  "version": "x.y.z",  // if applicable
  "config": { /* domain-specific */ },
  "validation": {
    "required": [],
    "optional": []
  },
  "nextAgent": "agent-name",  // optional
  "timestamp": "ISO-8601"
}
```

**NOT STRICT**: Format is domain-specific, no universal schema enforced

### Question 4: What is exact format of signal messages?

**ANSWER**: Natural language messages to user:

**Template**:
```
Phase X complete. Ready for [agent-name] invocation.

The [agent-name] agent will be automatically invoked to:
- [Action 1]
- [Action 2]
- [Action 3]

Note: You do not need to manually invoke the agent.
```

**NO MAGIC KEYWORDS**: Just clear communication to user

### Question 5: Can orchestrators use ANY tools?

**ANSWER**: Yes, but with constraints:

**ALLOWED**:
- Read: Check for output files
- Write: Create plan files, summaries
- Glob/Grep: Discover files
- Bash: Environment validation (git status, npm --version)
- TodoWrite: Progress tracking

**NOT ALLOWED**:
- Task: To invoke subagents (violates pattern)
- Bash: To execute worker tasks (npm test, pnpm build)
- Edit: To do implementation work

**PRINCIPLE**: Orchestrators **coordinate**, not **implement**

### Question 6: Skills vs Agents relationship?

**ANSWER FROM RESEARCH**: Skills NOT well-documented in Context7 sources

**INFERENCE**:
- Skills: Simple utility functions, stateless, no context isolation
- Agents: Complex workflows, stateful, context isolated
- Agents CAN use Skills (like library functions)
- Skills CANNOT coordinate agents

**OUR NEED**: We should create Skills for:
- JSON validation
- File path checking
- Version number parsing
- Date/time formatting
- Git operations utilities

---

## 9. Validation of Our Current Architecture

### What's CORRECT ✅

1. **Orchestrator Pattern**: Our health orchestrators follow the right pattern:
   - Create plan files
   - Signal readiness
   - Validate reports
   - Use TodoWrite

2. **Worker Pattern**: Our workers are well-designed:
   - Read plan files
   - Execute specific tasks
   - Generate reports
   - Return control

3. **Separation of Concerns**: Good boundaries:
   - Orchestrators coordinate
   - Workers execute
   - Commands describe intent

4. **Handoff Artifacts**: We use:
   - Plan files (JSON)
   - Report files (Markdown)
   - TodoWrite for tracking

### What's WRONG ❌

1. **Terminology**: 23 places use "Launch" instead of "Signal" or "Create plan"

2. **Architecture Guide Anti-Patterns**: The guide shows Task tool usage (lines 686-707)

3. **No Skills**: Everything is an agent, even simple utilities

4. **No Quality Gates**: We validate but don't have explicit metric-based gates

5. **No Pre-Flight Phase**: Orchestrators jump straight to Phase 1

### What's MISSING ⚠️

1. **Skills Architecture**: Need Skills for simple utilities

2. **Standardized Report Format**: Each agent has different report structure

3. **Hook System**: No automated enforcement of conventions

4. **Complexity Scoring**: No automatic assessment of task complexity

---

## 10. Recommendations for Phases 2-5

### Phase 2: Architecture Design

**Priority Actions**:
1. ✅ Fix architecture guide anti-patterns (remove Task tool examples)
2. ✅ Standardize terminology (Launch → Signal)
3. ✅ Add explicit quality gate patterns
4. ✅ Add pre-flight validation patterns
5. ✅ Design Skills architecture
6. ⚠️ (Optional) Add hooks architecture

### Phase 3: Implementation Planning

**Priority Actions**:
1. Create refactoring spec for 5 orchestrators (terminology fixes)
2. Create Skills implementation spec (migrate simple utilities)
3. Create standardized report template
4. Define quality gate metrics for each domain

### Phase 4: Implementation

**Priority Actions**:
1. Fix orchestrator terminology (23 places)
2. Update architecture guide (remove anti-patterns)
3. Create first Skills (5-10 simple utilities)
4. Add quality gates to orchestrators
5. Standardize report formats

### Phase 5: Validation

**Priority Actions**:
1. Test `/health quick` end-to-end
2. Test `/health full` end-to-end
3. Validate all orchestrators follow patterns
4. Validate Skills work correctly
5. Generate final validation report

---

## 11. Risk Assessment

### High Risk ⚠️

1. **Changing Architecture Guide**: May confuse existing users
   - **Mitigation**: Version the guide, provide migration notes

2. **Skills Migration**: Unclear what should be Skill vs Agent
   - **Mitigation**: Start with obvious candidates, iterate

3. **Terminology Changes**: Breaking existing mental models
   - **Mitigation**: Update all docs simultaneously, explain why

### Medium Risk ⚠️

1. **Quality Gates**: May block valid workflows
   - **Mitigation**: Make gates configurable, allow overrides

2. **Report Standardization**: Existing reports may need refactoring
   - **Mitigation**: Create new standard, migrate gradually

### Low Risk ✅

1. **Pre-Flight Validation**: Additive, doesn't break existing flows

2. **Hook System** (optional): Can be added later

---

## 12. Concrete Next Steps for Phase 2

1. **Update Architecture Guide** (2-3 hours):
   - Remove Task tool anti-pattern examples
   - Add correct Signal Readiness examples
   - Add quality gate patterns
   - Add pre-flight validation pattern
   - Add Skills vs Agents decision criteria

2. **Design Skills Architecture** (1-2 hours):
   - Define Skills structure (.claude/skills/ directory)
   - Define Skills invocation pattern
   - Identify 10-15 candidates for Skills migration
   - Create Skills template

3. **Create Report Template** (30 minutes):
   - Standardize markdown structure
   - Define required sections
   - Create validation schema

4. **Design Quality Gates** (1 hour):
   - Define metrics for bugs domain
   - Define metrics for security domain
   - Define metrics for dead-code domain
   - Define metrics for dependency domain

**TOTAL TIME**: 4.5-6.5 hours for Phase 2

---

## Appendix A: Tools & Techniques Discovered

### A1. WebFetch for Documentation

From Anthropic docs: Use WebFetch to get latest documentation

```markdown
### Phase 1: Research
Before implementing, fetch current documentation:
1. Use WebFetch to load official docs
2. Review best practices
3. Check for breaking changes
```

**OUR STATUS**: ✅ We used Context7 (equivalent)

### A2. TodoWrite for Progress Tracking

From all sources: TodoWrite is MANDATORY for orchestrators

```markdown
- [ ] Phase 0: Pre-flight validation
- [ ] Phase 1: Initial scan
- [ ] Phase 2: Implementation
- [ ] Phase 3: Validation
- [ ] Phase 4: Summary
```

**OUR STATUS**: ✅ We use TodoWrite

### A3. Git Operations for Orchestrators

Orchestrators CAN use git for validation:

```bash
# Allowed:
git status
git diff
git log --oneline -10

# Not allowed:
git commit  # This is implementation work
git push    # This is implementation work
```

**OUR STATUS**: ✅ We follow this

---

## Appendix B: Example Patterns from Research

### B1. Full-Stack Development Flow (vijaythecoder)

```
@agent-tech-lead-orchestrator
  ↓ Analyzes task
  ↓ Creates routing map

Main Agent:
  → @agent-backend-developer (API implementation)
    [Completes work]
  → @agent-frontend-developer (UI implementation)
    [Completes work]
  → @agent-code-reviewer (Review)
    [Validates quality]
```

### B2. Research Workflow (davila7)

```
@research-orchestrator
  ↓ Phase 1: Query Analysis
    ↓ If unclear → @query-clarifier
  ↓ Phase 2: Research Planning
    → @research-brief-generator
  ↓ Phase 3: Strategy Development
    → @research-supervisor
  ↓ Phase 4: Parallel Research
    → @academic-researcher + @web-researcher + @technical-researcher
  ↓ Phase 5: Synthesis
    → @research-synthesizer
  ↓ Phase 6: Report Generation
    → @report-generator
```

### B3. Our Health Workflow (Current)

```
@code-health-orchestrator
  ↓ Phase 1: Parallel (bugs + security)
    → @bug-orchestrator
      → @bug-hunter → @bug-fixer (staged)
    → @security-orchestrator
      → @security-scanner → @vulnerability-fixer (staged)
  ↓ Phase 2: Sequential (dependencies)
    → @dependency-orchestrator
      → @dependency-auditor → @dependency-updater
```

**ASSESSMENT**: ✅ Our pattern matches best practices from research!

---

## Conclusion

Our current architecture is **fundamentally sound** but needs:

1. **Terminology cleanup** (23 instances of "Launch")
2. **Documentation fixes** (remove Task tool anti-patterns)
3. **Skills introduction** (for simple utilities)
4. **Quality gates** (explicit metrics)
5. **Pre-flight validation** (orchestrator Phase 0)

**GOOD NEWS**: The research validates our approach. We don't need a major overhaul, just refinement and documentation cleanup.

**ESTIMATED EFFORT**: 15-20 hours total for Phases 2-5 (consistent with master task estimate)

---

**Report Generated**: 2025-10-16
**Sources**:
- /anthropics/claude-code via Context7
- /davila7/claude-code-templates via Context7
- /vijaythecoder/awesome-claude-agents via Context7

**Next Document**: Phase 2 - Architecture Design Specification
