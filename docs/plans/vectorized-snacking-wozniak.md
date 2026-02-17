# Investigation: 502 Error on Dev for Course EPT-0124

## Context

Tester reports 502 error on Dev (`dev.ai.megacampus.ru`) during generation of course EPT-0124.

## Root Cause: Container Restart During CI/CD Deployment

**502 was transient** — caused by container recreation during a push to `develop` branch.

### Evidence

**nginx error log** (5 entries, all at 20:33:00-20:33:13 UTC):

```
connect() failed (111: Connection refused) while connecting to upstream
upstream: "http://127.0.0.1:3010" (web-dev container)
URL: /courses/default-organization/kak-stat-schastlivym-884c3af5/generating?workflow=true
Client IP: 185.200.177.180 (tester)
```

**All dev containers recreated ~13 min ago** (CI/CD deploy):

- `megacampus-web-dev`: Up 13 min (healthy)
- `megacampus-api-dev`: Up 13 min (healthy)
- All workers: Up 13 min

During the 30-60 sec startup window, nginx proxied to port 3010 but the web container wasn't listening yet -> **502 Bad Gateway**.

### Current Status: Everything Healthy

| Container         | Memory            | Status  |
| ----------------- | ----------------- | ------- |
| web-dev           | 135MB / 1GB (13%) | healthy |
| api-dev           | 236MB / 1GB (23%) | healthy |
| worker-dev        | 200MB / 2GB (10%) | running |
| worker-stage6-dev | 198MB / 2GB (10%) | running |

**No ongoing issues.** The 502 was a brief window during deploy.

## Course EPT-0124 Status

| Field             | Value                                  |
| ----------------- | -------------------------------------- |
| Course ID         | `2c921d06-4722-4b3b-8de1-97c24c37ebaa` |
| Title             | "Как стать счастливым"                 |
| Generation Status | `stage_6_generating`                   |
| Jobs              | 2 completed, 5 active (lesson_content) |
| Errors on course  | None                                   |

Course is **actively generating**, no application errors.

## Secondary Issue: "Course not found" Warning

Web-dev logs show one warning after restart:

```json
{
  "error": "Cannot coerce the result to a single JSON object",
  "msg": "Course not found or not accessible"
}
```

This likely occurred during SSR when the web container started before the API was fully ready. Transient, should not recur.

## Earlier Stage 4 Failures (Separate Issue)

Course had repeated Stage 4 failures (18:24-18:51 UTC):

```
Phase phase3_expert failed after 3 attempts:
Phase 3 validation failed: pedagogical_strategy is Required
```

LLM didn't return required `pedagogical_strategy` field. Failed 3 BullMQ attempts, but course eventually progressed to Stage 6. This is a known cascading repair pattern.

## Recommended Actions

### For tester (immediate)

- **Refresh the page** — the 502 is already resolved, containers are healthy
- If 502 persists, clear browser cache and try again

### No code changes needed

The 502 was caused by infrastructure (deploy restart), not a bug in the application. Dev environment uses simple restart (no blue/green), so brief downtime during deploys is expected.

### Optional future improvement

If dev downtime during deploys is a problem, consider one of:

1. Add `proxy_next_upstream error timeout` to nginx dev config to retry on connection failure
2. Implement rolling restart (one container at a time) for dev compose
