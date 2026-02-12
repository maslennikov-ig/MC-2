# Fix: tRPC Proxy Route — query params + auth overhead

## Context

Тестер на `192.168.1.85:3000` (не localhost) получает 400 BAD_REQUEST на все вызовы `clarifying.submitAnswer`. Причина: proxy route `/api/trpc/[...path]` не пробрасывал query params для POST запросов. tRPC `httpBatchLink` добавляет `?batch=1`, без которого бэкенд не может распарсить batch body.

**Почему не rewrites**: исследование через Context7 и Next.js docs показало, что `rewrites()` в `next.config.ts` **не пробрасывают Authorization headers** к внешним URL. Это подтверждено GitHub issues #19078 и #17325. Custom API Route Handler — рекомендуемый паттерн для authenticated proxy.

## Changes

### File: `packages/web/app/api/trpc/[...path]/route.ts`

**1. Fix: forward query params for all methods (already applied)**

```diff
-    // Copy query params for GET requests
-    if (method === 'GET') {
-      const { searchParams } = new URL(request.url)
-      searchParams.forEach((value, key) => {
-        targetUrl.searchParams.set(key, value)
-      })
-    }
+    // Copy query params (needed for both GET and POST — tRPC batch link uses ?batch=1)
+    const { searchParams } = new URL(request.url)
+    searchParams.forEach((value, key) => {
+      targetUrl.searchParams.set(key, value)
+    })
```

**2. Improvement: forward client's Authorization header instead of creating server-side Supabase session**

Current proxy creates a Supabase server client on EVERY request just to re-extract the JWT. But the tRPC client (`trpc-provider.tsx:25-38`) already sends `Authorization: Bearer <token>`. The backend independently validates the JWT in `createContext()` (`server/trpc.ts:43-56`). Server-side re-extraction is redundant overhead.

```diff
-import { createClient } from '@/lib/supabase/server'

 async function proxyRequest(...) {
-    // Get auth token from Supabase session
-    const supabase = await createClient()
-    const { data: { session } } = await supabase.auth.getSession()
-    const accessToken = session?.access_token
-    userId = session?.user?.id

+    // Forward client's Authorization header directly
+    // Backend validates JWT independently (server/trpc.ts createContext)
+    const authorization = request.headers.get('authorization')

     const headers: HeadersInit = {
       'Content-Type': 'application/json',
     }
-    if (accessToken) {
-      headers['Authorization'] = `Bearer ${accessToken}`
+    if (authorization) {
+      headers['Authorization'] = authorization
     }
```

This removes:

- `createClient()` call (creates Supabase instance + reads cookies)
- `getSession()` call (extra I/O)
- ~50-100ms latency per proxied request

**Note**: `userId` for error logging — extract from JWT without Supabase call, or omit (backend logs the same errors with full context).

## Verification

1. **Restart dev server** (`pnpm --filter web dev`)
2. **From non-localhost** (192.168.1.85 or any LAN IP): create course, answer clarifying questions
3. **Check**: no 400 errors in browser console or backend logs
4. **Check**: auth works — only authenticated users can submit answers
5. **Type-check**: `pnpm --filter web type-check`
