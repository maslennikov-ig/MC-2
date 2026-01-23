# Code Review: Enrichment Storage Migration (Supabase → Local)

**Date:** 2026-01-23
**Reviewer:** Claude Code (Sonnet 4.5)
**Scope:** Migration of enrichment image storage from Supabase Storage to local server
**Files Reviewed:** 7 files (TypeScript services, handlers, Docker config, nginx, migration scripts)

---

## Executive Summary

### Overall Status: ⚠️ PARTIAL - Issues Found

**Summary:** The migration implementation is fundamentally sound and follows Node.js/nginx best practices. However, **critical security vulnerabilities** related to path traversal and several production-readiness issues require immediate attention before deployment.

### Risk Level: 🔴 HIGH

**Critical Issues:** 2 (path traversal, race conditions)
**High Priority:** 3 (error handling, disk space, validation)
**Medium Priority:** 4 (performance, code quality)
**Low Priority:** 2 (documentation, metrics)

### Key Findings

✅ **Strengths:**

- Clean separation of concerns (local-storage-service)
- Proper error logging with structured metadata
- Effective retry logic with exponential backoff
- Correct nginx configuration for static file serving
- Good use of WebP compression to reduce file sizes

🔴 **Critical Issues:**

1. **Path traversal vulnerability** in local-storage-service.ts (lines 62-64)
2. **Race condition risk** in concurrent file writes (no locking)
3. Missing disk space validation before writes

⚠️ **High Priority Issues:**

1. No validation of UUID format (allows arbitrary paths)
2. Migration script lacks rollback capability
3. Missing file permissions validation in Docker volume

---

## Detailed Findings by Category

## 1. Security Issues

### 🔴 CRITICAL: Path Traversal Vulnerability

**File:** `packages/course-gen-platform/src/stages/stage7-enrichments/services/local-storage-service.ts`
**Lines:** 62-65, 116-119

**Issue:**

```typescript
// VULNERABLE CODE
const dirPath = path.join(STORAGE_BASE, courseId, lessonId);
const fileName = `${enrichmentId}.${extension}`;
const filePath = path.join(dirPath, fileName);
```

**Problem:**

- No validation that `courseId`, `lessonId`, `enrichmentId` are safe strings
- Attacker could pass `../../etc/passwd` as courseId to write outside STORAGE_BASE
- `path.join()` does NOT prevent path traversal on its own

**Context7 Reference:**
Node.js documentation explicitly warns about path traversal in package exports:

> "Node.js strictly disallows path traversal (`..`) and invalid segments (`.`, `node_modules`) within exports targets to maintain package integrity."

**Impact:** HIGH

- Arbitrary file write vulnerability
- Could overwrite system files, application code, or sensitive data
- Docker volume mount at `/app/data/enrichments` could be escaped

**Recommendation:**

```typescript
import path from 'path';

/**
 * Validate and sanitize path component to prevent path traversal
 * @throws Error if component contains invalid characters
 */
function validatePathComponent(component: string, name: string): void {
  // Check for path traversal attempts
  if (component.includes('..') || component.includes('/') || component.includes('\\')) {
    throw new Error(`Invalid ${name}: contains path traversal or directory separators`);
  }

  // Check for hidden files/directories
  if (component.startsWith('.')) {
    throw new Error(`Invalid ${name}: cannot start with dot`);
  }

  // Validate UUIDs if that's what you expect
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (name === 'courseId' || name === 'lessonId' || name === 'enrichmentId') {
    if (!uuidRegex.test(component)) {
      throw new Error(`Invalid ${name}: must be a valid UUID`);
    }
  }

  // Additional: check for null bytes
  if (component.includes('\0')) {
    throw new Error(`Invalid ${name}: contains null byte`);
  }
}

export async function uploadEnrichmentAssetLocal(
  courseId: string,
  lessonId: string,
  enrichmentId: string,
  buffer: Buffer,
  extension = 'webp'
): Promise<string> {
  // Validate all path components BEFORE constructing paths
  validatePathComponent(courseId, 'courseId');
  validatePathComponent(lessonId, 'lessonId');
  validatePathComponent(enrichmentId, 'enrichmentId');

  // Validate extension (whitelist)
  const allowedExtensions = ['webp', 'png', 'jpg', 'jpeg'];
  if (!allowedExtensions.includes(extension)) {
    throw new Error(`Invalid extension: ${extension}`);
  }

  // Now safe to construct paths
  const dirPath = path.join(STORAGE_BASE, courseId, lessonId);
  const fileName = `${enrichmentId}.${extension}`;
  const filePath = path.join(dirPath, fileName);

  // CRITICAL: Verify the resolved path is still within STORAGE_BASE
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(STORAGE_BASE);
  if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
    throw new Error('Path traversal attempt detected');
  }

  // ... rest of function
}
```

**Apply same fix to:**

- `uploadCourseCardLocal()` (line 105-149)
- `deleteEnrichmentAssetLocal()` (line 169-189)
- `assetExistsLocal()` (line 197-206)
- `getAssetMetadataLocal()` (line 214-241)

---

### 🔴 CRITICAL: Race Condition in File Writes

**File:** `local-storage-service.ts`
**Lines:** 69-72

**Issue:**

```typescript
// Ensure directory exists
await fs.mkdir(dirPath, { recursive: true });

// Write file
await fs.writeFile(filePath, buffer);
```

**Problem:**

- Two concurrent requests for same lesson could:
  1. Both check directory doesn't exist
  2. Both create directory simultaneously (OK with recursive: true)
  3. Both write same file simultaneously → corrupted file or lost data
- Stage 7 worker processes enrichments concurrently
- No file locking mechanism

**Impact:** MEDIUM-HIGH

- Corrupted image files if concurrent generation occurs
- Unlikely in production (enrichments generated once), but possible during:
  - Regeneration requests
  - Migration script + live generation
  - Multiple worker instances

**Recommendation:**

Option 1: Atomic writes with temporary files

```typescript
import { randomBytes } from 'crypto';

export async function uploadEnrichmentAssetLocal(
  courseId: string,
  lessonId: string,
  enrichmentId: string,
  buffer: Buffer,
  extension = 'webp'
): Promise<string> {
  // ... validation ...

  const dirPath = path.join(STORAGE_BASE, courseId, lessonId);
  const fileName = `${enrichmentId}.${extension}`;
  const filePath = path.join(dirPath, fileName);

  // Generate unique temporary filename
  const tempFileName = `${enrichmentId}.${randomBytes(8).toString('hex')}.tmp`;
  const tempFilePath = path.join(dirPath, tempFileName);

  try {
    await fs.mkdir(dirPath, { recursive: true });

    // Write to temporary file first
    await fs.writeFile(tempFilePath, buffer);

    // Atomic rename (overwrite if exists)
    await fs.rename(tempFilePath, filePath);

    logger.info({ storagePath, fileSize: buffer.length }, 'Asset uploaded');
    return storagePath;
  } catch (error) {
    // Clean up temp file if exists
    try {
      await fs.unlink(tempFilePath);
    } catch {}

    logger.error({ storagePath, error }, 'Upload failed');
    throw error;
  }
}
```

Option 2: Add application-level locking (Redis-based)

```typescript
// Use Redis lock during file operations
import { acquireLock, releaseLock } from '@/shared/redis-lock';

const lockKey = `enrichment:upload:${courseId}:${lessonId}:${enrichmentId}`;
const lock = await acquireLock(lockKey, 30000); // 30s timeout

try {
  // ... file operations ...
} finally {
  await releaseLock(lock);
}
```

**Preferred:** Option 1 (atomic writes) - simpler, no Redis dependency for file operations.

---

### ⚠️ HIGH: Missing Disk Space Validation

**File:** `local-storage-service.ts`
**Lines:** 49-95

**Issue:**

- No check for available disk space before writing
- Large files (up to 50MB) could fill disk
- Migration could download hundreds of files and exhaust storage

**Impact:** MEDIUM

- Service crashes if disk full
- Could affect entire server (shared /opt mount)
- No graceful degradation

**Recommendation:**

```typescript
import { statfs } from 'fs/promises';

const MIN_FREE_SPACE_BYTES = 500 * 1024 * 1024; // 500MB minimum

async function checkDiskSpace(dirPath: string): Promise<void> {
  try {
    const stats = await statfs(dirPath);
    const freeSpace = stats.bavail * stats.bsize;

    if (freeSpace < MIN_FREE_SPACE_BYTES) {
      throw new Error(
        `Insufficient disk space: ${Math.round(freeSpace / 1024 / 1024)}MB free, ` +
        `minimum ${MIN_FREE_SPACE_BYTES / 1024 / 1024}MB required`
      );
    }
  } catch (error) {
    logger.warn({ error }, 'Could not check disk space, proceeding anyway');
    // Don't fail on disk space check error (might not have permissions)
  }
}

export async function uploadEnrichmentAssetLocal(...) {
  // ... validation ...

  // Check disk space before large write
  await checkDiskSpace(STORAGE_BASE);

  // ... rest of function ...
}
```

---

### ⚠️ HIGH: No UUID Format Validation

**File:** `local-storage-service.ts`, `cover-handler.ts`, `card-handler.ts`

**Issue:**

- Functions accept arbitrary strings for `courseId`, `lessonId`, `enrichmentId`
- No validation that these are actually UUIDs
- Could construct invalid/dangerous paths

**Current Code:**

```typescript
export async function uploadEnrichmentAssetLocal(
  courseId: string, // No validation
  lessonId: string, // No validation
  enrichmentId: string, // No validation
  buffer: Buffer,
  extension = 'webp'
);
```

**Impact:** MEDIUM

- Path construction assumes UUIDs (safe characters)
- If non-UUID passed, could create weird directory structures
- Combined with path traversal, becomes critical

**Recommendation:**
See "Path Traversal Vulnerability" fix above - includes UUID validation.

---

## 2. Error Handling Issues

### ⚠️ HIGH: Incomplete Error Recovery in Handlers

**File:** `cover-handler.ts`, `card-handler.ts`
**Lines:** cover: 1117-1132, card: 515-531

**Issue:**

```typescript
} catch (error) {
  const durationMs = Date.now() - startTime;
  const errorMessage = error instanceof Error ? error.message : String(error);

  logger.error({ enrichmentId, durationMs, error: errorMessage }, 'generation failed');

  throw new Error(`Cover generation failed: ${errorMessage}`);
}
```

**Problem:**

- Error thrown loses original error stack trace
- No cleanup of partial uploads if error occurs after image generation but before upload completes
- Retry logic in handlers doesn't account for partial failures

**Impact:** MEDIUM

- Difficult to debug production issues (no stack traces in logs)
- Could leave orphaned files if upload succeeds but DB update fails
- Retry might attempt to overwrite corrupted partial files

**Recommendation:**

```typescript
} catch (error) {
  const durationMs = Date.now() - startTime;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error(
    {
      enrichmentId,
      lessonId: lesson.id,
      courseId: course.id,
      durationMs,
      error: errorMessage,
      stack: errorStack // Include stack trace
    },
    'Cover generation failed'
  );

  // Cleanup: attempt to delete partial upload if storagePath was set
  if (typeof storagePath !== 'undefined') {
    try {
      await deleteEnrichmentAssetLocal(storagePath);
      logger.info({ storagePath }, 'Cleaned up partial upload');
    } catch (cleanupError) {
      logger.warn({ storagePath, cleanupError }, 'Failed to cleanup partial upload');
    }
  }

  // Re-throw original error (preserves stack)
  throw error;
}
```

---

### ⚠️ MEDIUM: Silent Failure in Delete Operation

**File:** `local-storage-service.ts`
**Lines:** 169-189

**Issue:**

```typescript
export async function deleteEnrichmentAssetLocal(storagePath: string): Promise<void> {
  const filePath = path.join(STORAGE_BASE, storagePath);

  try {
    await fs.unlink(filePath);
    logger.info({ storagePath, filePath }, 'Local enrichment asset deleted');
  } catch (error) {
    // Ignore ENOENT (file not found) - idempotent delete
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error({ storagePath, error }, 'Failed to delete');
      throw error;
    }
  }
}
```

**Problem:**

- Deletes only the file, not parent directories
- Over time, creates many empty directories (`courseId/lessonId/`)
- No mechanism to clean up empty directories
- Could accumulate thousands of empty dirs

**Impact:** LOW

- Disk space waste (minimal - directory entries are small)
- `ls` and `find` operations slow down over time
- Harder to navigate filesystem manually

**Recommendation:**

```typescript
export async function deleteEnrichmentAssetLocal(storagePath: string): Promise<void> {
  validatePathComponent(storagePath, 'storagePath'); // Add validation

  const filePath = path.join(STORAGE_BASE, storagePath);

  try {
    await fs.unlink(filePath);
    logger.info({ storagePath }, 'Asset deleted');

    // Try to remove parent directory if empty
    const dirPath = path.dirname(filePath);
    try {
      await fs.rmdir(dirPath); // Only succeeds if empty
      logger.debug({ dirPath }, 'Removed empty directory');
    } catch {
      // Directory not empty or doesn't exist - ignore
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error({ storagePath, error }, 'Delete failed');
      throw error;
    }
  }
}
```

---

## 3. Migration Script Issues

### ⚠️ HIGH: No Rollback Capability

**File:** `scripts/migrate-enrichments.sh`
**Lines:** 1-166

**Issue:**

- Script downloads all files from Supabase
- No verification of downloads (checksums, file integrity)
- No rollback if migration fails halfway
- No dry-run mode to test before actual migration

**Current Flow:**

```bash
migrate_files() {
  # Downloads files one by one
  # If download fails, script continues
  # No transaction-like semantics
  # No rollback possible
}
```

**Impact:** HIGH

- If migration fails halfway, system in inconsistent state
- No way to roll back to Supabase URLs
- Manual recovery required

**Recommendation:**

Add dry-run mode and rollback capability:

```bash
#!/bin/bash

# Configuration
DRY_RUN="${DRY_RUN:-false}"
BACKUP_PATH="${BACKUP_PATH:-/opt/megacampus/data/enrichments-backup}"

# Add dry-run mode
migrate_files() {
  log_info "Starting migration (DRY_RUN=$DRY_RUN)"

  # ... file listing ...

  for file in $files; do
    local full_path="${course}/${file}"
    total=$((total + 1))

    if [ "$DRY_RUN" = "true" ]; then
      # Just log what would be done
      log_info "[DRY-RUN] Would download: $full_path"
    else
      # Actually download
      if download_file "$full_path"; then
        success=$((success + 1))
      else
        failed=$((failed + 1))
      fi
    fi
  done
}

# Add backup function
backup_existing_files() {
  if [ -d "$LOCAL_PATH" ] && [ "$(ls -A $LOCAL_PATH)" ]; then
    log_info "Backing up existing files to $BACKUP_PATH"
    mkdir -p "$BACKUP_PATH"
    cp -r "$LOCAL_PATH"/* "$BACKUP_PATH/"
    log_info "Backup complete"
  fi
}

# Add rollback function
rollback() {
  log_error "Migration failed. Rolling back..."

  if [ -d "$BACKUP_PATH" ]; then
    rm -rf "$LOCAL_PATH"
    mkdir -p "$LOCAL_PATH"
    cp -r "$BACKUP_PATH"/* "$LOCAL_PATH/"
    log_info "Rollback complete"
  else
    log_error "No backup found, cannot rollback"
  fi
}

# Main execution
if [ "$DRY_RUN" = "true" ]; then
  log_info "DRY RUN MODE - no files will be downloaded"
fi

backup_existing_files
migrate_files || rollback
```

**Usage:**

```bash
# Test migration without downloading
DRY_RUN=true ./scripts/migrate-enrichments.sh

# Actual migration with backup
./scripts/migrate-enrichments.sh

# Manual rollback if needed
BACKUP_PATH=/opt/megacampus/data/enrichments-backup \
  bash -c 'cp -r $BACKUP_PATH/* /opt/megacampus/data/enrichments/'
```

---

### ⚠️ MEDIUM: No File Integrity Verification

**File:** `scripts/migrate-enrichments.sh`
**Lines:** 69-90

**Issue:**

```bash
download_file() {
  # ...
  curl -s -o "$local_path" "${SUPABASE_URL}/storage/..."

  if [ -f "$local_path" ] && [ -s "$local_path" ]; then
    log_info "Downloaded: $remote_path"
    return 0
  else
    log_warn "Failed to download: $remote_path"
    return 1
  fi
}
```

**Problem:**

- Only checks file exists and is non-empty
- Doesn't verify file is valid image (could be HTML error page)
- No checksum verification
- Corrupted downloads silently accepted

**Impact:** MEDIUM

- Corrupted images stored locally
- Users see broken images after migration
- Difficult to identify which files are corrupted

**Recommendation:**

```bash
# Add file type verification
download_file() {
  local remote_path="$1"
  local local_path="${LOCAL_PATH}/${remote_path}"
  local local_dir=$(dirname "$local_path")

  mkdir -p "$local_dir"

  # Download with response headers
  local http_code=$(curl -s -w "%{http_code}" -o "$local_path" \
    "${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${remote_path}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

  # Check HTTP status
  if [ "$http_code" != "200" ]; then
    log_warn "HTTP $http_code for $remote_path"
    rm -f "$local_path"
    return 1
  fi

  # Verify file exists and non-empty
  if [ ! -f "$local_path" ] || [ ! -s "$local_path" ]; then
    log_warn "Empty or missing: $remote_path"
    return 1
  fi

  # Verify file is actually an image (using 'file' command)
  local file_type=$(file -b --mime-type "$local_path")
  if [[ ! "$file_type" =~ ^image/ ]]; then
    log_warn "Not an image (${file_type}): $remote_path"
    rm -f "$local_path"
    return 1
  fi

  log_info "Downloaded and verified: $remote_path ($file_type)"
  return 0
}
```

---

## 4. Docker & Production Issues

### ⚠️ MEDIUM: File Permissions Not Explicitly Set

**File:** `docker-compose.production.yml`
**Lines:** 316-318

**Issue:**

```yaml
worker-stage7:
  # ...
  volumes:
    - ./data/enrichments:/app/data/enrichments
```

**Problem:**

- Volume mount inherits host permissions
- No explicit UID/GID configuration
- If host directory owned by root, container write fails
- No documentation of required permissions

**Impact:** MEDIUM

- Service could fail to start if permissions wrong
- Error manifests as cryptic "EACCES" errors
- Difficult to debug in production

**Recommendation:**

1. Add explicit documentation in docker-compose:

```yaml
# Local enrichment storage (covers, cards) - served by nginx
# IMPORTANT: Ensure directory permissions allow container write access
#   mkdir -p ./data/enrichments
#   chmod 755 ./data/enrichments
#   chown 1000:1000 ./data/enrichments  # node user in container
- ./data/enrichments:/app/data/enrichments
```

2. Add permission check in service initialization:

```typescript
// packages/course-gen-platform/src/stages/stage7-enrichments/worker-entrypoint.ts

async function verifyStoragePermissions() {
  const testPath = path.join(STORAGE_BASE, '.permission-test');

  try {
    await fs.writeFile(testPath, 'test');
    await fs.unlink(testPath);
    logger.info({ STORAGE_BASE }, 'Storage permissions OK');
  } catch (error) {
    logger.error(
      { STORAGE_BASE, error },
      'FATAL: Cannot write to enrichments storage directory. Check Docker volume permissions.'
    );
    process.exit(1);
  }
}

// Call during worker startup
await verifyStoragePermissions();
```

3. Add setup script:

```bash
#!/bin/bash
# scripts/setup-enrichments-storage.sh

STORAGE_PATH="${1:-./data/enrichments}"

echo "Setting up enrichments storage at $STORAGE_PATH"

mkdir -p "$STORAGE_PATH"
chmod 755 "$STORAGE_PATH"

# Set ownership to node user (UID 1000 in container)
if [ "$(id -u)" = "0" ]; then
  chown 1000:1000 "$STORAGE_PATH"
  echo "Ownership set to UID 1000 (container node user)"
else
  echo "Not running as root - ownership unchanged"
fi

echo "Setup complete!"
```

---

### ⚠️ LOW: No Monitoring/Metrics for Storage Operations

**File:** `local-storage-service.ts`

**Issue:**

- No metrics for upload success/failure rate
- No tracking of disk space usage
- No alerting if disk fills up
- No visibility into performance

**Impact:** LOW

- Difficult to detect storage issues proactively
- Can't measure performance improvements from Supabase migration
- No early warning for disk space issues

**Recommendation:**

Add metrics/monitoring:

```typescript
import { registry, Counter, Histogram, Gauge } from '@/shared/metrics';

// Define metrics
const uploadCounter = new Counter({
  name: 'enrichments_uploads_total',
  help: 'Total enrichment uploads',
  labelNames: ['status', 'type'],
  registers: [registry],
});

const uploadDuration = new Histogram({
  name: 'enrichments_upload_duration_seconds',
  help: 'Upload duration in seconds',
  labelNames: ['type'],
  registers: [registry],
});

const diskSpaceGauge = new Gauge({
  name: 'enrichments_disk_space_bytes',
  help: 'Available disk space in enrichments storage',
  registers: [registry],
});

export async function uploadEnrichmentAssetLocal(...) {
  const startTime = Date.now();

  try {
    // ... upload logic ...

    uploadCounter.inc({ status: 'success', type: 'enrichment' });
    uploadDuration.observe({ type: 'enrichment' }, (Date.now() - startTime) / 1000);

    return storagePath;
  } catch (error) {
    uploadCounter.inc({ status: 'error', type: 'enrichment' });
    throw error;
  }
}

// Periodic disk space check
setInterval(async () => {
  try {
    const stats = await statfs(STORAGE_BASE);
    const freeSpace = stats.bavail * stats.bsize;
    diskSpaceGauge.set(freeSpace);
  } catch (error) {
    logger.warn({ error }, 'Failed to check disk space');
  }
}, 60000); // Every minute
```

---

## 5. Nginx Configuration Review

### ✅ GOOD: Static File Serving Configuration

**File:** `nginx-megacampus.conf`
**Lines:** 70-79

**Current Configuration:**

```nginx
location /storage/enrichments/ {
    alias /opt/megacampus/data/enrichments/;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options "nosniff";
    types { image/webp webp; }
    default_type image/webp;
    try_files $uri =404;
}
```

**Analysis:**
✅ **Correct use of `alias` directive** - Context7 confirms this is the proper way to map URLs to alternative paths
✅ **Cache headers optimal** - `max-age=31536000, immutable` perfect for content-addressed files
✅ **Security header present** - `X-Content-Type-Options: nosniff` prevents MIME sniffing
✅ **try_files with =404** - Proper error handling per Context7 best practices
✅ **Explicit MIME type** - Forces WebP type

**Minor Suggestions:**

1. Add rate limiting for storage endpoint (prevent abuse):

```nginx
# Before location block
limit_req_zone $binary_remote_addr zone=storage_limit:10m rate=50r/s;

location /storage/enrichments/ {
    limit_req zone=storage_limit burst=100 nodelay;

    alias /opt/megacampus/data/enrichments/;
    # ... rest of config ...
}
```

2. Add CORS headers if needed for client-side access:

```nginx
location /storage/enrichments/ {
    alias /opt/megacampus/data/enrichments/;

    # CORS for image access
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;

    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options "nosniff";
    types { image/webp webp; }
    default_type image/webp;
    try_files $uri =404;
}
```

3. Consider adding etag support (nginx generates automatically, just enable):

```nginx
location /storage/enrichments/ {
    alias /opt/megacampus/data/enrichments/;

    # Enable ETag for conditional requests
    etag on;

    # ... rest of config ...
}
```

---

## 6. SQL Migration Review

### ⚠️ MEDIUM: Migration Not Idempotent

**File:** `packages/course-gen-platform/supabase/migrations/20260123000006_migrate_enrichment_urls_to_local.sql`
**Lines:** 18-30

**Issue:**

```sql
UPDATE lesson_enrichments
SET content = jsonb_set(
  content,
  '{imageUrl}',
  to_jsonb(
    regexp_replace(
      content->>'imageUrl',
      'https://diqooqbuchsliypgwksu\.supabase\.co/storage/v1/object/public/course-enrichments/',
      'https://ai.megacampus.ru/storage/enrichments/'
    )
  )
)
WHERE content->>'imageUrl' LIKE '%supabase.co%course-enrichments%';
```

**Problem:**

- If migration runs twice, URLs already migrated match WHERE clause
- `regexp_replace` on already-migrated URLs has no effect (good)
- But UPDATE still executes, updating `updated_at` timestamps unnecessarily

**Impact:** LOW

- Re-running migration safe but inefficient
- Triggers unnecessary timestamp updates
- Could confuse auditing/change tracking

**Recommendation:**

```sql
-- More precise WHERE clause to avoid already-migrated records
UPDATE lesson_enrichments
SET content = jsonb_set(
  content,
  '{imageUrl}',
  to_jsonb(
    regexp_replace(
      content->>'imageUrl',
      'https://diqooqbuchsliypgwksu\.supabase\.co/storage/v1/object/public/course-enrichments/',
      'https://ai.megacampus.ru/storage/enrichments/'
    )
  )
)
WHERE content->>'imageUrl' LIKE 'https://diqooqbuchsliypgwksu.supabase.co/storage/v1/object/public/course-enrichments/%';
-- More specific pattern prevents matching already-migrated URLs

-- Alternative: Use transaction with verification
BEGIN;

-- Store count before migration
CREATE TEMP TABLE migration_check AS
SELECT COUNT(*) as before_count
FROM lesson_enrichments
WHERE content->>'imageUrl' LIKE 'https://diqooqbuchsliypgwksu.supabase.co/%';

-- Run migration
UPDATE lesson_enrichments
SET content = jsonb_set(
  content,
  '{imageUrl}',
  to_jsonb(
    regexp_replace(
      content->>'imageUrl',
      'https://diqooqbuchsliypgwksu\.supabase\.co/storage/v1/object/public/course-enrichments/',
      'https://ai.megacampus.ru/storage/enrichments/'
    )
  )
)
WHERE content->>'imageUrl' LIKE 'https://diqooqbuchsliypgwksu.supabase.co/%';

-- Verify
DO $$
DECLARE
  before_count INTEGER;
  after_count INTEGER;
BEGIN
  SELECT before_count INTO before_count FROM migration_check;

  SELECT COUNT(*) INTO after_count
  FROM lesson_enrichments
  WHERE content->>'imageUrl' LIKE 'https://diqooqbuchsliypgwksu.supabase.co/%';

  IF after_count > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % records still have Supabase URLs', after_count;
  END IF;

  RAISE NOTICE 'Migration successful: % records migrated', before_count;
END $$;

COMMIT;
```

---

## 7. Code Quality Issues

### ⚠️ MEDIUM: Code Duplication Between Handlers

**File:** `cover-handler.ts` and `card-handler.ts`

**Issue:**
Significant code duplication between handlers:

1. **Retry logic** (identical in both):
   - `cover-handler.ts` lines 184-208
   - `card-handler.ts` lines 74-101

2. **Alt text generation** (nearly identical):
   - `cover-handler.ts` lines 213-242
   - `card-handler.ts` lines 105-141

3. **Visual style extraction** (identical):
   - `cover-handler.ts` lines 315-351
   - `card-handler.ts` lines 152-188

**Impact:** MEDIUM

- Bug fixes must be applied twice
- Inconsistent behavior if one handler updated and not the other
- Harder to maintain

**Recommendation:**

Extract shared utilities to `services/enrichment-utils.ts`:

```typescript
// packages/course-gen-platform/src/stages/stage7-enrichments/services/enrichment-utils.ts

import { logger } from '@/shared/logger';

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxAttempts: number = RETRY_CONFIG.MAX_ATTEMPTS,
  initialDelayMs: number = RETRY_CONFIG.INITIAL_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      const delayMs = initialDelayMs * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1);
      logger.warn(
        { context, attempt, delayMs, error: lastError.message },
        'Operation failed, retrying...'
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Alt text templates for all supported languages
 */
export const ALT_TEXT_TEMPLATES = {
  cover: {
    en: 'Cover illustration for lesson:',
    ru: 'Обложка урока:',
    // ... all other languages ...
  },
  card: {
    lesson: {
      en: 'Card for lesson:',
      ru: 'Карточка урока:',
      // ...
    },
    course: {
      en: 'Card for course:',
      ru: 'Карточка курса:',
      // ...
    },
  },
};

/**
 * Generate localized alt text
 */
export function getLocalizedAltText(
  type: 'cover' | 'card',
  language: string,
  title: string,
  options?: { isLesson?: boolean }
): string {
  const safeTitle = title.slice(0, 100);

  if (type === 'cover') {
    const template = ALT_TEXT_TEMPLATES.cover[language] ?? ALT_TEXT_TEMPLATES.cover.en;
    return `${template} ${safeTitle}`;
  }

  const isLesson = options?.isLesson ?? true;
  const templates = ALT_TEXT_TEMPLATES.card;
  const langTemplates = templates[language] ?? templates.en;
  const prefix = isLesson ? langTemplates.lesson : langTemplates.course;
  return `${prefix} ${safeTitle}`;
}

/**
 * Default visual style
 */
export const DEFAULT_VISUAL_STYLE = {
  colorScheme: 'rich gradients with deep shadows and luminous highlights, vibrant accent colors',
  aesthetic: 'premium 3D render, cinematic lighting, sophisticated and polished',
  visualElements:
    'glossy 3D objects, volumetric light rays, soft reflections, depth of field blur, floating elements',
  mood: 'inspiring, professional, cutting-edge, premium quality',
};

/**
 * Extract visual style from course data
 */
export function getVisualStyle(course: {
  visual_style?: unknown;
  settings?: unknown;
}): typeof DEFAULT_VISUAL_STYLE {
  // First try dedicated visual_style column
  if (course.visual_style && typeof course.visual_style === 'object') {
    const vs = course.visual_style as Record<string, unknown>;
    if (vs.colorScheme && vs.aesthetic && vs.visualElements && vs.mood) {
      return {
        colorScheme: String(vs.colorScheme),
        aesthetic: String(vs.aesthetic),
        visualElements: String(vs.visualElements),
        mood: String(vs.mood),
      };
    }
  }

  // Fallback to settings.visual_style (legacy)
  if (course.settings && typeof course.settings === 'object') {
    const settings = course.settings as Record<string, unknown>;
    if (settings.visual_style && typeof settings.visual_style === 'object') {
      const vs = settings.visual_style as Record<string, unknown>;
      if (vs.colorScheme && vs.aesthetic && vs.visualElements && vs.mood) {
        return {
          colorScheme: String(vs.colorScheme),
          aesthetic: String(vs.aesthetic),
          visualElements: String(vs.visualElements),
          mood: String(vs.mood),
        };
      }
    }
  }

  return DEFAULT_VISUAL_STYLE;
}
```

Then update handlers to import from shared utils.

---

### ⚠️ LOW: Missing JSDoc for Public Functions

**File:** `local-storage-service.ts`

**Issue:**

- Good JSDoc for main functions
- Missing JSDoc for `buildPublicUrl()` (line 157)
- Missing examples in JSDoc

**Recommendation:**
Add more comprehensive documentation with examples:

````typescript
/**
 * Build full public URL for enrichment asset
 *
 * Constructs the complete URL that clients use to access assets served by nginx.
 * URLs follow the pattern: {SITE_URL}/storage/enrichments/{storagePath}
 *
 * @param storagePath - Relative path returned from upload function
 *                      Example: "courseId/lessonId/enrichmentId.webp"
 * @returns Full public URL accessible by clients
 *          Example: "https://ai.megacampus.ru/storage/enrichments/abc-123/def-456/xyz-789.webp"
 *
 * @example
 * ```typescript
 * const storagePath = await uploadEnrichmentAssetLocal(
 *   'course-123',
 *   'lesson-456',
 *   'enrichment-789',
 *   imageBuffer
 * );
 * const publicUrl = buildPublicUrl(storagePath);
 * // publicUrl: "https://ai.megacampus.ru/storage/enrichments/course-123/lesson-456/enrichment-789.webp"
 * ```
 *
 * @see nginx-megacampus.conf - location /storage/enrichments/
 */
export function buildPublicUrl(storagePath: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai.megacampus.ru';
  return `${baseUrl}${PUBLIC_URL}/${storagePath}`;
}
````

---

## Summary of Recommendations

### Immediate Actions (Before Deployment)

1. 🔴 **FIX PATH TRAVERSAL VULNERABILITY**
   - Add `validatePathComponent()` function
   - Validate all path inputs before file operations
   - Add path resolution check

2. 🔴 **FIX RACE CONDITION**
   - Implement atomic writes with temp files
   - Or add Redis-based locking

3. ⚠️ **ADD DISK SPACE VALIDATION**
   - Check free space before writes
   - Set minimum threshold (500MB)

4. ⚠️ **IMPROVE MIGRATION SCRIPT**
   - Add dry-run mode
   - Add backup/rollback capability
   - Add file integrity verification

5. ⚠️ **ADD PERMISSION CHECKS**
   - Verify storage permissions on startup
   - Add setup script for directory permissions
   - Document required permissions

### Short-term Improvements (1-2 weeks)

1. Extract shared utilities to reduce duplication
2. Add metrics/monitoring for storage operations
3. Improve error handling with stack traces
4. Add cleanup of empty directories in delete operation
5. Make SQL migration fully idempotent

### Long-term Enhancements (Future)

1. Add compression of older images (aging policy)
2. Implement CDN integration for better performance
3. Add image optimization pipeline (different sizes)
4. Consider backup strategy for local storage
5. Add automated tests for storage service

---

## Testing Recommendations

### Unit Tests Needed

```typescript
// packages/course-gen-platform/src/stages/stage7-enrichments/services/__tests__/local-storage-service.test.ts

describe('local-storage-service', () => {
  describe('uploadEnrichmentAssetLocal', () => {
    it('should reject path traversal attempts', async () => {
      await expect(
        uploadEnrichmentAssetLocal('../../etc', 'passwd', 'evil', Buffer.from(''))
      ).rejects.toThrow('path traversal');
    });

    it('should reject non-UUID courseId', async () => {
      await expect(
        uploadEnrichmentAssetLocal('not-a-uuid', 'lesson-id', 'enrich-id', Buffer.from(''))
      ).rejects.toThrow('must be a valid UUID');
    });

    it('should handle concurrent writes safely', async () => {
      const buffer = Buffer.from('test');
      const promises = Array(10).fill(null).map(() =>
        uploadEnrichmentAssetLocal('course-id', 'lesson-id', 'enrich-id', buffer)
      );
      await Promise.all(promises);
      // Verify file not corrupted
    });

    it('should reject when disk space low', async () => {
      // Mock statfs to return low space
      await expect(
        uploadEnrichmentAssetLocal('course', 'lesson', 'enrich', Buffer.alloc(100MB))
      ).rejects.toThrow('Insufficient disk space');
    });
  });
});
```

### Integration Tests Needed

1. End-to-end upload → nginx serve → verify accessible
2. Migration script dry-run on staging data
3. Concurrent worker test (multiple stage7 workers)
4. Disk full scenario (fill disk, verify graceful failure)
5. Permission errors (chmod 000, verify error handling)

---

## Environment-Specific Concerns

### Development Environment

✅ **Current Setup:**

```yaml
# docker-compose.yml (dev)
volumes:
  - ./data/enrichments:/app/data/enrichments
```

**Recommendations:**

- Use same volume structure in dev as production
- Add `.gitignore` entry for `data/enrichments/`
- Document that local dev needs nginx configured (or use docker nginx)

### Staging Environment

**Recommendations:**

- Run migration script with `DRY_RUN=true` first
- Verify nginx config serves files correctly
- Test rollback procedure
- Monitor disk space during migration

### Production Environment

**Checklist before deployment:**

- [ ] Apply all security fixes (path traversal, race conditions)
- [ ] Set up monitoring/alerts for disk space
- [ ] Run migration script dry-run
- [ ] Backup Supabase Storage bucket
- [ ] Verify nginx config syntax (`nginx -t`)
- [ ] Test file access from production domain
- [ ] Plan maintenance window for migration
- [ ] Document rollback procedure

---

## References

### Context7 Documentation

**Node.js File System Security:**

- Path traversal prevention in package exports
- File permission checks with `fs.access()`
- Proper use of `path.join()` and `path.resolve()`

**nginx Static File Serving:**

- `alias` directive for path mapping
- `try_files` for existence checking
- Cache-Control headers for immutable content
- Security headers (`X-Content-Type-Options`)

### Related Files

- `.claude/agents/database/workers/database-architect.md` - For future RLS on storage paths
- `docs/ADR-005-deployment-strategy.md` - Deployment context
- `packages/course-gen-platform/src/stages/stage7-enrichments/README.md` - Stage 7 overview

---

## Conclusion

The enrichment storage migration is well-architected and follows best practices for local file storage. However, **critical security vulnerabilities** must be addressed before production deployment:

1. **Path traversal vulnerability** - HIGH RISK
2. **Race condition in writes** - MEDIUM RISK
3. **Missing disk space validation** - MEDIUM RISK

Once these issues are resolved, the migration will provide:

- ✅ Significant cost savings (egress traffic eliminated)
- ✅ Faster image loading (local serving)
- ✅ Better control over storage
- ✅ Reduced vendor lock-in

**Recommendation:** Apply security fixes from this review, run comprehensive tests on staging, then proceed with production deployment.

---

**Review completed:** 2026-01-23
**Reviewed by:** Claude Code (Sonnet 4.5)
**Next review:** After fixes applied
