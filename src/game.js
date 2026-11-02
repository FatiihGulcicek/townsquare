import Vue from "vue";
import { speak } from "./voice";
import { getPushSubscription, onPushSubscription } from "./push";
import { play } from "./sfx";

/*
 * Connection to a Vampir Köylü room. The server is the source of truth: it
 * sends this player's personal view of the game ("state") after every change.
 */
const store = (key, value) => {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    // private mode
  }
  return null;
};

function newId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => (b % 36).toString(36)).join("");
}

let playerId = store("vkPlayerId");
if (!playerId || !/^[a-z0-9]{8,40}$/.test(playerId)) {
  playerId = newId();
  store("vkPlayerId", playerId);
}

export const game = Vue.observable({
  playerId,
  name: store("vkName") || "",
  code: "",
  status: "idle", // idle | connecting | online | offline
  state: null,
  receivedAt: 0,
  toasts: [],
  roleCardOpen: false,
  transition: null, // {kind, title, sub} full screen phase change
});

let transitionTimer = null;
function showTransition(kind, title, sub) {
  game.transition = { kind, title, sub, at: Date.now() };
  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => (game.transition = null), 2600);
}

// ---------- toasts ----------

let toastId = 0;
export function toast(text, type = "info", ms = 4500) {
  const id = ++toastId;
  const last = game.toasts[game.toasts.length - 1];
  if (last && last.text === text) return;
  game.toasts.push({ id, text, type });
  if (game.toasts.length > 2) game.toasts.shift();
  setTimeout(() => {
    const i = game.toasts.findIndex((t) => t.id === id);
    if (i >= 0) game.toasts.splice(i, 1);
  }, ms);
}

function vibrate(pattern = [120, 60, 120]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {
    // ignore
  }
}

// ---------- socket ----------

let socket = null;
let retry = null;
let wanted = false;
let lastMessage = 0;

// phones drop sockets silently: ping regularly, reconnect if nothing comes back
setInterval(() => {
  if (!socket || socket.readyState !== 1) return;
  if (Date.now() - lastMessage > 50000) {
    socket.close();
    return;
  }
  send("ping");
}, 20000);

function url(code) {
  const proto = location.protocol === "https:" ? "wss://" : "ws://";
  const base = process.env.VUE_APP_WSS || proto + location.host + "/vk/";
  return base + code + "/" + game.playerId;
}

export function send(command, params) {
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify([command, params]));
  }
}

export function act(type, params = {}) {
  send("act", { type, ...params });
}

function presence() {
  send("visible", document.visibilityState !== "hidden");
  const sub = getPushSubscription();
  if (sub) send("push", sub);
}

function phaseChanged(prev, next) {
  if (!prev) return;
  if (prev.phase === next.phase && prev.gameId === next.gameId) return;
  const r = next.round;
  if (next.phase === "night") {
    play("night");
    showTransition("night", `${r}. Gece`, "Köy uyuyor… telefonuna bak");
  } else if (next.phase === "day") {
    const died = next.lastNight && next.lastNight.died[0];
    play(died ? "death" : "day");
    showTransition(
      "day",
      `${r}. Gün`,
      died
        ? `${died.name} bu gece öldü`
        : next.lastNight && next.lastNight.saved
        ? "Doktor birini kurtardı!"
        : "Bu gece kimse ölmedi",
    );
  } else if (next.phase === "lastwords") {
    play("death");
  } else if (next.phase === "dusk" && next.executed) {
    play("death");
  } else if (next.phase === "over") {
    const mine = next.me.role && next.roles[next.me.role].team;
    play(mine ? (mine === next.winner ? "win" : "lose") : "win");
    showTransition(
      "over",
      next.winner === "vampir" ? "Vampirler kazandı" : "Köylüler kazandı",
      mine
        ? mine === next.winner
          ? "Tebrikler, kazandın! 🎉"
          : "Bu sefer kaybettin"
        : "",
    );
  } else if (next.phase === "roles") {
    play("turn");
  }
}

function onState(next) {
  const prev = game.state;
  game.state = next;
  game.receivedAt = Date.now();
  if (!next.me) return;
  phaseChanged(prev, next);
  if (prev && prev.phase === "day" && next.phase === "day") {
    const before = Object.keys(prev.votes).length;
    const after = Object.keys(next.votes).length;
    if (before !== after) play("vote");
  }
  const lastChat = (s) => {
    const town = (s && s.chat && s.chat.town) || [];
    return town.length ? town[town.length - 1].n : 0;
  };
  if (prev && lastChat(next) > lastChat(prev)) {
    const m = next.chat.town[next.chat.town.length - 1];
    if (!m.sys && m.from !== next.me.pid) play("pop");
  }
  // a new character: show the card once per game
  const role = next.me.role;
  if (role) {
    const key = next.code + ":" + next.gameId + ":" + role;
    if (store("vkSeenRole") !== key) {
      store("vkSeenRole", key);
      game.roleCardOpen = true;
      vibrate();
    }
  }
  // my turn at night
  if (
    next.phase === "night" &&
    next.night &&
    !next.night.done &&
    (!prev || prev.phase !== "night")
  ) {
    vibrate([200, 80, 200]);
    if (next.night.action !== "koylu") setTimeout(() => play("turn"), 1500);
  }
  if (prev && prev.me.alive && !next.me.alive && next.me.seated) {
    toast("Öldün. Artık sadece izleyebilirsin.", "death", 6000);
    vibrate([400]);
  }
}

function open(code) {
  clearTimeout(retry);
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  game.status = "connecting";
  const ws = new WebSocket(url(code));
  socket = ws;
  ws.onopen = () => {
    game.status = "online";
    lastMessage = Date.now();
    if (game.name) send("join", { name: game.name });
    else send("hello");
    presence();
  };
  ws.onmessage = (event) => {
    lastMessage = Date.now();
    let command, params;
    try {
      [command, params] = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    if (command === "state") onState(params);
    else if (command === "narrate") {
      toast(params, "story", 7000);
      speak(params);
    } else if (command === "kicked") {
      toast("Oda sahibi seni odadan çıkardı.", "warning");
      leave(true);
    }
  };
  ws.onclose = (event) => {
    if (socket !== ws) return;
    socket = null;
    if (event.code === 4004) {
      toast(
        "Bu oda artık yok (sunucu yeniden başlamış olabilir). Yeni bir oda kur.",
        "warning",
        8000,
      );
      leave(true);
      return;
    }
    if (!wanted) return;
    game.status = event.code === 1012 ? "connecting" : "offline";
    // server restart: come back quickly, the room is restored from the database
    retry = setTimeout(
      () => wanted && open(game.code),
      event.code === 1012 ? 1500 : 2000,
    );
  };
}

export function join(code) {
  code = (code || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
  if (code.length !== 4) return false;
  wanted = true;
  game.code = code;
  game.state = null;
  store("vkRoom", code);
  if (location.hash !== "#" + code) {
    history.replaceState(null, "", location.pathname + "#" + code);
  }
  open(code);
  return true;
}

export function leave(silent = false) {
  if (!silent && game.state && game.state.phase === "lobby") act("leave");
  wanted = false;
  clearTimeout(retry);
  if (socket) {
    socket.onclose = null;
    socket.close(1000);
    socket = null;
  }
  game.code = "";
  game.state = null;
  game.status = "idle";
  store("vkRoom", null);
  history.replaceState(null, "", location.pathname);
}

export function setName(name) {
  game.name = (name || "").trim().slice(0, 24);
  store("vkName", game.name);
  if (game.name && game.code) send("join", { name: game.name });
}

export async function createRoom(mode) {
  const response = await fetch("/api/room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, playerId: game.playerId }),
  });
  if (!response.ok) throw new Error("busy");
  const { code } = await response.json();
  join(code);
  return code;
}

/** resume after the phone wakes up */
function resume() {
  presence();
  if (wanted && (!socket || socket.readyState > 1)) open(game.code);
}
document.addEventListener("visibilitychange", resume);
window.addEventListener("pageshow", resume);
window.addEventListener("online", resume);
window.addEventListener("pagehide", () => send("visible", false));
onPushSubscription(() => presence());

/** room from the link (#ABCD) or the last one we were in */
export function restore() {
  const fromHash = (location.hash || "").replace("#", "");
  if (/^[A-Za-z]{4}$/.test(fromHash)) return join(fromHash);
  const last = store("vkRoom");
  if (last) return join(last);
  return false;
}

export function chat(channel, text) {
  send("chat", { channel, text });
}

export async function fetchProfile() {
  try {
    const response = await fetch("/api/me", {
      headers: { "X-Player-Id": game.playerId },
      cache: "no-store",
    });
    return await response.json();
  } catch (e) {
    return { enabled: false };
  }
}

export async function fetchLeaderboard() {
  try {
    const response = await fetch("/api/leaderboard", { cache: "no-store" });
    return await response.json();
  } catch (e) {
    return { enabled: false, list: [] };
  }
}

/** move a profile to this device with its code */
export function useProfileCode(code) {
  code = (code || "").trim().toLowerCase();
  if (!/^[a-z0-9]{8,40}$/.test(code)) return false;
  playerId = code;
  game.playerId = code;
  store("vkPlayerId", code);
  return true;
}

export function shareLink() {
  return location.origin + "/#" + game.code;
}
