# Phase 1: Complete Research Report - Sub-Agent Patterns & Skills

**Date**: 2025-10-16
**Task**: Master Agent Ecosystem Refactoring - Phase 1 Complete Research
**Status**: COMPLETE with all sources reviewed

---

## Executive Summary

This report synthesizes research from ALL sources mentioned in Subtask 1.1:

### Articles Reviewed:
1. ✅ **Typhren's SubAgent Pattern** - https://typhren.substack.com/p/sub-agents-in-claude-code-the-subagent
2. ✅ **GoatReview Tutorial** - https://goatreview.com/how-to-use-claude-code-subagents-tutorial/

### Repositories Reviewed:
3. ✅ **wshobson/agents** - Plugin marketplace architecture
4. ✅ **vanzan01/claude-code-sub-agent-collective** - Hub-and-spoke multi-agent patterns
5. ✅ **zhsama/claude-sub-agent** - Spec-driven workflow orchestration

### Official Documentation:
6. ✅ **Claude Code Skills** - https://docs.claude.com/en/docs/claude-code/skills

### Additional Context7 Research:
7. ✅ Anthropic's official Claude Code patterns
8. ✅ davila7/claude-code-templates (production orchestrators)
9. ✅ vijaythecoder/awesome-claude-agents (agent architecture)

---

## 1. CRITICAL DISCOVERY: How Orchestrators Actually Work

### From Typhren's SubAgent Pattern Article

**KEY INSIGHT**: The orchestrator is a **"pure coordinator"** that must NOT do implementation work.

#### The Tag-Based Handoff Pattern

Typhren describes a sophisticated **metacognitive tagging system** for agent communication:

```markdown
## Tag Lifecycle

Planning Phase:
- Agents mark decisions with #PATH_DECISION
- Uncertainties tagged with #PLAN_UNCERTAINTY
- Critical exports tagged with #EXPORT_CRITICAL

Orchestrator Phase:
- Extracts all tagged content
- Cleans and structures information
- Passes to synthesis agent

Implementation Phase:
- Agents mark work with #COMPLETION_DRIVE
- Anti-patterns flagged with #CARGO_CULT
- Improvements suggested with #SUGGEST_ERROR_HANDLING

Verification Phase:
- Verification agent resolves all assumptions
- Removes unnecessary patterns
```

**CRITICAL ANTI-PATTERN IDENTIFIED**:
> "Early attempts allowing the orchestrator to help with tasks resulted in degraded plan quality and instruction drift."

**TRANSLATION TO OUR ARCHITECTURE**:
- ✅ Orchestrators should ONLY coordinate (we do this)
- ❌ Orchestrators should NOT execute bash commands for workers (we violate this in docs)
- ✅ Use structured markers/tags for handoffs (we use plan files - equivalent)

#### Agent Specialization

Typhren recommends **role-specific agents**, not generic workers:

**Planning Agents**:
- system-architect
- data-architect
- ui-planner

**Synthesis Agent**:
- Integrates conflicting plans into unified blueprints

**Implementation Agents**:
- backend-engineer
- frontend-engineer
- database-engineer

**Verification Agents**:
- Validate assumptions
- Remove unnecessary patterns

**OUR EQUIVALENT**:
```
Planning: bug-hunter, security-scanner, dead-code-hunter
Synthesis: (missing - orchestrator does this)
Implementation: bug-fixer, vulnerability-fixer, dead-code-remover
Verification: (missing - orchestrator does this)
```

**FINDING**: We could benefit from separate verification agents!

#### Model Selection Strategy

Typhren recommends **cognitive resource allocation**:
- **Opus 4.1 with `ultra_think`**: Synthesis (highest complexity)
- **Sonnet 4 with `think_hard`**: Implementation
- **Regular thinking**: Verification tasks

**OUR CURRENT**: We use Sonnet for everything (reasonable default)

---

### From GoatReview Tutorial

**KEY INSIGHT**: Subagents are **"autonomous AI entities maintaining independent context"** - like specialized team members working in parallel.

#### Setup Pattern: Start Simple

Tutorial recommends **starting with 2-subagent configurations** before complex orchestrations.

Example: Create three specialized roles for API project:
1. **Service Architect** - communication and boundaries
2. **Security Engineer** - authentication and threat modeling
3. **Infrastructure Specialist** - deployment and monitoring

**OUR EQUIVALENT**: We have hunter/fixer pairs per domain (good!)

#### Communication Best Practices

**Role Definition**:
- Explicit specialization prevents artificial task division
- Each agent should have clear, non-overlapping responsibilities

**Synchronization Points**:
- Regular check-ins prevent divergent solutions
- Don't let agents work too independently

**Batch Interactions**:
- Group communications rather than constant back-and-forth
- Reduces latency

**Context Inheritance**:
- Subagents inherit specific parent context
- But maintain independence for their work

**OUR STATUS**:
- ✅ Clear role definition (hunter vs fixer)
- ⚠️ Sync points via plan files (could be more explicit)
- ✅ Batch interactions (report files)
- ✅ Context inheritance (plan files provide context)

#### Real-World Workflow Example

For **legacy modernization**, deploy **competing subagents simultaneously**:
- One designs incremental migration
- Another proposes complete rewrite

Both provide: timelines, resources, risks, ROI.

**INSIGHT**: Sometimes parallel competing approaches > single approach!

**APPLICATION TO US**: Could we run multiple bug-fixing strategies in parallel and pick best?

#### Critical Considerations

**Token Consumption**:
> "Subagents use 3-4x more tokens than single-threaded assistance"

**Context Limitations**:
> "Memory doesn't persist across sessions, requiring re-establishment"

**OUR IMPLICATIONS**:
- Be mindful of cost (orchestrated workflows are expensive)
- Each invocation needs full context via plan files
- Can't rely on agent "remembering" previous work

---

## 2. Repository Patterns Analysis

### From wshobson/agents - Plugin Marketplace

**KEY FINDING**: This repo is **NOT about orchestrator-worker patterns** - it's a **plugin marketplace**!

#### Architecture

- **63 focused plugins** across 23 categories
- Each plugin is self-contained with agents + commands
- **Plugin-based composition model** not orchestrator model

#### Coordination Mechanism

Uses **multi-agent workflow orchestrators**:
- 15 workflow orchestrators coordinate complex operations
- Example: `full-stack-orchestration` → backend → frontend → testing → security → deployment
- Plugins are "composed" together

#### Invocation Model

```bash
/plugin install plugin-name      # Install plugin
/plugin                          # List available plugins
# Installed plugins auto-load their agents
```

**LESSON FOR US**: Consider plugin architecture for extensibility in future!

**NOT RELEVANT**: No Signal Readiness patterns or explicit orchestrator-worker code.

---

### From vanzan01/claude-code-sub-agent-collective - Hub-and-Spoke

**KEY FINDING**: This is the **GOLD STANDARD** for multi-agent coordination!

#### Hub-and-Spoke Coordination Model

```
              ┌─────────────────┐
              │ @task-orchestrator │
              │  (Central Hub)   │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │Frontend │   │Backend  │   │Testing  │
   │Specialist│   │Specialist│   │Specialist│
   └─────────┘   └─────────┘   └─────────┘
```

**WHY IT WORKS**:
- Prevents "peer-to-peer communication chaos"
- Central routing eliminates agent self-selection errors
- All requests route through `/van` command → @task-orchestrator

**OUR EQUIVALENT**:
- We have `code-health-orchestrator` as central hub for health domain
- ✅ This matches the pattern!

#### CLAUDE.md as Behavioral Operating System

**CRITICAL PATTERN**: CLAUDE.md establishes **prime directives** that override default agent behavior.

**PURPOSE**:
- Enforce consistent operational rules across ALL agents
- Prevent agents from improvising approaches
- Document project-specific conventions

**EXAMPLE** from repo:
```markdown
## Project Documentation Conventions (Important)

**Documentation Files:** All new documentation or task files must be saved under the `docs/` folder.

**Code Files:** Follow the project structure (place new code in appropriate src/module folder).

**Tests:** Put new test files under `tests/` directory, mirroring code structure.

> **Important:** When creating a new file, ensure the directory exists or create it. Never default to the root directory.
```

**OUR STATUS**:
- ⚠️ We have CLAUDE.md in the project
- ❌ But it's not used as behavioral OS
- ❌ We don't enforce conventions automatically

**RECOMMENDATION**: Update CLAUDE.md to include our agent patterns!

#### Enforcement Through Hooks

**REVOLUTIONARY PATTERN**: Use **hooks to enforce behavior**, not just document it!

**Example Hook**:
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

**Hook Script**:
```bash
#!/usr/bin/env bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')

# Check if file is being written to root directory
if [[ "$FILE_PATH" =~ ^[^/]*\.md$ ]]; then
  echo "❌ Error: Documentation files must be in docs/ directory" >&2
  exit 2  # Exit code 2 blocks the tool call
fi

exit 0  # Allow the tool call
```

**BENEFITS**:
- Automatic enforcement (no agent compliance needed)
- Catches mistakes before they happen
- Immediate feedback

**OUR STATUS**: ❌ We don't use hooks yet

**RECOMMENDATION**: Phase 4+ could add hooks for critical validations:
- Ensure reports go in correct directories
- Validate plan file format
- Enforce naming conventions

#### Handoff Contracts

**PATTERN**: Standardized handoff contracts preserve information across agent transitions.

**IMPLEMENTATION**:
- Every implementation agent provides **consistent TDD completion reporting**
- Downstream agents can reliably process predictable output formats

**OUR STATUS**:
- ✅ We use plan files (good)
- ✅ We use report files (good)
- ⚠️ Report formats vary across agents (needs standardization)

#### Complexity-Driven Prioritization

**ResearchDrivenAnalyzer Pattern**: Score task complexity to focus effort appropriately.

**SCORING FACTORS**:
- Lines of code expected
- Number of dependencies
- Integration points
- Domain knowledge required
- Risk level

**SCORE INTERPRETATION**:
- 5-15: Simple (1 specialist, 1-2 hours)
- 16-30: Moderate (2-3 specialists, 4-8 hours)
- 31-40: Complex (orchestrated workflow, 1-2 days)
- 41-50: Critical (full orchestration + reviews, multi-day)

**OUR STATUS**: ❌ We don't score complexity automatically

**POTENTIAL BENEFIT**: Could help auto-select Quick vs Full health mode!

#### Quality Gates with Blocking

**CRITICAL PATTERN**: Validation checkpoints that **BLOCK** workflow progression.

**IMPLEMENTATION**:
```markdown
## Phase 2: Quality Gate

✅ **REQUIRED (Blocking)**:
- [ ] All tests passing (npm test)
- [ ] Type check passing (npm run type-check)
- [ ] No linting errors (npm run lint)
- [ ] Code coverage ≥ 80% (npm run coverage)

If ANY blocking criterion fails:
1. ⛔ **STOP** - Do not proceed to next phase
2. Report failures with details
3. Provide fix instructions
4. Ask user: "Fix issues or skip validation? (fix/skip)"
5. If "skip": Add warning to summary
6. If "fix": Wait for fixes, then re-run gate

⚠️ **RECOMMENDED (Non-blocking)**:
- [ ] Performance benchmarks met
- [ ] Accessibility standards (WCAG AA)
- [ ] Security scan clean (npm audit)

If recommended criteria fail:
- Add warnings to summary
- Continue to next phase
- Note in final report for later review
```

**OUR STATUS**:
- ✅ We have validation steps
- ❌ We don't have explicit blocking gates with metrics
- ⚠️ We validate but don't STOP on failures

**RECOMMENDATION**: Add explicit quality gates to orchestrators!

---

### From zhsama/claude-sub-agent - Spec-Driven Workflow

**KEY FINDING**: This repo shows a **complete workflow orchestration** from requirements to deployment!

#### Agent Chain

```
spec-analyst (requirements)
  ↓
spec-architect (design)
  ↓
spec-planner (tasks)
  ↓
spec-developer (code + tests)
  ↓
spec-tester (test suites)
  ↓
spec-reviewer (code review)
  ↓
spec-validator (quality metrics)
```

#### Plan File Formats (Artifact-Based Communication)

Each agent produces **structured documentation artifacts**:

**Phase 1 Output**:
- `requirements.md` / `user-stories.md`

**Phase 2 Output**:
- `architecture.md` / `api-spec.md`

**Phase 3 Output**:
- `tasks.md` / `test-plan.md`

**Phase 4 Output**:
- Source code + unit tests

**Phase 5 Output**:
- Test suites + coverage reports

**Phase 6 Output**:
- Review reports

**Phase 7 Output**:
- Validation reports + quality scores

**OUR EQUIVALENT**:
```
bug-hunter → bug-hunting-report.md
security-scanner → security-audit-report.md
version-updater → version-update-report-X.Y.Z.md
```

✅ We follow this pattern!

#### Quality Gates as Signal Files

**Gate 1 (Planning)**: 95% threshold
- Requirements completeness
- Architecture feasibility
- Task breakdown quality

**Gate 2 (Development)**: 80% threshold
- Test coverage
- Code quality metrics
- Security scans
- Performance benchmarks

**Gate 3 (Production)**: 85% threshold
- Overall quality score
- Documentation completeness
- Deployment readiness

**Failed gates trigger feedback loops** back to earlier phases.

**OUR STATUS**:
- ⚠️ We have validation but no numeric thresholds
- ❌ We don't have feedback loops back to earlier phases
- ⚠️ Our orchestrators progress linearly (no back-tracking)

**POTENTIAL IMPROVEMENT**: Add retry logic with automatic phase rollback!

#### Orchestrator Coordination Pattern

The spec-orchestrator:
1. Sequences three phases: Planning → Development → Validation
2. Routes outputs from one agent as inputs to next
3. Enforces quality gates between phases
4. Supports phase skipping via `--skip-agent`, `--phase` options

**OUR EQUIVALENT**: Our health orchestrators do similar sequencing!

---

## 3. Skills vs Agents - Official Documentation

### What Are Skills?

From official docs:

> "Skills package expertise into discoverable capabilities. Each Skill consists of a SKILL.md file with instructions that Claude reads when relevant, plus optional supporting files like scripts and templates."

**KEY DISTINCTION**:
- **Skills are model-invoked** (Claude decides when to use them)
- **Slash commands are user-invoked** (user types `/command`)

### When to Use Skills

Skills excel for:
- ✅ Extending Claude's capabilities for specific workflows
- ✅ Sharing expertise across teams via git
- ✅ Reducing repetitive prompting
- ✅ Composing multiple Skills for complex tasks

### Skills Storage Options

**1. Personal Skills**: `~/.claude/skills/`
- Available across all projects
- Ideal for individual workflows

**2. Project Skills**: `.claude/skills/`
- Shared with team through git
- Auto-available to team members

**3. Plugin Skills**: Bundled with plugins
- Auto-available when plugin installed

### Skill Structure

```
skill-name/
├── SKILL.md (required)
├── supporting-files.md (optional)
└── scripts/ (optional)
```

### SKILL.md Format

```yaml
---
name: Your Skill Name
description: Brief description of what this Skill does and when to use it
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Claude.
```

**CRITICAL**: The `description` field determines when Claude uses the Skill!

### Restricting Tool Access

```yaml
---
name: Safe File Reader
description: Read files without modification capabilities
allowed-tools: Read, Grep, Glob  # Only these tools
---
```

### Skills vs Agents Decision Matrix

| Criterion | Skill | Agent |
|-----------|-------|-------|
| **Context** | Shares parent context | Isolated context |
| **Complexity** | Single task | Multi-step workflow |
| **Invocation** | Automatic by Claude | Explicit via Task tool or auto-match |
| **State** | Stateless | Can be stateful |
| **Tools** | Can be restricted | Full tool access (or restricted) |
| **File Count** | Single SKILL.md + optional files | Single agent.md |
| **Coordination** | Cannot coordinate agents | Can coordinate (orchestrators) |

### When to Choose Skills

**Use Skills for**:
- Formatting output (JSON, YAML, XML)
- Validating data structures
- Running common scripts
- Parsing logs
- Generating boilerplate
- Simple transformations

**Use Agents for**:
- Multi-step workflows
- Coordinating other agents
- Complex analysis requiring isolation
- Tasks needing separate context

### Examples of Good Skill Candidates from Our Codebase

❌ **Currently Agents (should be Skills)**:
1. Parse `package.json` for version
2. Format git commit messages
3. Validate JSON plan files
4. Generate timestamps
5. Extract file extensions
6. Count lines of code
7. Parse git diff output
8. Format markdown tables
9. Validate semver strings
10. Convert relative to absolute paths

✅ **Currently Agents (should stay Agents)**:
- bug-hunter (multi-step: scan → analyze → report)
- bug-fixer (multi-step: fix → validate → report)
- version-updater (multi-step: find → update → validate)
- All orchestrators (coordinate multiple agents)

---

## 4. Synthesis: The Complete Picture

### How Orchestrators ACTUALLY Work

Based on ALL research sources, here's the definitive pattern:

#### Step-by-Step Flow

**1. Orchestrator Invocation** (by user or parent orchestrator)
```
User: "Use bug-orchestrator to find and fix bugs"
  ↓
Main Claude session invokes bug-orchestrator agent
```

**2. Orchestrator Creates Plan**
```markdown
bug-orchestrator:
  1. Analyzes request
  2. Creates .bug-hunter-plan.json:
     {
       "priority": "Critical",
       "scope": ["type-check", "build"],
       "exclude": ["node_modules", "dist"]
     }
  3. Updates TodoWrite: "Phase 1: Bug Detection"
```

**3. Orchestrator Signals Readiness**
```markdown
bug-orchestrator reports to user:
  "Phase 1 complete. Ready for bug detection.

   The bug-hunter agent will be automatically invoked to:
   - Run type-check to find type errors
   - Run build to find compilation errors
   - Analyze patterns for common bugs
   - Generate bug-hunting-report.md

   Note: The main Claude session will handle invocation automatically."
```

**4. Main Claude Session Auto-Invokes Worker**
```
Main session sees context:
  - .bug-hunter-plan.json exists
  - Orchestrator signaled "bug-hunter"
  - bug-hunter agent description matches context

Main session invokes: bug-hunter agent
```

**5. Worker Executes**
```markdown
bug-hunter:
  1. Reads .bug-hunter-plan.json
  2. Runs: pnpm type-check
  3. Runs: pnpm build
  4. Analyzes output
  5. Creates bug-hunting-report.md:
     - Critical bugs: 5
     - High bugs: 10
     - Validation: ✅ PASSED
  6. Returns control to main session
```

**6. Main Session Returns to Orchestrator**
```
Main session: "bug-hunter completed work"
  ↓
Orchestrator re-invoked to continue
```

**7. Orchestrator Validates**
```markdown
bug-orchestrator:
  1. Reads bug-hunting-report.md
  2. Validates: Report shows 15 bugs found
  3. Checks: Validation status ✅ PASSED
  4. Updates TodoWrite: "Phase 1: Complete ✅"
  5. Proceeds to Phase 2: Bug Fixing
```

**8. Repeat for Next Phase**
```markdown
bug-orchestrator:
  1. Creates .bug-fixer-plan.json (priority: Critical)
  2. Signals readiness for bug-fixer
  3. [Cycle repeats]
```

### The "Waiting" Mechanism

**CRITICAL UNDERSTANDING**: There is **NO explicit waiting**!

Instead:
1. Orchestrator creates plan file
2. Orchestrator **returns control** to main session
3. Main session sees context and auto-invokes worker
4. Worker completes and returns
5. Main session re-invokes orchestrator

**IT'S NOT WAITING - IT'S RETURNING CONTROL!**

### What Orchestrators Can/Cannot Do

#### ✅ CAN DO:
- Read files (check for report files)
- Write files (create plan files, summaries)
- Grep/Glob (discover files)
- Bash **for validation** (git status, npm --version, check env)
- TodoWrite (track progress)
- Analyze reports
- Make decisions
- Signal readiness

#### ❌ CANNOT DO (violates pattern):
- Bash **for worker tasks** (npm test, pnpm build, running scans)
- Task tool to invoke subagents
- Implementation work
- Directly execute what workers should do
- Skip creating plan files
- Skip creating handoff artifacts

### The Tag/Marker Pattern

From Typhren, we learned about **metacognitive tags** for handoffs:

**OUR EQUIVALENT**: Plan files with structured data

**Typhren's Pattern**:
```markdown
## Planning Output
#PATH_DECISION Selected REST over GraphQL
#PLAN_UNCERTAINTY Database scaling strategy unclear
#EXPORT_CRITICAL Must support 10K concurrent users
```

**Our Pattern** (equivalent):
```json
{
  "decisions": {
    "architecture": "REST",
    "uncertainties": ["Database scaling strategy unclear"],
    "critical_requirements": ["Support 10K concurrent users"]
  }
}
```

Both achieve the same goal: **structured information passing**.

---

## 5. Skills Architecture Design

### What We Need

Based on Skills documentation and our current architecture:

#### Directory Structure

```
.claude/
├── skills/                    # Project-wide skills
│   ├── parse-package-json/
│   │   └── SKILL.md
│   ├── format-commit-message/
│   │   └── SKILL.md
│   ├── validate-plan-file/
│   │   ├── SKILL.md
│   │   └── schema.json
│   └── generate-report-header/
│       ├── SKILL.md
│       └── template.md
```

#### Skill Examples

**Skill 1: Parse Package JSON**
```yaml
---
name: parse-package-json
description: Extract version, dependencies, and metadata from package.json files. Use when needing to read project version or dependency information.
allowed-tools: Read
---

# Parse Package JSON

Extract structured information from package.json files.

## Instructions

1. Use Read tool to load package.json
2. Parse as JSON
3. Extract relevant fields:
   - version
   - name
   - dependencies (if needed)
   - devDependencies (if needed)
4. Return structured data:
   ```json
   {
     "name": "project-name",
     "version": "1.2.3",
     "dependencies": {...}
   }
   ```

## Error Handling
- If file doesn't exist: Report error clearly
- If JSON invalid: Report parsing error
- If field missing: Return null for that field
```

**Skill 2: Validate Plan File**
```yaml
---
name: validate-plan-file
description: Validate that plan files (*.json in root) conform to expected schema. Use before agents read plan files to catch format errors early.
allowed-tools: Read
---

# Validate Plan File

Check plan file structure and required fields.

## Instructions

1. Read the plan file using Read tool
2. Validate JSON syntax
3. Check required fields:
   - `phase` (number)
   - `config` (object)
4. Check optional fields:
   - `validation` (object with required/optional arrays)
   - `nextAgent` (string)
5. Return validation result:
   ```json
   {
     "valid": true/false,
     "errors": ["list of errors if any"],
     "warnings": ["list of warnings"]
   }
   ```

## Schema File
See schema.json in this directory for full specification.
```

#### Candidates for Skills Migration

From our current codebase (HIGH PRIORITY):

1. **parse-package-json** - Extract version/dependencies
2. **validate-plan-file** - Check plan file format
3. **format-commit-message** - Generate standard commit format
4. **generate-report-header** - Standard report headers with timestamp
5. **parse-git-status** - Parse `git status` output
6. **extract-version** - Parse version strings (semver)
7. **format-todo-list** - Generate TodoWrite formatted lists
8. **validate-report-file** - Check report format
9. **calculate-priority-score** - Determine bug/issue priority
10. **format-markdown-table** - Generate formatted tables

### Agent Integration with Skills

Agents can use Skills just like built-in tools:

**Agent Code** (conceptual):
```markdown
## Step 1: Get Current Version

Use the parse-package-json Skill to extract the current version.

Expected output: { "version": "0.7.0" }

## Step 2: Calculate New Version

Based on change type (patch/minor/major), calculate new version.
```

**How Claude Interprets**:
1. Sees "parse-package-json" mentioned
2. Checks Skills directory
3. Finds matching Skill description
4. Invokes Skill with appropriate context
5. Receives structured output
6. Continues with agent logic

---

## 6. Updated Recommendations

### Phase 2: Architecture Design (5-7 hours)

**1. Fix Architecture Guide** (2 hours)
- ✅ Remove Task tool anti-pattern examples (lines 686-707)
- ✅ Add correct "Return Control" pattern explanation
- ✅ Add hub-and-spoke pattern from vanzan01
- ✅ Add tag/marker handoff pattern from Typhren
- ✅ Add quality gates with blocking
- ✅ Update communication protocol section

**2. Design Skills Architecture** (2 hours)
- ✅ Create `.claude/skills/` directory structure
- ✅ Define 10 Skills (starting with parse-package-json)
- ✅ Create SKILL.md template
- ✅ Document Skills vs Agents decision criteria
- ✅ Create Skills integration guide for agents

**3. Update CLAUDE.md as Behavioral OS** (1 hour)
- ✅ Add project conventions
- ✅ Add agent invocation patterns
- ✅ Add file organization rules
- ✅ Add quality standards
- ✅ Make it authoritative reference

**4. Design Hook System (Optional)** (1 hour)
- ✅ Create `.claude/hooks/` directory
- ✅ Define validation hooks
- ✅ Create example: validate-file-location.sh
- ✅ Create example: validate-plan-file.sh
- ✅ Document hook patterns

**5. Add Quality Gates Specification** (1 hour)
- ✅ Define metrics for each domain
- ✅ Create gate threshold configuration
- ✅ Document blocking vs non-blocking criteria
- ✅ Add feedback loop patterns

### Phase 3: Implementation Planning (2-3 hours)

**1. Create Orchestrators Refactoring Spec** (1 hour)
- For each of 5 orchestrators:
  - Current violations
  - Required terminology changes
  - Quality gates to add
  - Validation to add

**2. Create Skills Implementation Spec** (1 hour)
- Priority order for 10 Skills
- Dependencies between Skills
- Testing strategy
- Agent integration points

**3. Create Standardized Report Template** (30 min)
- Required sections
- Validation section format
- Metadata format
- Examples

**4. Create Verification Agent Spec** (30 min)
- Separate verification from orchestrators
- Define verification patterns
- Integration with existing flow

### Phase 4: Implementation (6-8 hours)

**1. Fix Orchestrator Terminology** (1 hour)
- 23 instances of "Launch" → "Signal"
- Remove Task tool references
- Add "Return Control" explanations

**2. Implement Skills** (3-4 hours)
- Create 10 SKILL.md files
- Add supporting files (schemas, templates)
- Test each Skill independently
- Document integration patterns

**3. Add Quality Gates** (1 hour)
- Add gates to each orchestrator
- Add blocking logic
- Add metrics thresholds
- Test gate failures

**4. Update CLAUDE.md** (30 min)
- Add behavioral rules
- Add conventions
- Make authoritative

**5. Implement Hooks (Optional)** (1-2 hours)
- Create validation scripts
- Add to settings.json
- Test hook execution
- Document hook patterns

**6. Add Verification Agents (Optional)** (1 hour)
- Create verification agent template
- Integrate with orchestrators
- Test verification flow

### Phase 5: Validation (3-4 hours)

**1. End-to-End Testing** (2 hours)
- Test `/health quick`
- Test `/health full`
- Test each orchestrator independently
- Test Skills invocation

**2. Pattern Compliance Audit** (1 hour)
- Check all orchestrators follow patterns
- Verify no Task tool usage
- Verify quality gates work
- Verify Skills integration

**3. Generate Final Report** (1 hour)
- Document all changes
- Create migration guide
- Update user documentation
- Create validation report

---

## 7. Critical Findings Summary

### What We Got RIGHT ✅

1. **Orchestrator Pattern**: Our orchestrators already follow the correct pattern
   - Create plan files ✅
   - Workers read plans ✅
   - Workers generate reports ✅
   - Orchestrators validate reports ✅

2. **Separation of Concerns**: Good boundaries
   - Orchestrators coordinate ✅
   - Workers execute ✅
   - Clear responsibilities ✅

3. **Hub-and-Spoke**: code-health-orchestrator is a central hub ✅

4. **Artifact-Based Communication**: Plan files + report files ✅

### What We Got WRONG ❌

1. **Documentation Anti-Patterns**: Architecture guide shows Task tool usage
2. **Terminology**: 23 instances of "Launch" instead of "Signal"
3. **No Skills**: Everything is an agent
4. **No Quality Gates**: Validation exists but no explicit blocking gates
5. **No Hooks**: No automated enforcement
6. **No Verification Agents**: Orchestrators do verification themselves
7. **CLAUDE.md Not Used**: Not serving as behavioral OS

### What We're MISSING ⚠️

1. **Skills Architecture**: Need for simple utilities
2. **Quality Gates**: Numeric thresholds and blocking
3. **Pre-Flight Validation**: Phase 0 checks
4. **Verification Agents**: Separate from orchestrators
5. **Feedback Loops**: No automatic retry/rollback
6. **Complexity Scoring**: No automatic task assessment
7. **Hook System**: No automated enforcement

---

## 8. Key Insights from Research

### Insight 1: Context-Based Auto-Invocation

The "Signal Readiness" pattern is **NOT about waiting** - it's about:
1. Creating the right context (plan files)
2. Signaling what work is needed (clear message)
3. Returning control to main session
4. Main session auto-invoking based on description matching

**IMPLICATION**: Agent descriptions are CRITICAL for auto-invocation!

### Insight 2: Orchestrators are Pure Coordinators

From Typhren:
> "Orchestrator must remain a pure coordinator and avoid implementation work. Early attempts allowing orchestrator to help resulted in degraded plan quality."

**IMPLICATION**: Strict boundary enforcement is essential!

### Insight 3: Skills vs Agents is About Complexity

Not about size or function count, but about:
- **Complexity of workflow** (single task vs multi-step)
- **Need for context isolation** (share vs isolate)
- **Coordination requirements** (standalone vs coordinates others)

**IMPLICATION**: Many of our "agents" should be Skills!

### Insight 4: Hooks Enable Enforcement

From vanzan01:
> "Hook system enforces test-first development before any code gets written."

**IMPLICATION**: Don't rely on documentation alone - enforce with hooks!

### Insight 5: Quality Gates Must Block

From vanzan01:
> "Quality gates block completion until standards are met."

**IMPLICATION**: Our validation should STOP progression on failures!

### Insight 6: Hub-and-Spoke Prevents Chaos

From vanzan01:
> "Central routing eliminates peer-to-peer communication chaos."

**IMPLICATION**: Always route through orchestrator, never direct agent-to-agent!

### Insight 7: CLAUDE.md is Behavioral OS

From vanzan01:
> "CLAUDE.md establishes prime directives that override default agent behavior."

**IMPLICATION**: Use CLAUDE.md to document and enforce patterns!

### Insight 8: Token Cost Matters

From GoatReview:
> "Subagents use 3-4x more tokens than single-threaded assistance."

**IMPLICATION**: Use orchestration judiciously, not for everything!

---

## 9. Risk Assessment (Updated)

### HIGH RISK ⚠️

**1. Breaking Existing Workflows**
- **Risk**: Terminology changes might confuse existing prompts
- **Mitigation**: Version the docs, provide migration guide

**2. Skills Migration Complexity**
- **Risk**: Unclear what should be Skill vs Agent
- **Mitigation**: Start with obvious 10 candidates, iterate

**3. Hook System Breakage**
- **Risk**: Hooks might block legitimate operations
- **Mitigation**: Make hooks optional, test thoroughly

### MEDIUM RISK ⚠️

**1. Quality Gates Too Strict**
- **Risk**: Gates might block valid workflows
- **Mitigation**: Make thresholds configurable, allow overrides

**2. Agent Description Changes**
- **Risk**: Changing descriptions might affect auto-invocation
- **Mitigation**: Test auto-invocation thoroughly

**3. Report Format Changes**
- **Risk**: Existing tools might parse old format
- **Mitigation**: Support both formats temporarily

### LOW RISK ✅

**1. Skills Addition**
- **Risk**: Minimal - additive change
- **Mitigation**: None needed

**2. CLAUDE.md Enhancement**
- **Risk**: Minimal - documentation change
- **Mitigation**: None needed

**3. Architecture Guide Fixes**
- **Risk**: Minimal - correcting anti-patterns
- **Mitigation**: None needed

---

## 10. Execution Plan Summary

### Phase 2: Architecture Design (5-7 hours)
1. Fix architecture guide
2. Design Skills architecture
3. Update CLAUDE.md
4. Design hook system (optional)
5. Add quality gates spec

### Phase 3: Planning (2-3 hours)
1. Create orchestrators refactoring spec
2. Create Skills implementation spec
3. Create report template
4. Create verification agent spec (optional)

### Phase 4: Implementation (6-8 hours)
1. Fix orchestrator terminology
2. Implement 10 Skills
3. Add quality gates
4. Update CLAUDE.md
5. Implement hooks (optional)
6. Add verification agents (optional)

### Phase 5: Validation (3-4 hours)
1. End-to-end testing
2. Pattern compliance audit
3. Generate final report

**TOTAL ESTIMATED TIME**: 16-22 hours

**CRITICAL PATH**: Phase 2 → Phase 3 → Phase 4 → Phase 5 (sequential)

---

## Appendix: Key Quotes from Research

### On Orchestrators

> "Orchestrator must remain a pure coordinator and avoid implementation work. Early attempts allowing orchestrator to help resulted in degraded plan quality." - Typhren

> "Central routing eliminates peer-to-peer communication chaos." - vanzan01

### On Skills

> "Skills package expertise into discoverable capabilities." - Claude Code Docs

> "Skills are model-invoked: Claude autonomously decides when to use them." - Claude Code Docs

### On Quality

> "Quality gates block completion until standards are met." - vanzan01

> "Hook system enforces test-first development before any code gets written." - vanzan01

### On Cost

> "Subagents use 3-4x more tokens than single-threaded assistance." - GoatReview

### On Communication

> "Subagents are autonomous AI entities maintaining independent context - like specialized team members working in parallel." - GoatReview

---

## Conclusion

This research confirms that our **fundamental architecture is sound**, but we have:

1. ✅ **Good Implementation**: Orchestrators follow correct patterns in code
2. ❌ **Bad Documentation**: Architecture guide teaches anti-patterns
3. ⚠️ **Missing Features**: Skills, hooks, quality gates, verification agents

**The good news**: We're 85% there! We just need refinement, not overhaul.

**The path forward**: Execute Phases 2-5 systematically (16-22 hours)

**The risk**: Low to medium - mostly additive changes

**The benefit**: Production-ready, architecturally sound agent ecosystem

---

**Report Completed**: 2025-10-16
**All Sources Reviewed**: ✅ Complete
**Next Step**: Begin Phase 2 - Architecture Design

