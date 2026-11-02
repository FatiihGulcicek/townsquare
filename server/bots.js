/*
 * Practice bots that play like people: they suspect, accuse, defend
 * themselves, claim roles (vampires sometimes bluff), follow the crowd when
 * voting and answer when someone talks about them.
 */
"use strict";
const crypto = require("crypto");

const rnd = (n) => (n > 0 ? crypto.randomInt(n) : 0);
const pick = (list) => list[rnd(list.length)];
const chance = (p) => Math.random() < p;
const isVampRole = (role) => role === "vampir" || role === "kurtadam";

const LINES = {
  accuse: [
    "Bence {x} çok şüpheli, dün hiç konuşmadı.",
    "{x} bir şeyler saklıyor gibi…",
    "Benim oyum {x}. İçimde kötü bir his var.",
    "{x}, dün gece neredeydin? 🤨",
    "Herkes {x}'e baksın, bence vampir o.",
    "{x} fazla sakin, bu iyiye işaret değil.",
  ],
  defend: [
    "Ben masumum! Beni asarsanız pişman olursunuz. 😤",
    "Neden ben? Ben sadece bir köylüyüm!",
    "Yanlış kişiye bakıyorsunuz, asıl şüpheli başka.",
    "Bana güvenin, ben vampir değilim. 🙏",
    "Beni suçlayan kişiye bir bakın bence…",
  ],
  casual: [
    "Hmm 🤔",
    "Bu gece kimse ölmesin inşallah.",
    "Bir şey fark ettiniz mi?",
    "Ben de emin değilim açıkçası.",
    "Konuşmayanlar en şüphelileri bence.",
  ],
  seerVamp: [
    "Ben Gözcüyüm! Dün gece {x}'e baktım: VAMPİR! 🧛",
    "Açıklıyorum: Gözcüyüm ve {x} vampir çıktı!",
  ],
  seerClean: ["Gözcüyüm; {x} temiz, ona dokunmayın."],
  agree: ["Katılıyorum, {x}.", "Evet, ben de {x} diyorum.", "Mantıklı. {x}."],
};

function line(kind, x) {
  return pick(LINES[kind]).replace(/\{x\}/g, x || "");
}

class BotBrain {
  constructor(room) {
    this.room = room;
    this.gameId = room.gameId;
    this.sus = {}; // botPid -> { pid: score }
    this.claims = {}; // pid -> { role, accused }
    this.found = {}; // botPid -> [{ pid, vampir }]
    this.bluffed = new Set();
  }

  bots() {
    return this.room.alive().filter((p) => p.bot);
  }

  suspicion(bot) {
    if (!this.sus[bot.pid]) {
      const s = {};
      this.room.players.forEach((p) => {
        if (p === bot) return;
        s[p.pid] = Math.random() * 2;
        if (isVampRole(bot.role) && isVampRole(p.role)) s[p.pid] = -100;
      });
      this.sus[bot.pid] = s;
    }
    return this.sus[bot.pid];
  }

  bump(target, amount, except) {
    this.room.players
      .filter((p) => p.bot && p !== except)
      .forEach((bot) => {
        const s = this.suspicion(bot);
        if (s[target] > -50) s[target] = (s[target] || 0) + amount;
      });
  }

  topSuspect(bot, pool) {
    const s = this.suspicion(bot);
    const options = (pool || this.room.alive()).filter((p) => p !== bot);
    if (!options.length) return null;
    return options.reduce((best, p) =>
      (s[p.pid] || 0) > (s[best.pid] || 0) ? p : best,
    );
  }

  talk(bot, text, delay) {
    setTimeout(() => {
      if (!bot.alive || this.room.phase === "night") return;
      this.room.botSay(bot, text);
    }, delay);
  }

  /** the room asks the bots to act at the start of a phase */
  act(phase) {
    const room = this.room;
    const round = room.round;
    const still = () => room.phase === phase && room.round === round;
    if (phase === "night") {
      this.bots().forEach((bot, i) =>
        setTimeout(
          () => still() && bot.alive && this.night(bot),
          2500 + rnd(5000) + i * 300,
        ),
      );
    } else if (phase === "day") {
      this.dayTalk();
      const dayMs = room.settings.dayMinutes * 60000;
      this.bots().forEach((bot) => {
        const at = Math.min(
          90000,
          Math.max(12000, dayMs * (0.25 + Math.random() * 0.35)),
        );
        setTimeout(() => still() && bot.alive && this.vote(bot), at);
      });
    } else if (phase === "runoff") {
      this.bots().forEach((bot) =>
        setTimeout(
          () => still() && bot.alive && this.vote(bot),
          4000 + rnd(9000),
        ),
      );
    }
  }

  night(bot) {
    const room = this.room;
    const alive = room.alive();
    const others = alive.filter((p) => p !== bot);
    const seerClaimer = alive.find(
      (p) => this.claims[p.pid] && this.claims[p.pid].role === "gozcu",
    );
    if (isVampRole(bot.role)) {
      // follow a teammate's choice, or go for the loudest seer
      const chosen = Object.values(room.night.vamp)[0];
      let target = chosen ? room.byPid(chosen) : null;
      if (
        !target &&
        seerClaimer &&
        !isVampRole(seerClaimer.role) &&
        chance(0.7)
      ) {
        target = seerClaimer;
      }
      if (!target) {
        const prey = others.filter((p) => !isVampRole(p.role));
        target = pick(prey);
      }
      if (target) room.nightAction(bot.id, target.pid);
    } else if (bot.role === "doktor") {
      let target = null;
      if (
        seerClaimer &&
        seerClaimer.pid !== room.lastProtected &&
        chance(0.7)
      ) {
        target = seerClaimer;
      } else if (bot.pid !== room.lastProtected && chance(0.35)) {
        target = bot;
      } else {
        target = pick(alive.filter((p) => p.pid !== room.lastProtected));
      }
      if (target) room.nightAction(bot.id, target.pid);
    } else if (bot.role === "gozcu") {
      const seen = (this.found[bot.pid] || []).map((f) => f.pid);
      const target = this.topSuspect(
        bot,
        others.filter((p) => !seen.includes(p.pid)),
      );
      if (target) {
        room.nightAction(bot.id, target.pid);
        (this.found[bot.pid] = this.found[bot.pid] || []).push({
          pid: target.pid,
          vampir: target.role === "vampir",
        });
        const s = this.suspicion(bot);
        s[target.pid] = target.role === "vampir" ? 100 : -20;
      }
    } else if (bot.role === "cadi") {
      const victim = room.vampTarget();
      const accused = Object.values(this.claims)
        .map((c) => room.byPid(c.accused))
        .find((p) => p && p.alive);
      room.witch(bot.id, {
        heal: !!victim && chance(0.5),
        poison: accused && chance(0.5) ? accused.pid : null,
      });
    } else {
      const t = pick(others);
      if (t) room.nightAction(bot.id, t.pid);
    }
  }

  dayTalk() {
    const room = this.room;
    let delay = 3000;
    this.bots().forEach((bot) => {
      // a seer bot reveals what it found
      const found = (this.found[bot.pid] || []).filter((f) => {
        const p = room.byPid(f.pid);
        return p && p.alive;
      });
      const vamp = found.find((f) => f.vampir);
      if (bot.role === "gozcu" && vamp && chance(0.8)) {
        const x = room.byPid(vamp.pid);
        this.claims[bot.pid] = { role: "gozcu", accused: x.pid };
        this.bump(x.pid, 6, null);
        this.talk(bot, line("seerVamp", x.name), (delay += 2500 + rnd(3000)));
        return;
      }
      // a vampire sometimes pretends to be the seer
      if (isVampRole(bot.role) && !this.bluffed.has(bot.pid) && chance(0.15)) {
        const victim = pick(
          room.alive().filter((p) => !isVampRole(p.role) && p !== bot),
        );
        if (victim) {
          this.bluffed.add(bot.pid);
          this.claims[bot.pid] = { role: "gozcu", accused: victim.pid };
          this.bump(victim.pid, 4, bot);
          this.talk(
            bot,
            line("seerVamp", victim.name),
            (delay += 2500 + rnd(3000)),
          );
          return;
        }
      }
      if (chance(0.55)) {
        const pool = isVampRole(bot.role)
          ? room.alive().filter((p) => !isVampRole(p.role))
          : room.alive();
        const x = this.topSuspect(bot, pool);
        if (x)
          this.talk(bot, line("accuse", x.name), (delay += 2000 + rnd(4000)));
      } else if (chance(0.3)) {
        this.talk(bot, line("casual"), (delay += 2000 + rnd(4000)));
      }
    });
  }

  vote(bot) {
    const room = this.room;
    if (room.votes[bot.pid]) return;
    let pool = room.alive().filter((p) => p !== bot);
    if (room.phase === "runoff" && room.runoff) {
      pool = pool.filter((p) => room.runoff.candidates.includes(p.pid));
    }
    if (isVampRole(bot.role)) {
      const prey = pool.filter((p) => !isVampRole(p.role));
      if (prey.length) pool = prey;
    }
    if (!pool.length) return room.dayVote(bot.id, "pass");
    // own suspicion plus the crowd
    const s = this.suspicion(bot);
    const crowd = {};
    Object.values(room.votes).forEach((t) => (crowd[t] = (crowd[t] || 0) + 1));
    const score = (p) =>
      (s[p.pid] || 0) + 0.6 * (crowd[p.pid] || 0) + Math.random() * 1.5;
    const target = pool.reduce((best, p) =>
      score(p) > score(best) ? p : best,
    );
    if (room.phase === "day" && score(target) < 1 && chance(0.25)) {
      return room.dayVote(bot.id, "pass");
    }
    room.dayVote(bot.id, target.pid);
    if (chance(0.25) && crowd[target.pid]) {
      this.talk(bot, line("agree", target.name), 800 + rnd(1500));
    }
  }

  /** a human wrote something in the village chat */
  heard(speaker, text) {
    const room = this.room;
    const lower = text.toLocaleLowerCase("tr");
    // "I'm the seer, X is a vampire"
    if (/gözcü/.test(lower)) {
      const named = room
        .alive()
        .find(
          (p) =>
            p !== speaker && lower.includes(p.name.toLocaleLowerCase("tr")),
        );
      if (named) {
        this.claims[speaker.pid] = { role: "gozcu", accused: named.pid };
        if (/temiz|masum/.test(lower)) this.bump(named.pid, -3, null);
        else this.bump(named.pid, 3, null);
      }
    }
    this.bots().forEach((bot) => {
      if (!lower.includes(bot.name.toLocaleLowerCase("tr"))) return;
      const s = this.suspicion(bot);
      if (/vampir|şüpheli|as |asalım|suçlu|oy/.test(lower)) {
        s[speaker.pid] = (s[speaker.pid] || 0) + 2;
        if (chance(0.8)) this.talk(bot, line("defend"), 1500 + rnd(2500));
      } else if (chance(0.4)) {
        this.talk(bot, line("casual"), 1500 + rnd(2500));
      }
    });
  }

  /** the hunter bot shoots its main suspect */
  shotTarget(bot) {
    const pool = this.room.alive().filter((p) => p !== bot);
    return this.topSuspect(bot, pool) || pick(pool);
  }
}

module.exports = { BotBrain };
