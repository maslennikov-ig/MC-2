# Archived Documentation

This directory contains deprecated documentation and agent files that have been superseded by the new 2-level architecture.

## Archived Files

### code-health-orchestrator.md

**Date Archived**: 2025-10-18
**Reason**: Replaced by direct domain orchestrator invocation

**Old Architecture** (deprecated):
```
User → /health → code-health-orchestrator (L0)
  → bug-orchestrator (L1)
    → bug-hunter (L2)
    → bug-fixer (L2)
```

**New Architecture** (current):
```
User → /health bugs → bug-orchestrator (L1)
  → bug-hunter (L2)
  → bug-fixer (L2)
```

**Migration**: The functionality has been distributed to domain-specific orchestrators:
- Bug management: `bug-orchestrator.md`
- Security audit: `security-orchestrator.md`
- Dead code cleanup: `dead-code-orchestrator.md`
- Dependency management: `dependency-orchestrator.md`

**Key Improvements**:
- Simplified 2-level hierarchy (was 3-level)
- Direct domain invocation via `/health {domain}`
- Removed unnecessary coordination layer
- Better isolation and context management
- Each domain orchestrator is now standalone

**Reference**: See `docs/Agents Ecosystem/ARCHITECTURE.md` for the new canonical architecture

---

## Archive Policy

Files are archived when:
1. Superseded by new architecture or patterns
2. No longer referenced in active codebase
3. Kept for historical reference only

Archived files should not be used for new development.
