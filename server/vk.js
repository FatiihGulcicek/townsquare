/*
 * Vampir Köylü game engine.
 *
 * Roles: Vampir, Köylü, Doktor, Gözcü.
 * Modes:
 *   auto  - the app is the storyteller: every phase has a deadline
 *   human - one person is the storyteller (not playing); they see everything
 *           and press "next" to move the game along, and may kill / revive.
 *
 * Security: every player connects with a private id (never shown to others).
 * Other players only ever see a public seat id ("pid"), so nobody can take
 * over someone else's seat or read their role.
 */
"use strict";
const crypto = require("crypto");
const { CATEGORIES, MODES, pickPenalties } = require("./penalties");

const ROLES = {
  vampir: {
    id: "vampir",
    name: "Vampir",
    was: "Vampir'di",
    team: "vampir",
    emoji: "🧛",
    desc: "Her gece diğer vampirlerle birlikte bir kurban seçersin. Gündüz köylü gibi davran ve yakalanma.",
  },
  koylu: {
    id: "koylu",
    name: "Köylü",
    was: "Köylü'ydü",
    team: "koy",
    emoji: "🧑‍🌾",
    desc: "Özel bir gücün yok. Gündüz konuş, şüphelendiğin kişiye oy ver ve vampirleri bul.",
  },
  doktor: {
    id: "doktor",
    name: "Doktor",
    was: "Doktor'du",
    team: "koy",
    emoji: "🩺",
    desc: "Her gece bir kişiyi korursun; vampirler onu o gece öldüremez. Aynı kişiyi iki gece üst üste koruyamazsın.",
  },
  gozcu: {
    id: "gozcu",
    name: "Gözcü",
    was: "Gözcü'ydü",
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
  vampires: [0, 1, 2, 3, 4], // 0 = automatic
};
const DEFAULT_SETTINGS = {
  dayMinutes: 5,
  nightSeconds: 60,
  vampires: 0,
  doktor: true,
  gozcu: true,
  reveal: true,
  lastWords: true,
  idlePenalty: true,
  penalty: "losers", // off | losers | team | firstDead | everyone
  penaltyCats: ["hafif", "komik", "muzik", "oyun"],
  customPenalties: [],
};
const IDLE_WARN = 2;
const IDLE_PUNISH = 3;
const ROLES_MS = 45000; // time to draw a card
const READ_CARD_MS = 6000;
const MIN_NIGHT_MS = 8000;
const VOTE_SETTLE_MS = 8000;
const LAST_WORDS_MS = 20000;
const DUSK_MS = 6000;
const CHAT_KEEP = 60;
const CHAT_MAX = 200;

const rnd = (n) => (n > 0 ? crypto.randomInt(n) : 0);
const pick = (list) => list[rnd(list.length)];
const newPid = () => crypto.randomBytes(5).toString("hex");
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** automatic number of vampires for n players */
function autoVampires(n) {
  return n <= 6 ? 1 : n <= 10 ? 2 : n <= 14 ? 3 : 4;
}

/** role counts for n players with the room's settings */
function setupFor(n, settings = DEFAULT_SETTINGS) {
  let vampir = settings.vampires || autoVampires(n);
  // vampires must start as a clear minority
  vampir = Math.max(1, Math.min(vampir, Math.ceil(n / 2) - 1));
  const gozcu = settings.gozcu ? 1 : 0;
  const doktor = settings.doktor && n >= 5 ? 1 : 0;
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
   * @param creatorId private id of the creator (storyteller in human mode)
   * @param io {sendTo(id, data), connectedIds(), push(ids, payload), destroy(),
   *            save(snapshot), gameOver(record), profile(id, name)}
   */
  constructor(code, mode, creatorId, io) {
    this.code = code;
    this.mode = mode === "human" ? "human" : "auto";
    this.stId = this.mode === "human" ? creatorId : null;
    this.ownerId = this.mode === "human" ? creatorId : null;
    this.io = io;
    this.players = [];
    this.kicked = new Set();
    this.settings = { ...DEFAULT_SETTINGS };
    this.log = [];
    this.timer = null;
    this.gameId = 0;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.chatSeq = 0;
    this.lastChat = {};
    this.voice = new Set(); // private ids in the voice chat
    this.reset();
  }

  // ---------- persistence ----------

  toJSON() {
    return {
      v: 2,
      code: this.code,
      mode: this.mode,
      stId: this.stId,
      ownerId: this.ownerId,
      players: this.players,
      kicked: [...this.kicked],
      settings: this.settings,
      log: this.log,
      phase: this.phase,
      round: this.round,
      deadline: this.deadline,
      night: this.night,
      nightStarted: this.nightStarted,
      lastProtected: this.lastProtected,
      votes: this.votes,
      settleAt: this.settleAt,
      lastNight: this.lastNight,
      executed: this.executed,
      condemned: this.condemned,
      winner: this.winner,
      seerLog: this.seerLog,
      cards: this.cards,
      penalties: this.penalties,
      deathOrder: this.deathOrder,
      gameId: this.gameId,
      startedAt: this.startedAt,
      chat: this.chat,
      chatSeq: this.chatSeq,
      createdAt: this.createdAt,
    };
  }

  static fromJSON(data, io) {
    const room = new Room(data.code, data.mode, data.stId, io);
    Object.assign(room, data, {
      kicked: new Set(data.kicked || []),
      voice: new Set(),
      io,
    });
    room.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    room.lastActivity = Date.now();
    room.schedule();
    room.botsAct();
    return room;
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.io.save(this.toJSON()), 800);
  }

  flush() {
    clearTimeout(this.saveTimer);
    return this.io.save(this.toJSON());
  }

  // ---------- plumbing ----------

  reset() {
    clearTimeout(this.timer);
    this.phase = "lobby";
    this.round = 0;
    this.deadline = 0;
    this.night = null;
    this.nightStarted = 0;
    this.lastProtected = null;
    this.votes = {};
    this.settleAt = 0;
    this.lastNight = null;
    this.executed = null;
    this.condemned = null;
    this.winner = null;
    this.seerLog = {};
    this.startedAt = 0;
    this.cards = null;
    this.penalties = null;
    this.deathOrder = [];
    this.chat = { town: [], vampir: [], dead: [] };
    this.players.forEach((p) => {
      p.role = null;
      p.alive = true;
      p.idle = 0;
      p.noVote = false;
    });
  }

  isAuto() {
    return this.mode === "auto";
  }

  /** auto mode: run next() when the phase deadline passes */
  schedule() {
    clearTimeout(this.timer);
    if (!this.isAuto() || !this.deadline) return;
    if (["lobby", "over"].includes(this.phase)) return;
    const phase = this.phase;
    const round = this.round;
    this.timer = setTimeout(
      () => {
        if (this.phase !== phase || this.round !== round) return;
        try {
          if (phase === "day" && !this.settleAt) {
            this.narrate("Süre doldu, oylar sayılıyor.");
          }
          this.next();
        } catch (e) {
          console.log("vk room error", e);
        }
      },
      Math.max(0, this.deadline - Date.now()),
    );
  }

  setDeadline(ms) {
    this.deadline = this.isAuto() && ms ? Date.now() + ms : 0;
    this.schedule();
  }

  player(id) {
    return this.players.find((p) => p.id === id);
  }

  byPid(pid) {
    return this.players.find((p) => p.pid === pid);
  }

  alive() {
    return this.players.filter((p) => p.alive);
  }

  owner() {
    if (this.mode === "human") return this.stId;
    const online = this.io.connectedIds();
    if (this.ownerId && this.player(this.ownerId)) {
      if (online.includes(this.ownerId)) return this.ownerId;
      const first = this.players.find((p) => online.includes(p.id));
      return first ? first.id : this.ownerId;
    }
    this.ownerId = this.players.length ? this.players[0].id : null;
    return this.ownerId;
  }

  narrate(text) {
    this.log.push(text);
    if (this.log.length > 50) this.log.shift();
    this.systemChat(text);
    this.io
      .connectedIds()
      .forEach((id) => this.io.sendTo(id, JSON.stringify(["narrate", text])));
  }

  update() {
    this.save();
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

  // ---------- chat ----------

  systemChat(text) {
    this.chat.town.push({ n: ++this.chatSeq, sys: true, text, at: Date.now() });
    if (this.chat.town.length > CHAT_KEEP) this.chat.town.shift();
  }

  /** which channels a person may write to right now */
  canWrite(id) {
    const out = [];
    if (id === this.stId) return ["town"];
    const me = this.player(id);
    if (!me || me.muted) return out;
    if (this.phase === "lobby" || this.phase === "over") return ["town"];
    if (!me.alive) return ["dead"];
    if (this.phase === "lastwords") {
      if (this.condemned === me.pid) out.push("town");
    } else if (this.phase !== "night") {
      out.push("town");
    }
    if (me.role === "vampir") out.push("vampir");
    return out;
  }

  canRead(id, channel) {
    if (channel === "town") return true;
    if (id === this.stId || this.phase === "over") return true;
    const me = this.player(id);
    if (!me) return false;
    if (channel === "vampir") return me.role === "vampir";
    if (channel === "dead") return !me.alive;
    return false;
  }

  say(id, channel, text) {
    text = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
    if (!text) return;
    text = text.slice(0, CHAT_MAX);
    if (!this.chat[channel] || !this.canWrite(id).includes(channel)) return;
    const now = Date.now();
    if (now - (this.lastChat[id] || 0) < 700) return;
    this.lastChat[id] = now;
    const me = this.player(id);
    this.chat[channel].push({
      n: ++this.chatSeq,
      from: me ? me.pid : "st",
      name: me ? me.name : "Anlatıcı",
      text,
      at: now,
    });
    if (this.chat[channel].length > CHAT_KEEP) this.chat[channel].shift();
    this.update();
  }

  // ---------- discipline ----------

  kill(p) {
    p.alive = false;
    if (!this.deathOrder) this.deathOrder = [];
    this.deathOrder.push(p.pid);
  }

  notice(id, text) {
    this.io.sendTo(id, JSON.stringify(["notice", text]));
  }

  /** players who did nothing for several phases lose their vote */
  trackIdle(acted) {
    if (!this.settings.idlePenalty) return;
    this.alive()
      .filter((p) => !p.bot && !p.noVote && acted(p) !== null)
      .forEach((p) => {
        if (acted(p)) {
          p.idle = 0;
          return;
        }
        p.idle = (p.idle || 0) + 1;
        if (p.idle === IDLE_WARN) {
          this.notice(
            p.id,
            "⚠️ Uyarı: art arda hiçbir şey yapmadın. Bir kez daha pasif kalırsan oy hakkını kaybedeceksin.",
          );
          this.io.push([p.id], {
            title: "Uyarı ⚠️",
            body: "Oyunda pasif kalıyorsun, sıradaki seçimini kaçırma!",
            tag: "idle",
          });
        } else if (p.idle >= IDLE_PUNISH) {
          p.noVote = true;
          this.narrate(
            `${p.name} uzun süre pasif kaldığı için oy hakkını kaybetti. 🚫`,
          );
        }
      });
  }

  // ---------- voice chat ----------

  /** public id of a participant ("st" for the storyteller) */
  voicePid(id) {
    if (id === this.stId) return "st";
    const p = this.player(id);
    return p ? p.pid : null;
  }

  voiceIdOf(pid) {
    if (pid === "st") return this.stId;
    const p = this.byPid(pid);
    return p ? p.id : null;
  }

  /** may a's voice reach b right now? (enforced by a's own phone) */
  canHear(aId, bId) {
    if (aId === bId) return false;
    if (aId === this.stId) return true;
    const a = this.player(aId);
    if (a && a.muted) return false;
    if (bId === this.stId) return true;
    const b = this.player(bId);
    if (!a) return false; // spectators only listen
    if (this.phase === "lobby" || this.phase === "over") return true;
    if (!a.alive) return !!b && !b.alive; // the dead talk among themselves
    if (this.phase === "night") {
      return a.role === "vampir" && !!b && b.alive && b.role === "vampir";
    }
    if (this.phase === "lastwords") return a.pid === this.condemned;
    return true; // roles, day, dusk: the whole village
  }

  voiceView(id) {
    const on = this.voice.has(id);
    const members = [...this.voice].filter((v) => v !== id);
    return {
      on,
      members: [...this.voice].map((v) => this.voicePid(v)).filter(Boolean),
      peers: on ? members.map((v) => this.voicePid(v)).filter(Boolean) : [],
      sendTo: on
        ? members
            .filter((v) => this.canHear(id, v))
            .map((v) => this.voicePid(v))
        : [],
      hearFrom: on
        ? members
            .filter((v) => this.canHear(v, id))
            .map((v) => this.voicePid(v))
        : [],
      me: this.voicePid(id),
    };
  }

  setVoice(id, on) {
    if (!this.voicePid(id) && id !== this.stId) {
      // spectators may listen too
      if (!on) this.voice.delete(id);
      return;
    }
    if (on) this.voice.add(id);
    else this.voice.delete(id);
    this.update();
  }

  /** relay WebRTC signalling between two members of the voice chat */
  signal(id, params) {
    if (!params || typeof params !== "object" || !this.voice.has(id)) return;
    const to = this.voiceIdOf(params.to);
    if (!to || !this.voice.has(to)) return;
    const data = params.data;
    if (!data || JSON.stringify(data).length > 12000) return;
    this.io.sendTo(
      to,
      JSON.stringify(["rtc", { from: this.voicePid(id), data }]),
    );
  }

  /** the last connection of a person closed */
  left(id) {
    if (this.voice.delete(id)) this.update();
  }

  // ---------- what each person sees ----------

  visibleRole(viewer, p) {
    if (this.phase === "over") return p.role;
    if (!viewer) return null;
    if (viewer.isSt || viewer.id === p.id) return p.role;
    if (!p.alive && this.settings.reveal) return p.role;
    if (viewer.role === "vampir" && p.role === "vampir") return p.role;
    return null;
  }

  view(id) {
    const me = this.player(id);
    const isSt = this.stId === id;
    const viewer = isSt ? { isSt: true, id } : me;
    const online = this.io.connectedIds();
    const n = this.players.length;
    const chat = {};
    Object.keys(this.chat).forEach((ch) => {
      if (this.canRead(id, ch)) chat[ch] = this.chat[ch].slice(-40);
    });
    const state = {
      code: this.code,
      gameId: this.gameId,
      mode: this.mode,
      phase: this.phase,
      round: this.round,
      remaining: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      settle: this.settleAt ? Math.max(0, this.settleAt - Date.now()) : 0,
      settings: this.settings,
      roles: ROLES,
      min: MIN_PLAYERS,
      max: MAX_PLAYERS,
      setup: n >= MIN_PLAYERS ? setupFor(n, this.settings) : null,
      me: {
        pid: me ? me.pid : null,
        name: me ? me.name : "",
        role: me ? me.role : null,
        alive: me ? me.alive : false,
        seated: !!me,
        isOwner: this.owner() === id,
        isStoryteller: isSt,
        muted: !!(me && me.muted),
        noVote: !!(me && me.noVote),
        idle: me ? me.idle || 0 : 0,
      },
      penalties: this.phase === "over" ? this.penalties : null,
      penaltyCategories: CATEGORIES,
      players: this.players.map((p) => ({
        pid: p.pid,
        name: p.name,
        alive: p.alive,
        online: !!p.bot || online.includes(p.id),
        bot: !!p.bot,
        muted: !!p.muted,
        noVote: !!p.noVote,
        kicked: !!p.kicked,
        role: this.visibleRole(viewer, p),
      })),
      votes: ["day", "lastwords", "dusk"].includes(this.phase)
        ? this.votes
        : {},
      lastNight: this.lastNight,
      executed: this.executed,
      condemned: this.condemned,
      winner: this.winner,
      log: this.log.slice(-10),
      night: null,
      seerLog: me && me.role === "gozcu" ? this.seerLog[id] || [] : [],
      chat,
      canWrite: this.canWrite(id),
      cards:
        this.phase === "roles" && this.cards
          ? this.cards.map((c, i) => {
              const by = c.by ? this.byPid(c.by) : null;
              return {
                i,
                taken: !!c.by,
                by: by ? by.name : "",
                mine: !!me && c.by === me.pid,
                role: (me && c.by === me.pid) || isSt ? c.role : null,
              };
            })
          : null,
      voice: this.voiceView(id),
      storyteller: null,
    };
    if (this.phase === "night" && me && me.alive) {
      const acts = this.night;
      const night = { action: me.role, target: null, done: false };
      if (me.role === "vampir") {
        night.target = acts.vamp[me.pid] || null;
        night.done = !!night.target;
        night.team = this.alive()
          .filter((p) => p.role === "vampir")
          .map((p) => ({
            pid: p.pid,
            name: p.name,
            target: acts.vamp[p.pid] || null,
          }));
      } else if (me.role === "doktor") {
        night.target = acts.doktor;
        night.done = !!acts.doktor;
        night.forbidden = this.lastProtected;
      } else if (me.role === "gozcu") {
        night.target = acts.gozcu;
        night.done = !!acts.gozcu;
      } else {
        night.target = acts.suspects[me.pid] || null;
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
    if (command === "voice") return this.setVoice(id, !!params);
    if (command === "rtc") return this.signal(id, params);
    if (command === "chat") {
      return params && this.say(id, params.channel || "town", params.text);
    }
    if (command !== "act" || !params || typeof params !== "object") return;
    const isBoss = this.owner() === id;
    const isSt = this.stId === id;
    switch (params.type) {
      case "settings":
        if (!isBoss || this.phase !== "lobby") return;
        Object.keys(SETTINGS).forEach((key) => {
          if (params[key] === undefined) return;
          const v = parseInt(params[key], 10);
          if (SETTINGS[key].includes(v)) this.settings[key] = v;
        });
        ["doktor", "gozcu", "reveal", "lastWords", "idlePenalty"].forEach(
          (key) => {
            if (typeof params[key] === "boolean") {
              this.settings[key] = params[key];
            }
          },
        );
        if (MODES.includes(params.penalty))
          this.settings.penalty = params.penalty;
        if (Array.isArray(params.penaltyCats)) {
          this.settings.penaltyCats = params.penaltyCats.filter(
            (c) => CATEGORIES[c],
          );
        }
        if (Array.isArray(params.customPenalties)) {
          this.settings.customPenalties = params.customPenalties
            .filter((t) => typeof t === "string")
            .map((t) => t.replace(/\s+/g, " ").trim().slice(0, 140))
            .filter(Boolean)
            .slice(0, 50);
        }
        return this.update();
      case "kick": {
        if (!isBoss) return;
        const p = this.byPid(params.target);
        if (!p || p.id === id) return;
        this.kicked.add(p.id);
        this.voice.delete(p.id);
        this.io.sendTo(p.id, JSON.stringify(["kicked", true]));
        if (this.phase === "lobby" || this.phase === "over") {
          this.players = this.players.filter((x) => x !== p);
          return this.update();
        }
        // during a game the seat stays, the player is out
        p.kicked = true;
        if (p.alive) {
          this.kill(p);
          this.narrate(this.deathText(p, "oyunu bozduğu için köyden kovuldu"));
        } else {
          this.narrate(`${p.name} odadan çıkarıldı.`);
        }
        if (!this.checkWin()) this.update();
        return;
      }
      case "mute": {
        if (!isBoss) return;
        const p = this.byPid(params.target);
        if (!p || p.id === id) return;
        p.muted = !p.muted;
        this.notice(
          p.id,
          p.muted
            ? "Oda yöneticisi seni susturdu: sohbete yazamaz ve sesli konuşamazsın."
            : "Susturman kaldırıldı, tekrar konuşabilirsin.",
        );
        this.narrate(
          p.muted ? `${p.name} susturuldu. 🔇` : `${p.name} artık konuşabilir.`,
        );
        return this.update();
      }
      case "punish": {
        // breaking the rules (e.g. showing your role): out of the game
        if (!isBoss || ["lobby", "over"].includes(this.phase)) return;
        const p = this.byPid(params.target);
        if (!p || !p.alive || p.id === id) return;
        this.kill(p);
        this.narrate(
          this.deathText(p, "kuralları çiğnediği için köyden kovuldu ⚖️"),
        );
        if (!this.checkWin()) this.update();
        return;
      }
      case "penaltyDone":
      case "reroll": {
        if (this.phase !== "over" || !this.penalties) return;
        const entry = this.penalties.find((x) => x.pid === params.target);
        const me = this.player(id);
        if (!entry || !(isBoss || (me && me.pid === entry.pid))) return;
        if (params.type === "penaltyDone") {
          entry.done = !entry.done;
          if (entry.done)
            this.narrate(`${entry.name} cezasını yerine getirdi! 👏`);
        } else {
          if (entry.rerolled) return;
          entry.rerolled = true;
          entry.text =
            pickPenalties(
              1,
              this.settings.penaltyCats,
              this.settings.customPenalties,
              rnd,
            )[0] || entry.text;
          this.narrate(`${entry.name} cezasını değiştirdi: ${entry.text}`);
        }
        return this.update();
      }
      case "addBot": {
        if (!isBoss || this.phase !== "lobby") return;
        if (this.players.length >= MAX_PLAYERS) return;
        const used = new Set(this.players.map((p) => p.name));
        let k = 1;
        while (used.has(`Bot ${k}`)) k++;
        this.players.push({
          id: "bot-" + newPid(),
          pid: newPid(),
          name: `Bot ${k}`,
          role: null,
          alive: true,
          bot: true,
        });
        return this.update();
      }
      case "removeBots":
        if (!isBoss || this.phase !== "lobby") return;
        this.players = this.players.filter((p) => !p.bot);
        return this.update();
      case "leave":
        if (this.phase === "lobby") {
          this.players = this.players.filter((p) => p.id !== id);
          if (this.ownerId === id) this.ownerId = null;
          this.update();
        }
        return;
      case "rename": {
        const me = this.player(id);
        if (me && this.phase === "lobby") {
          const name = this.uniqueName(params.name, me);
          if (name) {
            me.name = name;
            this.io.profile(id, name);
            this.update();
          }
        }
        return;
      }
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
      case "card":
        return this.pickCard(id, parseInt(params.index, 10));
      case "night":
        return this.nightAction(id, params.target);
      case "vote":
        return this.dayVote(id, params.target);
      case "next":
        if (isSt) this.next();
        return;
      case "kill":
      case "revive": {
        if (!isSt || ["lobby", "over"].includes(this.phase)) return;
        const p = this.byPid(params.target);
        if (!p) return;
        if (params.type === "kill" && p.alive) {
          this.kill(p);
          this.narrate(this.deathText(p, "öldü"));
        } else if (params.type === "revive" && !p.alive) {
          p.alive = true;
          this.narrate(`${p.name} hayata döndü!`);
        } else return;
        if (!this.checkWin()) this.update();
        return;
      }
    }
  }

  uniqueName(raw, except) {
    const name =
      typeof raw === "string"
        ? raw.replace(/\s+/g, " ").trim().slice(0, 24)
        : "";
    if (!name) return "";
    const norm = (v) => v.toLocaleLowerCase("tr");
    let unique = name;
    let k = 2;
    while (
      this.players.some((p) => p !== except && norm(p.name) === norm(unique))
    ) {
      unique = `${name} ${k++}`;
    }
    return unique;
  }

  join(id, name) {
    if (id === this.stId || this.player(id) || this.kicked.has(id)) {
      return this.sendState(id);
    }
    if (this.phase !== "lobby" || this.players.length >= MAX_PLAYERS) {
      return this.sendState(id);
    }
    const unique = this.uniqueName(name);
    if (!unique) return this.sendState(id);
    this.players.push({
      id,
      pid: newPid(),
      name: unique,
      role: null,
      alive: true,
    });
    if (!this.ownerId) this.ownerId = id;
    this.io.profile(id, unique);
    this.update();
  }

  deathText(p, verb) {
    return this.settings.reveal
      ? `${p.name} ${verb}. O bir ${ROLES[p.role].was}.`
      : `${p.name} ${verb}.`;
  }

  // ---------- game flow ----------

  start() {
    const n = this.players.length;
    if (n < MIN_PLAYERS) return;
    this.reset();
    this.gameId++;
    this.startedAt = Date.now();
    const s = setupFor(n, this.settings);
    const bag = shuffle([
      ...Array(s.vampir).fill("vampir"),
      ...Array(s.doktor).fill("doktor"),
      ...Array(s.gozcu).fill("gozcu"),
      ...Array(s.koylu).fill("koylu"),
    ]);
    // roles are dealt as face-down cards; everyone draws one
    this.cards = bag.map((role) => ({ role, by: null }));
    this.players.forEach((p) => {
      p.role = null;
      p.alive = true;
    });
    this.phase = "roles";
    this.narrate(
      `Oyun başlıyor! ${s.vampir} vampir aramızda. Herkes masadan bir kart çeksin ve kimseye göstermesin.`,
    );
    this.pushAll({
      title: "Oyun başladı 🃏",
      body: "Kartını çekmek için dokun.",
      tag: "phase",
    });
    this.setDeadline(ROLES_MS);
    // bots draw quickly
    this.players
      .filter((p) => p.bot)
      .forEach((bot) =>
        setTimeout(
          () => {
            if (this.phase !== "roles" || bot.role) return;
            const free = this.cards
              .map((c, i) => (c.by ? -1 : i))
              .filter((i) => i >= 0);
            if (free.length) this.pickCard(bot.id, pick(free));
          },
          1500 + rnd(4000),
        ),
      );
    this.update();
  }

  pickCard(id, index) {
    if (this.phase !== "roles") return;
    const me = this.player(id);
    const card = this.cards && this.cards[index];
    if (!me || me.role || !card || card.by) return;
    card.by = me.pid;
    me.role = card.role;
    // everyone has a card: start the night after a moment to read it
    if (this.isAuto() && this.players.every((p) => p.role)) {
      const soon = Date.now() + READ_CARD_MS;
      if (soon < this.deadline) {
        this.deadline = soon;
        this.schedule();
      }
    }
    this.update();
  }

  /** cards nobody drew go to the players without one */
  dealRest() {
    if (!this.cards) return;
    const free = shuffle(this.cards.filter((c) => !c.by));
    this.players
      .filter((p) => !p.role)
      .forEach((p) => {
        const card = free.pop();
        if (!card) return;
        card.by = p.pid;
        p.role = card.role;
      });
  }

  /** move to the next phase (storyteller button / auto deadline) */
  next() {
    switch (this.phase) {
      case "roles":
      case "dusk":
        return this.startNight();
      case "night":
        return this.resolveNight();
      case "day":
        return this.endDay();
      case "lastwords":
        return this.hang();
    }
  }

  startNight() {
    if (!["roles", "dusk"].includes(this.phase)) return;
    if (this.phase === "roles") this.dealRest();
    this.phase = "night";
    this.round++;
    this.night = { vamp: {}, doktor: null, gozcu: null, suspects: {} };
    this.votes = {};
    this.settleAt = 0;
    this.executed = null;
    this.condemned = null;
    this.nightStarted = Date.now();
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
    this.setDeadline(this.settings.nightSeconds * 1000);
    this.botsAct();
    this.update();
  }

  /** practice bots make random (valid) choices after a short delay */
  botsAct() {
    const phase = this.phase;
    const round = this.round;
    this.alive()
      .filter((p) => p.bot)
      .forEach((bot) => {
        const wait = 2500 + rnd(6000);
        setTimeout(
          () => {
            if (this.phase !== phase || this.round !== round || !bot.alive)
              return;
            const others = this.alive().filter((p) => p !== bot);
            if (phase === "night") {
              let options = others;
              if (bot.role === "vampir")
                options = others.filter((p) => p.role !== "vampir");
              if (bot.role === "doktor") {
                options = this.alive().filter(
                  (p) => p.pid !== this.lastProtected,
                );
              }
              const t = pick(options);
              if (t) this.nightAction(bot.id, t.pid);
            } else if (phase === "day") {
              if (rnd(6) === 0) return this.dayVote(bot.id, "pass");
              const options =
                bot.role === "vampir"
                  ? others.filter((p) => p.role !== "vampir")
                  : others;
              const t = pick(options.length ? options : others);
              if (t) this.dayVote(bot.id, t.pid);
            }
          },
          phase === "day" ? wait * 3 : wait,
        );
      });
  }

  nightReady() {
    if (this.phase !== "night") return false;
    const living = this.alive();
    const vampsDone = living
      .filter((p) => p.role === "vampir")
      .every((p) => this.night.vamp[p.pid]);
    const doctor = living.some((p) => p.role === "doktor");
    const seer = living.some((p) => p.role === "gozcu");
    return (
      vampsDone &&
      (!doctor || !!this.night.doktor) &&
      (!seer || !!this.night.gozcu)
    );
  }

  nightAction(id, targetPid) {
    if (this.phase !== "night") return;
    const me = this.player(id);
    const target = this.byPid(targetPid);
    if (!me || !me.alive || !target || !target.alive) return;
    if (me.role === "vampir") {
      if (target.role === "vampir") return;
      this.night.vamp[me.pid] = target.pid;
    } else if (me.role === "doktor") {
      if (target.pid === this.lastProtected) return;
      this.night.doktor = target.pid;
    } else if (me.role === "gozcu") {
      if (this.night.gozcu || target.id === id) return;
      this.night.gozcu = target.pid;
      const list = this.seerLog[id] || (this.seerLog[id] = []);
      list.push({
        round: this.round,
        name: target.name,
        vampir: target.role === "vampir",
      });
    } else {
      if (target.id === id) return;
      this.night.suspects[me.pid] = target.pid;
    }
    // everyone with a power has chosen: end the night a little earlier
    if (this.isAuto() && this.nightReady()) {
      const soon = Math.max(
        this.nightStarted + MIN_NIGHT_MS,
        Date.now() + 2000,
      );
      if (soon < this.deadline) {
        this.deadline = soon;
        this.schedule();
      }
    }
    this.update();
  }

  resolveNight() {
    if (this.phase !== "night") return;
    this.trackIdle((p) => {
      if (p.role === "vampir") return !!this.night.vamp[p.pid];
      if (p.role === "doktor") return !!this.night.doktor;
      if (p.role === "gozcu") return !!this.night.gozcu;
      return null; // villagers have nothing that matters to do at night
    });
    const tally = {};
    Object.entries(this.night.vamp).forEach(([vpid, t]) => {
      const v = this.byPid(vpid);
      if (v && v.alive && v.role === "vampir") tally[t] = (tally[t] || 0) + 1;
    });
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((t) => tally[t] === max);
    const victim = top.length ? this.byPid(pick(top)) : null;
    const saved = !!victim && this.night.doktor === victim.pid;
    this.lastProtected = this.night.doktor;
    this.lastNight = { round: this.round, died: [], saved };
    if (victim && !saved && victim.alive) {
      this.kill(victim);
      this.lastNight.died.push({
        pid: victim.pid,
        name: victim.name,
        role: this.settings.reveal ? victim.role : null,
      });
    }
    this.phase = "day";
    this.votes = {};
    this.settleAt = 0;
    let text = `Günaydın köy! ${this.round}. gün başladı. `;
    if (this.lastNight.died.length) {
      const d = this.lastNight.died[0];
      text += this.settings.reveal
        ? `Bu gece ${d.name} vampirlerin kurbanı oldu. O bir ${
            ROLES[victim.role].was
          }.`
        : `Bu gece ${d.name} vampirlerin kurbanı oldu.`;
    } else if (saved) {
      text +=
        "Vampirler saldırdı ama Doktor kurbanı kurtardı! Bu gece kimse ölmedi.";
    } else {
      text += "Bu gece kimse ölmedi.";
    }
    this.narrate(text);
    this.pushAll({ title: "Gün doğdu ☀️", body: text, tag: "phase" });
    if (this.checkWin()) return;
    this.setDeadline(this.settings.dayMinutes * 60000);
    this.botsAct();
    this.update();
  }

  allVoted() {
    return this.alive()
      .filter((p) => !p.noVote)
      .every((p) => this.votes[p.pid]);
  }

  dayVote(id, target) {
    if (this.phase !== "day") return;
    const me = this.player(id);
    if (!me || !me.alive || me.noVote) return;
    if (target === null || target === undefined || target === "") {
      delete this.votes[me.pid];
    } else if (target === "pass") {
      this.votes[me.pid] = "pass";
    } else {
      const t = this.byPid(target);
      if (!t || !t.alive || t.id === id) return;
      this.votes[me.pid] = t.pid;
    }
    if (this.isAuto()) {
      if (this.allVoted()) {
        // a few seconds to change minds, then count
        if (!this.settleAt) {
          this.settleAt = Date.now() + VOTE_SETTLE_MS;
          this.dayDeadline = this.deadline;
          this.deadline = Math.min(this.deadline, this.settleAt);
          this.schedule();
        }
      } else if (this.settleAt) {
        this.settleAt = 0;
        this.deadline = this.dayDeadline || this.deadline;
        this.schedule();
      }
    }
    this.update();
  }

  endDay() {
    if (this.phase !== "day") return;
    this.trackIdle((p) => !!this.votes[p.pid]);
    const tally = {};
    this.alive()
      .filter((p) => !p.noVote)
      .forEach((p) => {
        const t = this.votes[p.pid];
        if (t) tally[t] = (tally[t] || 0) + 1;
      });
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((t) => tally[t] === max);
    const lines = Object.keys(tally)
      .filter((t) => t !== "pass")
      .sort((a, b) => tally[b] - tally[a])
      .map((t) => `${this.byPid(t).name}: ${tally[t]}`);
    if (tally.pass) lines.push(`Pas: ${tally.pass}`);
    const summary = lines.length ? "Oylar: " + lines.join(", ") + ". " : "";
    this.settleAt = 0;
    if (max > 0 && top.length === 1 && top[0] !== "pass") {
      const p = this.byPid(top[0]);
      this.condemned = p.pid;
      if (this.settings.lastWords) {
        this.phase = "lastwords";
        this.narrate(
          `${summary}Köy kararını verdi: ${p.name} asılacak. Son sözlerini söylesin.`,
        );
        this.setDeadline(LAST_WORDS_MS);
        this.update();
        return;
      }
      this.narrate(summary.trim());
      return this.hang();
    }
    this.narrate(
      summary +
        (max > 0 && top.length > 1
          ? "Oylar eşit çıktı, bugün kimse asılmadı."
          : "Bugün kimse asılmadı."),
    );
    this.toDusk();
  }

  hang() {
    const p = this.byPid(this.condemned);
    if (p && p.alive) {
      this.kill(p);
      this.executed = {
        pid: p.pid,
        name: p.name,
        role: this.settings.reveal ? p.role : null,
      };
      this.narrate(this.deathText(p, "asıldı"));
    }
    this.condemned = null;
    if (this.checkWin()) return;
    this.toDusk();
  }

  toDusk() {
    this.phase = "dusk";
    this.setDeadline(DUSK_MS);
    this.update();
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
    clearTimeout(this.timer);
    this.phase = "over";
    this.winner = winner;
    this.deadline = 0;
    this.condemned = null;
    this.narrate(text);
    this.dealPenalties(winner);
    this.pushAll({ title: "Oyun bitti 🏁", body: text, tag: "phase" });
    this.io.gameOver({
      room: this.code,
      mode: this.mode,
      winner,
      rounds: this.round,
      startedAt: this.startedAt || Date.now(),
      players: this.players
        .filter((p) => !p.bot)
        .map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          won: ROLES[p.role].team === winner,
          alive: p.alive,
        })),
    });
    this.update();
    return true;
  }

  /** fun penalties for the losers (or whoever the room chose) */
  dealPenalties(winner) {
    const mode = this.settings.penalty;
    this.penalties = null;
    if (!mode || mode === "off") return;
    const humans = this.players.filter((p) => !p.bot && !p.kicked);
    let targets = [];
    if (mode === "losers" || mode === "team") {
      targets = humans.filter((p) => ROLES[p.role].team !== winner);
    } else if (mode === "firstDead") {
      const first = (this.deathOrder || [])
        .map((pid) => this.byPid(pid))
        .find((p) => p && !p.bot && !p.kicked);
      targets = first ? [first] : [];
    } else if (mode === "everyone") {
      targets = humans;
    }
    if (!targets.length) return;
    const texts = pickPenalties(
      mode === "team" ? 1 : targets.length,
      this.settings.penaltyCats,
      this.settings.customPenalties,
      rnd,
    );
    if (!texts.length) return;
    this.penalties = targets.map((p, i) => ({
      pid: p.pid,
      name: p.name,
      text: mode === "team" ? texts[0] : texts[i],
      done: false,
      rerolled: false,
    }));
    this.narrate(
      "🎲 Ceza zamanı! " +
        this.penalties.map((x) => `${x.name}: ${x.text}`).join(" · "),
    );
  }

  destroy() {
    clearTimeout(this.timer);
    clearTimeout(this.saveTimer);
    this.io.destroy();
  }
}

module.exports = {
  Room,
  ROLES,
  setupFor,
  DEFAULT_SETTINGS,
  MIN_PLAYERS,
  MAX_PLAYERS,
};
