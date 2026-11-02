/*
 * Web Push subscription: lets the server notify a player whose app is closed
 * or in the background (night falls, a vote starts, the storyteller wakes them).
 * On iPhone this only works when the app was added to the home screen (iOS 16.4+).
 */
let current = null;
const listeners = [];

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlB64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(subscription, key) {
  try {
    const existing =
      subscription.options && subscription.options.applicationServerKey;
    if (!existing) return true;
    const a = new Uint8Array(existing);
    const b = urlB64ToUint8Array(key);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  } catch (e) {
    return true;
  }
}

/** Subscribe (or refresh the subscription) if notifications are allowed. */
export async function setupPush() {
  if (!pushSupported() || Notification.permission !== "granted") return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const response = await fetch("/push/key", { cache: "no-store" });
    if (!response.ok) return null;
    const { enabled, key } = await response.json();
    if (!enabled || !key) return null;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(key),
      });
    }
    current = subscription.toJSON();
    listeners.forEach((fn) => fn(current));
    return current;
  } catch (e) {
    // not supported or blocked
    return null;
  }
}

export function getPushSubscription() {
  return current;
}

export function onPushSubscription(fn) {
  listeners.push(fn);
}
