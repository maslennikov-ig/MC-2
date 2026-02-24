# Fix: Docling MCP health check shows "Ограничен" instead of "Работает"

## Context

In the admin panel, the Docling MCP service card shows status "Ограничен" (degraded) with yellow styling, despite the service being healthy. The root cause is in the `checkDoclingMcp()` function which sends a JSON-RPC POST to the MCP endpoint, but the MCP Streamable HTTP transport responds with SSE (`text/event-stream`), not JSON. When `response.json()` fails on this SSE body, the code returns `degraded`.

**Production architecture:**

- `docling-mcp` (nginx proxy) -> `docling-mcp-internal` (actual MCP server)
- Nginx proxy has a `/health` endpoint returning `200 OK` (`nginx-docling-proxy.conf:5-8`)
- But the health check ignores `/health` and tries the MCP protocol endpoint

## Change

**File:** `packages/web/app/api/admin/health/route.ts` - replace `checkDoclingMcp()` function (lines 212-317)

**Two-tier health check:**

1. **Tier 1 - GET `/health`**: Derive from `DOCLING_MCP_URL` by replacing `/mcp` with `/health`. Works in production/dev via nginx proxy. Fast and reliable.

2. **Tier 2 - POST to MCP endpoint** (fallback for local dev without nginx):
   - Check `Content-Type` header: if `text/event-stream` -> healthy (SSE = MCP Streamable HTTP working)
   - Parse JSON-RPC response -> existing logic (already returns healthy)
   - HTTP 400/405 -> healthy (server is running, just needs a session)
   - Connection failure -> error

| Scenario                    | Tier 1          | Tier 2       | Result      |
| --------------------------- | --------------- | ------------ | ----------- |
| Production (nginx + MCP up) | 200 OK          | -            | **healthy** |
| Local dev (MCP running)     | fail (no nginx) | SSE response | **healthy** |
| MCP not running             | fail            | fail         | **error**   |

## Verification

1. `pnpm type-check` - no TypeScript errors
2. Deploy to dev -> admin panel shows green "Работает" for Docling MCP
