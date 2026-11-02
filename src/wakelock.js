/*
 * Keeps the phone screen on while a game is running (like mobile games do),
 * so the connection is not cut by the screen going dark mid-night.
 */
let lock = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock || document.visibilityState !== "visible") return;
  try {
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => {
      lock = null;
    });
  } catch (e) {
    lock = null; // battery saver or not supported
  }
}

export function keepAwake(on) {
  if (!("wakeLock" in navigator)) return;
  wanted = !!on;
  if (wanted) acquire();
  else if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}

// the lock is dropped whenever the page is hidden: take it again on return
document.addEventListener("visibilitychange", acquire);
