/*
 * Vampir Köylü game engine.
 *
 * Roles: Vampir, Köylü, Doktor, Gözcü.
 * Two modes:
 *   auto  - the app is the storyteller: timers move the game along
 *   human - one person is the storyteller (not playing); they see everything
 *           and decide when each phase ends, and may kill / revive players.
 *
 * The rules are always enforced by the server, so nobody can cheat by
 * looking at the network traffic: each player only receives what they may see.
 */
"use strict";
const crypto = require("crypto");

const ROLES = {
  vampir: {
    id: "vampir",
    was: "Vampir'di",
    name: "Vampir",
    team: "vampir",
    emoji: "🧛",
    desc: "Her gece diğer vampirlerle birlikte bir kurban seçersin. Gündüz köylü gibi davran ve yakalanma.",
  },
  koylu: {
    id: "koylu",
    was: "Köylü'ydü",
    name: "Köylü",
    team: "koy",
    emoji: "🧑‍🌾",
    desc: "Özel bir gücün yok. Gündüz konuş, şüphelendiğin kişiye oy ver ve vampirleri bul.",
  },
  doktor: {
    id: "doktor",
    was: "Doktor'du",
    name: "Doktor",
    team: "koy",
    emoji: "🩺",
    desc: "Her gece bir kişiyi korursun; vampirler onu o gece öldüremez. Aynı kişiyi iki gece üst üste koruyamazsın.",
  },
  gozcu: {
    id: "gozcu",
    was: "Gözcü'ydü",
    name: "Gözcü",
    team: "koy",
    emoji: "👁️",
    desc: "Her gece bir kişiyi seçersin ve onun vampir olup olmadığını hemen öğrenirsin.",
  },
};

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 20;
const SETTINGS = {
  dayMinutes: [2, 3, 5, 8, 12],
  nightSeconds: [30, 45, 60, 90, 120],
};
const MIN_NIGHT_MS = 8000;
const VOTE_SETTLE_MS = 8000;
const DUSK_MS = 6000;

const rnd = (n) => (n > 0 ? crypto.randomInt(n) : 0);
const pick = (list) => list[rnd(list.length)];
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** how many of each role for n players */
function setupFor(n) {
  const vampir = n <= 6 ? 1 : n <= 10 ? 2 : n <= 14 ? 3 : 4;
  const gozcu = 1;
  const doktor = n >= 5 ? 1 : 0;
  return {
    vampir,
    doktor,
    gozcu,
    koylu: Math.max(0, n - vampir - doktor - gozcu),
  };
}

class Room {
  /**
   * @param code room code
   * @param mode "auto" | "human"
   * @param creatorId playerId of the creator (storyteller in human mode)
   * @param io {sendTo(id, data), connectedIds(), push(ids, payload), destroy()}
   */
  constructor(code, mode, creatorId, io) {
    this.code = code;
    this.mode = mode === "human" ? "human" : "auto";
    this.stId = this.mode === "human" ? creatorId : null;
    this.ownerId = this.mode === "human" ? creatorId : null;
    this.io = io;
    this.players = [];
    this.kicked = new Set();
    this.settings = { dayMinutes: 5, nightSeconds: 60 };
    this.log = [];
    this.timers = new Set();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.reset();
  }

  // ---------- plumbing ----------

  reset() {
    this.clearTimers();
    this.phase = "lobby";
    this.round = 0;
    this.deadline = 0;
    this.night = null;
    this.lastProtected = null;
    this.votes = {};
    this.settleAt = 0;
    this.lastNight = null;
    this.executed = null;
    this.winner = null;
    this.seerLog = {};
    this.players.forEach((p) => {
      p.role = null;
      p.alive = true;
    });
  }

  later(fn, ms) {
    const handle = setTimeout(() => {
      this.timers.delete(handle);
      try {
        fn();
      } catch (e) {
        console.log("vk room error", e);
      }
    }, ms);
    this.timers.add(handle);
    return handle;
  }

  clearTimers() {
    (this.timers || new Set()).forEach((h) => clearTimeout(h));
    this.timers = new Set();
  }

  player(id) {
    return this.players.find((p) => p.id === id);
  }

  alive() {
    return this.players.filter((p) => p.alive);
  }

  isAuto() {
    return this.mode === "auto";
  }

  owner() {
    if (this.mode === "human") return this.stId;
    const seated = (id) => this.players.some((p) => p.id === id);
    if (this.ownerId && seated(this.ownerId)) {
      if (this.io.connectedIds().includes(this.ownerId)) return this.ownerId;
      // a temporarily disconnected owner is replaced by the first one online
      const online = this.players.find((p) =>
        this.io.connectedIds().includes(p.id),
      );
      return online ? online.id : this.ownerId;
    }
    this.ownerId = this.players.length ? this.players[0].id : null;
    return this.ownerId;
  }

  narrate(text) {
    this.log.push(text);
    if (this.log.length > 50) this.log.shift();
    this.io
      .connectedIds()
      .forEach((id) => this.io.sendTo(id, JSON.stringify(["narrate", text])));
  }

  update() {
    if (this.queued) return;
    this.queued = true;
    setImmediate(() => {
      this.queued = false;
      this.io.connectedIds().forEach((id) => this.sendState(id));
    });
  }

  sendState(id) {
    this.io.sendTo(id, JSON.stringify(["state", this.view(id)]));
  }

  pushAll(payload, onlyAlive = false) {
    const ids = (onlyAlive ? this.alive() : this.players).map((p) => p.id);
    if (this.stId) ids.push(this.stId);
    this.io.push(ids, payload);
  }

  // ---------- what each person sees ----------

  visibleRole(viewer, p) {
    if (this.phase === "over" || !p.alive) return p.role;
    if (!viewer) return null;
    if (viewer.isSt || viewer.id === p.id) return p.role;
    if (viewer.role === "vampir" && p.role === "vampir") return p.role;
    return null;
  }

  view(id) {
    const me = this.player(id);
    const isSt = this.stId === id;
    const viewer = isSt ? { isSt: true, id } : me;
    const n = this.players.length;
    const state = {
      code: this.code,
      gameId: this.gameId || 0,
      mode: this.mode,
      phase: this.phase,
      round: this.round,
      remaining: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      settle: this.settleAt ? Math.max(0, this.settleAt - Date.now()) : 0,
      settings: this.settings,
      roles: ROLES,
      min: MIN_PLAYERS,
      max: MAX_PLAYERS,
      setup: n >= MIN_PLAYERS ? setupFor(n) : null,
      me: {
        id,
        name: me ? me.name : "",
        role: me ? me.role : null,
        alive: me ? me.alive : false,
        seated: !!me,
        isOwner: this.owner() === id,
        isStoryteller: isSt,
      },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        online: this.io.connectedIds().includes(p.id),
        role: this.visibleRole(viewer, p),
      })),
      votes: this.phase === "day" || this.phase === "dusk" ? this.votes : {},
      lastNight: this.lastNight,
      executed: this.executed,
      winner: this.winner,
      log: this.log.slice(-10),
      night: null,
      seerLog: me && me.role === "gozcu" ? this.seerLog[id] || [] : [],
      storyteller: null,
    };
    if (this.phase === "night" && me && me.alive) {
      const acts = this.night;
      const night = { action: me.role, target: null, done: false };
      if (me.role === "vampir") {
        night.target = acts.vamp[id] || null;
        night.done = !!night.target;
        night.team = this.alive()
          .filter((p) => p.role === "vampir")
          .map((p) => ({
            id: p.id,
            name: p.name,
            target: acts.vamp[p.id] || null,
          }));
      } else if (me.role === "doktor") {
        night.target = acts.doktor;
        night.done = !!acts.doktor;
        night.forbidden = this.lastProtected;
      } else if (me.role === "gozcu") {
        night.target = acts.gozcu;
        night.done = !!acts.gozcu;
      } else {
        night.target = acts.suspects[id] || null;
        night.done = !!night.target;
      }
      state.night = night;
    }
    if (isSt) {
      state.storyteller = {
        night:
          this.phase === "night"
            ? {
                vamp: this.night.vamp,
                doktor: this.night.doktor,
                gozcu: this.night.gozcu,
                ready: this.nightReady(),
              }
            : null,
        allVoted: this.phase === "day" ? this.allVoted() : false,
      };
    }
    return state;
  }

  // ---------- incoming ----------

  receive(id, command, params) {
    this.lastActivity = Date.now();
    if (command === "join") return this.join(id, params && params.name);
    if (command === "hello") return this.sendState(id);
    if (command !== "act" || !params || typeof params !== "object") return;
    const isBoss = this.owner() === id;
    const isSt = this.stId === id;
    switch (params.type) {
      case "settings":
        if (!isBoss || this.phase !== "lobby") return;
        Object.keys(SETTINGS).forEach((key) => {
          const v = parseInt(params[key], 10);
          if (SETTINGS[key].includes(v)) this.settings[key] = v;
        });
        return this.update();
      case "kick": {
        if (!isBoss || this.phase !== "lobby") return;
        const p = this.player(params.target);
        if (!p || p.id === id) return;
        this.kicked.add(p.id);
        this.players = this.players.filter((x) => x !== p);
        this.io.sendTo(p.id, JSON.stringify(["kicked", true]));
        return this.update();
      }
      case "leave":
        if (this.phase === "lobby") {
          this.players = this.players.filter((p) => p.id !== id);
          if (this.ownerId === id) this.ownerId = null;
          this.update();
        }
        return;
      case "start":
        if (isBoss && this.phase === "lobby") this.start();
        return;
      case "newGame":
        if (isBoss && this.phase === "over") {
          this.reset();
          this.kicked.clear();
          this.narrate("Yeni oyun için bekleme odasındayız.");
          this.update();
        }
        return;
      case "night":
        return this.nightAction(id, params.target);
      case "vote":
        return this.dayVote(id, params.target);
      // storyteller (human mode) controls
      case "next":
        if (isSt) this.next();
        return;
      case "kill":
      case "revive": {
        if (!isSt || this.phase === "lobby" || this.phase === "over") return;
        const p = this.player(params.target);
        if (!p) return;
        if (params.type === "kill" && p.alive) {
          p.alive = false;
          this.narrate(`${p.name} öldü. O bir ${ROLES[p.role].was}.`);
        } else if (params.type === "revive" && !p.alive) {
          p.alive = true;
          this.narrate(`${p.name} hayata döndü!`);
        } else return;
        if (!this.checkWin()) this.update();
        return;
      }
    }
  }

  join(id, name) {
    name = typeof name === "string" ? name.trim().slice(0, 24) : "";
    if (id === this.stId || this.player(id) || this.kicked.has(id)) {
      return this.sendState(id);
    }
    if (!name || this.phase !== "lobby" || this.players.length >= MAX_PLAYERS) {
      return this.sendState(id);
    }
    const norm = (v) => v.toLocaleLowerCase("tr");
    let unique = name;
    let k = 2;
    while (this.players.some((p) => norm(p.name) === norm(unique))) {
      unique = `${name} ${k++}`;
    }
    this.players.push({ id, name: unique, role: null, alive: true });
    if (!this.ownerId) this.ownerId = id;
    this.update();
  }

  // ---------- game flow ----------

  start() {
    const n = this.players.length;
    if (n < MIN_PLAYERS) return;
    this.reset();
    this.gameId = (this.gameId || 0) + 1;
    const s = setupFor(n);
    const bag = shuffle([
      ...Array(s.vampir).fill("vampir"),
      ...Array(s.doktor).fill("doktor"),
      ...Array(s.gozcu).fill("gozcu"),
      ...Array(s.koylu).fill("koylu"),
    ]);
    this.players.forEach((p, i) => {
      p.role = bag[i];
      p.alive = true;
    });
    this.phase = "roles";
    this.narrate(
      `Oyun başlıyor! ${s.vampir} vampir aramızda. Herkes rolüne baksın ve kimseye göstermesin.`,
    );
    this.pushAll({
      title: "Oyun başladı 🧛",
      body: "Rolünü görmek için dokun.",
      tag: "phase",
    });
    this.update();
    if (this.isAuto()) this.later(() => this.startNight(), 10000);
  }

  /** storyteller pressed "next" */
  next() {
    switch (this.phase) {
      case "roles":
      case "dusk":
        return this.startNight();
      case "night":
        return this.resolveNight();
      case "day":
        return this.endDay();
    }
  }

  startNight() {
    if (this.phase === "over" || this.phase === "night") return;
    this.clearTimers();
    this.phase = "night";
    this.round++;
    this.night = { vamp: {}, doktor: null, gozcu: null, suspects: {} };
    this.votes = {};
    this.settleAt = 0;
    this.executed = null;
    this.nightStarted = Date.now();
    this.deadline = this.isAuto()
      ? Date.now() + this.settings.nightSeconds * 1000
      : 0;
    this.narrate(
      `${this.round}. gece. Köy uyusun, herkes gözlerini kapatsın ve telefonuna baksın.`,
    );
    this.pushAll(
      {
        title: "Gece çöktü 🌙",
        body: "Telefonuna bak ve gece seçimini yap.",
        tag: "phase",
      },
      true,
    );
    if (this.isAuto()) {
      const round = this.round;
      this.later(() => {
        if (this.phase === "night" && this.round === round) this.resolveNight();
      }, this.settings.nightSeconds * 1000);
    }
    this.update();
  }

  nightReady() {
    if (this.phase !== "night") return false;
    const living = this.alive();
    const vampsDone = living
      .filter((p) => p.role === "vampir")
      .every((p) => this.night.vamp[p.id]);
    const doctor = living.some((p) => p.role === "doktor");
    const seer = living.some((p) => p.role === "gozcu");
    return (
      vampsDone &&
      (!doctor || !!this.night.doktor) &&
      (!seer || !!this.night.gozcu)
    );
  }

  nightAction(id, targetId) {
    if (this.phase !== "night") return;
    const me = this.player(id);
    const target = this.player(targetId);
    if (!me || !me.alive || !target || !target.alive) return;
    if (me.role === "vampir") {
      if (target.role === "vampir") return;
      this.night.vamp[id] = target.id;
    } else if (me.role === "doktor") {
      if (target.id === this.lastProtected) return;
      this.night.doktor = target.id;
    } else if (me.role === "gozcu") {
      if (this.night.gozcu || target.id === id) return;
      this.night.gozcu = target.id;
      const list = this.seerLog[id] || (this.seerLog[id] = []);
      list.push({
        round: this.round,
        name: target.name,
        vampir: target.role === "vampir",
      });
    } else {
      if (target.id === id) return;
      this.night.suspects[id] = target.id;
    }
    this.update();
    if (this.isAuto() && this.nightReady()) {
      const wait = Math.max(
        1500,
        this.nightStarted + MIN_NIGHT_MS - Date.now(),
      );
      const round = this.round;
      clearTimeout(this.readyTimer);
      this.readyTimer = this.later(() => {
        if (
          this.phase === "night" &&
          this.round === round &&
          this.nightReady()
        ) {
          this.resolveNight();
        }
      }, wait);
    }
  }

  resolveNight() {
    if (this.phase !== "night") return;
    this.clearTimers();
    // the vampires' choice: most votes, ties broken randomly
    const tally = {};
    Object.entries(this.night.vamp).forEach(([vid, t]) => {
      const v = this.player(vid);
      if (v && v.alive) tally[t] = (tally[t] || 0) + 1;
    });
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((t) => tally[t] === max);
    const victim = top.length ? this.player(pick(top)) : null;
    const saved = !!victim && this.night.doktor === victim.id;
    this.lastProtected = this.night.doktor;
    this.lastNight = { round: this.round, died: [], saved };
    if (victim && !saved && victim.alive) {
      victim.alive = false;
      this.lastNight.died.push({ name: victim.name, role: victim.role });
    }
    this.phase = "day";
    this.votes = {};
    this.settleAt = 0;
    let text = `Günaydın köy! ${this.round}. gün başladı. `;
    if (this.lastNight.died.length) {
      const d = this.lastNight.died[0];
      text += `Bu gece ${d.name} vampirlerin kurbanı oldu. O bir ${
        ROLES[d.role].was
      }.`;
    } else if (saved) {
      text +=
        "Vampirler saldırdı ama Doktor kurbanı kurtardı! Bu gece kimse ölmedi.";
    } else {
      text += "Bu gece kimse ölmedi.";
    }
    this.narrate(text);
    this.pushAll({ title: "Gün doğdu ☀️", body: text, tag: "phase" });
    if (this.checkWin()) return;
    this.deadline = this.isAuto()
      ? Date.now() + this.settings.dayMinutes * 60000
      : 0;
    if (this.isAuto()) {
      const round = this.round;
      this.later(() => {
        if (this.phase === "day" && this.round === round) {
          this.narrate("Süre doldu, oylar sayılıyor.");
          this.endDay();
        }
      }, this.settings.dayMinutes * 60000);
    }
    this.update();
  }

  allVoted() {
    return this.alive().every((p) => this.votes[p.id]);
  }

  dayVote(id, target) {
    if (this.phase !== "day") return;
    const me = this.player(id);
    if (!me || !me.alive) return;
    if (target === null || target === undefined || target === "") {
      delete this.votes[id];
    } else if (target === "pass") {
      this.votes[id] = "pass";
    } else {
      const t = this.player(target);
      if (!t || !t.alive) return;
      this.votes[id] = t.id;
    }
    // everybody voted: give a few seconds to change minds, then count
    if (this.isAuto()) {
      clearTimeout(this.settleTimer);
      this.timers.delete(this.settleTimer);
      if (this.allVoted()) {
        this.settleAt = Date.now() + VOTE_SETTLE_MS;
        const round = this.round;
        this.settleTimer = this.later(() => {
          if (this.phase === "day" && this.round === round && this.allVoted()) {
            this.endDay();
          }
        }, VOTE_SETTLE_MS);
      } else {
        this.settleAt = 0;
      }
    }
    this.update();
  }

  endDay() {
    if (this.phase !== "day") return;
    this.clearTimers();
    const tally = {};
    this.alive().forEach((p) => {
      const t = this.votes[p.id];
      if (t) tally[t] = (tally[t] || 0) + 1;
    });
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((t) => tally[t] === max);
    const lines = Object.keys(tally)
      .filter((t) => t !== "pass")
      .sort((a, b) => tally[b] - tally[a])
      .map((t) => `${this.player(t).name}: ${tally[t]}`);
    if (tally.pass) lines.push(`Pas: ${tally.pass}`);
    let text = lines.length ? "Oylar: " + lines.join(", ") + ". " : "";
    this.executed = null;
    if (max > 0 && top.length === 1 && top[0] !== "pass") {
      const p = this.player(top[0]);
      p.alive = false;
      this.executed = { name: p.name, role: p.role };
      text += `Köy kararını verdi: ${p.name} asıldı. O bir ${
        ROLES[p.role].was
      }.`;
    } else if (max > 0 && top.length > 1) {
      text += "Oylar eşit çıktı, bugün kimse asılmadı.";
    } else {
      text += "Bugün kimse asılmadı.";
    }
    this.narrate(text);
    if (this.checkWin()) return;
    this.phase = "dusk";
    this.deadline = 0;
    this.settleAt = 0;
    this.update();
    if (this.isAuto()) this.later(() => this.startNight(), DUSK_MS);
  }

  checkWin() {
    if (this.phase === "over") return true;
    const living = this.alive();
    const vamps = living.filter((p) => p.role === "vampir").length;
    const others = living.length - vamps;
    let winner = null;
    let text = "";
    if (vamps === 0) {
      winner = "koy";
      text = "Bütün vampirler yok edildi. Köylüler kazandı! 🎉";
    } else if (vamps >= others) {
      winner = "vampir";
      text = "Vampirler köyü ele geçirdi. Vampirler kazandı! 🧛";
    }
    if (!winner) return false;
    this.clearTimers();
    this.phase = "over";
    this.winner = winner;
    this.deadline = 0;
    this.narrate(text);
    this.pushAll({ title: "Oyun bitti 🏁", body: text, tag: "phase" });
    this.update();
    return true;
  }

  destroy() {
    this.clearTimers();
    this.io.destroy();
  }
}

module.exports = { Room, ROLES, setupFor, MIN_PLAYERS, MAX_PLAYERS };
