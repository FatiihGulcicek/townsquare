/* Kasaba Meydanı service worker
 * - pages: the cached app shell opens instantly (even while the free server
 *   is still waking up) and is refreshed in the background; the app shows a
 *   "new version" banner when a newer build is online
 * - hashed build assets (js/css/img/fonts/media): cache first, they never change
 * - live game traffic (WebSocket) and server endpoints are never cached
 */
const SHELL = "km-shell-v11";
const ASSETS = "km-assets-v8";
const MAX_ASSETS = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        cache.addAll([
          "/",
          "/manifest.webmanifest",
          "/static/android-icon-192x192-v3.png",
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

// push messages from the server (the app is closed or in the background)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Kasaba Meydanı";
  // always show it: iOS cancels subscriptions that receive silent pushes
  // (the server only pushes to players whose app is in the background)
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/static/android-icon-192x192-v3.png",
      badge: "/static/android-icon-96x96-v3.png",
      tag: data.tag || "kasaba-meydani",
      renotify: true,
      // "your turn" buzzes longer and stays until it is tapped
      requireInteraction: data.tag === "turn",
      vibrate:
        data.tag === "turn" ? [250, 100, 250, 100, 400] : [120, 60, 120],
      data: { url: data.url || "/" },
    }),
  );
});

// tapping a notification brings the game back to the front
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        if (clients.length) return clients[0].focus();
        return self.clients.openWindow(target);
      }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(vk|api|healthz|push|version\.json)/.test(url.pathname)) return;
  // separate pages (privacy, terms) are not the app: plain network
  if (/\.html$/.test(url.pathname) && url.pathname !== "/index.html") return;

  // app pages: always try the network so updates arrive immediately
  if (request.mode === "navigate") {
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(SHELL).then((cache) => cache.put("/", copy));
      }
      return response;
    });
    event.respondWith(
      caches.match("/").then((cached) => {
        if (cached) {
          event.waitUntil(network.catch(() => null));
          return cached;
        }
        return network.catch(() => caches.match("/"));
      }),
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
