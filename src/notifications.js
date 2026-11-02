import Vue from "vue";
import { setupPush, pushSupported } from "./push";

export const notificationState = Vue.observable({
  supported: pushSupported(),
  permission:
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported",
});

/** ask for permission (must run from a tap) and subscribe to push */
export async function enableNotifications() {
  if (typeof Notification === "undefined") return false;
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch (e) {
      permission = "denied";
    }
  }
  notificationState.permission = permission;
  if (permission !== "granted") return false;
  await setupPush();
  return true;
}
