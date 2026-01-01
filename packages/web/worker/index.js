// Custom service worker code that runs before workbox
// This file is automatically imported into the generated sw.js

// ============================================================================
// Async/Generator Polyfills for Workbox Compatibility
// ============================================================================
// IMPORTANT: These helpers are required by Workbox's generated code.
// Workbox uses async/await internally but the transpiled output expects
// these helper functions to be available in the global scope.
//
// DO NOT REMOVE unless:
// 1. Upgrading to a newer Workbox version that doesn't need them
// 2. Changing the build configuration to include native async support
//
// Source: Babel async-to-generator transform
// Required for: Workbox cacheWillUpdate plugin and other async operations
// ============================================================================

// Define async generator helpers that workbox needs but doesn't include
// These are required for the cacheWillUpdate plugin async functions
function _async_to_generator(fn) {
  return function() {
    var self = this, args = arguments;
    return new Promise(function(resolve, reject) {
      var gen = fn.apply(self, args);
      function _next(value) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
      }
      function _throw(err) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
      }
      _next(undefined);
    });
  };
}

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
  try {
    var info = gen[key](arg);
    var value = info.value;
  } catch (error) {
    reject(error);
    return;
  }
  if (info.done) {
    resolve(value);
  } else {
    Promise.resolve(value).then(_next, _throw);
  }
}

function _ts_generator(thisArg, body) {
  var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
  return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
  function verb(n) { return function (v) { return step([n, v]); }; }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0: case 1: t = op; break;
        case 4: _.label++; return { value: op[1], done: false };
        case 5: _.label++; y = op[1]; op = [0]; continue;
        case 7: op = _.ops.pop(); _.trys.pop(); continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
          if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
          if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
          if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
          if (t[2]) _.ops.pop();
          _.trys.pop(); continue;
      }
      op = body.call(thisArg, _);
    } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
    if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
  }
}

// Make these available globally for workbox-generated code
self._async_to_generator = _async_to_generator;
self._ts_generator = _ts_generator;

console.log('[SW] Custom worker initialized with async helpers');

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {Object} NotificationPayload
 * @property {string} title - Notification title
 * @property {string} [body] - Notification body text
 * @property {string} [icon] - URL to notification icon
 * @property {string} [badge] - URL to notification badge
 * @property {string} [url] - URL to open when clicked
 * @property {string} [tag] - Notification tag for grouping
 */

/**
 * @typedef {Object} NotificationData
 * @property {string} url - URL to navigate to on click
 * @property {boolean} [parseError] - Whether there was an error parsing the payload
 */

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Validate URL is safe to open
 * Only allows relative URLs or URLs from approved origins
 * @param {string} url - The URL to validate
 * @returns {boolean} - Whether the URL is safe to open
 */
function isValidNotificationUrl(url) {
  try {
    // Allow relative URLs (start with /)
    if (url.startsWith('/')) {
      return true;
    }

    // Parse absolute URLs
    var urlObj = new URL(url, self.location.origin);

    // List of allowed origins
    var allowedOrigins = [
      'https://megacampus.ai',
      'https://www.megacampus.ai',
    ];

    // In development, also allow localhost
    if (self.location.hostname === 'localhost') {
      allowedOrigins.push('http://localhost:3000');
    }

    return allowedOrigins.includes(urlObj.origin);
  } catch (e) {
    console.warn('[SW] Invalid URL format:', url);
    return false;
  }
}

// ============================================================================
// Push Notification Handlers
// ============================================================================

/**
 * Handle incoming push notifications
 * Displays a notification to the user with the data from the push message
 * @param {PushEvent} event - The push event
 */
self.addEventListener('push', function(event) {
  console.log('[SW] Push notification received');

  var defaultData = {
    title: 'MegaCampusAI',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    url: '/',
    tag: 'default',
  };

  var data = defaultData;
  var parseError = false;

  try {
    if (event.data) {
      var parsed = event.data.json();
      data = { ...defaultData, ...parsed };

      // Validate required fields
      if (!data.title || typeof data.title !== 'string') {
        throw new Error('Invalid notification title');
      }
    }
  } catch (error) {
    console.error('[SW] Error parsing push data:', error);
    parseError = true;
    data = {
      ...defaultData,
      body: 'New notification (tap to view)',
    };
  }

  var options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-192x192.png',
    data: {
      url: data.url || '/',
      parseError: parseError,
    },
    vibrate: [100, 50, 100],
    tag: data.tag || 'default',
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .catch(function(error) {
        console.error('[SW] Failed to show notification:', error);
        // Fallback: Try minimal notification
        return self.registration.showNotification('MegaCampusAI', {
          body: 'You have a new notification',
          icon: '/icons/icon-192x192.png',
        });
      })
  );
});

/**
 * Handle notification click events
 * Opens the associated URL or focuses an existing window
 * @param {NotificationEvent} event - The notification click event
 */
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked');
  event.notification.close();

  var rawUrl = event.notification.data?.url || '/';

  // SECURITY: Validate URL before opening
  var url = isValidNotificationUrl(rawUrl) ? rawUrl : '/';

  if (url !== rawUrl) {
    console.warn('[SW] Blocked unsafe notification URL:', rawUrl);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Check if there's already a window with the target URL
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === url || client.url.includes(url)) {
          if ('focus' in client) {
            return client.focus();
          }
        }
      }

      // Check if there's any window we can navigate
      for (var j = 0; j < clientList.length; j++) {
        var existingClient = clientList[j];
        if ('navigate' in existingClient && 'focus' in existingClient) {
          return existingClient.navigate(url).then(function(c) {
            return c.focus();
          });
        }
      }

      // Open a new window if no existing window found
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

/**
 * Handle notification close events (for analytics if needed)
 */
self.addEventListener('notificationclose', function(event) {
  console.log('[SW] Notification closed:', event.notification.tag);
});

/**
 * Handle push subscription change events
 * This can happen when the push service updates the subscription
 */
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[SW] Push subscription changed');

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      // The public key should be available from the app
      // For now, we'll let the app handle re-subscription
    }).then(function(subscription) {
      console.log('[SW] Resubscribed to push notifications');
      // Notify the app about the new subscription
      return clients.matchAll().then(function(clientList) {
        clientList.forEach(function(client) {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGED',
            subscription: subscription.toJSON(),
          });
        });
      });
    }).catch(function(error) {
      console.error('[SW] Failed to resubscribe:', error);
    })
  );
});

console.log('[SW] Push notification handlers registered');
