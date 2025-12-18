# Edge Runtime Compatibility Status

**Last Updated**: 2025-10-04
**Priority**: Low (Monitoring Task)
**Status**: No Action Required Currently

## Overview

This document tracks Edge Runtime compatibility issues with Supabase realtime-js package and provides guidance for future edge deployment scenarios.

## Current Situation

### Build Warnings

During production builds, the following warnings appear:

```
Compiled with warnings.

./node_modules/@supabase/realtime-js/dist/module/RealtimeClient.js
Module not found: Can't resolve 'process/browser'

./node_modules/@supabase/realtime-js/dist/module/lib/version.js
The following Node.js APIs are not supported in the Edge Runtime:
- process.versions
- process.version
```

### Impact Assessment

**Current Impact**: ✅ **None - Application Functions Correctly**

- Middleware works correctly despite warnings
- No runtime errors in production
- Realtime subscriptions function as expected
- Build process completes successfully

**Potential Future Impact**: ⚠️ **May Limit Edge Runtime Deployment**

- If we want to deploy certain routes to Edge Runtime, these warnings may become blocking
- Edge Runtime has stricter Node.js API restrictions than standard Node.js runtime
- Current deployment uses standard Node.js runtime where these APIs are available

## Technical Details

### Why These Warnings Occur

The Supabase realtime-js library uses Node.js APIs that are not available in Vercel's Edge Runtime:

1. **`process.versions`**: Used to detect Node.js environment
2. **`process.version`**: Used to check Node.js version compatibility

These are legitimate uses for feature detection but are incompatible with Edge Runtime's subset of Node.js APIs.

### What is Edge Runtime?

Edge Runtime is Vercel's lightweight JavaScript runtime that:
- Runs at edge locations (closer to users)
- Has faster cold starts than serverless functions
- Has stricter API restrictions (no full Node.js APIs)
- Is ideal for middleware and simple API routes

## Current Architecture

### Routes Using Supabase Realtime

The following routes/components use Supabase realtime subscriptions:

1. **Course Generation Status Page** (`app/courses/generating/[slug]/page.tsx`)
   - Uses realtime subscriptions to monitor course generation progress
   - Deployed to standard Node.js runtime (not Edge Runtime)

2. **Middleware** (`middleware.ts`)
   - Does NOT use realtime subscriptions
   - Already compatible with Edge Runtime (warnings are from build analysis, not actual usage)

### Deployment Configuration

Current Next.js deployment uses:
- **Middleware**: Edge Runtime (compatible)
- **API Routes**: Node.js Runtime (allows full Node.js APIs)
- **Server Components**: Node.js Runtime (allows full Node.js APIs)

## Recommendations

### Short-term (Current State)

✅ **No Action Required**

- Warnings are informational only
- Application functions correctly
- Build succeeds without errors
- Realtime features work as expected

### Medium-term (Monitoring)

📊 **Monitor Supabase Package Updates**

Track Supabase package updates for Edge Runtime compatibility:

```bash
# Check for Supabase package updates
pnpm update --interactive @supabase/supabase-js @supabase/realtime-js

# Check release notes for Edge Runtime improvements
# https://github.com/supabase/supabase-js/releases
# https://github.com/supabase/realtime-js/releases
```

**Update Schedule**: Check quarterly or when major version updates are released

### Long-term (If Edge Deployment Needed)

If we decide to deploy realtime-heavy routes to Edge Runtime, consider these strategies:

#### Option 1: Isolate Realtime to Server Components

```typescript
// Keep realtime subscriptions in Server Components (Node.js runtime)
// Use client components only for UI rendering
export default async function CoursePage({ params }) {
  // Server component can use Node.js runtime
  const course = await getCourseData(params.slug);

  return <CourseClientComponent course={course} />;
}
```

#### Option 2: Use Supabase Edge Functions

```typescript
// Instead of realtime subscriptions in Next.js
// Use Supabase Edge Functions for realtime logic
// https://supabase.com/docs/guides/functions

// Next.js component polls Edge Function
const checkStatus = async () => {
  const { data } = await fetch('/api/course-status');
  return data;
};
```

#### Option 3: Split Routes by Runtime Requirements

```typescript
// next.config.ts
export const config = {
  // Routes with realtime: Node.js runtime
  '/courses/generating/[slug]': { runtime: 'nodejs' },

  // Simple routes: Edge runtime
  '/api/health': { runtime: 'edge' }
};
```

## Package Versions

**Current Versions** (as of 2025-10-04):

```json
{
  "@supabase/supabase-js": "^2.x.x",
  "@supabase/realtime-js": "^2.x.x"
}
```

**Known Compatible Versions**: All current versions work correctly with Node.js runtime

**Edge Runtime Status**: Not officially supported by @supabase/realtime-js

## Related Documentation

- [Vercel Edge Runtime Documentation](https://vercel.com/docs/functions/edge-functions/edge-runtime)
- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Next.js Runtime Configuration](https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes)

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-10-04 | No action required, continue monitoring | Warnings don't affect functionality, using Node.js runtime |

## Monitoring Checklist

Use this checklist when reviewing Edge Runtime compatibility:

- [ ] Check Supabase package release notes for Edge Runtime improvements
- [ ] Test realtime subscriptions after major Supabase updates
- [ ] Review build warnings after Next.js version updates
- [ ] Evaluate if new features require Edge Runtime deployment
- [ ] Assess if edge deployment would provide meaningful performance improvements

## Contacts

For questions about Edge Runtime deployment strategy:
- Review with team before making runtime changes
- Test thoroughly in preview deployments before production

---

**Conclusion**: This is a monitoring task, not an active bug. The application works correctly with current configuration. Document any changes to edge deployment requirements here.
