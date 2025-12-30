# Solving Service Worker 502 Errors in Next.js PWA Deployments

Users with stale Service Workers getting **502 Bad Gateway errors** after Next.js deployments stems from a specific, fixable problem: cached JS chunks with build-specific hashes no longer exist on the server, and the CacheFirst strategy serves errors from cache. This comprehensive guide provides multiple battle-tested solutions, from quick fixes within @ducanh2912/next-pwa to complete cache invalidation patterns used by production PWAs like Twitter and Pinterest.

## The root cause: Why your configuration is being ignored

Your `skipWaiting: false` and `cacheStartUrl: false` settings are being ignored because they're placed at the **wrong configuration level**. In @ducanh2912/next-pwa, `skipWaiting` belongs inside `workboxOptions`, not as a top-level option—a common misconfiguration that silently fails.

**Incorrect (silently ignored):**
```javascript
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  skipWaiting: false,     // ❌ NOT a valid top-level option
  cacheStartUrl: false,   // ✅ Valid top-level, but needs dynamicStartUrl too
});
```

**Correct configuration:**
```javascript
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheStartUrl: false,
  dynamicStartUrl: false,  // Required alongside cacheStartUrl
  workboxOptions: {
    skipWaiting: false,    // ✅ Correct location
    clientsClaim: false,
  },
});
```

The library's TypeScript types show `skipWaiting` is defined in `GenerateSWOptions` (part of `workboxOptions`), not in `PluginOptions`. Workbox-webpack-plugin defaults `skipWaiting: true`, so without explicit configuration in the correct location, it's always enabled.

## Preventing 502s with proper caching strategy

The real fix isn't about skipWaiting—it's about **never caching error responses** in the first place. Use `CacheableResponsePlugin` to only cache successful (200) responses, and switch from CacheFirst to NetworkFirst for JS chunks:

```javascript
// next.config.js - Complete solution
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheStartUrl: false,
  dynamicStartUrl: false,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: /\/_next\/static\/chunks\/.+\.js$/,
        handler: 'NetworkFirst',  // Not CacheFirst!
        options: {
          cacheName: 'next-js-chunks',
          networkTimeoutSeconds: 3,
          cacheableResponse: {
            statuses: [200],  // Critical: only cache 200 responses
          },
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 86400,
            purgeOnQuotaError: true,
          },
        },
      },
      {
        urlPattern: /\/_next\/static\/css\/.+\.css$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-css',
          cacheableResponse: { statuses: [200] },
          expiration: { maxEntries: 50, maxAgeSeconds: 86400 * 30 },
        },
      },
    ],
  },
});
```

The key insight: **NetworkFirst** tries the network first and falls back to cache only on network failure. Combined with `cacheableResponse: { statuses: [200] }`, this ensures 502 responses are never cached and users always get fresh chunks when available.

## Programmatic cache clearing from the main thread

When your ServiceWorkerManager runs "too late" (after 502 errors occur), the solution is to clear caches **before** the old SW can serve stale content. Add this to your app's bootstrap:

```javascript
// utils/clearStaleCache.ts
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION; // Set in build

export async function clearStaleCaches() {
  if (!('caches' in window)) return;
  
  const storedVersion = localStorage.getItem('app_version');
  
  // Version mismatch detected - nuclear option
  if (storedVersion && storedVersion !== APP_VERSION) {
    console.log(`Version mismatch: ${storedVersion} → ${APP_VERSION}`);
    
    // Clear ALL caches
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    
    // Unregister all service workers
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(reg => reg.unregister()));
    
    localStorage.setItem('app_version', APP_VERSION);
    
    // Force reload to get fresh content
    window.location.reload();
    return;
  }
  
  localStorage.setItem('app_version', APP_VERSION);
}

// Call FIRST in _app.tsx or root layout
// BEFORE any other initialization
useEffect(() => {
  clearStaleCaches();
}, []);
```

This approach clears caches immediately on page load when a version mismatch is detected, before the old SW can intercept requests.

## Service Worker self-destruct patterns

For a robust "poison pill" approach, deploy a new SW that detects stale resources and kills itself:

```javascript
// sw.js - Self-healing service worker
const VERSION = '__BUILD_HASH__'; // Inject at build time
const CRITICAL_RESOURCES = ['/_next/static/chunks/main'];

self.addEventListener('fetch', event => {
  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  try {
    const response = await fetch(request);
    
    // Detect server errors on critical resources
    if (response.status === 502 || response.status === 404) {
      const isCritical = CRITICAL_RESOURCES.some(r => 
        request.url.includes(r)
      );
      
      if (isCritical) {
        console.error(`Critical resource ${response.status}: ${request.url}`);
        await triggerSelfDestruct();
      }
    }
    return response;
  } catch (error) {
    // Network failure - try cache, but mark as stale
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function triggerSelfDestruct() {
  // Clear all caches
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
  
  // Unregister this service worker
  await self.registration.unregister();
  
  // Notify all clients to reload
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SW_SELF_DESTRUCT',
      reason: 'stale_resources',
    });
  });
}

// Listen for explicit cleanup requests
self.addEventListener('message', async event => {
  if (event.data.type === 'FORCE_CLEANUP') {
    await triggerSelfDestruct();
  }
});
```

## Clear-Site-Data header for emergency resets

The `Clear-Site-Data` HTTP header provides a nuclear option with **94.4% browser support** (including Safari 17+). The `"storage"` directive specifically unregisters Service Workers.

```typescript
// app/api/clear-cache/route.ts (Next.js App Router)
export async function POST(request: Request) {
  const currentVersion = process.env.APP_VERSION;
  const clientVersion = request.headers.get('x-app-version');
  
  // Only trigger for stale clients
  if (clientVersion && clientVersion !== currentVersion) {
    return new Response(JSON.stringify({ cleared: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Clear-Site-Data': '"cache", "storage"', // Clears caches AND unregisters SWs
      },
    });
  }
  
  return new Response(JSON.stringify({ cleared: false }));
}
```

**Key limitations:**
- HTTPS only (ignored on HTTP)
- Header is ignored when delivered BY a Service Worker (security measure)
- `"storage"` clears IndexedDB and localStorage too—use carefully
- Safari support only added in version 17.0 (September 2023)

**Implementation pattern for selective clearing:**
```javascript
// Client-side: trigger only for stale users
async function checkForStaleCache() {
  const currentVersion = document.querySelector(
    'meta[name="app-version"]'
  )?.content;
  
  try {
    const response = await fetch('/api/clear-cache', {
      method: 'POST',
      headers: {
        'x-app-version': localStorage.getItem('app_version') || '',
      },
      credentials: 'include', // Required for Clear-Site-Data
    });
    
    if (response.headers.has('clear-site-data')) {
      // Browser will handle clearing, then reload
      window.location.reload();
    }
  } catch (e) {
    console.error('Cache check failed:', e);
  }
}
```

## Production patterns from major PWAs

### Twitter Lite's approach
Twitter uses over **6,200 lines** of uglified Service Worker code with sophisticated caching. Key patterns:
- Cache-first for static assets (hashed JS/CSS bundles)
- Network-first for dynamic content
- Granular resource chunking—initial load only requires visible screen resources
- Silent, incremental cache updates

### Pinterest's Workbox implementation
Pinterest uses Workbox libraries with:
- **Precache manifest** for initial bundles (webpack runtime, vendor, entry chunks)
- **Cache-first** for JavaScript and CSS bundles with hash-based URLs
- **Application shell caching** for instant page refreshes
- Server-rendered, user-specific app shell cached for subsequent visits

### Common production pattern: User-prompted updates
Major PWAs avoid `skipWaiting()` for complex SPAs because it can cause version mismatches. Instead:

```javascript
// Workbox-window pattern used by production apps
import { Workbox } from 'workbox-window';

const wb = new Workbox('/sw.js');

wb.addEventListener('waiting', () => {
  // Show non-blocking notification
  showUpdateBanner({
    message: 'New version available',
    action: () => {
      wb.messageSkipWaiting();
    },
  });
});

wb.addEventListener('controlling', () => {
  window.location.reload();
});

wb.register();
```

## Should you switch to a custom Service Worker?

**Stay with Workbox** (via @ducanh2912/next-pwa or @serwist/next) unless you have very specific requirements. The tradeoffs:

| Factor | Workbox | Custom SW |
|--------|---------|-----------|
| **Development speed** | Fast—proven strategies | Slow—implement everything |
| **Bundle size** | ~40KB gzipped | Minimal |
| **Precache manifest** | Automatic | Manual webpack integration |
| **Error handling** | Plugin ecosystem | DIY |
| **Debugging** | Some abstraction | Full visibility |
| **Maintenance** | Battle-tested | Easy to introduce bugs |

**Workbox's CacheableResponsePlugin directly solves the 502 caching problem.** A custom SW only makes sense if you need sub-10KB bundle size or have caching logic that Workbox strategies can't express.

If you need more control than @ducanh2912/next-pwa offers, consider **@serwist/next** (a Workbox fork recommended by the next-pwa maintainer) or using Workbox's **InjectManifest** mode for a custom SW with automatic precache manifest generation.

## Complete recommended implementation

Here's the battle-tested configuration that prevents 502 errors and provides graceful updates:

```javascript
// next.config.js
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheStartUrl: false,
  dynamicStartUrl: false,
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      // JS chunks - NetworkFirst prevents 502 caching
      {
        urlPattern: /\/_next\/static\/chunks\/.+\.js$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'js-chunks',
          networkTimeoutSeconds: 3,
          cacheableResponse: { statuses: [200] },
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 86400,
            purgeOnQuotaError: true,
          },
        },
      },
      // Static assets with hash - CacheFirst is safe
      {
        urlPattern: /\/_next\/static\/(?!chunks).+$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          cacheableResponse: { statuses: [200] },
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 86400 * 30,
          },
        },
      },
      // HTML pages - NetworkFirst for freshness
      {
        urlPattern: /^https:\/\/[^/]+\/?(?!api|_next).*/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          networkTimeoutSeconds: 3,
          cacheableResponse: { statuses: [200] },
        },
      },
    ],
  },
});

module.exports = withPWA({
  // Your Next.js config
});
```

Add version-based cache clearing on the client:

```javascript
// app/layout.tsx or _app.tsx
useEffect(() => {
  const version = process.env.NEXT_PUBLIC_BUILD_ID;
  const stored = localStorage.getItem('build_id');
  
  if (stored && stored !== version && 'caches' in window) {
    caches.keys().then(names => 
      Promise.all(names.map(n => caches.delete(n)))
    ).then(() => localStorage.setItem('build_id', version));
  } else {
    localStorage.setItem('build_id', version);
  }
}, []);
```

## Conclusion

The 502 errors stem from **CacheFirst strategy caching error responses** combined with **misconfigured skipWaiting placement**. The solution combines three approaches: proper Workbox configuration with `cacheableResponse: { statuses: [200] }` and NetworkFirst for JS chunks, version-based client-side cache clearing that runs before the SW intercepts requests, and a Clear-Site-Data endpoint as an emergency kill switch.

Major production PWAs like Twitter and Pinterest favor **user-prompted updates** over aggressive skipWaiting, use **NetworkFirst for dynamic content** while reserving CacheFirst for immutable hashed assets, and implement robust version checking. For Next.js specifically, staying with Workbox (via @ducanh2912/next-pwa or @serwist/next) with proper configuration provides the best balance of reliability and maintainability.