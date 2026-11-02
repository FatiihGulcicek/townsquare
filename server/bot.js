/*
 * Automatic storyteller for Trouble Brewing.
 *
 * The bot sits in a channel as the "host" and speaks the same protocol as a
 * human Storyteller's grimoire: it seats players, hands out characters, runs
 * the nights (collecting choices from the players' phones), computes the
 * information, kills, runs nominations and votes, and decides the winner.
 *
 * Extra messages (all private to one player unless noted):
 *   bot -> player  ["auto", state]        what the player's panel shows
 *   bot -> all     ["narrate", text]      spoken / shown announcement
 *   player -> bot  ["auto", {action,...}] start, answer, nominate, ...
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SRC = path.join(__dirname, "..", "src");
const ROLES = JSON.parse(fs.readFileSync(path.join(SRC, "roles.json"), "utf8"));
let TR = {};
try {
  TR = JSON.parse(
    fs.readFileSync(path.join(SRC, "locales", "roles.tr.json"), "utf8"),
  );
} catch (e) {
  // English names as a fallback
}
const BY_ID = new Map(ROLES.map((r) => [r.id, r]));
const roleName = (id) =>
  (TR[id] && TR[id].name) || (BY_ID.get(id) || {}).name || id;

const TOWNSFOLK = [
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortuneteller",
  "undertaker",
  "monk",
  "ravenkeeper",
  "virgin",
  "slayer",
  "soldier",
  "mayor",
];
const OUTSIDERS = ["butler", "drunk", "recluse", "saint"];
const MINIONS = ["poisoner", "spy", "scarletwoman", "baron"];
const DEMONS = ["imp"];
const TEAM = {};
TOWNSFOLK.forEach((id) => (TEAM[id] = "townsfolk"));
OUTSIDERS.forEach((id) => (TEAM[id] = "outsider"));
MINIONS.forEach((id) => (TEAM[id] = "minion"));
DEMONS.forEach((id) => (TEAM[id] = "demon"));
const isEvil = (id) => TEAM[id] === "minion" || TEAM[id] === "demon";

// townsfolk, outsiders, minions, demons
const SETUP = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};
const MIN_PLAYERS = 5;
const MAX_PLAYERS = 15;
const DEFENSE_MS = 20000;
const MIN_NIGHT_MS = 15000;

const SETTINGS = {
  dayMinutes: [3, 5, 8, 12, 20],
  choiceSeconds: [30, 60, 90, 180],
  votingSpeed: [1000, 1500, 2500],
};

const rnd = (n) => (n > 0 ? crypto.randomInt(n) : 0);
const pick = (list) => list[rnd(list.length)];
const chance = (p) => Math.random() < p;
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const listNames = (names) =>
  names.length <= 1
    ? names.join("")
    : names.slice(0, -1).join(", ") + " ve " + names[names.length - 1];

class AutoGame {
  /**
   * @param channel channel name
   * @param io {broadcast(str), sendTo(id,str), isConnected(id),
   *            connectedIds(), push(ids, payload), destroy()}
   */
  constructor(channel, io) {
    this.channel = channel;
    this.io = io;
    this.seats = [];
    this.ownerId = null;
    this.kicked = new Set();
    this.settings = { dayMinutes: 8, choiceSeconds: 60, votingSpeed: 1500 };
    this.log = [];
    this.promptSeq = 0;
    this.timers = new Set();
    this.lastActivity = Date.now();
    this.createdAt = Date.now();
    this.resetGame();
    this.tickTimer = setInterval(() => this.tick(), 30000);
  }

  // ---------- plumbing ----------

  later(fn, ms) {
    const handle = setTimeout(() => {
      this.timers.delete(handle);
      try {
        fn();
      } catch (e) {
        console.log("auto storyteller error", e);
      }
    }, ms);
    this.timers.add(handle);
    return handle;
  }

  clearTimers() {
    this.timers.forEach((h) => clearTimeout(h));
    this.timers.clear();
  }

  send(command, params) {
    this.io.broadcast(JSON.stringify([command, params]));
  }

  sendTo(id, command, params) {
    this.io.sendTo(id, JSON.stringify([command, params]));
  }

  narrate(text) {
    this.log.push({ at: Date.now(), text });
    if (this.log.length > 40) this.log.shift();
    this.send("narrate", text);
  }

  seatOf(id) {
    return this.seats.findIndex((s) => s.id === id);
  }

  name(i) {
    return (this.seats[i] && this.seats[i].name) || "?";
  }

  alive() {
    return this.seats.map((s, i) => i).filter((i) => this.seats[i].alive);
  }

  owner() {
    const seated = (id) => this.seats.some((s) => s.id === id);
    if (
      this.ownerId &&
      seated(this.ownerId) &&
      this.io.isConnected(this.ownerId)
    ) {
      return this.ownerId;
    }
    const s = this.seats.find((seat) => this.io.isConnected(seat.id));
    if (s && !(this.ownerId && seated(this.ownerId))) this.ownerId = s.id;
    return s ? s.id : this.ownerId;
  }

  gamestate() {
    return this.seats.map((s) => ({
      name: s.name,
      id: s.id,
      isDead: !s.alive,
      isVoteless: !s.alive && !s.ghost,
      pronouns: "",
    }));
  }

  fullGamestate() {
    return {
      gamestate: this.gamestate(),
      isNight: this.phase === "night",
      isVoteHistoryAllowed: true,
      nomination: this.nomination || false,
      votingSpeed: this.settings.votingSpeed,
      lockedVote: this.lockedVote,
      isVoteInProgress: this.isVoteInProgress,
      markedPlayer: -1,
      fabled: [],
      ...(this.nomination ? { votes: this.votes } : {}),
    };
  }

  broadcastSeats() {
    this.send("gs", { gamestate: this.gamestate(), isLightweight: true });
  }

  sendRole(i) {
    const s = this.seats[i];
    if (!s) return;
    this.sendTo(s.id, "player", {
      index: i,
      property: "role",
      value: s.shown || "",
    });
  }

  /** everything a (re)connecting player needs */
  resync(id) {
    this.sendTo(id, "edition", { edition: { id: "tb" } });
    this.sendTo(id, "gs", this.fullGamestate());
    if (this.phase === "over") {
      this.seats.forEach((s, i) =>
        this.sendTo(id, "player", {
          index: i,
          property: "role",
          value: s.role,
        }),
      );
    } else {
      const i = this.seatOf(id);
      if (i >= 0 && this.seats[i].shown) this.sendRole(i);
    }
    this.sendState(id);
  }

  update() {
    if (this.updateQueued) return;
    this.updateQueued = true;
    setImmediate(() => {
      this.updateQueued = false;
      this.io.connectedIds().forEach((id) => this.sendState(id));
    });
  }

  publicPrompt(p) {
    return {
      id: p.id,
      kind: p.kind,
      title: p.title,
      text: p.text,
      role: p.role || null,
      count: p.count || 0,
      alive: !!p.alive,
      self: !!p.self,
      required: !!p.required,
      remaining: p.deadline ? Math.max(0, p.deadline - Date.now()) : 0,
      players: p.players || [],
      roles: p.roles || [],
      lines: p.lines || [],
    };
  }

  sendState(id) {
    const i = this.seatOf(id);
    const s = this.seats[i];
    const n = this.seats.length;
    const list = this.prompts.get(id) || [];
    const living = this.alive().length;
    const day = this.phase === "day";
    const free = day && !this.nomination;
    const owner = this.owner();
    const ownerSeat = this.seatOf(owner);
    this.sendTo(id, "auto", {
      active: true,
      phase: this.phase,
      day: this.day,
      night: this.night,
      seated: i >= 0,
      seat: i,
      alive: s ? s.alive : false,
      isOwner: owner === id,
      ownerName: ownerSeat >= 0 ? this.seats[ownerSeat].name : "",
      count: n,
      min: MIN_PLAYERS,
      max: MAX_PLAYERS,
      setup: SETUP[n] || null,
      settings: this.settings,
      prompt: list.length ? this.publicPrompt(list[0]) : null,
      pending: list.length,
      dayRemaining: day ? Math.max(0, this.dayEndsAt - Date.now()) : 0,
      ready: this.ready.size,
      readyNeeded: Math.floor(living / 2) + 1,
      iAmReady: this.ready.has(id),
      canNominate: free && !!s && s.alive && !this.nominators.has(i),
      nominees: [...this.nominees],
      block: this.block,
      voting: !!this.nomination,
      canSlay: free && !!s && s.alive && !this.slayAttempts.has(id),
      winner: this.winner,
      reason: this.reason,
      reveal:
        this.phase === "over"
          ? this.seats.map((seat) => ({
              name: seat.name,
              role: seat.role,
              shown: seat.shown,
              alive: seat.alive,
            }))
          : null,
      log: this.log.slice(-8).map((l) => l.text),
    });
  }

  tick() {
    const ids = this.io.connectedIds();
    if (ids.length) {
      this.lastActivity = Date.now();
      this.send("ping", [ids.length, 0]);
    }
    const idle = Date.now() - this.lastActivity;
    if (
      idle > 15 * 60 * 1000 ||
      Date.now() - this.createdAt > 12 * 3600 * 1000
    ) {
      this.destroy();
    }
  }

  destroy() {
    this.clearTimers();
    clearInterval(this.tickTimer);
    this.io.destroy();
  }

  // ---------- incoming ----------

  receive(data, ws) {
    let command, params;
    try {
      [command, params] = JSON.parse(data);
    } catch (e) {
      return;
    }
    const id = ws && ws.playerId;
    if (!id || id === "host") return;
    this.lastActivity = Date.now();
    switch (command) {
      case "getGamestate":
        this.resync(id);
        break;
      case "join":
        this.join(id, Array.isArray(params) ? params[1] : "");
        break;
      case "bye":
        this.leave(id);
        break;
      case "vote":
        this.onVote(id, params);
        break;
      case "auto":
        if (params && typeof params === "object") this.onAction(id, params);
        break;
    }
  }

  join(id, name) {
    name = typeof name === "string" ? name.trim().slice(0, 30) : "";
    if (this.seatOf(id) >= 0 || !name || this.kicked.has(id)) {
      this.resync(id);
      return;
    }
    if (this.phase !== "lobby" || this.seats.length >= MAX_PLAYERS) {
      this.resync(id);
      return;
    }
    const norm = (v) => v.toLocaleLowerCase("tr");
    let seatName = name;
    let suffix = 2;
    while (this.seats.some((s) => norm(s.name) === norm(seatName))) {
      seatName = `${name} (${suffix++})`;
    }
    this.seats.push(this.newSeat(id, seatName));
    if (!this.ownerId) this.ownerId = id;
    this.broadcastSeats();
    this.resync(id);
    this.update();
  }

  newSeat(id, name) {
    return { id, name, role: null, shown: null, alive: true, ghost: true };
  }

  leave(id) {
    const i = this.seatOf(id);
    if (i < 0 || this.phase !== "lobby") return;
    this.removeSeat(i);
  }

  removeSeat(i) {
    const [seat] = this.seats.splice(i, 1);
    if (seat && seat.id === this.ownerId) {
      this.ownerId = this.seats.length ? this.seats[0].id : null;
    }
    this.broadcastSeats();
    this.update();
  }

  onAction(id, a) {
    const isOwner = this.owner() === id;
    const i = this.seatOf(id);
    switch (a.action) {
      case "start":
        if (isOwner && this.phase === "lobby") this.startGame();
        break;
      case "settings":
        if (!isOwner || this.phase !== "lobby") break;
        Object.keys(SETTINGS).forEach((key) => {
          const value = parseInt(a[key], 10);
          if (SETTINGS[key].includes(value)) this.settings[key] = value;
        });
        this.update();
        break;
      case "kick": {
        const target = parseInt(a.target, 10);
        const seat = this.seats[target];
        if (!isOwner || this.phase !== "lobby" || !seat || seat.id === id)
          break;
        this.kicked.add(seat.id);
        this.removeSeat(target);
        break;
      }
      case "shuffle":
        if (!isOwner || this.phase !== "lobby") break;
        this.seats = shuffle(this.seats);
        this.broadcastSeats();
        this.narrate("Oturma düzeni karıştırıldı.");
        this.update();
        break;
      case "answer":
        this.onAnswer(id, a);
        break;
      case "ack":
        this.onAck(id, a);
        break;
      case "nominate":
        this.nominate(i, parseInt(a.target, 10));
        break;
      case "slay":
        this.slay(i, parseInt(a.target, 10));
        break;
      case "ready":
        this.setReady(id, i, !!a.value);
        break;
      case "endDay":
        if (isOwner && this.phase === "day" && !this.nomination) this.endDay();
        break;
      case "newGame":
        if (isOwner && this.phase === "over") this.newGame();
        break;
    }
  }

  // ---------- prompts ----------

  resetGame() {
    this.clearTimers();
    this.phase = "lobby";
    this.day = 0;
    this.night = 0;
    this.prompts = new Map();
    this.winner = null;
    this.reason = "";
    this.nomination = null;
    this.votes = [];
    this.lockedVote = 0;
    this.isVoteInProgress = false;
    this.block = null;
    this.nominators = new Set();
    this.nominees = new Set();
    this.ready = new Set();
    this.slayAttempts = new Set();
    this.dayEndsAt = 0;
    this.poisoned = -1;
    this.protected = -1;
    this.redHerring = -1;
    this.bluffs = [];
    this.lastExecuted = -1;
    this.virginUsed = false;
    this.butlerMaster = -1;
    this.nightChoices = {};
    this.nightDeaths = [];
    this.nightStage = null;
    this.endAfterVote = false;
    this.seats.forEach((s) => {
      s.role = null;
      s.shown = null;
      s.alive = true;
      s.ghost = true;
    });
  }

  addPrompt(i, prompt) {
    const seat = this.seats[i];
    if (!seat) return null;
    prompt.id = ++this.promptSeq;
    prompt.seat = i;
    const list = this.prompts.get(seat.id) || [];
    list.push(prompt);
    this.prompts.set(seat.id, list);
    if (!prompt.silent) {
      this.io.push(
        [seat.id],
        prompt.kind === "choose"
          ? {
              title: "Sıra sende 🌙",
              body: "Seçimini yapmak için dokun.",
              tag: "prompt",
            }
          : {
              title: "Yeni bilgin var 📜",
              body: "Anlatıcının sana söylediklerini görmek için dokun.",
              tag: "prompt",
            },
      );
    }
    this.update();
    return prompt;
  }

  info(i, title, text, extra = {}) {
    return this.addPrompt(i, { kind: "info", title, text, ...extra });
  }

  removePrompt(id, promptId) {
    const list = this.prompts.get(id) || [];
    const index = list.findIndex((p) => p.id === promptId);
    if (index < 0) return null;
    const [p] = list.splice(index, 1);
    return p;
  }

  pendingChoices(required = true) {
    const out = [];
    this.prompts.forEach((list) =>
      list.forEach((p) => {
        if (p.kind === "choose" && (!required || p.required)) out.push(p);
      }),
    );
    return out;
  }

  validTargets(p) {
    return this.seats
      .map((s, i) => i)
      .filter(
        (i) => (!p.alive || this.seats[i].alive) && (p.self || i !== p.seat),
      );
  }

  onAnswer(id, a) {
    const list = this.prompts.get(id) || [];
    const p = list.find((x) => x.id === a.promptId);
    if (!p || p.kind !== "choose") return;
    const targets = Array.isArray(a.targets)
      ? [...new Set(a.targets.map((t) => parseInt(t, 10)))]
      : [];
    const valid = this.validTargets(p);
    if (targets.length !== p.count || targets.some((t) => !valid.includes(t))) {
      return;
    }
    this.removePrompt(id, p.id);
    this.choose(p, targets);
  }

  onAck(id, a) {
    const list = this.prompts.get(id) || [];
    const p = list.find((x) => x.id === a.promptId);
    if (!p) return;
    if (p.kind === "choose" && p.required) return;
    this.removePrompt(id, p.id);
    this.update();
  }

  /** a choice was made (by the player or randomly on timeout) */
  choose(p, targets) {
    if (p.key && p.key !== "none") {
      this.nightChoices[p.key] = { seat: p.seat, targets };
    }
    if (p.key === "ravenkeeper") this.ravenkeeperInfo(p.seat, targets[0]);
    this.update();
    this.checkNightProgress();
  }

  timeoutChoices(stage) {
    if (this.phase !== "night" || this.nightStage !== stage) return;
    this.prompts.forEach((list, id) => {
      list.slice().forEach((p) => {
        if (p.kind !== "choose") return;
        this.removePrompt(id, p.id);
        if (p.required) {
          const targets = shuffle(this.validTargets(p)).slice(0, p.count);
          if (targets.length === p.count) {
            this.info(
              p.seat,
              p.title,
              "Süren doldu, seçimini senin yerine rastgele yaptım: " +
                listNames(targets.map((t) => this.name(t))) +
                ".",
              { silent: true },
            );
            this.choose(p, targets);
          }
        }
      });
    });
    this.update();
    this.checkNightProgress();
  }

  // ---------- setup ----------

  startGame() {
    const n = this.seats.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) return;
    this.resetGame();
    let [townsfolk, outsiders, minions] = SETUP[n];
    const minionRoles = shuffle(MINIONS).slice(0, minions);
    if (minionRoles.includes("baron")) {
      townsfolk -= 2;
      outsiders += 2;
    }
    const outsiderRoles = shuffle(OUTSIDERS).slice(0, outsiders);
    const townsfolkRoles = shuffle(TOWNSFOLK).slice(0, townsfolk);
    const bag = shuffle([
      ...townsfolkRoles,
      ...outsiderRoles,
      ...minionRoles,
      ...DEMONS,
    ]);
    const unused = TOWNSFOLK.filter((r) => !townsfolkRoles.includes(r));
    const drunkAs = pick(unused);
    this.seats.forEach((s, i) => {
      s.role = bag[i];
      s.shown = s.role === "drunk" ? drunkAs : s.role;
      s.alive = true;
      s.ghost = true;
    });
    const good = this.seats
      .map((s, i) => i)
      .filter((i) => !isEvil(this.seats[i].role));
    this.redHerring = pick(good);
    // demon bluffs: good characters that are not in play
    const notInPlay = [...TOWNSFOLK, ...OUTSIDERS].filter(
      (r) => !bag.includes(r) && r !== drunkAs,
    );
    this.bluffs = shuffle(notInPlay).slice(0, 3);
    this.phase = "setup";
    this.send("clearVoteHistory");
    this.seats.forEach((s, i) => this.sendRole(i));
    this.broadcastSeats();
    this.narrate(
      "Oyun başlıyor! Herkes karakterine baksın ve kimseye göstermesin. Birazdan gece çökecek.",
    );
    this.io.push(
      this.seats.map((s) => s.id),
      {
        title: "Oyun başladı 🎭",
        body: "Karakterin geldi, bakmak için dokun.",
        tag: "role",
      },
    );
    this.update();
    this.later(() => this.startNight(), 12000);
  }

  newGame() {
    this.resetGame();
    this.kicked.clear();
    this.seats.forEach((s, i) =>
      this.send("player", { index: i, property: "role", value: "" }),
    );
    this.send("isNight", false);
    this.send("clearVoteHistory");
    this.broadcastSeats();
    this.narrate("Yeni oyun için bekleme odasındayız.");
    this.update();
  }

  // ---------- registration helpers ----------

  sober(i) {
    const s = this.seats[i];
    return !!s && s.role === s.shown && i !== this.poisoned;
  }

  registersEvil(i) {
    const r = this.seats[i].role;
    if (r === "spy") return !chance(0.3);
    if (r === "recluse") return chance(0.4);
    return isEvil(r);
  }

  registersDemon(i) {
    const r = this.seats[i].role;
    if (r === "recluse") return chance(0.4);
    return r === "imp";
  }

  /** character a role-learning ability sees (Spy / Recluse may misregister) */
  registeredRole(i) {
    const r = this.seats[i].role;
    if (r === "spy" && chance(0.3)) return pick(TOWNSFOLK);
    if (r === "recluse" && chance(0.4)) return pick([...MINIONS, ...DEMONS]);
    return r;
  }

  othersThan(i, ...more) {
    return this.seats
      .map((s, k) => k)
      .filter((k) => k !== i && !more.includes(k));
  }

  // ---------- night ----------

  startNight() {
    if (this.phase === "over") return;
    this.phase = "night";
    this.night++;
    this.poisoned = -1;
    this.protected = -1;
    this.nightChoices = {};
    this.nightDeaths = [];
    this.nomination = null;
    this.isVoteInProgress = false;
    this.ready.clear();
    // unanswered choices from earlier are dropped, information stays
    this.prompts.forEach((list, id) =>
      this.prompts.set(
        id,
        list.filter((p) => p.kind !== "choose"),
      ),
    );
    this.send("isNight", true);
    this.narrate(
      `${this.night}. gece. Kasaba uyusun, herkes gözlerini kapatsın. Telefonuna bak ve seçimini yap.`,
    );
    this.io.push(
      this.seats.filter((s) => s.alive).map((s) => s.id),
      {
        title: "Gece çöktü 🌙",
        body: "Telefonuna bak: gece seçimini yap.",
        tag: "phase",
      },
    );
    const first = this.night === 1;
    if (first && this.seats.length >= 7) this.evilInfo();
    const deadline = Date.now() + this.settings.choiceSeconds * 1000;
    this.seats.forEach((s, i) => {
      if (!s.alive) return;
      const r = s.shown;
      let p = null;
      if (r === "poisoner") {
        p = {
          key: "poisoner",
          count: 1,
          alive: true,
          self: true,
          text: "Bu gece zehirlemek istediğin oyuncuyu seç. Zehirlenen oyuncunun yeteneği yarın akşama kadar çalışmaz.",
        };
      } else if (r === "monk" && !first) {
        p = {
          key: "monk",
          count: 1,
          alive: true,
          self: false,
          text: "Bu gece İblis'e karşı korumak istediğin oyuncuyu seç (kendin hariç).",
        };
      } else if (r === "imp" && !first) {
        p = {
          key: "imp",
          count: 1,
          alive: true,
          self: true,
          text: "Bu gece öldürmek istediğin oyuncuyu seç. Kendini seçersen ölürsün ve yaşayan bir Yandaş yeni İmp olur.",
        };
      } else if (r === "fortuneteller") {
        p = {
          key: "fortuneteller",
          count: 2,
          alive: false,
          self: true,
          text: "İki oyuncu seç: aralarında İblis olup olmadığını öğreneceksin.",
        };
      } else if (r === "butler") {
        p = {
          key: "butler",
          count: 1,
          alive: true,
          self: false,
          text: "Efendini seç (kendin hariç). Yarın yalnızca efendin el kaldırırsa sen de oy verebilirsin.",
        };
      }
      if (p) {
        p.required = true;
      } else {
        p = {
          key: "none",
          count: 1,
          alive: true,
          self: false,
          required: false,
          text: "Bu gece yeteneğin seni uyandırmıyor. Kimse anlamasın diye sen de şüphelendiğin bir oyuncuyu seç; bunun hiçbir etkisi yok.",
        };
      }
      this.addPrompt(i, {
        kind: "choose",
        title: `${this.night}. Gece`,
        role: s.shown,
        deadline,
        silent: true,
        ...p,
      });
    });
    this.nightStage = "choices";
    this.nightStarted = Date.now();
    this.later(
      () => this.timeoutChoices("choices"),
      this.settings.choiceSeconds * 1000,
    );
    this.update();
    this.checkNightProgress();
  }

  evilInfo() {
    const demon = this.seats.findIndex((s) => s.role === "imp");
    const minions = this.seats
      .map((s, i) => i)
      .filter((i) => TEAM[this.seats[i].role] === "minion");
    minions.forEach((i) => {
      const others = minions.filter((k) => k !== i);
      this.info(
        i,
        "Kötü takım",
        `İblis: ${this.name(demon)}.` +
          (others.length
            ? ` Diğer Yandaşlar: ${listNames(others.map((k) => this.name(k)))}.`
            : " Başka Yandaş yok."),
        { players: [demon, ...others], roles: ["imp"], silent: true },
      );
    });
    if (demon >= 0) {
      this.info(
        demon,
        "Kötü takım",
        `Yandaşların: ${listNames(
          minions.map((k) => this.name(k)),
        )}. Oyunda olmayan üç iyi karakter (blöf yapabilirsin): ${listNames(
          this.bluffs.map(roleName),
        )}.`,
        { players: minions, roles: this.bluffs, silent: true },
      );
    }
  }

  checkNightProgress() {
    if (this.phase !== "night") return;
    if (this.pendingChoices(true).length) return;
    if (this.nightStage === "choices") {
      this.nightStage = "resolving";
      const wait = Math.max(0, this.nightStarted + MIN_NIGHT_MS - Date.now());
      this.later(() => this.resolveNight(), wait);
    } else if (this.nightStage === "raven") {
      this.nightStage = "resolving";
      this.later(() => this.finishNight(), 1500);
    }
  }

  resolveNight() {
    if (this.phase !== "night") return;
    // dummy prompts nobody answered
    this.prompts.forEach((list, id) =>
      this.prompts.set(
        id,
        list.filter((p) => p.kind !== "choose"),
      ),
    );
    const c = this.nightChoices;
    const first = this.night === 1;
    if (c.poisoner && this.seats[c.poisoner.seat].role === "poisoner") {
      this.poisoned = c.poisoner.targets[0];
    }
    if (
      c.monk &&
      this.sober(c.monk.seat) &&
      this.seats[c.monk.seat].role === "monk"
    ) {
      this.protected = c.monk.targets[0];
    }
    if (c.butler) this.butlerMaster = c.butler.targets[0];
    if (
      !first &&
      c.imp &&
      this.seats[c.imp.seat].role === "imp" &&
      c.imp.seat !== this.poisoned
    ) {
      this.impKill(c.imp.seat, c.imp.targets[0]);
    }
    const raven = this.nightDeaths.find(
      (i) => this.seats[i].shown === "ravenkeeper",
    );
    if (raven !== undefined) {
      this.nightStage = "raven";
      this.addPrompt(raven, {
        kind: "choose",
        key: "ravenkeeper",
        title: `${this.night}. Gece`,
        role: "ravenkeeper",
        count: 1,
        alive: false,
        self: true,
        required: true,
        deadline: Date.now() + this.settings.choiceSeconds * 1000,
        text: "Bu gece öldün! Bir oyuncu seç ve onun karakterini öğren.",
      });
      this.later(
        () => this.timeoutChoices("raven"),
        this.settings.choiceSeconds * 1000,
      );
      this.update();
      return;
    }
    this.finishNight();
  }

  impKill(imp, t) {
    const target = this.seats[t];
    if (!target || !target.alive) return;
    if (t === imp) {
      // star pass
      this.killAtNight(t);
      const minions = this.alive().filter(
        (i) => TEAM[this.seats[i].role] === "minion",
      );
      if (minions.length) {
        const sw = minions.find((i) => this.seats[i].role === "scarletwoman");
        this.becomeImp(
          sw !== undefined ? sw : pick(minions),
          "Bu gece İmp kendini öldürdü. Artık İmp sensin! Yarından itibaren geceleri sen öldüreceksin.",
        );
      }
      return;
    }
    if (t === this.protected) return;
    if (target.role === "soldier" && t !== this.poisoned) return;
    if (target.role === "mayor" && t !== this.poisoned && chance(0.6)) {
      const others = this.alive().filter(
        (i) =>
          i !== t &&
          i !== imp &&
          i !== this.protected &&
          !(this.seats[i].role === "soldier" && i !== this.poisoned),
      );
      if (others.length && chance(0.5)) this.killAtNight(pick(others));
      return;
    }
    this.killAtNight(t);
  }

  killAtNight(i) {
    this.seats[i].alive = false;
    this.nightDeaths.push(i);
  }

  becomeImp(i, text) {
    const s = this.seats[i];
    s.role = "imp";
    s.shown = "imp";
    this.sendRole(i);
    this.info(i, "Yeni İblis", text, { roles: ["imp"] });
  }

  /** the Demon died: maybe the Scarlet Woman takes over */
  demonDied(aliveBefore) {
    if (aliveBefore < 5) return false;
    const sw = this.alive().find(
      (i) => this.seats[i].role === "scarletwoman" && i !== this.poisoned,
    );
    if (sw === undefined) return false;
    this.becomeImp(
      sw,
      "İblis öldü. Kızıl Kadın olarak artık İmp sensin! Geceleri sen öldüreceksin.",
    );
    return true;
  }

  finishNight() {
    if (this.phase !== "night") return;
    const first = this.night === 1;
    this.alive().forEach((i) => {
      const r = this.seats[i].shown;
      const ok = this.sober(i);
      if (first && r === "washerwoman") this.roleInfo(i, ok, "townsfolk");
      if (first && r === "librarian") this.roleInfo(i, ok, "outsider");
      if (first && r === "investigator") this.roleInfo(i, ok, "minion");
      if (first && r === "chef") this.chefInfo(i, ok);
      if (r === "empath") this.empathInfo(i, ok);
      if (r === "fortuneteller") this.fortuneInfo(i, ok);
      if (!first && r === "undertaker" && this.lastExecuted >= 0) {
        this.undertakerInfo(i, ok);
      }
      if (this.seats[i].role === "spy") this.spyInfo(i);
    });
    this.nightStage = null;
    this.dawn();
  }

  roleInfo(i, ok, team) {
    const title = roleName(this.seats[i].shown);
    const pool = { townsfolk: TOWNSFOLK, outsider: OUTSIDERS, minion: MINIONS }[
      team
    ];
    let target = -1;
    let role = null;
    if (ok) {
      const candidates = this.othersThan(i).filter(
        (k) => TEAM[this.seats[k].role] === team,
      );
      // the Spy / Recluse may register as something else
      this.othersThan(i).forEach((k) => {
        const r = this.seats[k].role;
        if (r === "spy" && team !== "minion" && chance(0.25))
          candidates.push(k);
        if (r === "recluse" && team === "minion" && chance(0.4))
          candidates.push(k);
      });
      if (!candidates.length) {
        this.info(
          i,
          title,
          team === "outsider"
            ? "Oyunda hiç Yabancı yok."
            : "Bu bilgiyi gösterecek oyuncu yok.",
          { role: this.seats[i].shown },
        );
        return;
      }
      target = pick(candidates);
      const real = this.seats[target].role;
      role =
        TEAM[real] === team
          ? real
          : pick(pool.filter((r) => r !== this.seats[i].shown));
    } else {
      if (team === "outsider" && chance(0.2)) {
        this.info(i, title, "Oyunda hiç Yabancı yok.", {
          role: this.seats[i].shown,
        });
        return;
      }
      target = pick(this.othersThan(i));
      role = pick(pool.filter((r) => r !== this.seats[i].shown));
    }
    const other = pick(this.othersThan(i, target));
    const shown = shuffle([target, other]);
    this.info(
      i,
      title,
      `${this.name(shown[0])} ya da ${this.name(
        shown[1],
      )}: bu ikisinden biri ${roleName(role)}.`,
      { players: shown, roles: [role], role: this.seats[i].shown },
    );
  }

  chefInfo(i, ok) {
    const n = this.seats.length;
    const evil = this.seats.map((s, k) => this.registersEvil(k));
    let pairs = 0;
    for (let k = 0; k < n; k++) if (evil[k] && evil[(k + 1) % n]) pairs++;
    if (!ok) pairs = (pairs + 1 + rnd(2)) % 3;
    this.info(
      i,
      roleName("chef"),
      `Yan yana oturan kötü oyuncu çifti sayısı: ${pairs}.`,
      { role: this.seats[i].shown },
    );
  }

  neighbours(i) {
    const n = this.seats.length;
    const result = [];
    for (let k = 1; k < n; k++) {
      const left = (i - k + n) % n;
      if (this.seats[left].alive && left !== i) {
        result.push(left);
        break;
      }
    }
    for (let k = 1; k < n; k++) {
      const right = (i + k) % n;
      if (this.seats[right].alive && right !== i && !result.includes(right)) {
        result.push(right);
        break;
      }
    }
    return result;
  }

  empathInfo(i, ok) {
    const near = this.neighbours(i);
    let count = near.filter((k) => this.registersEvil(k)).length;
    if (!ok) count = (count + 1 + rnd(near.length || 1)) % (near.length + 1);
    this.info(
      i,
      roleName("empath"),
      `Yaşayan komşuların (${listNames(
        near.map((k) => this.name(k)),
      )}) arasında ${count} kötü oyuncu var.`,
      { players: near, role: this.seats[i].shown },
    );
  }

  fortuneInfo(i, ok) {
    const choice = this.nightChoices.fortuneteller;
    const targets =
      choice && choice.seat === i
        ? choice.targets
        : shuffle(this.seats.map((s, k) => k)).slice(0, 2);
    let yes = targets.some(
      (k) => this.registersDemon(k) || k === this.redHerring,
    );
    if (!ok) yes = !yes;
    this.info(
      i,
      roleName("fortuneteller"),
      `${listNames(targets.map((k) => this.name(k)))}: aralarında İblis ${
        yes ? "VAR" : "YOK"
      }.`,
      { players: targets, role: this.seats[i].shown },
    );
  }

  undertakerInfo(i, ok) {
    const t = this.lastExecuted;
    const role = ok
      ? this.registeredRole(t)
      : pick([...TOWNSFOLK, ...OUTSIDERS, ...MINIONS, ...DEMONS]);
    this.info(
      i,
      roleName("undertaker"),
      `Bugün idam edilen ${this.name(t)} oyuncusunun karakteri: ${roleName(
        role,
      )}.`,
      { players: [t], roles: [role], role: this.seats[i].shown },
    );
  }

  ravenkeeperInfo(i, t) {
    const ok = this.seats[i].role === "ravenkeeper" && i !== this.poisoned;
    const role = ok
      ? this.registeredRole(t)
      : pick([...TOWNSFOLK, ...OUTSIDERS, ...MINIONS, ...DEMONS]);
    this.info(
      i,
      roleName("ravenkeeper"),
      `${this.name(t)} oyuncusunun karakteri: ${roleName(role)}.`,
      { players: [t], roles: [role], role: this.seats[i].shown },
    );
  }

  spyInfo(i) {
    const lines = this.seats.map((s, k) => {
      let line = `${s.name}: ${roleName(s.role)}`;
      if (s.role === "drunk") line += ` (kendini ${roleName(s.shown)} sanıyor)`;
      if (k === this.poisoned) line += " — zehirli";
      if (!s.alive) line += " — ölü";
      return line;
    });
    this.info(i, roleName("spy"), "Büyü kitabına göz attın:", {
      lines,
      role: "spy",
    });
  }

  dawn() {
    const deaths = this.nightDeaths;
    this.send("isNight", false);
    this.broadcastSeats();
    let text = `Günaydın kasaba! ${this.night}. gün başladı. `;
    if (deaths.length) {
      text +=
        listNames(deaths.map((k) => this.name(k))) +
        (deaths.length > 1 ? " bu gece öldüler." : " bu gece öldü.");
    } else {
      text += "Bu gece kimse ölmedi.";
    }
    this.narrate(text);
    this.io.push(
      this.seats.map((s) => s.id),
      { title: "Gün doğdu ☀️", body: text, tag: "phase" },
    );
    if (this.checkWin()) return;
    this.startDay();
  }

  // ---------- day ----------

  startDay() {
    this.phase = "day";
    this.day = this.night;
    this.nominators.clear();
    this.nominees.clear();
    this.block = null;
    this.ready.clear();
    this.lastExecuted = -1;
    this.endAfterVote = false;
    this.dayEndsAt = Date.now() + this.settings.dayMinutes * 60000;
    const day = this.day;
    this.later(() => {
      if (this.phase !== "day" || this.day !== day) return;
      if (this.nomination) this.endAfterVote = true;
      else {
        this.narrate("Gün için ayrılan süre doldu.");
        this.endDay();
      }
    }, this.settings.dayMinutes * 60000);
    this.update();
  }

  nominate(i, t) {
    if (this.phase !== "day" || this.nomination) return;
    const s = this.seats[i];
    const target = this.seats[t];
    if (
      !s ||
      !s.alive ||
      !target ||
      this.nominators.has(i) ||
      this.nominees.has(t)
    ) {
      return;
    }
    this.nominators.add(i);
    this.nominees.add(t);
    // Virgin: a Townsfolk nominating her is executed immediately
    if (target.role === "virgin" && !this.virginUsed && t !== this.poisoned) {
      this.virginUsed = true;
      if (TEAM[s.role] === "townsfolk") {
        this.narrate(
          `${s.name}, ${target.name} adlı oyuncuyu aday gösterdi... ve anında idam edildi!`,
        );
        s.alive = false;
        this.lastExecuted = i;
        this.broadcastSeats();
        if (this.checkWin()) return;
        this.phase = "dusk";
        this.update();
        this.later(() => this.startNight(), 6000);
        return;
      }
    }
    this.nomination = [i, t];
    this.votes = this.seats.map(() => false);
    this.lockedVote = 0;
    this.isVoteInProgress = false;
    this.send("votingSpeed", this.settings.votingSpeed);
    this.send("nomination", [i, t]);
    this.narrate(
      `${s.name}, ${target.name} adlı oyuncuyu aday gösterdi. ${Math.round(
        DEFENSE_MS / 1000,
      )} saniye sonra oylama başlıyor; oy vermek istiyorsan elini kaldır.`,
    );
    this.io.push(
      this.seats.map((x) => x.id),
      {
        title: "Aday gösterildi ⚖️",
        body: `${s.name}, ${target.name} adlı oyuncuyu aday gösterdi. Oy vermek için dön.`,
        tag: "vote",
      },
    );
    this.update();
    this.later(() => this.startVoteClock(), DEFENSE_MS);
  }

  startVoteClock() {
    if (!this.nomination) return;
    const n = this.seats.length;
    const nominee = this.nomination[1];
    this.isVoteInProgress = true;
    this.send("isVoteInProgress", true);
    this.lockedVote = 1;
    this.send("lock", [1, !!this.votes[nominee]]);
    const step = () => {
      if (!this.nomination) return;
      this.lockedVote++;
      const index = (nominee + this.lockedVote - 1) % n;
      // Butler: may only vote if the master votes too
      const seat = this.seats[index];
      if (
        this.votes[index] &&
        seat.role === "butler" &&
        index !== this.poisoned &&
        this.butlerMaster >= 0 &&
        !this.votes[this.butlerMaster]
      ) {
        this.votes[index] = false;
      }
      this.send("lock", [this.lockedVote, !!this.votes[index]]);
      if (this.lockedVote > n) {
        this.finishVote();
      } else {
        this.later(step, this.settings.votingSpeed);
      }
    };
    this.later(step, this.settings.votingSpeed);
    this.update();
  }

  onVote(id, params) {
    if (!this.nomination || !Array.isArray(params)) return;
    const [index, vote] = params;
    const seat = this.seats[index];
    if (!seat || seat.id !== id) return;
    const n = this.seats.length;
    const adjusted = (index - 1 + n - this.nomination[1]) % n;
    if (this.lockedVote > 0 && adjusted < this.lockedVote - 1) return;
    this.votes[index] = !!vote && (seat.alive || seat.ghost);
  }

  finishVote() {
    const t = this.nomination[1];
    this.isVoteInProgress = false;
    this.send("isVoteInProgress", false);
    const yes = this.votes.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    yes.forEach((i) => {
      if (!this.seats[i].alive) this.seats[i].ghost = false;
    });
    const majority = Math.ceil(this.alive().length / 2);
    const count = yes.length;
    let text = `${this.name(
      t,
    )} için ${count} oy çıktı (en az ${majority} gerekiyordu). `;
    if (count >= majority) {
      if (!this.block || count > this.block.votes) {
        this.block = { index: t, name: this.name(t), votes: count };
        text += `${this.name(t)} şimdi darağacında.`;
      } else if (count === this.block.votes) {
        this.block = { index: null, name: "", votes: count };
        text += "Oylar eşit: şu an kimse darağacında değil.";
      } else {
        text += "Ama bu, darağacındaki oyuncunun oyundan az.";
      }
    } else {
      text += "Bu yeterli değil.";
    }
    this.narrate(text);
    this.later(() => {
      this.nomination = null;
      this.lockedVote = 0;
      this.send("nomination", null);
      this.broadcastSeats();
      this.update();
      if (this.endAfterVote) {
        this.narrate("Gün için ayrılan süre doldu.");
        this.endDay();
      } else {
        this.checkReady();
      }
    }, 3500);
    this.update();
  }

  slay(i, t) {
    if (this.phase !== "day" || this.nomination) return;
    const s = this.seats[i];
    const target = this.seats[t];
    if (!s || !s.alive || !target || this.slayAttempts.has(s.id)) return;
    this.slayAttempts.add(s.id);
    const hit =
      target.alive &&
      s.role === "slayer" &&
      i !== this.poisoned &&
      this.registersDemon(t);
    const shot = `${s.name}, Avcı olduğunu söyleyerek ${target.name} adlı oyuncuyu vurdu... `;
    if (!hit) {
      this.narrate(shot + "Hiçbir şey olmadı.");
      this.update();
      return;
    }
    const aliveBefore = this.alive().length;
    target.alive = false;
    this.narrate(shot + `${target.name} öldü!`);
    this.broadcastSeats();
    if (target.role === "imp") this.demonDied(aliveBefore);
    this.checkWin();
    this.update();
  }

  setReady(id, i, value) {
    const s = this.seats[i];
    if (this.phase !== "day" || !s || !s.alive) return;
    if (value) this.ready.add(id);
    else this.ready.delete(id);
    this.update();
    this.checkReady();
  }

  checkReady() {
    if (this.phase !== "day" || this.nomination) return;
    if (this.ready.size > this.alive().length / 2) {
      this.narrate("Kasaba günü bitirmeye karar verdi.");
      this.endDay();
    }
  }

  endDay() {
    if (this.phase !== "day") return;
    this.phase = "dusk";
    if (this.block && this.block.index !== null) {
      const t = this.block.index;
      const target = this.seats[t];
      const aliveBefore = this.alive().length;
      target.alive = false;
      this.lastExecuted = t;
      this.narrate(`${target.name} idam edildi.`);
      this.broadcastSeats();
      if (target.role === "saint" && t !== this.poisoned) {
        this.gameOver(
          "evil",
          `${target.name} bir Aziz'di. İdam edilmesi kötülerin zaferi oldu.`,
        );
        return;
      }
      if (target.role === "imp") this.demonDied(aliveBefore);
    } else {
      this.narrate("Bugün kimse idam edilmedi.");
      const mayor = this.alive().find(
        (i) => this.seats[i].role === "mayor" && i !== this.poisoned,
      );
      if (this.alive().length === 3 && mayor !== undefined) {
        this.gameOver(
          "good",
          "Üç kişi kalmışken kimse idam edilmedi: Belediye Başkanı kasabayı kurtardı.",
        );
        return;
      }
    }
    if (this.checkWin()) return;
    this.update();
    this.later(() => this.startNight(), 6000);
  }

  checkWin() {
    if (this.phase === "over") return true;
    const living = this.alive();
    const demon = living.some((i) => this.seats[i].role === "imp");
    if (!demon) {
      this.gameOver("good", "İblis öldü.");
      return true;
    }
    if (living.length <= 2) {
      this.gameOver("evil", "Hayatta yalnızca iki oyuncu kaldı.");
      return true;
    }
    return false;
  }

  gameOver(winner, reason) {
    this.clearTimers();
    this.phase = "over";
    this.winner = winner;
    this.reason = reason;
    this.prompts = new Map();
    if (this.nomination) {
      this.nomination = null;
      this.send("nomination", null);
    }
    this.isVoteInProgress = false;
    this.send("isNight", false);
    this.seats.forEach((s, i) =>
      this.send("player", { index: i, property: "role", value: s.role }),
    );
    this.broadcastSeats();
    const text =
      (winner === "good" ? "İyi takım kazandı! " : "Kötü takım kazandı! ") +
      reason;
    this.narrate(text);
    this.io.push(
      this.seats.map((s) => s.id),
      { title: "Oyun bitti 🏁", body: text, tag: "phase" },
    );
    this.update();
  }
}

module.exports = { AutoGame, SETUP };
