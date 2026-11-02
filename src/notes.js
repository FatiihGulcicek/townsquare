import Vue from "vue";

/*
 * Private notebook: your own tags and notes about the other players.
 * Never leaves this phone; kept per game.
 */
export const notes = Vue.observable({ key: "", map: {} });

export const TAGS = {
  clean: { emoji: "🟢", label: "Temiz" },
  sus: { emoji: "🔴", label: "Şüpheli" },
  unsure: { emoji: "❓", label: "Emin değilim" },
};

export function useNotes(code, gameId) {
  const key = "vkNotes:" + code + ":" + gameId;
  if (notes.key === key) return;
  notes.key = key;
  try {
    notes.map = JSON.parse(localStorage.getItem(key) || "{}");
  } catch (e) {
    notes.map = {};
  }
  // forget notebooks of old games
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("vkNotes:") && k !== key)
      .slice(0, -3)
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    // ignore
  }
}

export function setNote(pid, patch) {
  const current = notes.map[pid] || { tag: "", text: "" };
  Vue.set(notes.map, pid, { ...current, ...patch });
  try {
    localStorage.setItem(notes.key, JSON.stringify(notes.map));
  } catch (e) {
    // ignore
  }
}
