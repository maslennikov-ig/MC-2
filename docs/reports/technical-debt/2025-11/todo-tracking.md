# TODO Comments Tracking Document

**Generated**: 2025-11-20T16:45:00Z
**Source**: Bug Hunting Report - Low Priority Issue LOW-1
**Total TODOs Found**: 16 (down from 29 reported)
**Status**: Tracked as Technical Debt

---

## Overview

This document tracks all TODO/FIXME comments found in the codebase. Each TODO has been categorized, prioritized, and converted into actionable technical debt items.

---

## Security & Access Control (2 TODOs)

### TODO-001: Add SuperAdmin Role Check for Cross-Org Analytics
- **File**: `packages/course-gen-platform/src/server/routers/summarization.ts:190`
- **Category**: Security / Authorization
- **Priority**: HIGH
- **Description**: Missing role check allows potential unauthorized access to cross-organization analytics
- **Impact**: Security vulnerability - users may access data from other organizations
- **Estimated Effort**: 2 hours
- **Code Context**:
```typescript
// Line 190
// TODO: Add SuperAdmin role check for cross-org analytics
```
- **Recommended Action**:
  1. Add SuperAdmin role validation before cross-org queries
  2. Add tests for role-based access control
  3. Audit all analytics endpoints for similar issues

---

## Resource Management (1 TODO)

### TODO-002: Add Cleanup for Server Resources
- **File**: `packages/course-gen-platform/src/server/index.ts:403`
- **Category**: Resource Management / Memory Leaks
- **Priority**: MEDIUM
- **Description**: Server shutdown doesn't clean up all resources
- **Impact**: Potential memory leaks on server restart/shutdown
- **Estimated Effort**: 3 hours
- **Code Context**:
```typescript
// Line 403
// TODO: Add cleanup for:
// - Database connections
// - Redis connections
// - Timer intervals
// - Pending async operations
```
- **Recommended Action**:
  1. Implement graceful shutdown handler
  2. Add cleanup for database connections
  3. Add cleanup for Redis connections
  4. Clear all intervals/timeouts
  5. Wait for pending operations to complete

---

## Analysis Workflow Implementation (9 TODOs)

### TODO-003: Implement Stage 3 Barrier Check
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts:95`
- **Category**: Feature Implementation / Workflow
- **Priority**: MEDIUM
- **Description**: Stage 3 barrier check not implemented
- **Impact**: Workflow may proceed without proper validation
- **Estimated Effort**: 4 hours
- **Code Context**:
```typescript
// Line 95
// TODO: Implement Stage 3 barrier check
```
- **Recommended Action**: Implement barrier logic to ensure Stage 2 completes successfully before Stage 3 begins

---

### TODO-004: Implement Full Classification Logic
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts:120`
- **Category**: Feature Implementation / AI
- **Priority**: HIGH
- **Description**: Classification node using stub instead of actual LLM call
- **Impact**: Phase 1 classifier not functioning properly
- **Estimated Effort**: 6 hours
- **Code Context**:
```typescript
// Line 120
// TODO: Implement full classification logic
```
- **Dependencies**: TODO-005
- **Recommended Action**: Replace stub with LangChain LLM integration

---

### TODO-005: Replace Classification Stub with LLM Call
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts:133`
- **Category**: Feature Implementation / AI
- **Priority**: HIGH
- **Description**: Stub code instead of actual LLM invocation
- **Impact**: Phase 1 returns mock data
- **Estimated Effort**: 4 hours
- **Code Context**:
```typescript
// Line 133
// TODO: Replace stub with actual LLM call
```
- **Recommended Action**: Integrate with LLM service, add retry logic, add error handling

---

### TODO-006: Implement Full Expert Analysis Logic
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts:247`
- **Category**: Feature Implementation / AI
- **Priority**: HIGH
- **Description**: Expert analysis node using stub
- **Impact**: Phase 3 expert analysis not functioning
- **Estimated Effort**: 8 hours
- **Code Context**:
```typescript
// Line 247
// TODO: Implement full expert analysis logic
```
- **Dependencies**: TODO-007
- **Recommended Action**: Implement expert knowledge extraction with LLM

---

### TODO-007: Replace Expert Analysis Stub with LLM Call
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts:260`
- **Category**: Feature Implementation / AI
- **Priority**: HIGH
- **Description**: Stub code instead of LLM call
- **Impact**: Phase 3 returns mock data
- **Estimated Effort**: 4 hours
- **Code Context**:
```typescript
// Line 260
// TODO: Replace stub with actual LLM call
```
- **Recommended Action**: Integrate with LLM service for expert analysis

---

### TODO-008: Implement Full Synthesis Logic
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts:290`
- **Category**: Feature Implementation / AI
- **Priority**: HIGH
- **Description**: Synthesis node using stub
- **Impact**: Phase 4 synthesis not functioning
- **Estimated Effort**: 6 hours
- **Code Context**:
```typescript
// Line 290
// TODO: Implement full synthesis logic
```
- **Dependencies**: TODO-009
- **Recommended Action**: Implement synthesis logic combining all phase outputs

---

### TODO-009: Replace Synthesis Stub with LLM Call
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts:303`
- **Category**: Feature Implementation / AI
- **Priority**: HIGH
- **Description**: Stub code instead of LLM call
- **Impact**: Phase 4 returns mock data
- **Estimated Effort**: 4 hours
- **Code Context**:
```typescript
// Line 303
// TODO: Replace stub with actual LLM call
```
- **Recommended Action**: Integrate with LLM service for synthesis

---

### TODO-010: Implement Full Assembly Logic
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts:336`
- **Category**: Feature Implementation / Logic
- **Priority**: MEDIUM
- **Description**: Assembly node using stub (no LLM needed - pure logic)
- **Impact**: Phase 5 assembly not functioning
- **Estimated Effort**: 6 hours
- **Code Context**:
```typescript
// Line 336
// TODO: Implement full assembly logic (NO LLM calls - pure logic)
```
- **Recommended Action**: Implement pure logic to assemble final analysis result

---

### TODO-011: Replace Assembly Stub with Logic
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts:350`
- **Category**: Feature Implementation / Logic
- **Priority**: MEDIUM
- **Description**: Stub code instead of actual assembly
- **Impact**: Phase 5 returns mock data
- **Estimated Effort**: 4 hours
- **Code Context**:
```typescript
// Line 350
// TODO: Replace stub with actual assembly logic
```
- **Recommended Action**: Implement data assembly logic

---

## Feature Enhancements (5 TODOs)

### TODO-012: Implement Proper Cost Calculation
- **File**: `packages/course-gen-platform/src/services/stage5/section-regeneration-service.ts:394`
- **Category**: Feature Enhancement / Metrics
- **Priority**: LOW
- **Description**: Cost calculation not implemented based on actual tokens and model pricing
- **Impact**: Cost tracking inaccurate
- **Estimated Effort**: 3 hours
- **Code Context**:
```typescript
// Line 394
// Calculate cost (TODO: implement proper cost calculation from tokens + model pricing)
```
- **Recommended Action**:
  1. Add token counting logic
  2. Implement model pricing lookup
  3. Calculate accurate cost per request

---

### TODO-013: Implement Proper DoclingDocument Retrieval
- **File**: `packages/course-gen-platform/src/shared/docling/client.ts:401`
- **Category**: Feature Implementation / Integration
- **Priority**: MEDIUM
- **Description**: DoclingDocument retrieval not fully implemented
- **Impact**: Document processing may be incomplete
- **Estimated Effort**: 4 hours
- **Code Context**:
```typescript
// Line 401
// TODO: Implement proper DoclingDocument retrieval
```
- **Recommended Action**: Implement full DoclingDocument API integration

---

### TODO-014: Add Language Detection from Contextual Content
- **File**: `packages/course-gen-platform/src/services/stage5/metadata-generator.ts:368`
- **Category**: Feature Enhancement / NLP
- **Priority**: LOW
- **Description**: Language detection could use contextual content for better accuracy
- **Impact**: Minor - language detection works but could be improved
- **Estimated Effort**: 2 hours
- **Code Context**:
```typescript
// Line 368
// TODO: Consider adding language detection from contextual_language content if needed
```
- **Recommended Action**: Evaluate if current language detection is sufficient; implement if needed

---

### TODO-015: Enable Database Lookup for LLM Models
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/langchain-models.ts:103`
- **Category**: Feature Implementation / Database
- **Priority**: MEDIUM
- **Description**: LLM model config stored in code instead of database
- **Impact**: Cannot dynamically configure LLM models
- **Estimated Effort**: 4 hours
- **Code Context**:
```typescript
// Line 103
// TODO: Enable database lookup after llm_model_config table is added to Database types
```
- **Recommended Action**:
  1. Add llm_model_config table to database schema
  2. Implement database lookup logic
  3. Add migration for existing hardcoded configs

---

### TODO-016: Implement Token-Aware Batching
- **File**: `packages/course-gen-platform/src/shared/embeddings/generate.ts:271`
- **Category**: Feature Enhancement / Performance
- **Priority**: LOW
- **Description**: Embedding batching not token-aware, may exceed limits
- **Impact**: Potential API errors with large batches
- **Estimated Effort**: 6 hours
- **Code Context**:
```typescript
// Line 271
// TODO: Implement token-aware batching (see docs/Future/TOKEN-AWARE-BATCHING.md)
```
- **Recommended Action**: See design doc at `docs/Future/TOKEN-AWARE-BATCHING.md`

---

## Summary by Category

| Category | Count | Priority Breakdown |
|----------|-------|-------------------|
| Security & Access Control | 1 | HIGH: 1 |
| Resource Management | 1 | MEDIUM: 1 |
| Analysis Workflow Implementation | 9 | HIGH: 6, MEDIUM: 3 |
| Feature Enhancements | 5 | MEDIUM: 3, LOW: 2 |
| **Total** | **16** | **HIGH: 7, MEDIUM: 7, LOW: 2** |

---

## Priority Matrix

### HIGH Priority (7 TODOs) - Fix in Next Sprint
1. TODO-001: SuperAdmin role check (Security)
2. TODO-004: Classification logic (Workflow)
3. TODO-005: Classification LLM call (Workflow)
4. TODO-006: Expert analysis logic (Workflow)
5. TODO-007: Expert analysis LLM call (Workflow)
6. TODO-008: Synthesis logic (Workflow)
7. TODO-009: Synthesis LLM call (Workflow)

**Estimated Total Effort**: 30 hours

### MEDIUM Priority (7 TODOs) - Schedule for Future Sprint
1. TODO-002: Server cleanup (Resource Management)
2. TODO-003: Stage 3 barrier (Workflow)
3. TODO-010: Assembly logic (Workflow)
4. TODO-011: Assembly stub (Workflow)
5. TODO-013: DoclingDocument retrieval (Integration)
6. TODO-015: Database LLM config lookup (Database)

**Estimated Total Effort**: 25 hours

### LOW Priority (2 TODOs) - Backlog
1. TODO-012: Cost calculation (Metrics)
2. TODO-014: Language detection (NLP)
3. TODO-016: Token-aware batching (Performance)

**Estimated Total Effort**: 11 hours

---

## Recommendations

### Immediate Actions
1. **Security Review**: Address TODO-001 (SuperAdmin check) immediately - security vulnerability
2. **Workflow Implementation**: The 9 analysis workflow TODOs indicate incomplete feature implementation
   - This is a major gap - the entire analysis workflow is using stubs
   - Should be prioritized as a feature implementation epic, not low-priority technical debt

### Sprint Planning
- **Sprint 1 (2 weeks)**: Implement classification, expert analysis, synthesis (TODOs 4-9)
- **Sprint 2 (1 week)**: Implement assembly logic, add security checks (TODOs 1, 10-11)
- **Sprint 3 (1 week)**: Add resource cleanup, database config (TODOs 2, 13, 15)

### Technical Debt Metrics
- **Total TODOs**: 16 (down from 29 - good progress!)
- **Total Estimated Effort**: 66 hours (~2 developer-weeks)
- **Critical Security Issues**: 1 (HIGH priority)
- **Incomplete Features**: 9 (analysis workflow stubs)

---

## Tracking Status

- [x] TODOs identified and categorized
- [x] Priorities assigned
- [x] Effort estimates provided
- [x] GitHub issues to be created: 16 issues
- [ ] Issues created in GitHub (awaiting approval)
- [ ] Sprint backlog updated (awaiting approval)

---

## GitHub Issue Template

When creating issues, use this template:

```markdown
## Description
[TODO description from this document]

## Category
[Security / Feature / Enhancement / Bug]

## Priority
[HIGH / MEDIUM / LOW]

## Effort Estimate
[Hours] hours

## Location
File: [file path]
Line: [line number]

## Code Context
```[language]
[code snippet]
```

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

## Related TODOs
[List any dependent TODOs]

## Documentation Reference
[Link to design docs if applicable]
```

---

*Document generated by bug-fixer worker*
*Part of Low Priority Bug Fixing (LOW-1)*
*Status: TODOs tracked, ready for issue creation*
