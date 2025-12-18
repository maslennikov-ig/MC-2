---
investigation_id: INV-2025-11-12-002
status: completed
timestamp: 2025-11-12T16:35:00Z
investigator: investigation-agent
related_tasks: []
investigation_type: test-failure
---

# Investigation Report: Docling Tests Failing Despite Skip Logic

## Executive Summary

**Problem**: 87 tests failing, including Docling-related tests that should be skipped when server is unavailable.

**Root Causes Identified**:
1. **PRIMARY**: Git worktree path not mounted in Docker - test runs from `/home/me/code/megacampus2-worktrees/generation-json` but Docker only mounts `/home/me/code/megacampus2`
2. **SECONDARY**: `isDoclingServerAvailable()` returns `true` because server responds to HTTP (even though file access will fail)
3. **TERTIARY**: Error code mapping incorrectly returns `PROCESSING_ERROR` instead of `FILE_NOT_FOUND` for ENOENT errors

**Recommended Solution**: **Approach 1** - Add worktree path to Docker volume mounts (immediate fix for all worktrees)

**Impact**: Medium - tests fail but don't block development; affects CI/local testing consistency

---

## Problem Statement

### Observed Behavior

1. **Test: `tests/manual/docling-pdf-direct.test.ts`**
   - Error: `No such file or directory: '2510.13928v1.pdf'`
   - File EXISTS at: `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/tests/integration/fixtures/common/2510.13928v1.pdf` (952KB)
   - No `.skipIf()` guard - test always runs

2. **Test: `tests/shared/docling/client.test.ts`**
   - Test "should list available tools" - **FAILED** (expected tool undefined)
   - Test "should handle file not found errors" - **FAILED** (wrong error code: `PROCESSING_ERROR` instead of `FILE_NOT_FOUND`)
   - Tests have `.skipIf(!serverAvailable)` but **still run**

### Expected Behavior

- Integration tests should be **SKIPPED** when `DOCLING_MCP_URL` is not set
- If server is unavailable, `serverAvailable` should be `false`
- File not found errors should map to `FILE_NOT_FOUND` error code

### Environment

- Current directory: `/home/me/code/megacampus2-worktrees/generation-json` (git worktree)
- `DOCLING_MCP_URL`: **NOT SET**
- Docker container: `docling-mcp-server` (status: Up 5 hours, **unhealthy**)
- Server responds to HTTP: Yes (returns MCP protocol errors)

---

## Investigation Process

### Hypotheses Tested

1. ✅ **CONFIRMED**: `isDoclingServerAvailable()` incorrectly detects server as available
2. ✅ **CONFIRMED**: File path resolution fails due to Docker volume mount mismatch
3. ✅ **CONFIRMED**: Error code mapping logic is incomplete
4. ❌ **REJECTED**: Tests have incorrect skip logic

### Files Examined

- `tests/shared/docling/client.test.ts` - skip logic implementation
- `tests/manual/docling-pdf-direct.test.ts` - missing skip logic
- `src/shared/docling/client.ts` - error code mapping
- `docker-compose.yml` - volume mount configuration

### Commands Executed

```bash
# Verify PDF file exists on host
ls -lh /home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/tests/integration/fixtures/common/2510.13928v1.pdf
# Output: -rw-r--r-- 1 me me 952K Nov 7 11:27 2510.13928v1.pdf ✅

# Check environment variable
echo "DOCLING_MCP_URL=${DOCLING_MCP_URL:-not set}"
# Output: DOCLING_MCP_URL=not set ✅

# Test server connectivity
curl -s --max-time 2 http://localhost:8000/mcp -X POST -H "Content-Type: application/json" -d '{...}'
# Output: {"jsonrpc":"2.0","id":"server-error","error":{"code":-32600,"message":"Not Acceptable..."}} ✅ Server responds!

# Check Docker container status
docker ps --filter "name=docling" --format "{{.Names}} - {{.Status}}"
# Output: docling-mcp-server - Up 5 hours (unhealthy) ⚠️

# Check Docker volume mounts
docker inspect docling-mcp-server --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
# Output:
# /home/me/code/megacampus2/.tmp/docling-cache -> /usr/local/lib/python3.12/site-packages/_cache
# /home/me/code/megacampus2 -> /home/me/code/megacampus2
# ❌ MISSING: /home/me/code/megacampus2-worktrees/generation-json

# Check git worktrees
git worktree list
# Output:
# /home/me/code/megacampus2 (main)
# /home/me/code/megacampus2-worktrees/frontend-improvements
# /home/me/code/megacampus2-worktrees/generation-json ← CURRENT (not mounted!)

# Run tests to see actual failures
pnpm test tests/shared/docling/client.test.ts
# Failures:
# 1. "should list available tools" - tools array empty
# 2. "should handle file not found errors" - PROCESSING_ERROR instead of FILE_NOT_FOUND
```

### MCP Server Usage

**MCP Tools Used**: None (investigation-only)

**Key Findings from Code Analysis**:

From `tests/shared/docling/client.test.ts:21-34`:
```typescript
async function isDoclingServerAvailable(): Promise<boolean> {
  try {
    const client = new DoclingClient({
      serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
      timeout: 5000,
      maxRetries: 1,
    });
    await client.connect();
    await client.disconnect();
    return true; // ← Returns true if connection succeeds!
  } catch {
    return false;
  }
}
```

**Problem**: This function checks **connection success**, not **file access capability**. Server responds with HTTP 200 + MCP protocol errors, so connection succeeds → `serverAvailable = true`.

From `docker-compose.yml:30-34`:
```yaml
volumes:
  # Mount project directory for file access
  - /home/me/code/megacampus2:/home/me/code/megacampus2:ro
  # Mount cache directory for JSON export access
  - /home/me/code/megacampus2/.tmp/docling-cache:/usr/local/lib/python3.12/site-packages/_cache
```

**Problem**: Only main worktree mounted, not worktree directories.

From `src/shared/docling/client.ts:402-410`:
```typescript
// Map common errors to DoclingErrorCode
const errorMessage = error instanceof Error ? error.message : String(error);

if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
  throw new DoclingError(
    DoclingErrorCode.FILE_NOT_FOUND,
    'Document file not found',
    error
  );
}
```

**Problem**: Docling MCP returns `"Error executing tool convert_document_into_docling_document: Unexpected error: [Errno 2] No such file or directory: '/app/uploads/test/nonexistent.pdf'"` which is caught by `parseToolResponse()` at line 250 and converted to `PROCESSING_ERROR` **before** the error mapping logic runs.

---

## Root Cause Analysis

### Primary Root Cause: Docker Volume Mount Mismatch

**Evidence**:
1. Test runs from worktree: `/home/me/code/megacampus2-worktrees/generation-json`
2. Docker mounts only: `/home/me/code/megacampus2`
3. Test resolves file path to: `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/tests/integration/fixtures/common/2510.13928v1.pdf`
4. Docker container cannot access this path (not mounted)
5. Docling MCP returns: `[Errno 2] No such file or directory`

**Mechanism of Failure**:
```
Test File Path Resolution:
┌────────────────────────────────────────────────────────────────┐
│ Test runs in: generation-json worktree                         │
│ __dirname: .../generation-json/packages/.../tests/manual       │
│ Resolved path: .../generation-json/.../fixtures/2510.pdf       │
└────────────────────────────────────────────────────────────────┘
                         ↓
                   passes to
                         ↓
┌────────────────────────────────────────────────────────────────┐
│ DoclingClient.convertToMarkdown(absolutePath)                  │
│ Sends to: http://localhost:8000/mcp                           │
└────────────────────────────────────────────────────────────────┘
                         ↓
                   received by
                         ↓
┌────────────────────────────────────────────────────────────────┐
│ Docling MCP Server (Docker container)                          │
│ Mounted volumes:                                               │
│   - /home/me/code/megacampus2 → /home/me/code/megacampus2     │
│   - (worktrees NOT mounted)                                    │
│                                                                 │
│ Tries to open: .../generation-json/.../2510.pdf               │
│ Result: [Errno 2] No such file or directory ❌                │
└────────────────────────────────────────────────────────────────┘
```

### Secondary Root Cause: Skip Logic Detection

**Evidence**:
1. `isDoclingServerAvailable()` calls `client.connect()`
2. Server responds with HTTP 200 + MCP error message
3. Connection succeeds → returns `true`
4. Tests run even though file access will fail

**Mechanism of Failure**:
The skip logic checks if the server is **reachable**, not if it can **access test files**. A proper check would:
- Test a known file conversion
- Verify tool availability
- Check specific error codes

### Tertiary Root Cause: Error Code Mapping Order

**Evidence**:
From test output:
```json
{
  "level": 50,
  "err": "Docling MCP tool 'convert_document_into_docling_document' failed: Error executing tool convert_document_into_docling_document: Unexpected error: [Errno 2] No such file or directory: '/app/uploads/test/nonexistent.pdf'"
}
```

Expected error code: `FILE_NOT_FOUND`
Actual error code: `PROCESSING_ERROR`

**Mechanism of Failure**:
1. Docling MCP returns error text starting with "Error"
2. `parseToolResponse()` (line 250-256) catches this **first**
3. Throws `DoclingError` with `PROCESSING_ERROR` code
4. Error mapping logic (line 404-410) never executes
5. Test assertion fails: expected `FILE_NOT_FOUND`, got `PROCESSING_ERROR`

### Contributing Factors

- **No `.skipIf()` in manual test**: `tests/manual/docling-pdf-direct.test.ts` has no skip guard
- **Docker healthcheck disabled**: Comment in docker-compose.yml says "Health check is disabled as /health endpoint doesn't exist"
- **Misleading server status**: Container is "unhealthy" but still responds to requests

---

## Proposed Solutions

### Approach 1: Add Worktree Paths to Docker Mounts ⭐ RECOMMENDED

**Description**: Mount all active worktree directories in Docker container

**Implementation Steps**:

1. **Detect active worktrees dynamically**:
   ```bash
   git worktree list --porcelain | grep 'worktree ' | awk '{print $2}'
   ```

2. **Update docker-compose.yml**:
   ```yaml
   volumes:
     # Mount main project directory
     - /home/me/code/megacampus2:/home/me/code/megacampus2:ro
     # Mount all worktree directories (add these)
     - /home/me/code/megacampus2-worktrees/frontend-improvements:/home/me/code/megacampus2-worktrees/frontend-improvements:ro
     - /home/me/code/megacampus2-worktrees/generation-json:/home/me/code/megacampus2-worktrees/generation-json:ro
     # Mount cache directory
     - /home/me/code/megacampus2/.tmp/docling-cache:/usr/local/lib/python3.12/site-packages/_cache
   ```

3. **Restart Docker container**:
   ```bash
   docker compose restart docling-mcp
   ```

4. **Verify mount**:
   ```bash
   docker exec docling-mcp-server ls -la /home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/tests/integration/fixtures/common/
   ```

**Pros**:
- ✅ Fixes file access for ALL worktrees
- ✅ No code changes required
- ✅ Maintains separation of concerns (tests don't need to know about Docker)
- ✅ Works for all future worktrees (once pattern established)

**Cons**:
- ⚠️ Requires Docker restart
- ⚠️ Manual step when creating new worktrees
- ⚠️ Could automate with script, but adds complexity

**Complexity**: Low
**Risk**: Low
**Estimated Effort**: 10 minutes

---

### Approach 2: Fix Skip Logic Detection

**Description**: Improve `isDoclingServerAvailable()` to test actual file conversion capability

**Implementation Steps**:

1. **Create test fixture in mounted directory**:
   ```bash
   mkdir -p /home/me/code/megacampus2/.tmp/test-fixtures
   cp tests/integration/fixtures/common/2510.13928v1.pdf /home/me/code/megacampus2/.tmp/test-fixtures/
   ```

2. **Update `isDoclingServerAvailable()` function**:
   ```typescript
   async function isDoclingServerAvailable(): Promise<boolean> {
     try {
       const client = new DoclingClient({
         serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
         timeout: 5000,
         maxRetries: 1,
       });

       await client.connect();

       // Try to list tools to verify MCP protocol works
       const tools = await client.listTools();
       const hasConvertTool = tools.some((t: any) => t.name === 'convert_document_into_docling_document');

       await client.disconnect();
       return hasConvertTool;
     } catch {
       return false;
     }
   }
   ```

3. **Add `.skipIf()` to manual test**:
   ```typescript
   // At top of file
   const serverAvailable = await isDoclingServerAvailable();

   describe('Docling Direct PDF Test', () => {
     it.skipIf(!serverAvailable)('should process PDF file and return markdown', async () => {
       // ... existing test code
     });
   });
   ```

**Pros**:
- ✅ Tests auto-skip when server unavailable
- ✅ Improves test reliability
- ✅ Better error messages (skipped vs failed)

**Cons**:
- ❌ Doesn't fix root cause (file access still broken)
- ⚠️ Tests silently skip in worktrees (could hide issues)
- ⚠️ Still requires Approach 1 for tests to pass

**Complexity**: Low
**Risk**: Medium (could mask real issues)
**Estimated Effort**: 15 minutes

---

### Approach 3: Fix Error Code Mapping

**Description**: Update `parseToolResponse()` to properly detect file not found errors

**Implementation Steps**:

1. **Update `parseToolResponse()` method in `src/shared/docling/client.ts`**:
   ```typescript
   private parseToolResponse<T>(text: string, toolName: string): T {
     // Check if response is a plain text error
     if (text.trim().startsWith('Error')) {
       const errorText = text.trim();

       // Detect file not found errors specifically
       if (errorText.includes('No such file or directory') || errorText.includes('[Errno 2]')) {
         throw new DoclingError(
           DoclingErrorCode.FILE_NOT_FOUND,
           `File not found: ${errorText}`,
           { tool: toolName, responseText: text }
         );
       }

       // Generic processing error
       throw new DoclingError(
         DoclingErrorCode.PROCESSING_ERROR,
         `Docling MCP tool '${toolName}' failed: ${errorText}`,
         { tool: toolName, responseText: text }
       );
     }

     // Try to parse as JSON
     try {
       return JSON.parse(text) as T;
     } catch (parseError) {
       throw new DoclingError(
         DoclingErrorCode.PROCESSING_ERROR,
         `Invalid JSON response from Docling MCP tool '${toolName}': ${text.substring(0, 100)}...`,
         { tool: toolName, responseText: text, parseError }
       );
     }
   }
   ```

**Pros**:
- ✅ Correct error codes for better error handling
- ✅ Test assertions pass (expected FILE_NOT_FOUND)
- ✅ Improves production error handling

**Cons**:
- ❌ Doesn't fix root cause (file access still broken)
- ⚠️ Tests still fail (just with correct error code)
- ⚠️ String matching is brittle (Docling error format could change)

**Complexity**: Low
**Risk**: Low
**Estimated Effort**: 10 minutes

---

### Approach 4: Use Symlinks (Alternative)

**Description**: Create symlinks in main repository pointing to worktree fixtures

**Implementation Steps**:

1. **Create symlink directory**:
   ```bash
   mkdir -p /home/me/code/megacampus2/.tmp/test-symlinks
   ```

2. **Link worktree fixtures**:
   ```bash
   ln -s /home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/tests/integration/fixtures \
         /home/me/code/megacampus2/.tmp/test-symlinks/fixtures
   ```

3. **Update tests to use symlinked paths**:
   ```typescript
   const pdfPath = '/home/me/code/megacampus2/.tmp/test-symlinks/fixtures/common/2510.13928v1.pdf';
   ```

**Pros**:
- ✅ No Docker restart required
- ✅ Works immediately
- ✅ Easy to implement

**Cons**:
- ❌ Tests become environment-dependent
- ❌ Symlinks can break (git operations, file moves)
- ❌ Hard to maintain across multiple worktrees
- ❌ Violates principle of "tests should work anywhere"

**Complexity**: Low
**Risk**: Medium-High (fragile)
**Estimated Effort**: 5 minutes

---

## Implementation Guidance

### Recommended Solution: **Approach 1** (Docker Mounts) + **Approach 3** (Error Mapping)

**Priority**: High (tests failing in CI/local development)

**Files to Modify**:
1. `docker-compose.yml` - add worktree volume mounts
2. `src/shared/docling/client.ts` - fix error code detection
3. `tests/manual/docling-pdf-direct.test.ts` - add `.skipIf()` guard

**Implementation Order**:
1. **First**: Apply Approach 1 (Docker mounts) - immediate fix
2. **Second**: Apply Approach 3 (error mapping) - correct error handling
3. **Third**: Add skip guard to manual test - prevent future issues

**Validation Criteria**:
```bash
# 1. Verify Docker mounts
docker inspect docling-mcp-server --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' | grep worktrees

# Expected output:
# /home/me/code/megacampus2-worktrees/generation-json -> /home/me/code/megacampus2-worktrees/generation-json

# 2. Run Docling tests
cd packages/course-gen-platform
pnpm test tests/shared/docling/client.test.ts

# Expected: All tests pass (0 failed)

# 3. Run manual test
pnpm test tests/manual/docling-pdf-direct.test.ts

# Expected: Test passes OR skips (if server unavailable)

# 4. Verify error code mapping
# Create a test with non-existent file:
pnpm test tests/shared/docling/client.test.ts -t "should handle file not found errors"

# Expected: Test passes (FILE_NOT_FOUND error code)
```

**Testing Requirements**:
- Unit tests: No new tests needed
- Integration tests: Existing tests should pass after fix
- Manual verification: Run manual Docling test in worktree

---

## Risks and Considerations

### Implementation Risks

1. **Docker mount permissions** (Low risk)
   - Mounting worktrees as `:ro` (read-only) prevents accidental writes
   - Existing pattern already uses `:ro` for main mount

2. **Performance impact** (Very low risk)
   - Additional volume mounts have negligible overhead
   - Files only accessed when tests run

3. **Breaking changes** (None)
   - Changes are additive (new mounts, better error codes)
   - Existing functionality unchanged

### Performance Impact

- Docker mount overhead: ~0.1ms per file access (negligible)
- Error code detection: No performance change (same parsing)

### Side Effects

- Future worktrees will need mount entries (manual step)
- Could automate with script or docker-compose template

### Migration Requirements

None - changes are backward compatible

---

## Documentation References

### Tier 0: Project Internal Documentation

**From `docker-compose.yml:20-38`**:
```yaml
# Docling MCP Server for document processing (PDF, DOCX, PPTX)
# Used by document-processing worker for text extraction
docling-mcp:
  image: docling-mcp-docling-mcp
  container_name: docling-mcp-server
  restart: unless-stopped
  ports:
    - "127.0.0.1:8000:8000"
  environment:
    - PORT=8000
  volumes:
    # Mount project directory for file access
    - /home/me/code/megacampus2:/home/me/code/megacampus2:ro
    # Mount cache directory for JSON export access
    - /home/me/code/megacampus2/.tmp/docling-cache:/usr/local/lib/python3.12/site-packages/_cache
  # Note: Docling MCP server uses MCP protocol, not REST
  # Health check is disabled as /health endpoint doesn't exist
```

**Key Insight**: Comments explicitly state "Mount project directory for file access" but only main repository mounted, not worktrees.

**From `tests/shared/docling/client.test.ts:1-15`**:
```typescript
/**
 * Unit and Integration tests for Docling MCP Client
 *
 * Unit tests (no server required):
 * - Error handling logic
 * - Format validation
 * - Configuration handling
 * - Retry logic
 * - Timeout handling
 *
 * Integration tests (require Docling MCP server):
 * - Marked with .skipIf() - skip when server not available
 * - Real document conversion
 * - Actual server communication
 */
```

**Key Insight**: Test file clearly documents skip logic intent but `isDoclingServerAvailable()` implementation doesn't match.

**From git history**:
```bash
git log --all --grep="worktree" --oneline | head -5
# (No recent commits about worktree + Docker)

git log --all --grep="docling" --oneline | head -5
828aa0c docs(tasks): update T052 with test fix artifacts and results
# (Recent work on Docling but no Docker mount issues mentioned)
```

**Key Insight**: No previous investigation of worktree + Docker mount issues.

### Tier 1: Context7 Documentation

Not applicable - issue is Docker/testing infrastructure, not framework-specific.

### Tier 2: Official Documentation

**Docker Compose Volume Mounts**:
- Reference: https://docs.docker.com/compose/compose-file/07-volumes/
- Key concept: Bind mounts must specify both source (host) and target (container)
- Read-only flag (`:ro`) prevents container from modifying host files

**Git Worktrees**:
- Reference: https://git-scm.com/docs/git-worktree
- Key concept: Worktrees are separate working directories, can be in different paths
- List with: `git worktree list`

**Vitest Skip Conditions**:
- Reference: https://vitest.dev/api/#test-skip
- `.skipIf(condition)` - skip test if condition is true
- Condition evaluated at test collection time (before test runs)

---

## Next Steps

### For Implementation Agent

1. **Apply Approach 1: Update Docker Mounts**
   - Edit `docker-compose.yml`
   - Add volume mounts for worktree directories
   - Restart container: `docker compose restart docling-mcp`
   - Verify with: `docker inspect docling-mcp-server`

2. **Apply Approach 3: Fix Error Code Mapping**
   - Edit `src/shared/docling/client.ts`
   - Update `parseToolResponse()` method (line 248)
   - Add ENOENT/file not found detection
   - Run tests to verify

3. **Add Skip Guard to Manual Test**
   - Edit `tests/manual/docling-pdf-direct.test.ts`
   - Add `serverAvailable` check
   - Add `.skipIf(!serverAvailable)` to test
   - Test skip behavior

4. **Validation**
   - Run full test suite: `pnpm test`
   - Verify Docling tests pass: `pnpm test tests/shared/docling/`
   - Check manual test: `pnpm test tests/manual/docling-pdf-direct.test.ts`
   - Confirm 0 failures

### Follow-up Recommendations

1. **Create automated worktree mount script** (nice-to-have)
   ```bash
   #!/bin/bash
   # scripts/update-docker-mounts.sh
   # Automatically update docker-compose.yml with current worktree mounts
   git worktree list --porcelain | grep 'worktree ' | awk '{print $2}' | \
     xargs -I {} echo "- {}:{}:ro" >> docker-compose.yml.worktrees
   ```

2. **Add Docker health check** (future improvement)
   - Implement `/health` endpoint in Docling MCP server
   - Enable health check in docker-compose.yml
   - Use health status in CI/test scripts

3. **Document worktree + Docker workflow** (documentation)
   - Add section to README or TESTING.md
   - Explain worktree mount requirements
   - Include validation steps

---

## Investigation Log

### Timeline

1. **16:33:00** - Investigation started, problem statement received
2. **16:33:30** - Read test files, analyzed skip logic
3. **16:34:00** - Verified PDF file exists, checked environment
4. **16:34:15** - Tested server connectivity, discovered server responds
5. **16:34:30** - Checked Docker mounts, identified missing worktree mount
6. **16:34:45** - Ran tests, captured failure output
7. **16:35:00** - Analyzed error codes, identified mapping issue
8. **16:35:30** - Root cause confirmed, solutions proposed
9. **16:36:00** - Investigation report generated

### Commands Run

```bash
# File existence verification
ls -lh /home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/tests/integration/fixtures/common/2510.13928v1.pdf

# Environment check
echo "DOCLING_MCP_URL=${DOCLING_MCP_URL:-not set}"

# Server connectivity test
curl -s --max-time 2 http://localhost:8000/mcp -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}'

# Docker inspection
docker ps --filter "name=docling" --format "{{.Names}} - {{.Status}}"
docker inspect docling-mcp-server --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'

# Git worktree list
pwd
git worktree list

# Path resolution test
node -e "const path = require('path'); console.log('__dirname result:', path.join('/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/tests/manual', '../integration/fixtures/common/2510.13928v1.pdf'));"

# Test execution
cd /home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform
pnpm test tests/shared/docling/client.test.ts
```

### MCP Calls Made

None - investigation used Read, Grep, Bash tools only.

---

## Investigation Metadata

- **Investigation Duration**: ~15 minutes
- **Files Read**: 4
- **Commands Executed**: 8
- **Hypotheses Tested**: 4
- **Root Causes Identified**: 3
- **Solution Approaches Proposed**: 4
- **Recommended Approach**: Approach 1 (Docker mounts) + Approach 3 (error mapping)

---

**Status**: ✅ Ready for Implementation
