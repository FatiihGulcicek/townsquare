import Vue from "vue";
import { setupPush, pushSupported } from "./push";
import { toast } from "./game";

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

/** bell / settings tap: turn notifications on, or say why they cannot be */
export async function askNotifications() {
  const state = notificationState.permission;
  if (state === "granted") {
    await setupPush();
    toast("Bildirimler açık: sıra sana gelince haber vereceğim.", "success");
    return;
  }
  if (state === "denied") {
    toast(
      "Bildirimler engellenmiş. Telefonun ayarlarından bu uygulamaya izin ver.",
      "warning",
      7000,
    );
    return;
  }
  if (state === "unsupported") {
    toast(
      "Bu tarayıcı bildirim desteklemiyor. iPhone'da uygulamayı ana ekrana ekleyip oradan aç.",
      "warning",
      7000,
    );
    return;
  }
  if (await enableNotifications())
    toast("Bildirimler açık: oyun kapalıyken de haber vereceğim.", "success");
}
