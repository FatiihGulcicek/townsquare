import Vue from "vue";
import { game, join, createRoom, toast } from "./game";
import { getPushSubscription, onPushSubscription } from "./push";
import { progress, levelFor } from "./progress";
import { play } from "./sfx";

/*
 * Connection to the town square: who is on the site, the shared chat and
 * invitations. Stays open the whole time the app is open.
 */
let notifyStored = "on";
try {
  notifyStored = localStorage.getItem("vkArrivals") || "on";
} catch (e) {
  // ignore
}

export const lobby = Vue.observable({
  connected: false,
  me: null, // my public id
  online: [],
  chat: [],
  invite: null, // { from, code }
  invited: {}, // pub -> time I invited them
  notifyArrivals: notifyStored === "on",
});

let socket = null;
let retry = null;

function send(command, params) {
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify([command, params]));
  }
}

/** tell the square who I am and where I am */
export function lobbyHello() {
  send("hello", {
    name: game.name,
    level: levelFor(progress.totals.xp),
    room: game.code || null,
    notify: lobby.notifyArrivals,
  });
}

function presence() {
  send("visible", document.visibilityState !== "hidden");
  const sub = getPushSubscription();
  if (sub) send("push", sub);
}

function open() {
  clearTimeout(retry);
  const proto = location.protocol === "https:" ? "wss://" : "ws://";
  const ws = new WebSocket(proto + location.host + "/lobby/" + game.playerId);
  socket = ws;
  ws.onopen = () => {
    lobby.connected = true;
    lobbyHello();
    presence();
  };
  ws.onmessage = (event) => {
    let command, params;
    try {
      [command, params] = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    if (command === "online") {
      lobby.online = params.list;
      lobby.me = params.me;
    } else if (command === "lchat") {
      lobby.chat = params;
    } else if (command === "lchat+") {
      lobby.chat.push(params);
      if (lobby.chat.length > 60) lobby.chat.shift();
      if (params.from !== lobby.me && !game.code) play("pop");
    } else if (command === "invite") {
      // don't interrupt a game that is running
      const busy =
        game.state &&
        !["lobby", "over"].includes(game.state.phase) &&
        game.state.me.seated;
      if (busy) {
        toast(
          `${params.from} seni ${params.code} odasına çağırıyor.`,
          "info",
          6000,
        );
      } else if (game.code !== params.code) {
        lobby.invite = params;
        play("turn");
        try {
          if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
        } catch (e) {
          // ignore
        }
      }
    } else if (command === "invited") {
      Vue.set(lobby.invited, params.to, Date.now());
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    lobby.connected = false;
    socket = null;
    retry = setTimeout(open, 3000);
  };
}

export function startLobby() {
  if (!socket) open();
}

export function lobbyChat(text) {
  send("chat", { text });
}

/** invite someone into my room (creating one first if I'm not in a room) */
export async function inviteToRoom(pub) {
  let code = game.code;
  if (!code) {
    try {
      code = await createRoom("auto");
    } catch (e) {
      toast("Oda kurulamadı, biraz sonra tekrar dene.", "warning");
      return;
    }
    // wait until the room connection is up
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  send("invite", { to: pub, code });
  toast("Davet gönderildi 📨", "success");
}

export function acceptInvite() {
  const code = lobby.invite && lobby.invite.code;
  lobby.invite = null;
  if (code) join(code);
}

export function declineInvite() {
  lobby.invite = null;
}

export function setArrivalNotifications(on) {
  lobby.notifyArrivals = on;
  try {
    localStorage.setItem("vkArrivals", on ? "on" : "off");
  } catch (e) {
    // ignore
  }
  lobbyHello();
}

document.addEventListener("visibilitychange", () => {
  presence();
  if (document.visibilityState === "visible" && !socket) open();
});
onPushSubscription(() => presence());
setInterval(() => send("ping"), 25000);

// keep the square informed when my name or room changes
new Vue({
  computed: {
    status() {
      return game.name + "|" + game.code;
    },
  },
  watch: {
    status() {
      lobbyHello();
    },
  },
});
