// ================================================================
// axiomOS service worker
//
// Strategy:
// - core application shell (html/js/css/manifest): network first + cache fallback
// - heavy static assets (icons/fonts/images): cache first + background refresh
// - navigations and generic same-origin requests: network first
// - user data remains outside the service worker in IndexedDB/local storage
//
// The cache key is bumped on release-worthy shell changes so stale assets are
// replaced cleanly after the user confirms an update.
// ================================================================

const CACHE_NAME = 'axiomOS-lite-v2.2.2-pwa2';
const APP_SCOPE_URL = new URL('./', self.registration.scope);
const APP_ROOT_PATH = new URL('./', APP_SCOPE_URL).pathname;
const APP_INDEX_URL = new URL('index.html', APP_SCOPE_URL).href;
const APP_INDEX_PATH = new URL('index.html', APP_SCOPE_URL).pathname;
const DEMO_PAGE_PATH = new URL('demo/demo.html', APP_SCOPE_URL).pathname;
const DEMO_INTERNAL_PAGE_PATH = new URL('demo/demo-internal.html', APP_SCOPE_URL).pathname;
const DEMO_LIVE_PAGE_PATH = new URL('demo/demo-live.html', APP_SCOPE_URL).pathname;
const DEMO_MEMO_PAGE_PATH = new URL('demo/demo-memo.html', APP_SCOPE_URL).pathname;
const STATIC_ASSET_PATHS = [
  '.',
  'index.html',
  'demo/demo.html',
  'demo/demo-internal.html',
  'demo/demo-live.html',
  'demo/demo-memo.html',
  'demo/manifest-demo.json',
  'css/demo.css',
  'css/tokens.css',
  'css/layout.css',
  'css/components.css',
  'css/features.css',
  'css/themes.css',
  'css/animations.css',
  'css/hardening.css',
  'js/head-state.js',
  'js/app-shell-state.js',
  'js/app-ui-state.js',
  'js/i18n.js',
  'js/shared-text.js',
  'js/activity-log.js',
  'js/lite-package.js',
  'js/lite-mode.js',
  'js/constants.js',
  'js/security.js',
  'js/eventbus.js',
  'js/toast.js',
  'js/modals.js',
  'js/demo-mode.js',
  'js/db-schema.js',
  'js/db-schema.js?v=2.2.2-pwa6',
  'js/db.js',
  'js/db.js?v=2.2.2-pwa6',
  'js/db.js?v=2.2.2-pwa9',
  'js/db-reactive.js',
  'js/db-reactive.js?v=2.2.2-pwa9',
  'js/onboarding-flow.js',
  'js/onboarding-flow.js?v=2.2.2-pwa6',
  'js/onboarding-flow.js?v=2.2.2-pwa9',
  'js/module-registry.js',
  'js/storage-lifecycle.js',
  'js/entity-logic.js',
  'js/timer-worker.js',
  'js/background.js',
  'js/ui-core.js',
  'js/ui-core-nav.js',
  'js/ui-core-xp.js',
  'js/ui-core-dashboard.js',
  'js/habits/ui-core-habit-panels.js',
  'js/habits/ui-core-habit-panels.js?v=2.2.2-pwa12',
  'js/habits/ui-core-habit-surface.js',
  'js/habits/ui-core-habit-surface.js?v=2.2.2-pwa12',
  'js/habits/ui-core-habits.js',
  'js/habits/ui-core-habits.js?v=2.2.2-pwa12',
  'js/reminders.js',
  'js/ui-core-settings.js',
  'js/ui-core-settings.js?v=2.2.2-pwa9',
  'js/ui-core-settings-surface.js',
  'js/ui-core-settings-surface.js?v=2.2.2-pwa9',
  'js/ui-core-settings-data.js',
  'js/ui-core-settings-data.js?v=2.2.2-pwa9',
  'js/habits/habits.js',
  'js/habits/habits.js?v=2.2.2-pwa12',
  'js/chart-utils.js',
  'js/deepwork.js',
  'js/daily-rhythm.js',
  'js/reflection.js',
  'js/rpg.js',
  'js/stats.js',
  'js/fitness.js',
  'js/experiments.js',
  'js/packages.js',
  'js/rewards.js',
  'js/library.js',
  'js/misc-features.js',
  'js/backup.js',
  'js/event-handlers.js',
  'js/event-handlers.js?v=2.2.2-pwa6',
  'js/init.js',
  'js/init.js?v=2.2.2-pwa6',
  'manifest.json',
  'icons/icon-192.svg',
  'icons/icon-512.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const STATIC_ASSET_URLS = STATIC_ASSET_PATHS.map((path) => new URL(path, APP_SCOPE_URL).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      STATIC_ASSET_URLS.map((url) =>
        cache.add(url).catch((err) => {
          console.warn('[SW] Failed to cache asset:', url, err);
        })
      )
    );
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) {
        await client.focus();
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(APP_INDEX_URL);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (!isInAppScope(url.pathname)) return;

  if (isShellPath(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isCacheFirstPath(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

function isInAppScope(pathname) {
  return pathname === APP_ROOT_PATH || pathname.startsWith(APP_ROOT_PATH);
}

function isShellPath(pathname) {
  return (
    pathname === APP_ROOT_PATH ||
    pathname === APP_INDEX_PATH ||
    pathname === DEMO_PAGE_PATH ||
    pathname === DEMO_INTERNAL_PAGE_PATH ||
    pathname === DEMO_LIVE_PAGE_PATH ||
    pathname === DEMO_MEMO_PAGE_PATH ||
    pathname.startsWith(new URL('css/', APP_SCOPE_URL).pathname) ||
    pathname.startsWith(new URL('js/', APP_SCOPE_URL).pathname) ||
    pathname.endsWith('manifest.json') ||
    pathname.endsWith('manifest-demo.json') ||
    pathname.endsWith('/sw.js')
  );
}

function isCacheFirstPath(pathname) {
  return (
    pathname.startsWith(new URL('icons/', APP_SCOPE_URL).pathname) ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.woff2')
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    fetchAndCache(request);
    return cached;
  }
  return fetchAndCache(request);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (isDocumentRequest(request)) {
      return caches.match(APP_INDEX_URL);
    }
    return Response.error();
  }
}

async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}

function isDocumentRequest(request) {
  return (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html')
  );
}
