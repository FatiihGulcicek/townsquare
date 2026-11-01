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

/** Reads ?action=host|join|reference|night from home screen shortcuts. */
export function takeLaunchAction() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  if (action || params.get("source")) {
    params.delete("action");
    params.delete("source");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname +
        (query ? "?" + query : "") +
        window.location.hash,
    );
  }
  return action;
}
