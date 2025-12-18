# Master Task: Agent Ecosystem Architecture Refactoring

**Status**: Not Started
**Priority**: Critical
**Created**: 2025-10-16
**Type**: Master Task (coordinates subtasks)

---

## Overview

This is a **master coordination task** that orchestrates the complete refactoring of our Claude Code agent ecosystem. It breaks down a large architectural improvement into manageable, independent subtasks that can be executed sequentially or in parallel where appropriate.

---

## Vision

Create a **production-ready, architecturally sound agent ecosystem** where:

- **Commands** describe user intent in natural language
- **Skills** provide reusable utility functions
- **Orchestrators** coordinate complex workflows without doing work themselves
- **Workers** execute specific, focused tasks
- **Shell scripts** handle system-level operations efficiently
- **Everything follows correct Signal Readiness pattern**

---

## Current State Assessment

### ✅ What Works
- Commands describe tasks (Pattern 2 mostly compliant)
- Workers are well-designed specialists (Pattern 1 compliant)
- MCP integration is context-aware
- Architecture guide exists as reference

### ❌ What's Broken
- **Orchestrators violate Pattern 3**: They execute worker tasks themselves instead of waiting
- **No Skills**: Simple utilities could be Skills for better reusability
- **Unclear boundaries**: When to use orchestrator vs worker vs skill vs script
- **No validation**: Patterns aren't tested in practice

### ⚠️ What's Unknown
- Correct Signal Readiness implementation details
- Skills vs Agents decision criteria
- Best practices from community repositories
- Performance implications of different patterns

---

## Subtasks Breakdown

### Phase 1: Research & Analysis (Parallel Execution OK)

**Subtask 1.1**: Research Sub-Agent Patterns
- File: `docs/SUBTASK-1.1-RESEARCH-SUBAGENT-PATTERNS.md`
- Duration: 2-3 hours
- Dependencies: None
- Deliverable: Research findings document

**Subtask 1.2**: Research Claude Code Skills
- File: `docs/SUBTASK-1.2-RESEARCH-SKILLS.md`
- Duration: 1-2 hours
- Dependencies: None
- Deliverable: Skills usage guide and recommendations

**Subtask 1.3**: Analyze Current Architecture
- File: `docs/SUBTASK-1.3-ANALYZE-CURRENT-ARCHITECTURE.md`
- Duration: 1-2 hours
- Dependencies: None
- Deliverable: Architecture analysis report with violations and recommendations

---

### Phase 2: Architecture Design (Sequential after Phase 1)

**Subtask 2.1**: Update Architecture Guide
- File: `docs/SUBTASK-2.1-UPDATE-ARCHITECTURE-GUIDE.md`
- Duration: 2-3 hours
- Dependencies: Subtasks 1.1, 1.2, 1.3
- Deliverable: Updated `ai-agents-architecture-guide.md`

**Subtask 2.2**: Design Skills Architecture
- File: `docs/SUBTASK-2.2-DESIGN-SKILLS-ARCHITECTURE.md`
- Duration: 1-2 hours
- Dependencies: Subtask 1.2
- Deliverable: Skills design specification

**Subtask 2.3**: Design Shell Scripts Architecture
- File: `docs/SUBTASK-2.3-DESIGN-SCRIPTS-ARCHITECTURE.md`
- Duration: 1 hour
- Dependencies: Subtask 1.3
- Deliverable: Scripts design specification

---

### Phase 3: Implementation Planning (Sequential after Phase 2)

**Subtask 3.1**: Create Orchestrators Refactoring Spec
- File: `docs/SUBTASK-3.1-ORCHESTRATORS-REFACTORING-SPEC.md`
- Duration: 1-2 hours
- Dependencies: Subtask 2.1
- Deliverable: Detailed refactoring plan for all 5 orchestrators

**Subtask 3.2**: Create Skills Implementation Spec
- File: `docs/SUBTASK-3.2-SKILLS-IMPLEMENTATION-SPEC.md`
- Duration: 1 hour
- Dependencies: Subtask 2.2
- Deliverable: Detailed Skills creation plan

**Subtask 3.3**: Create Scripts Implementation Spec
- File: `docs/SUBTASK-3.3-SCRIPTS-IMPLEMENTATION-SPEC.md`
- Duration: 30 minutes
- Dependencies: Subtask 2.3
- Deliverable: Detailed scripts creation plan

---

### Phase 4: Implementation (Can be partially parallel)

**Subtask 4.1**: Fix Orchestrators
- File: `docs/SUBTASK-4.1-FIX-ORCHESTRATORS.md`
- Duration: 3-4 hours
- Dependencies: Subtask 3.1
- Deliverable: All 5 orchestrators following correct patterns

**Subtask 4.2**: Implement Skills
- File: `docs/SUBTASK-4.2-IMPLEMENT-SKILLS.md`
- Duration: 2-3 hours
- Dependencies: Subtask 3.2
- Can run in parallel with: Subtask 4.1
- Deliverable: Working Skills with tests

**Subtask 4.3**: Implement Scripts
- File: `docs/SUBTASK-4.3-IMPLEMENT-SCRIPTS.md`
- Duration: 1-2 hours
- Dependencies: Subtask 3.3
- Can run in parallel with: Subtask 4.1, 4.2
- Deliverable: Shell scripts with documentation

**Subtask 4.4**: Update Workers Integration
- File: `docs/SUBTASK-4.4-UPDATE-WORKERS-INTEGRATION.md`
- Duration: 1-2 hours
- Dependencies: Subtasks 4.1, 4.2, 4.3
- Deliverable: Workers properly integrated with Skills and updated orchestrators

---

### Phase 5: Validation & Documentation (Sequential after Phase 4)

**Subtask 5.1**: End-to-End Testing
- File: `docs/SUBTASK-5.1-E2E-TESTING.md`
- Duration: 2-3 hours
- Dependencies: All Phase 4 subtasks
- Deliverable: Test results and validation report

**Subtask 5.2**: Create Final Documentation
- File: `docs/SUBTASK-5.2-CREATE-DOCUMENTATION.md`
- Duration: 1-2 hours
- Dependencies: Subtask 5.1
- Deliverable: Complete documentation suite

---

## Execution Strategy

### Sequential Approach (Safer)
```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
```
- **Pros**: Lower risk, clear dependencies
- **Cons**: Longer total time (10-12 hours)
- **Recommended for**: Solo execution or first-time implementation

### Parallel Approach (Faster)
```
Phase 1 (all parallel) →
Phase 2 (2.2 and 2.3 can be parallel) →
Phase 3 (all parallel) →
Phase 4 (4.1, 4.2, 4.3 parallel, then 4.4) →
Phase 5 (sequential)
```
- **Pros**: Faster total time (6-8 hours)
- **Cons**: Higher complexity, needs careful coordination
- **Recommended for**: Team execution or experienced implementer

---

## Success Criteria

### Architecture Quality
- [ ] All patterns clearly defined and documented
- [ ] Clear decision criteria for Commands vs Skills vs Agents vs Scripts
- [ ] Examples provided for each pattern
- [ ] Anti-patterns documented

### Implementation Quality
- [ ] All 5 orchestrators follow correct Signal Readiness pattern
- [ ] All 8 workers properly integrated
- [ ] Skills created for reusable utilities
- [ ] Scripts created for system operations
- [ ] Zero orchestrators execute worker tasks directly

### Validation Quality
- [ ] `/health quick` executes end-to-end successfully
- [ ] Workers are automatically invoked by orchestrators
- [ ] Plan files and signal files work correctly
- [ ] Skills can be invoked by agents
- [ ] Documentation is accurate and complete

---

## Deliverables Checklist

### Documentation
- [ ] Updated `ai-agents-architecture-guide.md`
- [ ] Skills usage guide
- [ ] Scripts documentation
- [ ] All 14 subtask specification files
- [ ] Final validation report

### Code
- [ ] 5 refactored orchestrator files
- [ ] N Skills files (TBD based on research)
- [ ] M shell scripts (TBD based on research)
- [ ] Updated worker files (if needed)

### Tests
- [ ] End-to-end test results
- [ ] Pattern compliance validation
- [ ] Performance benchmarks

---

## Dependencies Graph

```
┌─────────────────────────────────────────────────────────┐
│                    Phase 1: Research                    │
│  [1.1 Patterns] [1.2 Skills] [1.3 Current Analysis]    │
│        ↓              ↓              ↓                  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                 Phase 2: Architecture                   │
│    [2.1 Guide] ← (1.1, 1.2, 1.3)                       │
│    [2.2 Skills Design] ← (1.2)                         │
│    [2.3 Scripts Design] ← (1.3)                        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│               Phase 3: Planning                         │
│    [3.1 Orchestrators Spec] ← (2.1)                    │
│    [3.2 Skills Spec] ← (2.2)                           │
│    [3.3 Scripts Spec] ← (2.3)                          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              Phase 4: Implementation                    │
│    [4.1 Fix Orchestrators] ← (3.1)                     │
│    [4.2 Implement Skills] ← (3.2)                      │
│    [4.3 Implement Scripts] ← (3.3)                     │
│    [4.4 Update Workers] ← (4.1, 4.2, 4.3)              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              Phase 5: Validation                        │
│    [5.1 E2E Testing] ← (all Phase 4)                   │
│    [5.2 Documentation] ← (5.1)                         │
└─────────────────────────────────────────────────────────┘
```

---

## Risk Assessment

### High Risk Areas
1. **Orchestrator refactoring**: May break existing workflows
   - **Mitigation**: Test each orchestrator individually before integration

2. **Skills creation**: Unclear boundaries with workers
   - **Mitigation**: Research phase will establish clear criteria

3. **Signal Readiness pattern**: May not work as expected
   - **Mitigation**: Prototype with one orchestrator first

### Medium Risk Areas
1. **Workers integration**: May need updates for Skills
   - **Mitigation**: Minimal changes, focused on invocation

2. **Documentation accuracy**: May miss edge cases
   - **Mitigation**: Validation phase will catch discrepancies

### Low Risk Areas
1. **Scripts creation**: Straightforward shell scripting
2. **Commands**: Already mostly compliant

---

## Timeline Estimates

### Conservative (Sequential)
- Phase 1: 4-5 hours
- Phase 2: 4-5 hours
- Phase 3: 2-3 hours
- Phase 4: 6-9 hours
- Phase 5: 3-4 hours
- **Total**: 19-26 hours

### Optimistic (Parallel)
- Phase 1: 3 hours (parallel)
- Phase 2: 3 hours (mostly parallel)
- Phase 3: 2 hours (parallel)
- Phase 4: 5 hours (parallel then sequential)
- Phase 5: 3 hours (sequential)
- **Total**: 16 hours

### Realistic (Mixed)
- Phase 1: 3 hours (parallel)
- Phase 2: 4 hours (sequential)
- Phase 3: 2 hours (parallel)
- Phase 4: 6 hours (mostly parallel)
- Phase 5: 3 hours (sequential)
- **Total**: 18 hours

---

## Next Steps

1. **Review this master task** to ensure scope is appropriate
2. **Choose execution strategy** (sequential, parallel, or mixed)
3. **Create subtask files** for each phase as needed
4. **Start with Phase 1 subtasks** (research)
5. **Iterate through phases** updating master task status

---

## Status Tracking

### Phase 1: Research & Analysis
- [ ] Subtask 1.1: Research Sub-Agent Patterns - **Not Started**
- [ ] Subtask 1.2: Research Claude Code Skills - **Not Started**
- [ ] Subtask 1.3: Analyze Current Architecture - **Not Started**

### Phase 2: Architecture Design
- [ ] Subtask 2.1: Update Architecture Guide - **Not Started**
- [ ] Subtask 2.2: Design Skills Architecture - **Not Started**
- [ ] Subtask 2.3: Design Shell Scripts Architecture - **Not Started**

### Phase 3: Implementation Planning
- [ ] Subtask 3.1: Create Orchestrators Refactoring Spec - **Not Started**
- [ ] Subtask 3.2: Create Skills Implementation Spec - **Not Started**
- [ ] Subtask 3.3: Create Scripts Implementation Spec - **Not Started**

### Phase 4: Implementation
- [ ] Subtask 4.1: Fix Orchestrators - **Not Started**
- [ ] Subtask 4.2: Implement Skills - **Not Started**
- [ ] Subtask 4.3: Implement Scripts - **Not Started**
- [ ] Subtask 4.4: Update Workers Integration - **Not Started**

### Phase 5: Validation & Documentation
- [ ] Subtask 5.1: End-to-End Testing - **Not Started**
- [ ] Subtask 5.2: Create Final Documentation - **Not Started**

---

**Master Task Created**: 2025-10-16
**Estimated Total Effort**: 16-26 hours depending on approach
**Critical Path**: Sequential through all phases
**Parallelization Potential**: High in Phase 1, Medium in Phase 4

---

## Notes for Executor

- This is a **coordination document**, not an execution document
- Each subtask has its own detailed specification file
- Update status as subtasks complete
- Document any deviations from plan
- Capture lessons learned for future reference
- Consider creating git branches for major changes
