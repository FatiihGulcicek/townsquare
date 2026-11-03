<template>
  <span
    class="avatar"
    :class="[{ dead, offline: online === false, speaking }, frame]"
    :style="{
      width: size + 'px',
      height: size + 'px',
      fontSize: size * 0.4 + 'px',
      background,
    }"
  >
    <img v-if="photo" :src="photo" alt="" class="photo" />
    <span v-else class="initials">{{ initials }}</span>
    <span class="badge" v-if="displayBadge">{{ displayBadge }}</span>
    <span class="skull" v-if="dead">💀</span>
    <span class="mic" v-if="mic">🎙️</span>
    <span class="lvl" v-if="lvl >= 3 && size >= 44">{{ lvl }}</span>
  </span>
</template>

<script>
import { game } from "../game";
import { progress, levelFor, AVATAR_PRESETS, EMBLEM_PRESETS } from "../progress";

const PALETTE = [
  ["#7b2cbf", "#3c096c"],
  ["#d62828", "#6a040f"],
  ["#0077b6", "#023e8a"],
  ["#2a9d8f", "#1b4332"],
  ["#e76f51", "#9c2c13"],
  ["#c9a227", "#7a5c00"],
  ["#457b9d", "#1d3557"],
  ["#b5179e", "#560bad"],
  ["#588157", "#344e41"],
  ["#bc6c25", "#6f3a0f"],
];

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export default {
  props: {
    name: { type: String, default: "" },
    size: { type: Number, default: 48 },
    dead: Boolean,
    online: { type: Boolean, default: undefined },
    badge: { type: String, default: "" },
    speaking: Boolean,
    pid: { type: String, default: "" },
    src: { type: String, default: "" },
    mic: Boolean,
    self: Boolean,
  },
  computed: {
    player() {
      if (!game.state) return null;
      return (
        game.state.players.find(
          (x) => x.pid === this.pid || (!this.pid && x.name === this.name),
        ) || null
      );
    },
    lvl() {
      if (this.self || this.src) return levelFor(progress.totals.xp); // own avatar
      return this.player ? this.player.level || 1 : 1;
    },
    frame() {
      const bought = this.self || this.src
        ? (progress.totals.equipped || {}).frame
        : this.player && this.player.frame;
      if (bought) return "c-" + bought;
      const l = this.lvl;
      if (l >= 16) return "f-legend";
      if (l >= 12) return "f-ruby";
      if (l >= 8) return "f-gold";
      if (l >= 5) return "f-silver";
      if (l >= 3) return "f-bronze";
      return "";
    },
    photo() {
      if (this.self) {
        const preset = (progress.totals.equipped || {}).avatar;
        if (AVATAR_PRESETS[preset]) return AVATAR_PRESETS[preset];
      }
      if (this.src) return this.src;
      if (this.player && AVATAR_PRESETS[this.player.avatar])
        return AVATAR_PRESETS[this.player.avatar];
      let pid = this.pid;
      if (!pid && game.state && this.name) {
        const p = game.state.players.find((x) => x.name === this.name);
        pid = p ? p.pid : "";
      }
      return pid ? game.photos[pid] || "" : "";
    },
    displayBadge() {
      if (this.badge) return this.badge;
      const chosen = this.self
        ? (progress.totals.equipped || {}).emblem
        : this.player && this.player.emblem;
      return EMBLEM_PRESETS[chosen] || "";
    },
    initials() {
      // letters only (skip emoji such as the bot's 🤖)
      const parts = this.name
        .trim()
        .split(/\s+/)
        .map((w) => Array.from(w).filter((ch) => /\p{L}|\p{N}/u.test(ch)))
        .filter((chars) => chars.length);
      if (!parts.length) return "?";
      const first = parts[0][0];
      const second = parts.length > 1 ? parts[1][0] : parts[0][1] || "";
      return (first + second).toLocaleUpperCase("tr");
    },
    background() {
      const [a, b] = PALETTE[hash(this.name) % PALETTE.length];
      return `linear-gradient(145deg, ${a}, ${b})`;
    },
  },
};
</script>

<style scoped>
.avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: white;
  font-weight: 800;
  flex-shrink: 0;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.18),
    0 4px 12px rgba(0, 0, 0, 0.45);
  letter-spacing: 0.02em;
}
.photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.avatar.f-bronze {
  box-shadow:
    0 0 0 3px #b0763b,
    0 4px 12px rgba(0, 0, 0, 0.45);
}
.avatar.f-silver {
  box-shadow:
    0 0 0 3px #cfd6df,
    0 0 10px rgba(220, 230, 240, 0.4);
}
.avatar.f-gold {
  box-shadow:
    0 0 0 3px #e9b44c,
    0 0 14px rgba(233, 180, 76, 0.6);
}
.avatar.f-ruby {
  box-shadow:
    0 0 0 3px #c4122f,
    0 0 16px rgba(220, 20, 50, 0.7);
}
.avatar.f-legend {
  box-shadow:
    0 0 0 3px #b47bff,
    0 0 18px rgba(180, 123, 255, 0.9);
  animation: legend 3s linear infinite;
}
@keyframes legend {
  0%,
  100% {
    box-shadow:
      0 0 0 3px #b47bff,
      0 0 18px rgba(180, 123, 255, 0.9);
  }
  50% {
    box-shadow:
      0 0 0 3px #e9b44c,
      0 0 22px rgba(233, 180, 76, 0.9);
  }
}
.lvl {
  position: absolute;
  right: -8%;
  bottom: -8%;
  min-width: 34%;
  height: 34%;
  border-radius: 999px;
  background: #0b0d18;
  border: 1.5px solid #e9b44c;
  color: #e9b44c;
  font-size: 0.45em;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
}
.avatar.dead {
  filter: grayscale(1) brightness(0.55);
}
.avatar.offline::after {
  content: "";
  position: absolute;
  right: 2%;
  bottom: 2%;
  width: 22%;
  height: 22%;
  border-radius: 50%;
  background: #666;
  box-shadow: 0 0 0 2px #0b0d18;
}
.avatar.c-frame-fire {
  box-shadow:
    0 0 0 3px #ff7a1a,
    0 0 18px rgba(255, 90, 0, 0.9);
  animation: fire 1.2s ease-in-out infinite;
}
@keyframes fire {
  50% {
    box-shadow:
      0 0 0 3px #ffc23d,
      0 0 26px rgba(255, 140, 0, 0.9);
  }
}
.avatar.c-frame-ice {
  box-shadow:
    0 0 0 3px #9be7ff,
    0 0 18px rgba(120, 220, 255, 0.8);
}
.avatar.c-frame-rose {
  box-shadow:
    0 0 0 3px #ff6fa5,
    0 0 16px rgba(255, 100, 160, 0.7);
}
.avatar.c-frame-shadow {
  box-shadow:
    0 0 0 3px #1b1b1b,
    0 0 22px rgba(120, 0, 200, 0.9);
}
.avatar.c-frame-moon {
  box-shadow: 0 0 0 2px #e5cead, 0 0 0 5px #6b4c9b,
    0 0 20px rgba(190, 154, 255, 0.75);
}
.avatar.c-frame-thorn {
  box-shadow: 0 0 0 2px #b8455a, 0 0 0 5px #3f1428,
    0 0 17px rgba(217, 56, 88, 0.7);
}
.avatar.c-frame-royal {
  box-shadow: 0 0 0 2px #fff0b8, 0 0 0 5px #bf852b,
    0 0 21px rgba(255, 203, 83, 0.8);
}
.avatar.c-frame-emerald {
  box-shadow: 0 0 0 2px #c9f8bd, 0 0 0 5px #258561,
    0 0 20px rgba(74, 211, 158, 0.72);
}
.avatar.speaking {
  box-shadow:
    0 0 0 3px #3ddc84,
    0 0 18px rgba(61, 220, 132, 0.8);
}
.mic {
  position: absolute;
  left: -8%;
  top: -8%;
  font-size: 0.6em;
}
.badge {
  position: absolute;
  right: -6%;
  top: -6%;
  font-size: 0.75em;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
}
.skull {
  position: absolute;
  font-size: 0.8em;
  bottom: -8%;
  left: -6%;
  filter: none;
}
.avatar.c-frame-fire {
  box-shadow:
    0 0 0 3px #ff7a1a,
    0 0 18px rgba(255, 90, 0, 0.9);
  animation: fire 1.2s ease-in-out infinite;
}
@keyframes fire {
  50% {
    box-shadow:
      0 0 0 3px #ffc23d,
      0 0 26px rgba(255, 140, 0, 0.9);
  }
}
.avatar.c-frame-ice {
  box-shadow:
    0 0 0 3px #9be7ff,
    0 0 18px rgba(120, 220, 255, 0.8);
}
.avatar.c-frame-rose {
  box-shadow:
    0 0 0 3px #ff6fa5,
    0 0 16px rgba(255, 100, 160, 0.7);
}
.avatar.c-frame-shadow {
  box-shadow:
    0 0 0 3px #1b1b1b,
    0 0 22px rgba(120, 0, 200, 0.9);
}
.avatar.speaking {
  box-shadow:
    0 0 0 3px #3ddc84,
    0 0 18px rgba(61, 220, 132, 0.8) !important;
}
</style>
