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
  avci: {
    id: "avci",
    name: "Avcı",
    was: "Avcı'ydı",
    team: "koy",
    emoji: "🏹",
    desc: "Öldüğünde son bir atış hakkın olur: yanında götürmek istediğin bir kişiyi vurursun.",
  },
  cadi: {
    id: "cadi",
    name: "Cadı",
    was: "Cadı'ydı",
    team: "koy",
    emoji: "🧙‍♀️",
    desc: "İki iksirin var, ikisi de oyunda bir kez: kurtarma iksiri o gecenin kurbanını kurtarır, zehir iksiri seçtiğin kişiyi öldürür.",
  },
  deli: {
    id: "deli",
    name: "Deli",
    was: "Deli'ydi",
    team: "deli",
    emoji: "🤡",
    desc: "Tek başınasın. Köyü kendini asmaya ikna edersen oyunu sen kazanırsın! Gece öldürülürsen kaybedersin.",
  },
  muhtar: {
    id: "muhtar",
    name: "Muhtar",
    was: "Muhtar'dı",
    team: "koy",
    emoji: "🎖️",
    desc: "Köyün muhtarısın: gündüz oylamasında oyun iki oy sayılır.",
  },
  kurtadam: {
    id: "kurtadam",
    name: "Kurt Adam",
    was: "Kurt Adam'dı",
    team: "vampir",
    emoji: "🐺",
    desc: "Vampirlerin tarafındasın ve geceleri onlarla birlikte avlanırsın. Gözcü sana bakarsa seni masum görür.",
  },
};
const SPECIALS = ["avci", "cadi", "muhtar", "deli", "kurtadam"];

const isVamp = (p) => !!p && !!p.role && ROLES[p.role].team === "vampir";

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
  avci: false,
  cadi: false,
  deli: false,
  muhtar: false,
  kurtadam: false,
  lovers: false,
  secretVotes: false,
  defense: false,
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
const DEFENSE_MS = 40000;
const RUNOFF_MS = 60000;
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
  const out = { vampir, doktor, gozcu };
  let used = vampir + doktor + gozcu;
  // special roles only while there are seats left for at least one villager
  SPECIALS.forEach((role) => {
    if (!settings[role]) {
      out[role] = 0;
      return;
    }
    if (role === "kurtadam") {
      // the Werewolf takes a vampire's place (needs 2+ vampires)
      if (out.vampir >= 2) {
        out.vampir -= 1;
        out.kurtadam = 1;
      } else out.kurtadam = 0;
      return;
    }
    out[role] = used + 1 < n ? 1 : 0;
    used += out[role];
  });
  out.koylu = Math.max(0, n - used);
  return out;
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
    this.lastReact = {};
    this.voice = new Set(); // private ids in the voice chat
    this.cams = new Set(); // private ids with the camera on
    this.photos = {}; // pid -> small jpeg data url
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
      potions: this.potions,
      runoff: this.runoff,
      deathOrder: this.deathOrder,
      events: this.events,
      photos: this.photos,
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
      cams: new Set(),
      photos: data.photos || {},
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
    this.events = [];
    this.potions = { heal: true, poison: true };
    this.shot = null;
    this.runoff = null;
    this.chat = { town: [], vampir: [], dead: [] };
    this.players.forEach((p) => {
      p.role = null;
      p.alive = true;
      p.idle = 0;
      p.noVote = false;
      p.lover = null;
      p.shotUsed = false;
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
          if ((phase === "day" || phase === "runoff") && !this.settleAt) {
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
    } else if (this.phase === "defense") {
      if (this.runoff && this.runoff.candidates.includes(me.pid)) {
        out.push("town");
      }
    } else if (this.phase !== "night") {
      out.push("town");
    }
    if (isVamp(me)) out.push("vampir");
    return out;
  }

  canRead(id, channel) {
    if (channel === "town") return true;
    if (id === this.stId || this.phase === "over") return true;
    const me = this.player(id);
    if (!me) return false;
    if (channel === "vampir") return isVamp(me);
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

  // ---------- story (animated recap) ----------

  /** record an event for the animated story of the game */
  story(type, data = {}) {
    if (!this.events) this.events = [];
    this.events.push({
      n: this.events.length + 1,
      type,
      round: this.round,
      ...data,
    });
    if (this.events.length > 120) this.events.shift();
  }

  // ---------- discipline ----------

  kill(p) {
    if (!p.alive) return;
    p.alive = false;
    // consequences (broken heart, the Hunter's last shot) come right after
    // the death has been announced
    process.nextTick(() => this.afterDeath(p));
    // votes for or by a dead player no longer count
    if (this.votes) {
      delete this.votes[p.pid];
      Object.keys(this.votes).forEach((k) => {
        if (this.votes[k] === p.pid) delete this.votes[k];
      });
    }
    if (!this.deathOrder) this.deathOrder = [];
    this.deathOrder.push(p.pid);
  }

  afterDeath(p) {
    if (this.phase === "over" || this.phase === "lobby") return;
    let changed = false;
    const partner = p.lover ? this.byPid(p.lover) : null;
    if (partner && partner.alive) {
      this.kill(partner);
      this.story("grief", {
        name: partner.name,
        other: p.name,
        role: this.settings.reveal ? partner.role : null,
      });
      this.narrate(
        `💔 ${partner.name}, sevdiği ${p.name} öldüğü için kederden öldü.` +
          (this.settings.reveal ? ` O bir ${ROLES[partner.role].was}.` : ""),
      );
      changed = true;
    }
    if (p.role === "avci" && !p.shotUsed) {
      p.shotUsed = true;
      this.shot = { pid: p.pid, until: Date.now() + 25000 };
      this.notice(
        p.id,
        "🏹 Öldün ama son bir atış hakkın var! 25 saniye içinde birini seç.",
      );
      this.io.push([p.id], {
        title: "Son atışın 🏹",
        body: "Öldün! Yanında götüreceğin kişiyi seç.",
        tag: "shot",
      });
      this.narrate(`🏹 ${p.name} bir Avcı'ydı ve son atışını yapmak üzere!`);
      const shot = this.shot;
      setTimeout(() => {
        if (this.shot !== shot) return;
        this.shot = null;
        this.narrate(`${p.name} son atışını yapmadı.`);
        this.update();
      }, 25000);
      if (p.bot) {
        setTimeout(() => {
          const t = pick(this.alive());
          if (t) this.shoot(p.id, t.pid);
        }, 2500);
      }
      changed = true;
    }
    if (changed && !this.checkWin()) this.update();
  }

  shoot(id, targetPid) {
    const me = this.player(id);
    const target = this.byPid(targetPid);
    if (!me || !this.shot || this.shot.pid !== me.pid) return;
    if (!target || !target.alive || target === me) return;
    this.shot = null;
    this.kill(target);
    this.story("shot", {
      name: target.name,
      by: me.name,
      role: this.settings.reveal ? target.role : null,
    });
    this.narrate(this.deathText(target, `${me.name} tarafından vuruldu 🏹`));
    if (!this.checkWin()) this.update();
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
      return isVamp(a) && !!b && b.alive && isVamp(b);
    }
    if (this.phase === "lastwords") return a.pid === this.condemned;
    if (this.phase === "defense") {
      return !!this.runoff && this.runoff.candidates.includes(a.pid);
    }
    return true; // roles, day, dusk: the whole village
  }

  voiceView(id) {
    const on = this.voice.has(id);
    const members = [...this.voice].filter((v) => v !== id);
    return {
      on,
      cams: [...this.cams].map((v) => this.voicePid(v)).filter(Boolean),
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
    else {
      this.voice.delete(id);
      this.cams.delete(id);
    }
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
    const a = this.voice.delete(id);
    const b = this.cams.delete(id);
    if (a || b) this.update();
  }

  // ---------- emoji reactions ----------

  react(id, params) {
    const REACTIONS = [
      "😱",
      "🤔",
      "😂",
      "👀",
      "😡",
      "❤️",
      "👏",
      "🙄",
      "🤥",
      "🧛",
    ];
    if (!params || !REACTIONS.includes(params.emoji)) return;
    const me = this.player(id);
    const from = me ? me.pid : id === this.stId ? "st" : null;
    if (!from) return;
    // only when you could also talk to the village
    if (id !== this.stId && !this.canWrite(id).includes("town")) return;
    const target = this.byPid(params.to);
    if (!target) return;
    const now = Date.now();
    if (now - (this.lastReact[id] || 0) < 600) return;
    this.lastReact[id] = now;
    const message = JSON.stringify([
      "react",
      { from, to: target.pid, emoji: params.emoji, at: now },
    ]);
    this.io.connectedIds().forEach((other) => this.io.sendTo(other, message));
  }

  // ---------- profile photos (sent separately: they are big) ----------

  setPhoto(id, data) {
    const me = this.player(id);
    if (!me) return;
    if (data === null || data === "") {
      delete this.photos[me.pid];
    } else if (
      typeof data === "string" &&
      data.length < 60000 &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)
    ) {
      this.photos[me.pid] = data;
    } else {
      return;
    }
    const message = JSON.stringify([
      "photo",
      { pid: me.pid, data: this.photos[me.pid] || null },
    ]);
    this.io.connectedIds().forEach((other) => this.io.sendTo(other, message));
    this.save();
  }

  sendPhotos(id) {
    this.io.sendTo(id, JSON.stringify(["photos", this.photos]));
  }

  // ---------- what each person sees ----------

  visibleRole(viewer, p) {
    if (this.phase === "over") return p.role;
    if (!viewer) return null;
    if (viewer.isSt || viewer.id === p.id) return p.role;
    if (!p.alive && this.settings.reveal) return p.role;
    if (isVamp(viewer) && isVamp(p)) return p.role;
    return null;
  }

  /** open votes, or only your own one when voting is secret */
  visibleVotes(me) {
    if (
      !["day", "runoff", "defense", "lastwords", "dusk"].includes(this.phase)
    ) {
      return {};
    }
    const secret =
      this.settings.secretVotes && ["day", "runoff"].includes(this.phase);
    if (!secret) return this.votes;
    return me && this.votes[me.pid] ? { [me.pid]: this.votes[me.pid] } : {};
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
      events: this.events || [],
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
      votes: this.visibleVotes(me),
      votedCount: ["day", "runoff"].includes(this.phase)
        ? this.voters().filter((p) => this.votes[p.pid]).length
        : 0,
      runoff: this.runoff,
      shot: this.shot
        ? {
            pid: this.shot.pid,
            mine: !!me && me.pid === this.shot.pid,
            remaining: Math.max(0, this.shot.until - Date.now()),
          }
        : null,
      lover:
        me && me.lover && this.byPid(me.lover)
          ? { pid: me.lover, name: this.byPid(me.lover).name }
          : null,
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
      const night = {
        action: isVamp(me) ? "vampir" : me.role,
        target: null,
        done: false,
      };
      if (isVamp(me)) {
        night.target = acts.vamp[me.pid] || null;
        night.done = !!night.target;
        night.team = this.alive()
          .filter((p) => isVamp(p))
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
      } else if (me.role === "cadi") {
        night.done = !!(acts.cadi && acts.cadi.done);
        night.cadi = acts.cadi || null;
        night.potions = this.potions;
        // the witch sees who the vampires are going for
        night.victim = this.vampTarget();
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
    if (command === "cam") {
      if (params && this.voice.has(id)) this.cams.add(id);
      else this.cams.delete(id);
      return this.update();
    }
    if (command === "photo") return this.setPhoto(id, params);
    if (command === "react") return this.react(id, params);
    if (command === "photos") return this.sendPhotos(id);
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
        [
          "doktor",
          "gozcu",
          "reveal",
          "lastWords",
          "idlePenalty",
          "avci",
          "cadi",
          "deli",
          "muhtar",
          "kurtadam",
          "lovers",
          "secretVotes",
          "defense",
        ].forEach((key) => {
          if (typeof params[key] === "boolean") {
            this.settings[key] = params[key];
          }
        });
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
          this.story("punish", {
            name: p.name,
            role: this.settings.reveal ? p.role : null,
            how: "kick",
          });
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
        this.story("punish", {
          name: p.name,
          role: this.settings.reveal ? p.role : null,
          how: "rule",
        });
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
      case "shoot":
        return this.shoot(id, params.target);
      case "witch":
        return this.witch(id, params);
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
          this.story("punish", {
            name: p.name,
            role: this.settings.reveal ? p.role : null,
            how: "st",
          });
          this.narrate(this.deathText(p, "öldü"));
        } else if (params.type === "revive" && !p.alive) {
          p.alive = true;
          this.story("revive", { name: p.name });
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
    const bag = shuffle(
      Object.keys(s).reduce(
        (all, role) => all.concat(Array(s[role] || 0).fill(role)),
        [],
      ),
    );
    // roles are dealt as face-down cards; everyone draws one
    this.cards = bag.map((role) => ({ role, by: null }));
    this.players.forEach((p) => {
      p.role = null;
      p.alive = true;
    });
    this.phase = "roles";
    const evil = s.vampir + (s.kurtadam || 0);
    this.story("start", { vampires: evil, players: n });
    this.narrate(
      `Oyun başlıyor! ${evil} kötü aramızda. Herkes masadan bir kart çeksin ve kimseye göstermesin.`,
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
      case "runoff":
        return this.endDay();
      case "defense":
        return this.startRunoff();
      case "lastwords":
        return this.hang();
    }
  }

  startNight() {
    if (!["roles", "dusk"].includes(this.phase)) return;
    if (this.phase === "roles") {
      this.dealRest();
      this.pickLovers();
    }
    this.phase = "night";
    this.round++;
    this.night = { vamp: {}, doktor: null, gozcu: null, suspects: {} };
    this.votes = {};
    this.settleAt = 0;
    this.executed = null;
    this.condemned = null;
    this.nightStarted = Date.now();
    this.story("night", {});
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
            if (phase === "night" && bot.role === "cadi") {
              this.witch(bot.id, {});
            } else if (phase === "night") {
              let options = others;
              if (isVamp(bot)) options = others.filter((p) => !isVamp(p));
              if (bot.role === "doktor") {
                options = this.alive().filter(
                  (p) => p.pid !== this.lastProtected,
                );
              }
              const t = pick(options);
              if (t) this.nightAction(bot.id, t.pid);
            } else if (phase === "day" || phase === "runoff") {
              if (rnd(6) === 0) return this.dayVote(bot.id, "pass");
              let options = isVamp(bot)
                ? others.filter((p) => !isVamp(p))
                : others;
              if (phase === "runoff") {
                options = others.filter((p) =>
                  this.runoff.candidates.includes(p.pid),
                );
              }
              const t = pick(options.length ? options : others);
              if (t) this.dayVote(bot.id, t.pid);
            }
          },
          phase === "day" ? wait * 3 : phase === "runoff" ? wait : wait,
        );
      });
  }

  nightReady() {
    if (this.phase !== "night") return false;
    const living = this.alive();
    const vampsDone = living
      .filter((p) => isVamp(p))
      .every((p) => this.night.vamp[p.pid]);
    const doctor = living.some((p) => p.role === "doktor");
    const seer = living.some((p) => p.role === "gozcu");
    const witch = living.some((p) => p.role === "cadi");
    return (
      vampsDone &&
      (!doctor || !!this.night.doktor) &&
      (!seer || !!this.night.gozcu) &&
      (!witch || !!(this.night.cadi && this.night.cadi.done))
    );
  }

  /** two random players fall in love: if one dies, so does the other */
  pickLovers() {
    if (!this.settings.lovers || this.players.length < 5) return;
    const [a, b] = shuffle(this.players).slice(0, 2);
    a.lover = b.pid;
    b.lover = a.pid;
    [a, b].forEach((p) => {
      const other = p === a ? b : a;
      this.notice(
        p.id,
        `💘 Aşık oldun! Sevdiğin kişi: ${other.name}. Biriniz ölürse diğeri de kederden ölür.`,
      );
    });
    this.story("lovers", {});
  }

  /** the witch: heal tonight's victim and/or poison someone (once each) */
  witch(id, params) {
    if (this.phase !== "night") return;
    const me = this.player(id);
    if (!me || !me.alive || me.role !== "cadi") return;
    const heal = !!params.heal && this.potions.heal;
    let poison = null;
    if (params.poison && this.potions.poison) {
      const t = this.byPid(params.poison);
      if (t && t.alive && t !== me) poison = t.pid;
    }
    this.night.cadi = { heal, poison, done: true };
    this.update();
  }

  /** current leading target of the vampires (the witch may see it) */
  vampTarget() {
    const tally = {};
    Object.values(this.night.vamp).forEach(
      (t) => (tally[t] = (tally[t] || 0) + 1),
    );
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((t) => tally[t] === max);
    return top.length === 1 ? top[0] : null;
  }

  nightAction(id, targetPid) {
    if (this.phase !== "night") return;
    const me = this.player(id);
    const target = this.byPid(targetPid);
    if (!me || !me.alive || !target || !target.alive) return;
    if (isVamp(me)) {
      if (isVamp(target)) return;
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
        vampir: target.role === "vampir", // the Werewolf looks innocent
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
      if (isVamp(p)) return !!this.night.vamp[p.pid];
      if (p.role === "doktor") return !!this.night.doktor;
      if (p.role === "gozcu") return !!this.night.gozcu;
      if (p.role === "cadi") return !!(this.night.cadi && this.night.cadi.done);
      return null; // villagers have nothing that matters to do at night
    });
    const tally = {};
    Object.entries(this.night.vamp).forEach(([vpid, t]) => {
      const v = this.byPid(vpid);
      if (v && v.alive && isVamp(v)) tally[t] = (tally[t] || 0) + 1;
    });
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((t) => tally[t] === max);
    const victim = top.length ? this.byPid(pick(top)) : null;
    let saved = !!victim && this.night.doktor === victim.pid;
    const cadi = this.night.cadi;
    let witchSaved = false;
    if (victim && !saved && cadi && cadi.heal && this.potions.heal) {
      saved = true;
      witchSaved = true;
      this.potions.heal = false;
    }
    this.lastProtected = this.night.doktor;
    this.lastNight = { round: this.round, died: [], saved, witchSaved };
    if (victim && !saved && victim.alive) {
      this.kill(victim);
      this.lastNight.died.push({
        pid: victim.pid,
        name: victim.name,
        role: this.settings.reveal ? victim.role : null,
      });
    }
    let poisoned = null;
    if (cadi && cadi.poison && this.potions.poison) {
      this.potions.poison = false;
      const t = this.byPid(cadi.poison);
      if (t && t.alive) {
        this.kill(t);
        poisoned = t;
        this.lastNight.died.push({
          pid: t.pid,
          name: t.name,
          role: this.settings.reveal ? t.role : null,
          poison: true,
        });
      }
    }
    this.phase = "day";
    this.votes = {};
    this.settleAt = 0;
    let text = `Günaydın köy! ${this.round}. gün başladı. `;
    const was = (d) =>
      this.settings.reveal ? ` O bir ${ROLES[d.role].was}.` : "";
    this.lastNight.died.forEach((d) => {
      text += d.poison
        ? `${d.name} gece zehirlenmiş olarak bulundu.${was(d)} `
        : `Bu gece ${d.name} vampirlerin kurbanı oldu.${was(d)} `;
    });
    if (saved) {
      text += witchSaved
        ? "Vampirler saldırdı ama gizemli bir iksir kurbanı kurtardı! "
        : "Vampirler saldırdı ama Doktor kurbanı kurtardı! ";
    }
    if (!this.lastNight.died.length && !saved) text += "Bu gece kimse ölmedi.";
    text = text.trim();
    this.lastNight.died.forEach((d) =>
      this.story(d.poison ? "poison" : "kill", {
        name: d.name,
        role: d.role,
        text,
      }),
    );
    if (!this.lastNight.died.length || saved) {
      if (!this.lastNight.died.length) {
        this.story(saved ? "saved" : "quiet", { text, witch: witchSaved });
      }
    }
    void poisoned;
    this.story("day", {});
    this.narrate(text);
    this.pushAll({ title: "Gün doğdu ☀️", body: text, tag: "phase" });
    if (this.checkWin()) return;
    this.setDeadline(this.settings.dayMinutes * 60000);
    this.botsAct();
    this.update();
  }

  /** who may vote right now */
  voters() {
    return this.alive().filter((p) => !p.noVote);
  }

  allVoted() {
    return this.voters().every((p) => this.votes[p.pid]);
  }

  dayVote(id, target) {
    if (this.phase !== "day" && this.phase !== "runoff") return;
    const me = this.player(id);
    if (!me || !me.alive || me.noVote) return;
    if (target === null || target === undefined || target === "") {
      delete this.votes[me.pid];
    } else if (target === "pass") {
      this.votes[me.pid] = "pass";
    } else {
      const t = this.byPid(target);
      if (!t || !t.alive || t.id === id) return;
      // the run-off is only between the two defendants
      if (this.phase === "runoff" && !this.runoff.candidates.includes(t.pid)) {
        return;
      }
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

  /** weighted votes: the Muhtar's vote counts twice */
  tally() {
    const tally = {};
    this.voters().forEach((p) => {
      const t = this.votes[p.pid];
      if (t) tally[t] = (tally[t] || 0) + (p.role === "muhtar" ? 2 : 1);
    });
    return tally;
  }

  endDay() {
    if (this.phase !== "day" && this.phase !== "runoff") return;
    const isRunoff = this.phase === "runoff";
    this.trackIdle((p) => !!this.votes[p.pid]);
    const tally = this.tally();
    const ranked = Object.keys(tally)
      .filter((t) => t !== "pass")
      .sort((a, b) => tally[b] - tally[a]);
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((t) => tally[t] === max);
    const lines = ranked.map((t) => `${this.byPid(t).name}: ${tally[t]}`);
    if (tally.pass) lines.push(`Pas: ${tally.pass}`);
    const summary = lines.length ? "Oylar: " + lines.join(", ") + ". " : "";
    this.settleAt = 0;
    this.story("votes", {
      runoff: isRunoff,
      tally: ranked.map((t) => ({ name: this.byPid(t).name, count: tally[t] })),
      pass: tally.pass || 0,
      text: summary.trim() || "Kimse oy vermedi.",
    });
    // defense: the two most voted defend themselves, then a run-off vote
    if (!isRunoff && this.settings.defense && ranked.length >= 2) {
      const candidates = ranked.slice(0, 2);
      this.runoff = { candidates };
      this.phase = "defense";
      const names = candidates.map((pid) => this.byPid(pid).name);
      this.story("defense", { names });
      this.narrate(
        `${summary}En çok oyu ${names[0]} ve ${names[1]} aldı. Şimdi ikisi savunma yapacak, sonra aralarında son oylama olacak.`,
      );
      this.setDeadline(DEFENSE_MS);
      this.update();
      return;
    }
    this.runoff = null;
    if (max > 0 && top.length === 1 && top[0] !== "pass") {
      const p = this.byPid(top[0]);
      this.condemned = p.pid;
      if (this.settings.lastWords) {
        this.phase = "lastwords";
        this.story("lastwords", { name: p.name });
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
    this.story(max > 0 && top.length > 1 ? "tie" : "nohang", {});
    this.narrate(
      summary +
        (max > 0 && top.length > 1
          ? "Oylar eşit çıktı, bugün kimse asılmadı."
          : "Bugün kimse asılmadı."),
    );
    this.toDusk();
  }

  /** after the defense speeches: vote again between the two */
  startRunoff() {
    if (this.phase !== "defense") return;
    this.phase = "runoff";
    this.votes = {};
    this.settleAt = 0;
    const names = this.runoff.candidates.map((pid) => this.byPid(pid).name);
    this.narrate(`Son oylama: ${names[0]} mı, ${names[1]} mı?`);
    this.setDeadline(RUNOFF_MS);
    this.botsAct();
    this.update();
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
      this.story("hang", { name: p.name, role: this.executed.role });
      this.narrate(this.deathText(p, "asıldı"));
      if (p.role === "deli") {
        // the Jester wanted exactly this
        this.condemned = null;
        this.checkWin(
          "deli",
          `🤡 ${p.name} bir Deli'ydi ve asılmayı başardı. Deli kazandı!`,
        );
        return;
      }
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

  checkWin(forced, forcedText) {
    if (this.phase === "over") return true;
    const living = this.alive();
    const vamps = living.filter((p) => isVamp(p)).length;
    const others = living.length - vamps;
    let winner = forced || null;
    let text = forcedText || "";
    if (!winner && vamps === 0) {
      winner = "koy";
      text = "Bütün vampirler yok edildi. Köylüler kazandı! 🎉";
    } else if (!winner && vamps >= others) {
      winner = "vampir";
      text = "Vampirler köyü ele geçirdi. Vampirler kazandı! 🧛";
    }
    if (!winner) return false;
    clearTimeout(this.timer);
    this.phase = "over";
    this.winner = winner;
    this.deadline = 0;
    this.condemned = null;
    this.shot = null;
    this.runoff = null;
    this.story("win", {
      winner,
      roles: this.players.map((p) => ({
        name: p.name,
        role: p.role,
        alive: p.alive,
      })),
    });
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
    this.story("penalty", {
      items: this.penalties.map((x) => ({ name: x.name, text: x.text })),
    });
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
