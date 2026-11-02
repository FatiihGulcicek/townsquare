import Vue from "vue";
import { getJSON, setJSON, setItem, storedKeys } from "./storage";

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
  notes.map = getJSON(key, {});
  // forget notebooks of old games
  storedKeys()
    .filter((k) => k.startsWith("vkNotes:") && k !== key)
    .slice(0, -3)
    .forEach((k) => setItem(k, null));
}

export function setNote(pid, patch) {
  const current = notes.map[pid] || { tag: "", text: "" };
  Vue.set(notes.map, pid, { ...current, ...patch });
  setJSON(notes.key, notes.map);
}
