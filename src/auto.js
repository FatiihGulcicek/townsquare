import Vue from "vue";

/*
 * State sent by the automatic storyteller (server/bot.js) to this player.
 * `active` is false in normal, human-run games.
 */
const initial = () => ({
  active: false,
  phase: "lobby",
  day: 0,
  night: 0,
  seated: false,
  seat: -1,
  alive: false,
  isOwner: false,
  ownerName: "",
  count: 0,
  min: 5,
  max: 15,
  setup: null,
  settings: { dayMinutes: 8, choiceSeconds: 60, votingSpeed: 1500 },
  prompt: null,
  pending: 0,
  dayRemaining: 0,
  ready: 0,
  readyNeeded: 0,
  iAmReady: false,
  canNominate: false,
  nominees: [],
  block: null,
  voting: false,
  canSlay: false,
  winner: null,
  reason: "",
  reveal: null,
  log: [],
  receivedAt: 0,
});

export const autoState = Vue.observable(initial());

export function setAutoState(params) {
  Object.assign(autoState, params || {}, {
    active: true,
    receivedAt: Date.now(),
  });
}

export function resetAutoState() {
  Object.assign(autoState, initial());
}

let sender = null;
export function registerAutoSender(fn) {
  sender = fn;
}

/** send an action to the automatic storyteller */
export function autoAction(action, params = {}) {
  if (sender) sender({ action, ...params });
}

/** create a new room run by the automatic storyteller */
export async function createAutoRoom() {
  const response = await fetch("/auto/new", {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("busy");
  const { channel } = await response.json();
  return channel;
}
