# FUTURE-005: Sentry Error Monitoring Integration

**Status**: Future Enhancement
**Priority**: Medium
**Effort**: 4-6 hours
**Created**: 2025-11-29
**Source**: Code Review Issue #8

---

## Problem Statement

Currently, errors in the web application are logged via `console.error` which:
- Does not persist errors for analysis
- Does not aggregate similar errors
- Does not provide alerting for production issues
- Does not track error trends over time

## Proposed Solution

Integrate Sentry for comprehensive error monitoring across the Next.js web application.

## Scope

### Files to Create/Modify

```
packages/web/
├── sentry.client.config.ts    # Client-side Sentry config
├── sentry.server.config.ts    # Server-side Sentry config
├── sentry.edge.config.ts      # Edge runtime config (middleware)
├── next.config.js             # Add withSentryConfig wrapper
└── .env.example               # Add SENTRY_DSN, SENTRY_AUTH_TOKEN
```

### Dependencies

```bash
pnpm add @sentry/nextjs
```

### Configuration

1. **Client-side tracking**:
   - React component errors (Error Boundaries)
   - Unhandled promise rejections
   - Console errors
   - Performance monitoring (Web Vitals)

2. **Server-side tracking**:
   - API route errors
   - Server Component errors
   - tRPC errors
   - Database query failures

3. **Edge tracking**:
   - Middleware errors
   - Auth failures

### Integration Points

- `packages/web/lib/logger.ts` - Add Sentry.captureException
- `packages/web/components/generation-monitoring/realtime-provider.tsx` - Capture subscription errors
- `packages/web/app/api/**/route.ts` - Wrap with Sentry error handler
- Error boundaries in key components

## References

- [Sentry Next.js Documentation](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- Code Review Report: Issue #8 "Missing API Error Logging"

## Acceptance Criteria

- [ ] Sentry SDK installed and configured
- [ ] Client-side errors captured
- [ ] Server-side errors captured
- [ ] Source maps uploaded for stack traces
- [ ] Environment tags (development/staging/production)
- [ ] User context attached to errors (anonymized)
- [ ] Performance monitoring enabled
- [ ] Alert rules configured for critical errors
