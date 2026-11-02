import Vue from "vue";

/*
 * Small sound effects synthesised with Web Audio (no sound files to load).
 * Browsers only allow audio after a tap, so unlock() runs on the first tap.
 */
let ctx = null;
let stored = "on";
try {
  stored = localStorage.getItem("vkSfx") || "on";
} catch (e) {
  // ignore
}

export const sfxState = Vue.observable({ enabled: stored === "on" });

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function unlockSfx() {
  try {
    context();
  } catch (e) {
    // ignore
  }
}

export function setSfx(on) {
  sfxState.enabled = on;
  try {
    localStorage.setItem("vkSfx", on ? "on" : "off");
  } catch (e) {
    // ignore
  }
  if (on) play("pop");
}

function tone(
  c,
  { freq, type = "sine", start = 0, dur = 0.4, gain = 0.2, slide },
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  const t = c.currentTime + start;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

const SOUNDS = {
  // low, slow minor chord
  night: (c) => {
    [146.8, 174.6, 220].forEach((f, i) =>
      tone(c, {
        freq: f,
        type: "triangle",
        start: i * 0.12,
        dur: 1.6,
        gain: 0.12,
      }),
    );
  },
  // bright bell
  day: (c) => {
    [523.3, 659.3, 784].forEach((f, i) =>
      tone(c, { freq: f, start: i * 0.1, dur: 1.1, gain: 0.12 }),
    );
  },
  // tolling bell
  death: (c) => {
    tone(c, { freq: 110, type: "sine", dur: 2.2, gain: 0.25 });
    tone(c, { freq: 220.5, type: "sine", dur: 1.6, gain: 0.08 });
  },
  vote: (c) => tone(c, { freq: 880, type: "square", dur: 0.08, gain: 0.05 }),
  pop: (c) => tone(c, { freq: 600, slide: 900, dur: 0.12, gain: 0.08 }),
  turn: (c) => {
    tone(c, { freq: 392, dur: 0.25, gain: 0.12 });
    tone(c, { freq: 587.3, start: 0.18, dur: 0.35, gain: 0.12 });
  },
  win: (c) => {
    [523.3, 659.3, 784, 1046.5].forEach((f, i) =>
      tone(c, {
        freq: f,
        type: "triangle",
        start: i * 0.14,
        dur: 0.6,
        gain: 0.12,
      }),
    );
  },
  lose: (c) => {
    [392, 349.2, 311.1, 261.6].forEach((f, i) =>
      tone(c, {
        freq: f,
        type: "triangle",
        start: i * 0.18,
        dur: 0.7,
        gain: 0.12,
      }),
    );
  },
};

export function play(name) {
  if (!sfxState.enabled || !SOUNDS[name]) return;
  try {
    const c = context();
    if (c) SOUNDS[name](c);
  } catch (e) {
    // sound is optional
  }
}

if (typeof document !== "undefined") {
  const first = () => {
    unlockSfx();
    document.removeEventListener("pointerdown", first, true);
  };
  document.addEventListener("pointerdown", first, true);
}
