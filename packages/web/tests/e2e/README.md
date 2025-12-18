# E2E Tests for Draft Session Workflow

This directory contains end-to-end tests for the Redis-based draft session management system.

## Overview

The draft session workflow prevents database pollution by storing form data in Redis with a 24-hour TTL, only materializing to PostgreSQL when necessary (file upload or form submission).

## Test Scenarios

### 1. Form Submission Without DB Pollution (`draft-session-flow.spec.ts`)

- **Scenario 1**: Complete form submission - verifies no DB record until submit
- **Scenario 2**: Auto-save to Redis - verifies form data saves after blur with debounce
- **Scenario 3**: File upload materialization - verifies DB creation on file upload
- **Scenario 4**: Page refresh - verifies new session creation without DB pollution
- **Scenario 5**: Abandoned session cleanup - verifies TTL cleanup works
- **Scenario 6**: Form validation - verifies validation errors don't create DB records
- **Bonus**: Multiple tabs isolation - verifies separate sessions per tab

## Prerequisites

### 1. Environment Setup

Copy `.env.e2e.example` to `.env.e2e` and configure:

```bash
cp .env.e2e.example .env.e2e
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for DB operations
- `REDIS_URL` - Redis connection URL (default: redis://localhost:6379)
- `TOKEN` - Test user auth token
- `TEST_USER_ID` - Test user ID
- `TEST_ORG_ID` - Test organization ID

### 2. Services Running

Ensure these services are running:

```bash
# Redis
docker-compose up -d redis

# Next.js dev server
pnpm dev

# Or use Playwright's built-in server (configured in playwright.config.ts)
```

### 3. Database State

Tests automatically clean up before/after each run, but for initial setup:

```bash
# Ensure test user exists in database
# User ID: 5a6f0557-613f-45bc-b591-059ffc7c7960
# Email: tester@megacampus.ai
```

## Running Tests

### Run All E2E Tests

```bash
pnpm test:e2e
```

### Run Specific Test File

```bash
pnpm test:e2e e2e/draft-session-flow.spec.ts
```

### Run in UI Mode (Debug)

```bash
pnpm test:e2e:ui
```

### Run Specific Scenario

```bash
# Run only Scenario 1
pnpm test:e2e --grep "should NOT create DB record until form submit"

# Run all scenarios in describe block
pnpm test:e2e --grep "Auto-Save to Redis"
```

### Run with Different Browsers

```bash
# Chromium only
pnpm test:e2e --project=chromium

# Firefox only
pnpm test:e2e --project=firefox

# All browsers
pnpm test:e2e --project=chromium --project=firefox --project=webkit
```

### Run in Headed Mode (See Browser)

```bash
pnpm test:e2e --headed
```

### Run in Debug Mode

```bash
pnpm test:e2e --debug
```

## Test Architecture

```
courseai-next/
├── e2e/
│   ├── draft-session-flow.spec.ts    # Main test scenarios
│   └── README.md                      # This file
├── tests/
│   ├── fixtures/
│   │   ├── auth.ts                   # Authentication fixtures
│   │   └── test-helpers.ts           # Helper functions
│   ├── global-setup.ts               # Global setup (auth)
│   ├── global-teardown.ts            # Global teardown
│   └── .auth/                        # Auth state (generated)
│       └── user.json
└── playwright.config.ts              # Playwright configuration
```

## Helper Functions

### Redis Operations

```typescript
import {
  getRedisSession,
  getAllRedisSessions,
  clearRedisSessions,
  setRedisSessionTimestamp,
} from '../tests/fixtures/test-helpers'

// Get specific session
const session = await getRedisSession(userId, sessionId)

// Get all sessions for user
const sessions = await getAllRedisSessions(userId)

// Clean up all sessions
await clearRedisSessions(userId)

// Set session timestamp (for TTL testing)
await setRedisSessionTimestamp(userId, sessionId, 25) // 25 hours ago
```

### Database Operations

```typescript
import {
  getDraftCourses,
  clearDraftCourses,
} from '../tests/fixtures/test-helpers'

// Get draft courses for user
const drafts = await getDraftCourses(userId)

// Clean up draft courses
await clearDraftCourses(userId)
```

### Page Interactions

```typescript
import {
  fillFormFields,
  waitForAutoSave,
  getCurrentUserId,
} from '../tests/fixtures/test-helpers'

// Fill form without submit
await fillFormFields(page, {
  topic: 'Test Course',
  description: 'Description',
  email: 'test@example.com',
  language: 'ru',
})

// Wait for auto-save debounce (3s + buffer)
await waitForAutoSave(page, 4000)

// Get current user ID
const userId = await getCurrentUserId(page)
```

## Troubleshooting

### Tests Failing with "Session not found"

**Cause**: Redis not running or connection refused

**Fix**:
```bash
docker-compose up -d redis
# Or check REDIS_URL in .env.e2e
```

### Tests Failing with "User not authenticated"

**Cause**: Invalid or expired TOKEN in .env.e2e

**Fix**:
1. Get fresh token from .env.test
2. Update TOKEN in .env.e2e
3. Re-run tests

### Auto-save Tests Failing

**Cause**: Debounce timeout too short or network delay

**Fix**: Increase timeout in `waitForAutoSave()` calls:
```typescript
await waitForAutoSave(page, 5000) // Increase from 4000 to 5000
```

### DB Record Not Created on Submit

**Cause**: Form validation failing or submit handler not triggered

**Fix**: Check browser console in headed mode:
```bash
pnpm test:e2e --headed --debug
```

### Cleanup Job Not Available

**Cause**: Supabase Edge Function not deployed

**Fix**: Tests will skip cleanup job test or use Redis TTL fallback:
```bash
# Deploy Edge Function
supabase functions deploy cleanup-old-drafts
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps

      - name: Run E2E tests
        run: pnpm test:e2e
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          REDIS_URL: redis://localhost:6379
          TOKEN: ${{ secrets.TEST_TOKEN }}
          TEST_USER_ID: ${{ secrets.TEST_USER_ID }}
          TEST_ORG_ID: ${{ secrets.TEST_ORG_ID }}

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

## Performance Benchmarks

Expected test execution times (on modern hardware):

- **Scenario 1** (Form Submission): ~8-10s
- **Scenario 2** (Auto-Save): ~12-15s (includes debounce waits)
- **Scenario 3** (File Upload): ~10-12s
- **Scenario 4** (Page Refresh): ~10-12s
- **Scenario 5** (Cleanup): ~5-8s
- **Scenario 6** (Validation): ~5-7s
- **Bonus** (Multiple Tabs): ~10-12s

**Total**: ~60-75 seconds for all scenarios

## Debugging Tips

### 1. Enable Verbose Logging

```bash
DEBUG=pw:api pnpm test:e2e
```

### 2. Slow Down Execution

```bash
pnpm test:e2e --headed --slow-mo=1000
```

### 3. Pause on Failure

```typescript
test('my test', async ({ page }) => {
  await page.pause() // Pause execution
  // ... test code ...
})
```

### 4. Screenshot on Each Step

```typescript
await page.screenshot({ path: 'step1-before-fill.png' })
await fillFormFields(page, { topic: 'Test' })
await page.screenshot({ path: 'step2-after-fill.png' })
```

### 5. Inspect Network Requests

```typescript
page.on('request', (request) => {
  console.log('>>', request.method(), request.url())
})

page.on('response', (response) => {
  console.log('<<', response.status(), response.url())
})
```

## Coverage Report

After running tests, view the HTML report:

```bash
pnpm exec playwright show-report
```

## Related Documentation

- [Technical Spec: Draft Course Cleanup](../docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md)
- [Draft Session Manager](../lib/draft-session.ts)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Test Fixtures Guide](https://playwright.dev/docs/test-fixtures)

## Maintenance

### Updating Tests

When the form changes:
1. Update selectors in `test-helpers.ts` → `fillFormFields()`
2. Update validation scenarios in Scenario 6
3. Run tests in UI mode to verify selectors

### Adding New Scenarios

1. Create new `test.describe()` block
2. Add setup/teardown if needed
3. Use existing helper functions
4. Update this README

### Deprecating Tests

Mark as `.skip` instead of deleting:
```typescript
test.skip('deprecated test', async ({ page }) => {
  // ... old test ...
})
```

## Support

For questions or issues:
1. Check this README
2. Check [Technical Spec](../docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md)
3. Run tests in debug mode: `pnpm test:e2e --debug`
4. Review Playwright traces in test results
