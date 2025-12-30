This is a classic "Zombie Service Worker" problem caused by atomic deployments. Your new deployment deleted the old hashed JavaScript files (chunks) from the server, but the user's active Service Worker is serving an old cached HTML file that references those deleted chunks. When the browser tries to fetch them, the server returns 404 (or 502), crashing the app.

Here is the solution strategy, ranked from **Emergency Fix** to **Permanent Prevention**.

### Phase 1: The "Kill Switch" (Immediate Emergency Fix)

You cannot rely on the broken Service Worker to update itself normally because it might be erroring out. You must deploy a "nuclear" update that forces it to unregister and reload the page.

**1. Create a manual Kill Switch file**
Create a file named `public/sw.js` manually. This code will replace the generated one. It activates immediately, clears **all** caches, unregisters itself, and forces a hard reload.

```javascript
// public/sw.js
self.addEventListener('install', (event) => {
  // 1. Activate immediately (skip waiting)
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 2. Take control and clean up
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Delete ALL caches (including runtime caches from other origins)
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }),
      // Unregister the service worker
      self.registration.unregister()
    ]).then(() => {
      // 3. Force all open tabs to reload the page from the network
      return self.clients.matchAll({ type: 'window' });
    }).then((clients) => {
      clients.forEach((client) => {
        if (client.url && 'navigate' in client) {
          client.navigate(client.url);
        }
      });
    })
  );
});

```

**2. Deploy with PWA Disabled**
Modify your `next.config.js` to disable the plugin temporarily. This prevents it from overwriting your manual `sw.js`.

```javascript
// next.config.js
const withPWA = require("@ducanh2912/next-pwa").default({
  disable: true, // <--- IMPORTANT: Disable generation for this deploy
  // ...
});

```

**How this works:** Browsers automatically check for `sw.js` updates on navigation. They will download your new "Kill Switch," activate it, wipe the bad cache, and reload the user to a clean state.

---

### Phase 2: The "Nuclear Option" (Server-Side Safety Net)

For users who are stuck and not even fetching the new `sw.js` (rare but possible), use the `Clear-Site-Data` header.

**Action:** Add this header to your `next.config.js`.
*Warning: This will clear LocalStorage and Cookies (logging users out).*

```javascript
module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Clear-Site-Data',
            value: '"cache", "storage"', // Wipes Cache, ServiceWorkers, LocalStorage
          },
        ],
      },
    ];
  },
};

```

*Deploy this for 24-48 hours until traffic normalizes, then remove it.*

---

### Phase 3: Permanent Prevention (Long Term Fix)

Once the crisis is over, re-enable the PWA with a configuration that prevents this death loop. The root cause is precaching hashed build chunks.

**1. Do Not Precache Build Chunks**
You must exclude Webpack chunks from the precache manifest. Let the browser cache them naturally (HTTP cache) or use a runtime strategy.

**2. Fix `skipWaiting**`
The `skipWaiting: false` option is often ignored because it needs to be passed inside `workboxOptions`.

**Recommended `next.config.js`:**

```javascript
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  // 1. Pass skipWaiting inside workboxOptions to ensure it's respected
  workboxOptions: {
    skipWaiting: false, 
    clientsClaim: false,
    // 2. CRITICAL: Exclude opaque Next.js build chunks from SW precache
    // This prevents the SW from looking for old files that don't exist
    exclude: [
      /middleware-manifest\.json$/, 
      /app-build-manifest\.json$/, 
      /_next\/static\/chunks\/.*/, // Exclude all chunks
      /_next\/static\/css\/.*/     // Exclude CSS
    ],
  },
  // 3. Use Runtime Caching for chunks instead (StaleWhileRevalidate)
  extendDefaultRuntimeCaching: true,
  runtimeCaching: [
     {
       // NetworkFirst for the main document (HTML) to get the latest hash pointers
       urlPattern: ({ request }) => request.mode === 'navigate',
       handler: 'NetworkFirst',
       options: {
         cacheName: 'pages',
         expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
       },
     },
     {
       // StaleWhileRevalidate for JS chunks
       urlPattern: /^https?.+\/_next\/static\/.+\.(js|css)$/i,
       handler: 'StaleWhileRevalidate', 
       options: {
         cacheName: 'static-resources',
         expiration: { maxEntries: 60, maxAgeSeconds: 24 * 60 * 60 },
       },
     },
  ]
});

```

---

### Phase 4: Runtime Safety Net (React Error Boundary)

Even with the best configuration, network errors happen. Add a global error listener to your `_app.tsx` or root layout to catch chunk loading errors and force a reload.

```javascript
// Add to your root component (e.g., inside useEffect)
useEffect(() => {
  window.addEventListener('error', (e) => {
    // Check if the error is a ChunkLoadError
    if (/Loading chunk [\d]+ failed/.test(e.message)) {
      window.location.reload();
    }
  });
}, []);

```

### Answers to your Research Questions

1. **How to force `skipWaiting: false`?**
Pass it inside `workboxOptions: { skipWaiting: false }`. The top-level `skipWaiting` option in `next-pwa` is a helper that sometimes gets overridden by Workbox defaults.
2. **How to programmatically clear ALL caches?**
Use `caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))`.
3. **Is there a way to "poison" the old SW?**
Yes. The "Kill Switch" `sw.js` (Phase 1) is the standard "poison" pill pattern.
4. **Should we switch to a completely custom SW?**
For production Next.js apps, **yes**. Using `strategy: 'injectManifest'` (where you write your own `sw.ts`) is safer than `generateSW` because it gives you explicit control over the lifecycle.
5. **Recommended pattern for cache invalidation?**
**Skew Protection:** Configure your hosting (Vercel/Netlify) to **keep old files** for 24 hours after a new deploy. This ensures the "old" SW can still fetch "old" chunks until the user refreshes.
6. **Can we use Clear-Site-Data?**
Yes, specifically `Clear-Site-Data: "storage"`. It is the only server-side way to forcibly unregister a Service Worker.