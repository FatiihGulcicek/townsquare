/* Kasaba Meydanı service worker
 * - pages: network first, falls back to the cached app shell when offline
 * - hashed build assets (js/css/img/fonts/media): cache first, they never change
 * - live game traffic (WebSocket) and server endpoints are never cached
 */
const SHELL = "km-shell-v2";
const ASSETS = "km-assets-v2";
const MAX_ASSETS = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        cache.addAll([
          "/",
          "/manifest.webmanifest",
          "/static/android-icon-192x192.png",
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL && key !== ASSETS)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_ASSETS) {
    await Promise.all(
      keys.slice(0, keys.length - MAX_ASSETS).map((k) => cache.delete(k)),
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(live|healthz|metrics)/.test(url.pathname)) return;

  // app pages: always try the network so updates arrive immediately
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // fingerprinted assets: cache first
  if (/^\/(js|css|img|fonts|media|static)\//.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => {
                cache.put(request, copy);
                trim(cache);
              });
            }
            return response;
          }),
      ),
    );
  }
});
