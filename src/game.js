import Vue from "vue";
import { speak } from "./voice";
import { getPushSubscription, onPushSubscription } from "./push";
import { play } from "./sfx";
import {
  recordGame,
  penaltyDone,
  titleFor,
  levelFor,
  progress,
} from "./progress";
import {
  bindVoice,
  voiceState,
  voiceSignal,
  voiceReconnected,
  leaveVoice,
  voiceChat,
} from "./voicechat";

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
  lastStory: 0,
  photos: {}, // pid -> profile photo of the people in the room
  myPhoto: store("vkPhoto") || "",
  liveQueue: [], // story events to play full screen as they happen
  reactions: [], // flying emoji {id, to, emoji}
});

const readJSON = (key, fallback) => {
  try {
    return JSON.parse(store(key) || "") || fallback;
  } catch (e) {
    return fallback;
  }
};

/** rooms this phone created (to open them again with the same code) */
export function savedRooms() {
  return readJSON("vkRooms", []);
}
function rememberRoom(code, mode) {
  const list = savedRooms().filter((r) => r.code !== code);
  list.unshift({ code, mode, at: Date.now() });
  store("vkRooms", JSON.stringify(list.slice(0, 8)));
}
export function forgetRoom(code) {
  store("vkRooms", JSON.stringify(savedRooms().filter((r) => r.code !== code)));
}

/** people you played with on this phone */
export function friends() {
  return Object.values(readJSON("vkFriends", {})).sort(
    (a, b) => b.last - a.last,
  );
}
function rememberFriends(state) {
  const all = readJSON("vkFriends", {});
  state.players
    .filter((p) => !p.bot && p.pid !== state.me.pid)
    .forEach((p) => {
      const key = p.name.toLocaleLowerCase("tr");
      const old = all[key] || { name: p.name, games: 0 };
      all[key] = { name: p.name, games: old.games + 1, last: Date.now() };
    });
  const trimmed = Object.values(all)
    .sort((a, b) => b.last - a.last)
    .slice(0, 40);
  store(
    "vkFriends",
    JSON.stringify(
      Object.fromEntries(
        trimmed.map((f) => [f.name.toLocaleLowerCase("tr"), f]),
      ),
    ),
  );
}

let reactionId = 0;
export function react(to, emoji) {
  send("react", { to, emoji });
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

/** new story events are played full screen while the game goes on */
function queueStory(prev, next) {
  const events = next.events || [];
  if (!prev || prev.code !== next.code) {
    // first state after (re)connecting: don't replay the past
    game.lastStory = events.length ? events[events.length - 1].n : 0;
    return;
  }
  if (prev.gameId !== next.gameId) game.lastStory = 0;
  const fresh = events.filter((e) => e.n > (game.lastStory || 0));
  if (!fresh.length) return;
  game.lastStory = fresh[fresh.length - 1].n;
  fresh.forEach((e) => game.liveQueue.push(e));
  if (game.liveQueue.length > 8)
    game.liveQueue.splice(0, game.liveQueue.length - 8);
}

function onState(next) {
  const prev = game.state;
  game.state = next;
  game.receivedAt = Date.now();
  if (!next.me) return;
  queueStory(prev, next);
  if (
    prev &&
    prev.phase !== "over" &&
    next.phase === "over" &&
    next.me.seated
  ) {
    rememberFriends(next);
    const result = recordGame(next);
    send("level", levelFor(progress.totals.xp));
    if (result && result.xp) {
      setTimeout(() => {
        toast(`+${result.xp} XP kazandın ⭐`, "success", 5000);
        if (result.levelUp) {
          toast(
            `🎉 Seviye atladın: ${result.levelUp}. seviye · ${titleFor(
              result.levelUp,
            )}`,
            "success",
            7000,
          );
        }
        result.fresh.forEach((b, i) =>
          setTimeout(
            () => {
              toast(`🏅 Yeni rozet: ${b.emoji} ${b.name}`, "success", 6000);
              play("win");
            },
            1200 * (i + 1),
          ),
        );
      }, 9000);
    }
  }
  // my penalty done: a badge
  if (next.penalties && next.me.pid) {
    const mine = next.penalties.find((x) => x.pid === next.me.pid);
    if (mine && mine.done) {
      const badge = penaltyDone();
      if (badge) {
        toast(`🏅 Yeni rozet: ${badge.emoji} ${badge.name}`, "success", 6000);
      }
    }
  }
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
  voiceState(next.voice);
  const role = next.me.role;
  if (role) {
    const key = next.code + ":" + next.gameId + ":" + role;
    if (store("vkSeenRole") !== key) {
      store("vkSeenRole", key);
      // a freshly drawn card flips first, then the big card opens
      const drawn = next.phase === "roles";
      setTimeout(() => (game.roleCardOpen = true), drawn ? 1100 : 0);
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
    send("photos");
    if (game.myPhoto) send("photo", game.myPhoto);
    send("level", levelFor(progress.totals.xp));
    presence();
    voiceReconnected();
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
    else if (command === "react") {
      const id = ++reactionId;
      game.reactions.push({ id, to: params.to, emoji: params.emoji });
      if (game.reactions.length > 30) game.reactions.shift();
      setTimeout(() => {
        const i = game.reactions.findIndex((r) => r.id === id);
        if (i >= 0) game.reactions.splice(i, 1);
      }, 2600);
    } else if (command === "photo") {
      if (params.data) Vue.set(game.photos, params.pid, params.data);
      else Vue.delete(game.photos, params.pid);
    } else if (command === "photos") {
      game.photos = { ...(params || {}) };
    } else if (command === "rtc") voiceSignal(params);
    else if (command === "notice") {
      toast(params, "warning", 8000);
      vibrate([300, 100, 300]);
    } else if (command === "narrate") {
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
  game.photos = {};
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
  if (voiceChat.on) leaveVoice();
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

export async function createRoom(mode, wanted) {
  const response = await fetch("/api/room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      playerId: game.playerId,
      code: wanted || undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(response.status === 400 ? "code" : "busy");
  }
  const { code, existing } = await response.json();
  if (!existing) rememberRoom(code, mode);
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
bindVoice(send);

/** room from the link (#ABCD) or the last one we were in */
export function restore() {
  const fromHash = (location.hash || "").replace("#", "");
  if (/^[A-Za-z]{4}$/.test(fromHash)) return join(fromHash);
  const last = store("vkRoom");
  if (last) return join(last);
  return false;
}

/** set (or clear with "") the profile photo */
export function setMyPhoto(data) {
  game.myPhoto = data || "";
  store("vkPhoto", data ? data : null);
  send("photo", data || null);
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
