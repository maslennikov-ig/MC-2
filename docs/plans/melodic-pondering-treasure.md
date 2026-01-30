# Plan: Deployment Architecture & Documentation Alignment

**Task:** Привести серверную архитектуру и документацию к единому соответствию
**Status:** Ready for approval

---

## Current State Analysis

### Server Containers (from docker ps)

| Container            | Port | Status    | Expected                  |
| -------------------- | ---- | --------- | ------------------------- |
| megacampus-web-dev   | 3010 | ✓ Running | ✓ Correct                 |
| megacampus-api-dev   | 4010 | ✓ Running | ✓ Correct                 |
| megacampus-web-blue  | 3001 | ✓ Running | ✓ Correct                 |
| megacampus-api-blue  | 4001 | ✓ Running | ✓ Correct                 |
| megacampus-web-green | 3002 | ✓ Running | ✓ Correct                 |
| megacampus-api-green | 4002 | ✗ MISSING | Should exist for rollback |
| megacampus-api       | 4000 | ✗ ORPHAN  | Legacy, should be removed |

### Documentation Inconsistencies

**ADR-004 (Branch Strategy):**

```
develop -> Dev
staging -> Stage     ← WRONG branch name
main -> Production   ← WRONG branch name
```

**ADR-005 & deployment-guide.md (Correct):**

```
develop -> dev.ai.megacampus.ru (Dev)
master -> ai.megacampus.ru (Staging)
```

**Issue:** ADR-004 uses `staging` and `main` branch names, but actual branches are `develop` and `master`.

---

## Solution

### 1. Server Cleanup (SSH Commands)

```bash
# 1. Check active color
cat /opt/megacampus/active_color  # Should show "blue" or "green"

# 2. Remove orphan container from legacy docker-compose.production.yml
docker stop megacampus-api 2>/dev/null || true
docker rm megacampus-api 2>/dev/null || true

# 3. Verify Blue/Green state
docker ps --filter "name=megacampus" --format "{{.Names}}\t{{.Ports}}"
```

**Note:** api-green (4002) being missing is OK if current active color is blue. It will be created on next deployment when green becomes active.

### 2. Documentation Updates

#### 2.1. ADR-004: Fix Branch Names

**File:** `docs/ADR-004-blue-green-deployment.md`

**Section:** "1. Branching & Environments"

```diff
- - `develop` -> **Dev**
- - `staging` -> **Stage**
- - `main` -> **Production**
+ - `develop` -> **Dev** (dev.ai.megacampus.ru)
+ - `master` -> **Staging** (ai.megacampus.ru)
+ - TBD -> **Production** (future)
```

#### 2.2. ADR-004: Update Port Table

**Section:** "3. Blue/Green Architecture"

Add web ports for clarity:

```diff
- We will run two identical application instances ("Blue" and "Green") on the production server, listening on different ports (e.g., 4001 and 4002).
+ We will run two identical application sets ("Blue" and "Green") with:
+ - **Blue**: web:3001, api:4001
+ - **Green**: web:3002, api:4002
+ - **Dev**: web:3010, api:4010 (separate environment)
```

---

## Files to Modify

| File                                    | Changes                                           |
| --------------------------------------- | ------------------------------------------------- |
| `docs/ADR-004-blue-green-deployment.md` | Fix branch names (`staging`→`master`, `main`→TBD) |
| Server (SSH)                            | Remove orphan `megacampus-api` container          |

---

## Verification

### 1. Server State

```bash
# SSH to server
ssh megacampus-prod

# Verify containers
docker ps --filter "name=megacampus" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Expected output (if active=blue):
# megacampus-web-dev      Up      0.0.0.0:3010->3000/tcp
# megacampus-api-dev      Up      0.0.0.0:4010->4000/tcp
# megacampus-web-blue     Up      0.0.0.0:3001->3000/tcp
# megacampus-api-blue     Up      0.0.0.0:4001->4000/tcp

# Verify no orphans
docker ps -a --filter "name=megacampus-api" --filter "status=exited"
# Should be empty
```

### 2. Documentation Consistency

After edits, verify:

- ADR-004 branch names match ADR-005 and deployment-guide.md
- All three documents reference same ports: Blue (3001/4001), Green (3002/4002), Dev (3010/4010)
- All three documents reference same branches: develop, master

### 3. Blue/Green Test

```bash
# Simulate deployment (dry run)
cat /opt/megacampus/active_color          # Check current
# If blue: next deploy creates green containers
# If green: next deploy creates blue containers
```

---

## Summary

1. **Server:** Remove orphan `megacampus-api` container
2. **ADR-004:** Fix branch names to match reality (`master` not `main`, no `staging` branch)
3. **Verify:** All docs consistent, server matches expected architecture
