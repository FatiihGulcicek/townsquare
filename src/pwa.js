import Vue from "vue";

/*
 * Progressive Web App helpers: service worker registration and the
 * "add to home screen" flow (native prompt on Android/desktop Chrome,
 * instructions on iOS Safari which has no prompt API).
 */
const ua = navigator.userAgent || "";

export const pwaState = Vue.observable({
  canInstall: false,
  isStandalone:
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true,
  isIOS:
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
  updateReady: false,
});

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  pwaState.canInstall = true;
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  pwaState.canInstall = false;
  pwaState.isStandalone = true;
});

/** Shows the install prompt; returns false where the browser has none (iOS). */
export async function install() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  pwaState.canInstall = false;
  return outcome === "accepted";
}

export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production") return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              pwaState.updateReady = true;
            }
          });
        });
      })
      .catch(() => {
        // offline support is optional
      });
  });
}

/*
 * New version check: every build has an id; when the server has a newer one
 * the app shows a "new version" banner. Updating refreshes the cached shell.
 */
const BUILD = process.env.VUE_APP_BUILD || "";
async function checkVersion() {
  if (!BUILD || process.env.NODE_ENV !== "production") return;
  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    if (!response.ok) return;
    const { build } = await response.json();
    if (build && build !== BUILD) pwaState.updateReady = true;
  } catch (e) {
    // offline
  }
}
setTimeout(checkVersion, 8000);
setInterval(checkVersion, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkVersion();
});

export async function applyUpdate() {
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n.startsWith("km-shell"))
        .map((n) => caches.delete(n)),
    );
  } catch (e) {
    // no cache api
  }
  window.location.reload();
}
