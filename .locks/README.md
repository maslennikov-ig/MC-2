# Lock Files Directory

This directory contains temporary lock files used to prevent concurrent write operations during fixer/updater phases.

## Purpose

Orchestrators use lock files to ensure only ONE fixer/updater runs at a time, preventing:
- File conflicts
- Race conditions
- Inconsistent state

## Lock File Format

**Filename**: `active-fixer.lock`

**Content**:
```json
{
  "domain": "bugs|security|dead-code|dependency",
  "started": "2025-10-18T14:30:00Z",
  "pid": "orchestrator-instance-id",
  "phase": "fixing|remediation|cleanup|update"
}
```

## Lock Protocol

### Before Starting Fixer Phase

1. Check for `active-fixer.lock` file
2. If exists:
   - Read lock file
   - Check if expired (>30 minutes old)
   - If not expired: wait or fail with message
3. If no lock or expired:
   - Create new lock file
   - Execute fixer phase
   - Remove lock on completion or failure

### Lock Expiry

- **Timeout**: 30 minutes
- **Auto-cleanup**: Locks older than 30 minutes are considered stale
- **Manual cleanup**: Delete `.locks/active-fixer.lock` if stuck

## Parallel Execution Rules

**Hunter/Scanner phases** (read-only):
- ✅ CAN run in parallel
- ✅ NO lock required
- Multiple domains can scan simultaneously

**Fixer/Updater phases** (write operations):
- ❌ CANNOT run in parallel
- ✅ MUST acquire lock first
- Only ONE domain can fix at a time

## Example

**Scenario**: User runs `/health bugs` and `/health security` simultaneously

**Timeline**:
```
T0: Both orchestrators start Phase 1 (detection) - PARALLEL ✅
T1: bug-orchestrator creates active-fixer.lock, starts fixing
T2: security-orchestrator checks lock → WAIT (bug-orchestrator has lock)
T3: bug-orchestrator completes fixing, removes lock
T4: security-orchestrator acquires lock, starts fixing
```

## Troubleshooting

**Lock stuck?**
```bash
# Check lock age
ls -lh .locks/active-fixer.lock

# If older than 30 minutes, safe to delete
rm .locks/active-fixer.lock
```

**Multiple domains waiting?**
- This is expected behavior
- Sequential execution ensures safety
- Each domain will run after previous completes

---

**Auto-cleanup**: Orchestrators remove their lock files on:
- Successful completion
- Validation failure (after rollback)
- Max iterations reached
- User cancellation
