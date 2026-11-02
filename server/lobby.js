/*
 * The town square outside the games: who is on the site right now, a shared
 * chat, invitations into a room, and a phone notification when someone
 * comes online (so friends know there is a game to join).
 *
 * Everyone appears under a public id derived from their private id, so the
 * private id (which owns their seat in a game) is never revealed.
 */
"use strict";
const crypto = require("crypto");

const CHAT_KEEP = 60;
const CHAT_MAX = 200;
const ARRIVAL_COOLDOWN = 30 * 60 * 1000; // announce the same person at most every 30 min
const RECIPIENT_COOLDOWN = 20 * 60 * 1000; // notify the same person at most every 20 min
const REPORT_WINDOW = 24 * 3600 * 1000;
const REPORTS_TO_MUTE = 3; // different people
const MUTE_FOR = 60 * 60 * 1000;

class Lobby {
  /**
   * @param push {register(channel, id, sub), unregister, send(channel, id, payload)}
   * @param roomExists (code) => boolean
   */
  constructor(push, roomExists, grant) {
    this.push = push;
    this.roomExists = roomExists;
    this.grant = grant || (() => true);
    this.reports = {}; // reported pub -> [{ by, at, text }]
    this.mutedUntil = {}; // pub -> time
    this.reportLog = []; // last reports, for the owner of the server
    this.members = new Map(); // private id -> { sockets:Set, name, level, room, pub, visible }
    this.chat = [];
    this.seq = 0;
    this.lastChat = {};
    this.lastArrival = {}; // private id -> time we announced them
    this.lastNotified = {}; // private id -> time they got an arrival push
    this.notifyOff = new Set(); // private ids that don't want arrival pushes
    this.known = new Map(); // private id -> name (people seen since start)
    this.queued = false;
  }

  pubOf(id) {
    return crypto
      .createHash("sha256")
      .update("vk-lobby:" + id)
      .digest("hex")
      .slice(0, 12);
  }

  byPub(pub) {
    for (const [id, m] of this.members) if (m.pub === pub) return id;
    return null;
  }

  connect(ws, id) {
    let m = this.members.get(id);
    const isNew = !m;
    if (!m) {
      m = {
        sockets: new Set(),
        name: "",
        level: 1,
        room: null,
        pub: this.pubOf(id),
        visible: true,
        since: Date.now(),
      };
      this.members.set(id, m);
    }
    m.sockets.add(ws);
    ws.send(JSON.stringify(["lchat", this.chat.slice(-40)]));
    this.broadcastList();
    return isNew;
  }

  disconnect(ws, id) {
    const m = this.members.get(id);
    if (!m) return;
    m.sockets.delete(ws);
    if (!m.sockets.size) {
      this.members.delete(id);
      this.broadcastList();
    }
  }

  send(id, data) {
    const m = this.members.get(id);
    if (!m) return;
    m.sockets.forEach((ws) => ws.readyState === 1 && ws.send(data));
  }

  list() {
    return [...this.members.values()]
      .filter((m) => m.name)
      .map((m) => ({
        pub: m.pub,
        name: m.name,
        level: m.level,
        room: m.room,
        away: !m.visible,
      }))
      .sort(
        (a, b) =>
          (a.room ? 1 : 0) - (b.room ? 1 : 0) ||
          a.name.localeCompare(b.name, "tr"),
      );
  }

  broadcastList() {
    if (this.queued) return;
    this.queued = true;
    setTimeout(() => {
      this.queued = false;
      const list = this.list();
      this.members.forEach((m, id) =>
        this.send(id, JSON.stringify(["online", { list, me: m.pub }])),
      );
    }, 300);
  }

  receive(id, command, params) {
    const m = this.members.get(id);
    if (!m) return;
    switch (command) {
      case "hello": {
        const hadName = !!m.name;
        const name =
          params && typeof params.name === "string"
            ? params.name.replace(/\s+/g, " ").trim().slice(0, 24)
            : "";
        const level = parseInt(params && params.level, 10);
        m.name = name;
        m.level = level >= 1 && level <= 99 ? level : 1;
        const room =
          params &&
          typeof params.room === "string" &&
          /^[A-Z]{4}$/.test(params.room)
            ? params.room
            : null;
        m.room = room;
        if (params && Array.isArray(params.blocks)) {
          m.blocks = new Set(
            params.blocks
              .filter((b) => typeof b === "string" && /^[0-9a-f]{12}$/.test(b))
              .slice(0, 200),
          );
        }
        if (params && params.notify === false) this.notifyOff.add(id);
        else if (params && params.notify === true) this.notifyOff.delete(id);
        if (name) this.known.set(id, name);
        if (name && !hadName) this.announce(id, name);
        this.broadcastList();
        return;
      }
      case "visible":
        m.visible = params !== false;
        this.broadcastList();
        return;
      case "push":
        if (params) this.push.register("lobby", id, params);
        else this.push.unregister("lobby", id);
        return;
      case "chat":
        return this.say(id, m, params && params.text);
      case "invite":
        return this.invite(id, m, params);
      case "block":
        m.blocks = m.blocks || new Set();
        if (params && typeof params.pub === "string") {
          if (params.on === false) m.blocks.delete(params.pub);
          else if (m.blocks.size < 200) m.blocks.add(params.pub);
        }
        return;
      case "report":
        return this.report(id, m, params);
    }
  }

  say(id, m, text) {
    text = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
    if (!text || !m.name) return;
    const now = Date.now();
    if ((this.mutedUntil[m.pub] || 0) > now) {
      const minutes = Math.ceil((this.mutedUntil[m.pub] - now) / 60000);
      this.send(
        id,
        JSON.stringify([
          "lnotice",
          `Birkaç kişi seni şikâyet etti. ${minutes} dk meydanda yazamazsın.`,
        ]),
      );
      return;
    }
    if (now - (this.lastChat[id] || 0) < 800) return;
    this.lastChat[id] = now;
    const msg = {
      n: ++this.seq,
      from: m.pub,
      name: m.name,
      level: m.level,
      text: text.slice(0, CHAT_MAX),
      at: now,
    };
    this.chat.push(msg);
    if (this.chat.length > CHAT_KEEP) this.chat.shift();
    const data = JSON.stringify(["lchat+", msg]);
    this.members.forEach((_, other) => this.send(other, data));
  }

  invite(id, m, params) {
    if (!params || !m.name) return;
    const code =
      typeof params.code === "string" ? params.code.toUpperCase() : "";
    if (!/^[A-Z]{4}$/.test(code) || !this.roomExists(code)) return;
    const target = this.byPub(params.to);
    if (!target || target === id) return;
    const now = Date.now();
    m.invites = m.invites || {};
    if (now - (m.invites[params.to] || 0) < 15000) return; // no spamming
    m.invites[params.to] = now;
    const t0 = this.members.get(target);
    if (t0 && t0.blocks && t0.blocks.has(m.pub)) {
      // blocked: the sender sees nothing unusual
      this.send(id, JSON.stringify(["invited", { to: params.to }]));
      return;
    }
    if (!this.grant(code, id, target)) return;
    this.send(
      target,
      JSON.stringify(["invite", { from: m.name, pub: m.pub, code }]),
    );
    this.send(id, JSON.stringify(["invited", { to: params.to }]));
    const t = this.members.get(target);
    if (!t || !t.visible) {
      this.push.send("lobby", target, {
        title: "Oyuna çağrıldın 🧛",
        body: `${m.name} seni ${code} odasına çağırıyor. Katılmak için dokun.`,
        tag: "invite",
        url: "/#" + code,
      });
    }
  }

  /** a report from 3 different people silences someone for an hour */
  report(id, m, params) {
    if (!params || typeof params.pub !== "string" || !m.name) return;
    const pub = params.pub;
    if (pub === m.pub) return;
    const now = Date.now();
    const list = (this.reports[pub] || []).filter(
      (r) => now - r.at < REPORT_WINDOW,
    );
    if (list.some((r) => r.by === m.pub)) {
      this.send(
        id,
        JSON.stringify(["lnotice", "Bu kişiyi zaten şikâyet ettin."]),
      );
      return;
    }
    const msg = this.chat.find((c) => c.n === params.n && c.from === pub);
    const entry = { by: m.pub, at: now, text: msg ? msg.text : "" };
    list.push(entry);
    this.reports[pub] = list;
    this.reportLog.push({ pub, ...entry });
    if (this.reportLog.length > 100) this.reportLog.shift();
    console.log("lobby report", pub, "by", m.pub, JSON.stringify(entry.text));
    this.send(
      id,
      JSON.stringify(["lnotice", "Şikâyetin alındı, teşekkürler. 🙏"]),
    );
    if (
      list.length >= REPORTS_TO_MUTE &&
      !((this.mutedUntil[pub] || 0) > now)
    ) {
      this.mutedUntil[pub] = now + MUTE_FOR;
      // take their messages off the square
      this.chat = this.chat.filter((c) => c.from !== pub);
      const data = JSON.stringify(["lchat-del", { from: pub }]);
      this.members.forEach((_, other) => this.send(other, data));
    }
  }

  /** someone arrived: let the others (whose app is closed) know */
  announce(id, name) {
    const now = Date.now();
    if (now - (this.lastArrival[id] || 0) < ARRIVAL_COOLDOWN) return;
    this.lastArrival[id] = now;
    const online = this.members.size;
    this.push.subscribedPlayers("lobby").forEach((other) => {
      if (other === id || this.notifyOff.has(other)) return;
      const om = this.members.get(other);
      if (om && om.visible) return; // they can already see it
      if (now - (this.lastNotified[other] || 0) < RECIPIENT_COOLDOWN) return;
      this.lastNotified[other] = now;
      this.push.send("lobby", other, {
        title: "Kasabada hareket var 🌙",
        body:
          online > 1
            ? `${name} ve ${online - 1} kişi daha sitede. Bir oyun açalım mı?`
            : `${name} sitede! Bir oyun açalım mı?`,
        tag: "arrival",
        url: "/",
      });
    });
  }

  stats() {
    return {
      online: this.members.size,
      chat: this.chat.length,
      reports: this.reportLog.length,
      muted: Object.values(this.mutedUntil).filter((t) => t > Date.now())
        .length,
    };
  }
}

module.exports = { Lobby };
