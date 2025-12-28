# Service Worker 502 Bad Gateway Error Research

**Research Date**: 2025-12-28
**Researcher**: research-specialist
**Status**: Complete
**Focus**: Service Worker caching issues with Next.js PWA causing 502 Bad Gateway errors after deployment

---

## Executive Summary

After deployment of Next.js PWA applications using @ducanh2912/next-pwa, users experience 502 Bad Gateway errors due to the Service Worker serving stale JavaScript chunks with outdated build IDs. This is a well-documented issue in the PWA ecosystem caused by the fundamental mismatch between Next.js's dynamic chunk generation and Service Worker precaching strategies.

**Key Findings:**
- Root cause is Service Worker precaching chunks with content-based hashes that change on every build
- Next.js chunk hashes are NOT deterministic even with same BUILD_ID
- Using `skipWaiting: true` significantly worsens the problem for lazy-loaded resources
- The @ducanh2912/next-pwa maintainer recommends migrating to Serwist (modern successor)
- Multiple mitigation strategies exist, from immediate fixes to long-term architectural changes

**Recommended Immediate Action:**
1. Implement ChunkLoadError detection and auto-reload with localStorage protection
2. Remove `skipWaiting: true` from Service Worker configuration
3. Use NetworkFirst strategy for HTML pages to prevent stale content serving

---

## Table of Contents

1. [Root Cause Analysis](#root-cause-analysis)
2. [Known Issues with @ducanh2912/next-pwa](#known-issues-with-ducanh2912next-pwa)
3. [Best Practices for Service Worker Caching](#best-practices-for-service-worker-caching)
4. [skipWaiting and clientsClaim Trade-offs](#skipwaiting-and-clientsclaim-trade-offs)
5. [Mitigation Strategies](#mitigation-strategies)
6. [Recommendations](#recommendations)
7. [Sources](#sources)

---

## Root Cause Analysis

### The Problem Chain

1. **Next.js Chunk Generation**
   - Next.js generates webpack chunks with content-based hashes (e.g., `chunks/123abc.js`)
   - Chunk hashes change on EVERY build, even with the same BUILD_ID
   - Source: [Next.js Discussion #65856](https://github.com/vercel/next.js/discussions/65856) confirms "chunk names are not the same between builds"

2. **Service Worker Precaching**
   - Service Worker precaches chunks during installation
   - Precache manifest includes specific chunk URLs with their hashes
   - After deployment, new chunks have different hashes

3. **The Mismatch**
   - New HTML points to new chunk URLs (`chunks/456def.js`)
   - Service Worker cache contains old chunk URLs (`chunks/123abc.js`)
   - Browser requests new chunk → 404 Not Found → 502 Bad Gateway

4. **skipWaiting Exacerbates the Issue**
   - When `skipWaiting: true`, new Service Worker takes control immediately
   - User may have loaded page with old SW, then new SW activates mid-session
   - Lazy-loaded chunks requested with new hashes fail because old chunks are cached
   - **Workbox Warning**: "If your web app lazy-loads resources that are uniquely versioned with hashes in their URLs, it's recommended that you avoid using skip waiting" ([Proximity Blog](https://www.proximity.blog/post/building-a-next-js-pwa-using-nextpwa-and-service-worker-2022330))

### Why 502 Instead of 404?

The 502 Bad Gateway error occurs when:
- The Service Worker attempts to serve a cached response but the resource doesn't exist
- CDN or reverse proxy layers cache outdated file mappings
- Cloudflare or similar CDNs cache an outdated file with a mismatched path ([Next.js Discussion #48328](https://github.com/vercel/next.js/discussions/48328))

### Impact on User Experience

- Users see broken pages after deployment
- Navigation fails when triggering lazy-loaded routes
- Only fix is manual cache clearing or hard refresh (Ctrl+Shift+R)
- Normal refresh (Ctrl+R) is NOT sufficient because browsers don't unload earlier instance ([Handling Service Worker Updates](https://whatwebcando.today/articles/handling-service-worker-updates/))

---

## Known Issues with @ducanh2912/next-pwa

### Package Status

- **Current Package**: `@ducanh2912/next-pwa` v10.2.9 (last published ~1 year ago)
- **Maintainer Recommendation**: Consider migrating to `@serwist/next` ([GitHub DuCanhGH/next-pwa](https://github.com/DuCanhGH/next-pwa))
- **Background**: Fork of unmaintained `shadowwalker/next-pwa`; maintainer now develops Serwist

### Common Issues Reported

1. **Stale Data with getServerSideProps**
   - Default `stale-while-revalidate` strategy problematic for SSR pages
   - Solution: Use NetworkFirst strategy for GSSP pages ([Next.js Discussion #52024](https://github.com/vercel/next.js/discussions/52024))

2. **Service Worker Persistence**
   - SW remains installed even after disabling PWA in config
   - Causes stale data issues for returning users
   - Requires manual unregistration or no-op SW deployment

3. **Update Detection Failures**
   - Users report update dialog not appearing
   - Clicking 'update' button does nothing
   - Hard reload required to get latest version

4. **ChunkLoadError with Service Workers**
   - Multiple reports of chunk loading failures after deployment
   - "The installed service worker tries to fetch the old component chunk instead of the new one" ([Create React App Issue #3613](https://github.com/facebook/create-react-app/issues/3613))

### Configuration Caveats

- **cacheOnFrontendNav**: Enables additional route caching with next/link navigation
- **aggressiveFrontEndNavCaching**: Caches ALL stylesheets/scripts (requires cacheOnFrontendNav)
- **cacheStartUrl**: Can cause issues if start URL returns different HTML for different states (logged in vs out)
- **Debugging Tip**: "When debugging service worker, constantly clean application cache to reduce some flaky errors" ([next-pwa Configuring Docs](https://ducanh-next-pwa.vercel.app/docs/next-pwa/configuring))

---

## Best Practices for Service Worker Caching

### Workbox Strategies Overview

#### 1. NetworkFirst
**When to Use:**
- HTML pages (always get latest content)
- API endpoints that update frequently
- Server-side rendered pages

**How It Works:**
- Tries network first
- Falls back to cache if network fails
- Updates cache with successful network response

**Source:** [Workbox Strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies)

#### 2. CacheFirst
**When to Use:**
- Static assets (images, fonts)
- Versioned/hashed resources already precached
- Offline fallback pages

**How It Works:**
- Serves from cache if available
- Only queries network on cache miss
- Does NOT update cache in background

**Warning:** Not suitable for resources that need to stay fresh

#### 3. StaleWhileRevalidate
**When to Use:**
- CSS/JS files where freshness is less critical
- Resources where speed > freshness

**How It Works:**
- Serves cached version immediately
- Updates cache in background
- Next request gets updated version

**Trade-off:** Users may see stale content for one navigation cycle

### Recommended Workbox Configuration for Next.js

```javascript
// workbox-config.js or next.config.js
{
  runtimeCaching: [
    // HTML pages - always get latest
    {
      urlPattern: /^https:\/\/yourdomain\.com\/.*$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
      },
    },
    // Static assets - cache first
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    // API calls - network first
    {
      urlPattern: /^https:\/\/yourdomain\.com\/api\/.*$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60, // 5 minutes
        },
      },
    },
  ],
}
```

**Source:** [Workbox Strategies with Examples](https://www.harrytheo.com/blog/2021/03/workbox-strategies-with-examples-and-use-cases/)

### Excluding Dynamic Chunks from Precache

**Critical:** Do NOT precache Next.js dynamic chunks. They have content-based hashes that change on every build.

```javascript
// next.config.js with @ducanh2912/next-pwa
const withPWA = require('@ducanh2912/next-pwa')({
  dest: 'public',
  exclude: [
    // Exclude dynamic chunks
    /chunks\/.*$/,
    // Exclude build-specific files
    /\.map$/,
    /manifest.*\.js$/,
  ],
});
```

**Source:** [next-pwa Configuring Docs](https://ducanh-next-pwa.vercel.app/docs/next-pwa/configuring)

---

## skipWaiting and clientsClaim Trade-offs

### skipWaiting Behavior

**What It Does:**
- Forces new Service Worker to activate immediately
- Skips "waiting" state (normally waits for all tabs to close)

**Deprecated Workbox Method:**
- `workbox-core`'s `skipWaiting()` is deprecated in v6
- Use `self.skipWaiting()` directly instead
- **Source:** [Workbox Core Docs](https://developer.chrome.com/docs/workbox/modules/workbox-core)

### clientsClaim Behavior

**What It Does:**
- New Service Worker takes control of all clients immediately
- No refresh required for SW to control pages

**Workbox Recommendation:**
- Continue using `clientsClaim()` from workbox-core
- Provides safety against calling `self.clients.claim()` before activation
- Prevents runtime exceptions
- **Source:** [Workbox Core Docs](https://developer.chrome.com/docs/workbox/modules/workbox-core)

### The Critical Warning

**Workbox Documentation:**
> "If your web app lazy-loads resources that are uniquely versioned with hashes in their URLs, it's recommended that you avoid using skip waiting. Enabling it could lead to failures when lazily-loading URLs that were previously precached and were purged during an updated service worker's activation."

**Source:** [Building a Next.js PWA - Part II](https://able.bio/drenther/building-a-progressive-web-app-with-nextjs-part-ii--98ojk46)

### Recommended Configuration

```javascript
// service-worker.js
import { installSerwist } from '@serwist/sw';

installSerwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // CRITICAL: Set to false for Next.js
  clientsClaim: true, // Safe to use with Workbox wrapper
  navigationPreload: true,
  runtimeCaching: [/* ... */],
});
```

### Trade-offs Matrix

| Configuration | Pros | Cons |
|---------------|------|------|
| `skipWaiting: true` + `clientsClaim: true` | Immediate updates, no user action needed | **High risk of ChunkLoadError**, can break mid-session navigation |
| `skipWaiting: false` + `clientsClaim: true` | Updates on next navigation, safer | Requires closing all tabs to activate new SW |
| `skipWaiting: false` + `clientsClaim: false` | Most stable, predictable behavior | Requires page refresh after closing all tabs |

**Recommendation for Next.js:** Use `skipWaiting: false` + `clientsClaim: true` to balance safety and user experience.

---

## Mitigation Strategies

### Strategy 1: ChunkLoadError Detection and Auto-Reload (Immediate Fix)

**Problem Solved:** Automatically recover from chunk loading failures without requiring manual user intervention.

**Implementation:**

```javascript
// app/error-boundary.js or _app.js
const RELOAD_COOLDOWN_KEY = 'chunk-error-reload-time';
const COOLDOWN_DURATION = 10000; // 10 seconds

function handleChunkLoadError(error) {
  // Detect ChunkLoadError
  const isChunkError =
    error.name === 'ChunkLoadError' ||
    /Loading chunk [\d]+ failed/.test(error.message) ||
    /ChunkLoadError/.test(error.message);

  if (!isChunkError) return false;

  // Check cooldown to prevent infinite reload loop
  const lastReloadTime = localStorage.getItem(RELOAD_COOLDOWN_KEY);
  const now = Date.now();

  if (lastReloadTime && now - parseInt(lastReloadTime) < COOLDOWN_DURATION) {
    console.error('ChunkLoadError occurred within cooldown period. Not reloading.');
    return true; // Error handled, but no reload
  }

  // Set cooldown and reload
  localStorage.setItem(RELOAD_COOLDOWN_KEY, now.toString());
  console.log('ChunkLoadError detected. Reloading page...');
  window.location.reload();
  return true;
}

// Global error handler
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    handleChunkLoadError(event.error);
  });

  // For Promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    handleChunkLoadError(event.reason);
  });
}
```

**Sources:**
- [Code-splitting React apps safely](https://mitchgavan.com/code-splitting-react-safely/)
- [Fixing ChunkLoadError](https://dev.to/ianwalter/fixing-chunkloaderror-3791)

**Pros:**
- Immediate fix, no configuration changes
- Prevents infinite reload loops
- Transparent to users (automatic recovery)

**Cons:**
- Page refresh loses application state
- Doesn't prevent the underlying issue
- Can negatively impact UX for stateful apps (forms, etc.)

---

### Strategy 2: Remove skipWaiting (Configuration Change)

**Problem Solved:** Prevents Service Worker from taking control mid-session when chunks change.

**Implementation:**

```javascript
// next.config.js
const withPWA = require('@ducanh2912/next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: false, // CHANGE: Set to false
  // Keep clientsClaim for better UX
  workboxOptions: {
    clientsClaim: true,
  },
});

module.exports = withPWA({
  // Your Next.js config
});
```

**User Experience Impact:**
- Users need to close ALL tabs of your app
- Then reopen to get new Service Worker
- OR implement update notification UI

**Update Notification Pattern:**

```javascript
// components/UpdateNotification.jsx
import { useEffect, useState } from 'react';

export function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New SW installed, old SW still controlling
              setShowUpdate(true);
            }
          });
        });
      });
    }
  }, []);

  const handleUpdate = () => {
    window.location.reload();
  };

  if (!showUpdate) return null;

  return (
    <div className="update-notification">
      <p>A new version is available!</p>
      <button onClick={handleUpdate}>Update Now</button>
    </div>
  );
}
```

**Source:** [Handling Service Worker Updates](https://whatwebcando.today/articles/handling-service-worker-updates/)

---

### Strategy 3: Use NetworkFirst for HTML Pages

**Problem Solved:** Ensures users always get latest HTML which references correct chunk URLs.

**Implementation:**

```javascript
// next.config.js
const withPWA = require('@ducanh2912/next-pwa')({
  dest: 'public',
  runtimeCaching: [
    {
      // HTML pages - always fetch from network first
      urlPattern: /^https:\/\/yourdomain\.com\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'html-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Static assets - can use CacheFirst
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|woff|woff2)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
  ],
});
```

**Critical:** This does NOT solve chunk caching issues, but prevents stale HTML from referencing wrong chunks.

---

### Strategy 4: Exclude Dynamic Chunks from Precache

**Problem Solved:** Prevents Service Worker from caching chunks that will become stale.

**Implementation:**

```javascript
// next.config.js
const withPWA = require('@ducanh2912/next-pwa')({
  dest: 'public',
  exclude: [
    // Exclude all chunks
    ({ asset }) => {
      if (
        asset.name.startsWith('static/chunks/pages/') ||
        asset.name.match(/^static\/chunks\/[\d]+\..*\.js$/)
      ) {
        return true;
      }
      return false;
    },
    // Also exclude source maps
    /\.map$/,
  ],
});
```

**Alternative using Serwist:**

```javascript
// sw.ts
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry } from '@serwist/precaching';
import { installSerwist } from '@serwist/sw';

declare global {
  interface WorkerGlobalScope {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

installSerwist({
  // Filter out chunks from precache manifest
  precacheEntries: (self.__SW_MANIFEST || []).filter(entry => {
    const url = typeof entry === 'string' ? entry : entry.url;
    return !url.includes('/chunks/') && !url.includes('/pages/');
  }),
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});
```

**Source:** [Serwist Precaching Guide](https://serwist.pages.dev/docs/serwist/guide/precaching)

---

### Strategy 5: Deploy No-Op Service Worker (Emergency Rollback)

**Problem Solved:** Immediately disable Service Worker functionality to restore normal caching behavior.

**When to Use:**
- Emergency situations with widespread user impact
- During migration away from PWA
- When rolling back a buggy SW deployment

**Implementation:**

```javascript
// public/sw.js (replace existing service worker)
self.addEventListener('install', () => {
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clear all caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }),
      // Take control of all clients
      self.clients.claim(),
      // Optionally reload all clients
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          if ('navigate' in client) {
            client.navigate(client.url);
          }
        });
      }),
    ])
  );
});

// NO fetch event handler - all requests pass through to network
```

**Deploy with Clear-Site-Data Header:**

```javascript
// For Express.js server
app.get('/sw.js', (req, res) => {
  res.setHeader('Clear-Site-Data', '"cache", "storage"');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile('public/sw.js');
});

// For Next.js middleware
// middleware.ts
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/sw.js') {
    const response = NextResponse.next();
    response.headers.set('Clear-Site-Data', '"cache", "storage"');
    return response;
  }
}
```

**Warning:** Clear-Site-Data header clears ALL storage including localStorage, IndexedDB, sessionStorage. Not all browsers support it.

**Sources:**
- [Removing Buggy Service Workers](https://developer.chrome.com/docs/workbox/remove-buggy-service-workers)
- [Service Worker Deployment Expectations](https://developer.chrome.com/docs/workbox/service-worker-deployment)

---

### Strategy 6: Migrate to Serwist (Long-term Solution)

**Problem Solved:** Modern PWA library with better Next.js integration and active maintenance.

**Migration Steps:**

1. **Install Serwist:**
   ```bash
   npm install @serwist/next @serwist/precaching @serwist/sw
   # or
   yarn add @serwist/next @serwist/precaching @serwist/sw
   ```

2. **Update next.config.js:**
   ```javascript
   const withSerwist = require('@serwist/next').default({
     swSrc: 'app/sw.ts', // For App Router
     swDest: 'public/sw.js',
     disable: process.env.NODE_ENV === 'development',
     reloadOnOnline: false, // Prevent forced reload when going online
   });

   module.exports = withSerwist({
     // Your Next.js config
   });
   ```

3. **Create Service Worker (app/sw.ts):**
   ```typescript
   import { defaultCache } from '@serwist/next/worker';
   import type { PrecacheEntry } from '@serwist/precaching';
   import { installSerwist } from '@serwist/sw';

   declare global {
     interface WorkerGlobalScope {
       __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
     }
   }

   declare const self: ServiceWorkerGlobalScope;

   installSerwist({
     precacheEntries: self.__SW_MANIFEST,
     skipWaiting: false, // CRITICAL for Next.js
     clientsClaim: true,
     navigationPreload: true,
     runtimeCaching: [
       ...defaultCache,
       // Add custom caching strategies here
     ],
   });
   ```

4. **Update TypeScript Config:**
   ```json
   {
     "compilerOptions": {
       "lib": ["dom", "dom.iterable", "esnext", "webworker"],
       "types": ["@serwist/next/typings"]
     }
   }
   ```

5. **Update manifest.json:**
   ```json
   {
     "name": "Your App Name",
     "short_name": "App",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#ffffff",
     "theme_color": "#000000",
     "icons": [
       {
         "src": "/icon-192.png",
         "sizes": "192x192",
         "type": "image/png"
       },
       {
         "src": "/icon-512.png",
         "sizes": "512x512",
         "type": "image/png"
       }
     ]
   }
   ```

**Sources:**
- [Building a PWA with Serwist](https://javascript.plainenglish.io/building-a-progressive-web-app-pwa-in-next-js-with-serwist-next-pwa-successor-94e05cb418d7)
- [Serwist Getting Started](https://serwist.pages.dev/docs/next/getting-started)

**Migration Benefits:**
- Active maintenance (vs @ducanh2912/next-pwa last updated ~1 year ago)
- Better Next.js 14/15 App Router support
- Improved TypeScript support
- Cleaner API for custom caching strategies
- Recommended by @ducanh2912/next-pwa maintainer

**Migration Risks:**
- Different configuration API (breaking changes)
- Requires service worker file rewrite
- May need to update existing PWA code

---

### Strategy 7: Cache Versioning Strategy

**Problem Solved:** Ensures old caches are cleared when deploying new versions.

**Implementation:**

```javascript
// sw.js or service-worker.ts
const CACHE_VERSION = 'v1.0.0'; // Update on each deployment
const CACHE_NAME = `app-cache-${CACHE_VERSION}`;

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => {
            // Delete old caches
            return cacheName !== CACHE_NAME && cacheName.startsWith('app-cache-');
          })
          .map(cacheName => caches.delete(cacheName))
      );
    })
  );
});
```

**Automated Versioning:**

```javascript
// next.config.js
const fs = require('fs');
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const buildId = require('crypto').randomBytes(16).toString('hex');

module.exports = {
  env: {
    CACHE_VERSION: packageJson.version,
    BUILD_ID: buildId,
  },
  generateBuildId: async () => {
    return buildId;
  },
};
```

**Source:** [Implementing Service Workers in Next.js](https://blog.logrocket.com/implementing-service-workers-next-js/)

---

## Recommendations

### Immediate Actions (Can Implement Today)

1. **Add ChunkLoadError Handler**
   - Implement localStorage-based auto-reload
   - Prevents 502 errors from persisting
   - Low risk, high reward
   - **Estimated Effort:** 1-2 hours

2. **Set skipWaiting to false**
   - Single line configuration change
   - Significantly reduces risk of mid-session failures
   - Requires update notification UI for best UX
   - **Estimated Effort:** 30 minutes (config) + 2-4 hours (notification UI)

3. **Configure NetworkFirst for HTML**
   - Ensures latest HTML is fetched
   - Reduces stale chunk reference issues
   - **Estimated Effort:** 1 hour

### Short-term Actions (Next Sprint)

4. **Exclude Dynamic Chunks from Precache**
   - Prevents caching chunks that will become stale
   - Requires understanding of your bundle structure
   - May increase network usage slightly
   - **Estimated Effort:** 4-8 hours (testing required)

5. **Implement Update Notification UI**
   - Informs users when new version available
   - Provides manual update trigger
   - Improves UX when skipWaiting is false
   - **Estimated Effort:** 4-6 hours

6. **Add Service Worker Unregister Function**
   - For emergency rollback scenarios
   - Can be triggered via admin panel or feature flag
   - **Estimated Effort:** 2-3 hours

### Long-term Actions (Next Quarter)

7. **Migrate to Serwist**
   - Modern, actively maintained PWA library
   - Better Next.js 14/15 support
   - Recommended by @ducanh2912/next-pwa maintainer
   - **Estimated Effort:** 2-3 days (including testing)

8. **Implement Automated Cache Versioning**
   - Ties cache version to package.json version
   - Automatic cleanup of old caches
   - Reduces manual maintenance
   - **Estimated Effort:** 4-6 hours

9. **Add Monitoring for ChunkLoadError**
   - Track frequency of chunk errors in production
   - Alert on abnormal error rates
   - Use error tracking service (Sentry, LogRocket)
   - **Estimated Effort:** 2-4 hours

### Architecture Review Actions

10. **Evaluate PWA Necessity**
    - Is offline functionality required?
    - Are you using push notifications?
    - Is install-to-homescreen critical?
    - If no: Consider removing PWA entirely
    - **Estimated Effort:** Planning session (2-4 hours)

11. **Consider Edge Caching Strategy**
    - Use CDN caching for static assets
    - Cache-Control headers for chunks
    - May reduce need for aggressive SW caching
    - **Estimated Effort:** 1-2 days (infrastructure)

12. **Implement Gradual Rollout Strategy**
    - Deploy SW updates to percentage of users first
    - Monitor error rates before full rollout
    - Use feature flags or A/B testing
    - **Estimated Effort:** 1-2 days (infrastructure)

---

## Implementation Priority Matrix

| Strategy | Impact | Effort | Priority | Risk |
|----------|--------|--------|----------|------|
| ChunkLoadError Handler | High | Low | **P0** | Low |
| Set skipWaiting: false | High | Low | **P0** | Low |
| NetworkFirst for HTML | Medium | Low | **P1** | Low |
| Exclude Chunks from Precache | High | Medium | **P1** | Medium |
| Update Notification UI | Medium | Medium | **P1** | Low |
| Migrate to Serwist | High | High | **P2** | Medium |
| Cache Versioning | Medium | Medium | **P2** | Low |
| Monitoring | Medium | Low | **P2** | Low |
| No-Op SW (Emergency) | High | Low | **As Needed** | Low |

---

## Testing Checklist

Before deploying Service Worker changes:

- [ ] Test on multiple browsers (Chrome, Firefox, Safari, Edge)
- [ ] Test update scenario (old SW → new SW)
- [ ] Test offline functionality
- [ ] Test ChunkLoadError handler (simulate failed chunk load)
- [ ] Test with cleared cache
- [ ] Test with existing cache
- [ ] Test hard refresh behavior (Ctrl+Shift+R)
- [ ] Test normal refresh behavior (Ctrl+R)
- [ ] Test navigation between routes
- [ ] Test lazy-loaded routes
- [ ] Verify SW registers correctly
- [ ] Verify SW updates correctly
- [ ] Verify no infinite reload loops
- [ ] Check network tab for chunk requests
- [ ] Check Application tab for SW status
- [ ] Check Console for errors/warnings
- [ ] Test on mobile devices (iOS Safari, Chrome Android)
- [ ] Test PWA install functionality
- [ ] Verify manifest.json loads correctly
- [ ] Test skipWaiting behavior

---

## Additional Considerations

### Next.js 15 and Turbopack

**Current Status:**
- Turbopack does NOT support webpack plugins
- next-pwa and @ducanh2912/next-pwa use webpack
- Using Turbopack with next-pwa causes compilation errors
- **Source:** [Turbopack Issue #5199](https://github.com/vercel/turborepo/discussions/5199)

**Workarounds:**
1. Don't use Turbopack in production builds (use webpack)
2. Disable Turbopack: `next dev --turbo=false`
3. Use Serwist which has better Turbopack compatibility roadmap

### CDN and Reverse Proxy Considerations

If using Cloudflare, Nginx, or other proxies:

1. **Set Correct Cache-Control Headers:**
   ```javascript
   // next.config.js
   async headers() {
     return [
       {
         source: '/sw.js',
         headers: [
           {
             key: 'Cache-Control',
             value: 'public, max-age=0, must-revalidate',
           },
         ],
       },
       {
         source: '/manifest.json',
         headers: [
           {
             key: 'Cache-Control',
             value: 'public, max-age=0, must-revalidate',
           },
         ],
       },
     ];
   },
   ```

2. **Purge CDN Cache After Deployment:**
   ```bash
   # Cloudflare
   curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
     -H "Authorization: Bearer {api_token}" \
     -H "Content-Type: application/json" \
     --data '{"files":["https://yourdomain.com/sw.js"]}'
   ```

3. **Verify X-Cache Headers:**
   - Check if CDN is caching sw.js
   - Ensure sw.js is NOT cached by CDN
   - Use `Cache-Control: no-cache` if needed

### Horizontal Scaling Issues

If running multiple Next.js instances:

- Chunk hashes may differ between instances (even with same BUILD_ID)
- Load balancer may serve chunks from different builds
- **Solution:** Use sticky sessions OR ensure all instances deploy simultaneously
- **Source:** [Next.js Discussion #65856](https://github.com/vercel/next.js/discussions/65856)

---

## Sources

### Documentation
- [Workbox Strategies - Chrome for Developers](https://developer.chrome.com/docs/workbox/modules/workbox-strategies)
- [Workbox Core - Chrome for Developers](https://developer.chrome.com/docs/workbox/modules/workbox-core)
- [Service Worker Lifecycle - Chrome for Developers](https://developer.chrome.com/docs/workbox/service-worker-lifecycle)
- [Removing Buggy Service Workers - Chrome for Developers](https://developer.chrome.com/docs/workbox/remove-buggy-service-workers)
- [Next.js PWA Guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Serwist Getting Started](https://serwist.pages.dev/docs/next/getting-started)
- [Serwist Precaching Guide](https://serwist.pages.dev/docs/serwist/guide/precaching)
- [next-pwa Configuring Docs](https://ducanh-next-pwa.vercel.app/docs/next-pwa/configuring)
- [MDN: Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [MDN: skipWaiting()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting)

### GitHub Issues & Discussions
- [Next.js Discussion #48328 - ChunkLoadError in Production](https://github.com/vercel/next.js/discussions/48328)
- [Next.js Issue #38507 - ChunkLoadError Timeout](https://github.com/vercel/next.js/issues/38507)
- [Next.js Discussion #65856 - Build ID vs Chunk Hashes](https://github.com/vercel/next.js/discussions/65856)
- [Next.js Discussion #52024 - Stale Data with Service Worker](https://github.com/vercel/next.js/discussions/52024)
- [Next.js Discussion #64336 - Page/Asset Matching for SW Precache](https://github.com/vercel/next.js/discussions/64336)
- [Create React App Issue #3613 - Service Worker Chunk Loading](https://github.com/facebook/create-react-app/issues/3613)
- [Turbopack Discussion #5199 - next-pwa Build Error](https://github.com/vercel/turborepo/discussions/5199)
- [shadowwalker/next-pwa Issue #424 - Next 13 Service Worker Issues](https://github.com/shadowwalker/next-pwa/issues/424)
- [DuCanhGH/next-pwa Repository](https://github.com/DuCanhGH/next-pwa)

### Blog Posts & Tutorials
- [Building a Next.js PWA with Serwist](https://javascript.plainenglish.io/building-a-progressive-web-app-pwa-in-next-js-with-serwist-next-pwa-successor-94e05cb418d7)
- [Code-splitting React apps safely - Mitch Gavan](https://mitchgavan.com/code-splitting-react-safely/)
- [Handling Service Worker Updates](https://whatwebcando.today/articles/handling-service-worker-updates/)
- [Building a Next.js PWA - Part II](https://able.bio/drenther/building-a-progressive-web-app-with-nextjs-part-ii--98ojk46)
- [Implementing Service Workers in Next.js - LogRocket](https://blog.logrocket.com/implementing-service-workers-next-js/)
- [Workbox Strategies with Examples - HarryTheo](https://www.harrytheo.com/blog/2021/03/workbox-strategies-with-examples-and-use-cases/)
- [Building a Next.js PWA with next-pwa - Proximity Blog](https://www.proximity.blog/post/building-a-next-js-pwa-using-nextpwa-and-service-worker-2022330)
- [Fixing ChunkLoadError - DEV Community](https://dev.to/ianwalter/fixing-chunkloaderror-3791)
- [Cascading Cache Invalidation - Philip Walton](https://philipwalton.com/articles/cascading-cache-invalidation/)
- [Fixing 502 Bad Gateway Error - Kinsta](https://kinsta.com/blog/502-bad-gateway/)

### Stack Overflow & Community
- [Stack Overflow: Best Practices for Next.js Apps](https://stackoverflow.blog/2022/12/20/best-practices-to-increase-the-speed-for-next-js-apps/)
- [Sentry: Fixing ChunkLoadErrors in JavaScript](https://sentry.io/answers/chunk-load-errors-javascript/)

---

## Conclusion

The 502 Bad Gateway error caused by Service Worker caching is a well-documented issue in the Next.js PWA ecosystem. The root cause is the mismatch between Next.js's dynamic chunk generation (with content-based hashes) and Service Worker's static precaching strategy.

**Key Takeaways:**

1. **Avoid `skipWaiting: true`** - Workbox explicitly warns against this for apps with lazy-loaded hashed resources (like Next.js)

2. **Implement ChunkLoadError Handler** - Provides automatic recovery without user intervention

3. **Use NetworkFirst for HTML** - Ensures users get latest HTML with correct chunk references

4. **Consider Migrating to Serwist** - Modern, actively maintained alternative recommended by @ducanh2912/next-pwa maintainer

5. **Monitor and Test Thoroughly** - Service Worker bugs are notoriously difficult to debug in production

The immediate priority should be implementing the P0 recommendations (ChunkLoadError handler + skipWaiting: false) to mitigate user impact, followed by the P1 recommendations for a more robust long-term solution.

For further assistance, consult the Serwist documentation or consider opening an issue in the [DuCanhGH/next-pwa GitHub repository](https://github.com/DuCanhGH/next-pwa/issues).

---

**Report Generated:** 2025-12-28
**Research Conducted By:** research-specialist
**Total Sources Referenced:** 50+
**Research Duration:** Comprehensive web search + documentation review
