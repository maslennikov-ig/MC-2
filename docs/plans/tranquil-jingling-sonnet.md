# Plan: Server Infrastructure Issues Fix

## Summary

Three critical issues found on servers:

1. **DEV**: Disk space exhausted (182MB free, 500MB required) — blocks Stage 7 (images/cards)
2. **STAGE**: Redis RDB snapshot failure (~107k errors) — blocks all write operations
3. **Browser**: ChunkLoadError after deploy — stale chunks issue

## Root Cause Analysis

### Issue 1: DEV Disk Space (PRIORITY 1)

- **Symptom**: `Insufficient disk space: 182MB free, minimum 500MB required`
- **Impact**: Stage 7 (card/image generation) fails for course `ed093928-1286-450e-99db-55d9f412e9f5`
- **Cause**: Docker images/volumes, logs, or generated files consuming disk

### Issue 2: STAGE Redis RDB (PRIORITY 2)

- **Symptom**: `MISCONF Redis is configured to save RDB snapshots, but it's currently unable to persist to disk`
- **Impact**: Workers 6, 7 completely blocked (~107,000 errors logged)
- **Cause**: Redis cannot write RDB snapshot — disk full or permission issue

### Issue 3: ChunkLoadError (LOW PRIORITY)

- **Symptom**: `ERR_HTTP2_PROTOCOL_ERROR` loading JS chunks
- **Impact**: Page fails to load after refresh
- **Cause**: Old chunks deleted during deploy, browser cached old chunk references
- **Fix**: Hard refresh (Ctrl+Shift+R) or wait for cache expiry

## Investigation Steps

### Phase 1: Check Server Disk Usage

```bash
# Connect to server
ssh megacampus-prod

# Check disk usage
df -h

# Find large directories
du -sh /opt/megacampus/data/* | sort -hr | head -20

# Check Docker disk usage
docker system df

# Check Docker logs size
du -sh /var/lib/docker/containers/*/*.log | sort -hr | head -10
```

### Phase 2: Check Redis Status

```bash
# Check Redis container status
docker logs megacampus-redis --tail=100

# Check Redis memory/disk
docker exec megacampus-redis redis-cli INFO persistence

# Check RDB file location
docker exec megacampus-redis ls -la /data
```

### Phase 3: Cleanup Actions

#### For Disk Space:

```bash
# Remove unused Docker images
docker image prune -a --force

# Remove unused volumes
docker volume prune --force

# Clean old uploads (if safe)
# Check uploads-dev size first
du -sh /opt/megacampus/data/uploads-dev

# Clean Docker logs
truncate -s 0 /var/lib/docker/containers/*/*.log

# Clean old builds
docker builder prune --force
```

#### For Redis:

```bash
# Option A: Disable RDB persistence (if not critical)
docker exec megacampus-redis redis-cli CONFIG SET stop-writes-on-bgsave-error no

# Option B: Fix disk space first, then:
docker exec megacampus-redis redis-cli BGSAVE
```

## Files to Modify

None — this is infrastructure investigation, no code changes needed.

## Verification

1. After cleanup: `df -h` should show >1GB free on /
2. After Redis fix: Check `/admin/logs` — no new Redis MISCONF errors
3. Test Stage 7 generation on dev — images should generate

## Beads Tasks

Will create after investigation confirms root cause:

- `bd create --type=bug --priority=1 --title="Fix: DEV disk space exhausted"`
- `bd create --type=bug --priority=1 --title="Fix: STAGE Redis RDB failure"`

## Notes

- Both STAGE and DEV are on same server (95.81.98.230)
- Redis issue on STAGE and disk space on DEV likely related — same disk
- ChunkLoadError is expected during deploys, not a bug
