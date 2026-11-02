<template>
  <span
    class="avatar"
    :class="{ dead, offline: online === false, speaking }"
    :style="{
      width: size + 'px',
      height: size + 'px',
      fontSize: size * 0.4 + 'px',
      background,
    }"
  >
    <img v-if="photo" :src="photo" alt="" class="photo" />
    <span v-else class="initials">{{ initials }}</span>
    <span class="badge" v-if="badge">{{ badge }}</span>
    <span class="skull" v-if="dead">💀</span>
    <span class="mic" v-if="mic">🎙️</span>
  </span>
</template>

<script>
import { game } from "../game";

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
  },
  computed: {
    photo() {
      if (this.src) return this.src;
      let pid = this.pid;
      if (!pid && game.state && this.name) {
        const p = game.state.players.find((x) => x.name === this.name);
        pid = p ? p.pid : "";
      }
      return pid ? game.photos[pid] || "" : "";
    },
    initials() {
      const parts = this.name.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return "?";
      const first = parts[0][0] || "";
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
</style>
