import Vue from "vue";
import { t } from "./i18n";

/*
 * In-app notifications ("toasts"). Important ones also vibrate and, when the
 * app is in the background and the player allowed it, show a system
 * notification through the service worker.
 */
export const notifications = Vue.observable({ list: [] });

let counter = 0;
const ICONS = {
  info: "broadcast-tower",
  success: "check-square",
  warning: "exclamation-triangle",
  role: "theater-masks",
  night: "cloud-moon",
  day: "sun",
  vote: "hand-paper",
  death: "skull",
  player: "user",
};

export function dismiss(id) {
  const index = notifications.list.findIndex((n) => n.id === id);
  if (index > -1) notifications.list.splice(index, 1);
}

function systemNotification(title, body) {
  try {
    if (
      document.visibilityState !== "hidden" ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !navigator.serviceWorker
    ) {
      return;
    }
    navigator.serviceWorker.ready.then((registration) =>
      registration.showNotification(title, {
        body,
        icon: "static/android-icon-192x192.png",
        badge: "static/android-icon-96x96.png",
        tag: "kasaba-meydani",
        renotify: true,
      }),
    );
  } catch (e) {
    // notifications are optional
  }
}

/**
 * @param key english text (translated with t)
 * @param params placeholder values
 * @param options {type, duration, important}
 */
export function notify(key, params, options = {}) {
  const type = options.type || "info";
  const text = t(key, params);
  // collapse identical messages that arrive in a burst
  const last = notifications.list[notifications.list.length - 1];
  if (last && last.text === text) {
    last.count++;
    return;
  }
  const id = ++counter;
  notifications.list.push({ id, text, type, icon: ICONS[type], count: 1 });
  if (notifications.list.length > 4) notifications.list.shift();
  setTimeout(
    () => dismiss(id),
    options.duration || (options.important ? 6000 : 3500),
  );
  if (options.important) {
    try {
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    } catch (e) {
      // ignore
    }
    systemNotification("Kasaba Meydanı", text);
  }
}

/** Ask for permission to show system notifications while in the background. */
export async function requestPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch (e) {
    return "denied";
  }
}

export function permissionState() {
  return "Notification" in window ? Notification.permission : "unsupported";
}
