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
    <span class="initials">{{ initials }}</span>
    <span class="badge" v-if="badge">{{ badge }}</span>
    <span class="skull" v-if="dead">💀</span>
    <span class="mic" v-if="mic">🎙️</span>
  </span>
</template>

<script>
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
    mic: Boolean,
  },
  computed: {
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
