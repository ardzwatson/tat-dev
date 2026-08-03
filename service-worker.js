// Service Worker for Tahuna Te Ahi 🔥
//
// Scope: lightweight offline app-shell caching, plus graceful handling of
// the Google Sheets CSV endpoints this app depends on for passcodes, the
// Video Library, and the custom System icon set. Deliberately does NOT
// cache video/audio media (HLS streams, Bunny CDN assets) or third-party
// CDN script bundles (hls.js, ffmpeg.wasm) - those are large, already rely
// on their own CDN/browser HTTP caching, and range requests (used for
// video seeking / audio scrubbing) don't play well with a naive SW cache
// intercepting them.

const STATIC_CACHE_NAME = 'tta-static-v1';
const SHEETS_CACHE_NAME = 'tta-sheets-v1';

// The app shell: just enough to boot the page from a cold cache/offline.
// Everything else (fonts, hls.js, ffmpeg, video/audio, sheet data, custom
// system icons) is fetched live and handled per-request below rather than
// precached here.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// Any request to docs.google.com under /spreadsheets/ is one of this app's
// three CSV data sources (Access tab, Video Library tab, System icons tab).
function isGoogleSheetsRequest(url) {
  return url.hostname === 'docs.google.com' && url.pathname.indexOf('/spreadsheets/') !== -1;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => {
        // Don't let a single failed precache entry (e.g. installing while
        // already offline) block the service worker from installing at all.
        console.warn('[SW] App shell precache failed:', err);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name !== STATIC_CACHE_NAME && name !== SHEETS_CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only ever handle simple GETs, and never intercept a request that
  // already carries a Range header - that's video/audio seeking/scrubbing,
  // which must go straight to the network untouched so HLS playback and
  // audio-progress dragging behave exactly as if no service worker were
  // present at all.
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);

  // --- Google Sheets data: network-first, cache as an offline fallback only ---
  // Passcodes, assigned clips, and system icons need to be current every
  // time the app is online - this never serves stale sheet data while a
  // network path exists. Only when the fetch itself fails (offline) does it
  // fall back to whatever was cached from the last successful load, so a
  // previously-logged-in user still has a shot at using the app offline
  // instead of hitting a hard failure.
  if (isGoogleSheetsRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(SHEETS_CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // --- Same-origin app shell assets: cache-first, refreshed in the background ---
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const responseClone = response.clone();
              caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return response;
          })
          .catch(() => cached);
        // Serve the cached copy instantly when available (stale-while-
        // revalidate) so the app shell loads instantly on repeat visits and
        // still works offline; otherwise wait on the network.
        return cached || networkFetch;
      })
    );
    return;
  }

  // Everything else - CDN script bundles (hls.js, ffmpeg.wasm), Google
  // Fonts, video/audio streams, thumbnails, reference images - passes
  // straight through to the network untouched. This app already relies on
  // the browser's own HTTP cache for the CDN bundles, and deliberately
  // never caches media.
});
