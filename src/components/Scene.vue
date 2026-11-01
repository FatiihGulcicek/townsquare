<template>
  <div
    class="scene"
    :class="{
      night: grimoire.isNight,
      still: grimoire.isStatic || reducedMotion,
    }"
    aria-hidden="true"
  >
    <div class="layer sky" v-html="skySvg"></div>
    <div class="layer clouds far"></div>
    <div class="layer town" v-html="townSvg"></div>
    <div class="layer clouds near"></div>
    <div class="layer fog"><span></span><span></span><span></span></div>
    <canvas ref="rain" class="layer rain"></canvas>
    <div class="layer lightning"></div>
    <div class="layer vignette"></div>
  </div>
</template>

<script>
import { mapState } from "vuex";

// small deterministic random generator so the town looks the same for everyone
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const W = 1600;
const H = 900;
const GROUND = 770;

function buildSky() {
  const r = rng(7);
  let stars = "";
  for (let i = 0; i < 170; i++) {
    const x = (r() * W).toFixed(1);
    const y = (r() * 520).toFixed(1);
    const size = (r() * 1.3 + 0.4).toFixed(2);
    const twinkle = i % 4 === 0;
    stars += `<circle cx="${x}" cy="${y}" r="${size}" ${
      twinkle
        ? `class="tw" style="animation-delay:${(r() * 6).toFixed(2)}s;animation-duration:${(3 + r() * 4).toFixed(2)}s"`
        : ""
    }/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#04060f"/>
      <stop offset="0.45" stop-color="#0f1733"/>
      <stop offset="0.72" stop-color="#2c3264"/>
      <stop offset="1" stop-color="#5a3c5e"/>
    </linearGradient>
    <radialGradient id="sc-halo">
      <stop offset="0" stop-color="#f6e7bf" stop-opacity="0.6"/>
      <stop offset="0.35" stop-color="#9fb1e6" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#9fb1e6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sc-moon" cx="40%" cy="38%">
      <stop offset="0" stop-color="#fffaf0"/>
      <stop offset="1" stop-color="#e6d6aa"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sc-sky)"/>
  <g fill="#eef1ff" opacity="0.85">${stars}</g>
  <circle class="halo" cx="1210" cy="190" r="300" fill="url(#sc-halo)"/>
  <circle cx="1210" cy="190" r="58" fill="url(#sc-moon)"/>
  <g fill="#cdbb8c" opacity="0.35">
    <circle cx="1192" cy="172" r="11"/><circle cx="1230" cy="208" r="8"/><circle cx="1222" cy="168" r="5"/><circle cx="1188" cy="215" r="6"/>
  </g>
</svg>`;
}

function house(r, x, w, baseH, opts) {
  const h = baseH + r() * opts.vary;
  const top = GROUND - h;
  const roof = 30 + r() * 50;
  const roofType = r();
  let shape;
  if (roofType < 0.6) {
    shape = `M${x} ${GROUND}V${top}L${x + w / 2} ${top - roof}L${x + w} ${top}V${GROUND}Z`;
  } else if (roofType < 0.85) {
    // stepped gable
    const s = w / 6;
    shape = `M${x} ${GROUND}V${top}h${s}v-${roof / 3}h${s}v-${roof / 3}h${2 * s}v${roof / 3}h${s}v${roof / 3}h${s}V${GROUND}Z`;
  } else {
    shape = `M${x} ${GROUND}V${top}L${x + w * 0.2} ${top - roof * 0.6}H${x + w * 0.8}L${x + w} ${top}V${GROUND}Z`;
  }
  let extra = "";
  if (r() < 0.55) {
    const cx = x + w * (0.2 + r() * 0.5);
    extra += `<rect x="${cx}" y="${top - roof * 0.7}" width="${8 + r() * 6}" height="${roof * 0.7 + 4}"/>`;
  }
  let windows = "";
  const cols = Math.max(1, Math.floor(w / 34));
  const rows = Math.max(1, Math.floor((h - 30) / 48));
  for (let c = 0; c < cols; c++) {
    for (let row = 0; row < rows; row++) {
      if (r() > opts.lit) continue;
      const wx = x + (w / cols) * c + (w / cols - 12) / 2;
      const wy = top + 22 + row * 48;
      const arched = r() < 0.3;
      const cls = r() < 0.35 ? "win flick" : "win";
      const d = (r() * 8).toFixed(2);
      windows += arched
        ? `<path class="${cls}" style="animation-delay:${d}s" d="M${wx} ${wy + 20}v-12a6 6 0 0 1 12 0v12z"/>`
        : `<rect class="${cls}" style="animation-delay:${d}s" x="${wx}" y="${wy}" width="12" height="18" rx="1.5"/>`;
    }
  }
  return { body: `<path d="${shape}"/>${extra}`, windows };
}

function buildTown() {
  const r = rng(42);
  let back = "";
  let backWin = "";
  for (let x = -40; x < W + 40; ) {
    const w = 70 + r() * 90;
    const hs = house(r, x, w, 150, { vary: 140, lit: 0.18 });
    back += hs.body;
    backWin += hs.windows;
    x += w - 8;
  }
  let front = "";
  let frontWin = "";
  for (let x = -60; x < W + 60; ) {
    // leave room for the hall in the middle-left
    if (x > 470 && x < 690) {
      x = 690;
      continue;
    }
    const w = 90 + r() * 110;
    const hs = house(r, x, w, 90, { vary: 110, lit: 0.32 });
    front += hs.body;
    frontWin += hs.windows;
    x += w - 4;
  }
  // town hall with a bell tower and rose window
  const hall = `
    <path d="M480 ${GROUND}V560L580 480L680 560V${GROUND}Z"/>
    <path d="M548 480V330L580 240L612 330V480Z"/>
    <path d="M572 240L580 205L588 240Z"/>`;
  const hallWin = `
    <circle class="win flick" cx="580" cy="560" r="22"/>
    <path class="win" d="M570 330v-16a10 10 0 0 1 20 0v16z"/>
    <rect class="win" x="508" y="600" width="18" height="34" rx="9"/>
    <rect class="win flick" style="animation-delay:3s" x="634" y="600" width="18" height="34" rx="9"/>
    <path fill="#2a1a0c" d="M560 ${GROUND}v-70a20 20 0 0 1 40 0v70z"/>`;
  // well and lanterns on the square
  const square = `
    <ellipse cx="800" cy="${GROUND + 66}" rx="62" ry="12" fill="#03040a" opacity="0.6"/>
    <path d="M748 ${GROUND + 62}v-38h104v38z"/>
    <path d="M742 ${GROUND + 24}h116v-8H742z"/>
    <path d="M756 ${GROUND + 16}v-68h6v68zM838 ${GROUND + 16}v-68h6v68z"/>
    <path d="M740 ${GROUND - 52}L800 ${GROUND - 86}L860 ${GROUND - 52}z"/>`;
  const lantern = (x) => `
    <rect x="${x - 3}" y="${GROUND - 120}" width="6" height="${200}"/>
    <path d="M${x - 14} ${GROUND - 120}h28l-6 -30h-16z"/>
    <circle class="lamp" cx="${x}" cy="${GROUND - 136}" r="70" fill="url(#sc-lamp)"/>
    <rect class="lamp-core" x="${x - 7}" y="${GROUND - 146}" width="14" height="20" rx="3" fill="#ffd27a"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="sc-lamp">
      <stop offset="0" stop-color="#ffcf73" stop-opacity="0.75"/>
      <stop offset="0.25" stop-color="#ffb347" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sc-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0e1f"/>
      <stop offset="1" stop-color="#030409"/>
    </linearGradient>
    <radialGradient id="sc-warm" cx="50%" cy="100%" r="60%">
      <stop offset="0" stop-color="#ff9a4a" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path fill="#161d45" d="M0 610 Q200 540 420 590 T860 570 T1280 590 T1600 560 V${H}H0Z"/>
  <rect x="0" y="420" width="${W}" height="${GROUND - 420}" fill="url(#sc-warm)"/>
  <g fill="#10163a">${back}</g>
  <g class="windows dim" fill="#e0a64a">${backWin}</g>
  <g fill="#060815">${front}${hall}</g>
  <g class="windows" fill="#ffc45e">${frontWin}${hallWin}</g>
  <rect x="0" y="${GROUND}" width="${W}" height="${H - GROUND}" fill="url(#sc-ground)"/>
  <g fill="#020309">${square}${lantern(330)}${lantern(1270)}</g>
</svg>`;
}

export default {
  data() {
    return {
      skySvg: buildSky(),
      townSvg: buildTown(),
      reducedMotion:
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      raf: null,
    };
  },
  computed: {
    raining() {
      return (
        this.grimoire.isNight && !this.grimoire.isStatic && !this.reducedMotion
      );
    },
    ...mapState(["grimoire"]),
  },
  watch: {
    raining(on) {
      if (on) this.startRain();
      else this.stopRain();
    },
  },
  mounted() {
    if (this.raining) this.startRain();
  },
  beforeDestroy() {
    this.stopRain();
  },
  methods: {
    startRain() {
      const canvas = this.$refs.rain;
      if (!canvas || this.raf) return;
      const ctx = canvas.getContext("2d");
      const drops = [];
      const resize = () => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      };
      resize();
      this._resize = resize;
      window.addEventListener("resize", resize);
      const count = Math.min(260, Math.round(canvas.width / 5));
      for (let i = 0; i < count; i++) {
        drops.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          l: 10 + Math.random() * 18,
          v: 9 + Math.random() * 9,
          a: 0.12 + Math.random() * 0.25,
        });
      }
      let last = performance.now();
      const frame = (now) => {
        const dt = Math.min(50, now - last) / 16.7;
        last = now;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = "round";
        ctx.lineWidth = 1.2;
        for (const d of drops) {
          d.y += d.v * dt;
          d.x -= d.v * 0.18 * dt;
          if (d.y > canvas.height) {
            d.y = -d.l;
            d.x = Math.random() * (canvas.width + 100);
          }
          ctx.strokeStyle = `rgba(190,205,255,${d.a})`;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.l * 0.18, d.y - d.l);
          ctx.stroke();
        }
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    },
    stopRain() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      if (this._resize) window.removeEventListener("resize", this._resize);
      const canvas = this.$refs.rain;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    },
  },
};
</script>

<style lang="scss">
.scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  background: #04060f;

  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    > svg {
      width: 100%;
      height: 100%;
      display: block;
    }
  }

  .sky .tw {
    animation: sc-twinkle 4s ease-in-out infinite;
  }
  .sky .halo {
    animation: sc-halo 9s ease-in-out infinite;
    transform-origin: 1210px 190px;
  }

  // drifting clouds made of soft gradients
  .clouds {
    width: 200%;
    background-repeat: repeat-x;
    animation: sc-drift 180s linear infinite;
    &.far {
      opacity: 0.35;
      background-image:
        radial-gradient(ellipse 22% 7% at 12% 22%, #5d6a9a 0%, transparent 70%),
        radial-gradient(ellipse 18% 6% at 38% 14%, #4b5788 0%, transparent 70%),
        radial-gradient(ellipse 26% 8% at 66% 26%, #59669a 0%, transparent 70%),
        radial-gradient(ellipse 16% 5% at 88% 12%, #4b5788 0%, transparent 70%);
      background-size: 50% 100%;
    }
    &.near {
      opacity: 0.22;
      animation-duration: 95s;
      background-image:
        radial-gradient(ellipse 30% 9% at 20% 34%, #8090c0 0%, transparent 70%),
        radial-gradient(ellipse 24% 7% at 72% 18%, #7080b4 0%, transparent 70%);
      background-size: 50% 100%;
    }
  }

  .town .win.flick {
    animation: sc-flicker 6s steps(1) infinite;
  }
  .town .windows {
    filter: drop-shadow(0 0 6px rgba(255, 190, 90, 0.7));
  }
  .town .windows.dim {
    opacity: 0.55;
    filter: none;
  }
  .town .lamp {
    animation: sc-lamp 3.2s ease-in-out infinite;
    transform-box: fill-box;
    transform-origin: center;
  }

  // low fog drifting across the square
  .fog span {
    position: absolute;
    left: -50%;
    width: 200%;
    height: 34%;
    bottom: -6%;
    background: radial-gradient(
      ellipse at center,
      rgba(150, 165, 210, 0.14) 0%,
      rgba(150, 165, 210, 0) 65%
    );
    animation: sc-fog 60s ease-in-out infinite alternate;
    &:nth-child(2) {
      bottom: 4%;
      height: 24%;
      opacity: 0.7;
      animation-duration: 85s;
      animation-direction: alternate-reverse;
    }
    &:nth-child(3) {
      bottom: -10%;
      height: 40%;
      opacity: 0.5;
      animation-duration: 120s;
    }
  }

  .rain {
    opacity: 0;
    transition: opacity 1.5s;
  }
  .lightning {
    background: radial-gradient(
      ellipse at 75% 15%,
      rgba(220, 230, 255, 0.9),
      rgba(150, 170, 255, 0.25) 45%,
      transparent 75%
    );
    opacity: 0;
  }
  .vignette {
    background:
      radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.5) 100%),
      linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0));
    transition: background-color 1.5s;
  }

  // night phase: darker town, rain and the occasional lightning
  &.night {
    .vignette {
      background-color: rgba(2, 4, 16, 0.45);
    }
    .town .windows {
      opacity: 0.6;
    }
    .rain {
      opacity: 1;
    }
    .lightning {
      animation: sc-lightning 17s linear infinite;
    }
    .clouds.near {
      opacity: 0.4;
    }
  }

  &.still * {
    animation: none !important;
  }
}

@keyframes sc-twinkle {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.2;
  }
}
@keyframes sc-halo {
  0%,
  100% {
    opacity: 0.85;
  }
  50% {
    opacity: 1;
  }
}
@keyframes sc-drift {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(-50%, 0, 0);
  }
}
@keyframes sc-flicker {
  0%,
  41%,
  44%,
  100% {
    opacity: 1;
  }
  42% {
    opacity: 0.35;
  }
  70% {
    opacity: 0.8;
  }
  72% {
    opacity: 1;
  }
}
@keyframes sc-lamp {
  0%,
  100% {
    opacity: 0.85;
    transform: scale(1);
  }
  30% {
    opacity: 1;
    transform: scale(1.05);
  }
  55% {
    opacity: 0.75;
    transform: scale(0.97);
  }
}
@keyframes sc-fog {
  from {
    transform: translate3d(-8%, 0, 0);
  }
  to {
    transform: translate3d(8%, 0, 0);
  }
}
@keyframes sc-lightning {
  0%,
  90%,
  92.5%,
  100% {
    opacity: 0;
  }
  90.5% {
    opacity: 0.8;
  }
  91% {
    opacity: 0.15;
  }
  91.6% {
    opacity: 1;
  }
}
</style>
