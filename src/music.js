import Vue from "vue";

/*
 * Atmosphere music, generated live with Web Audio (no files to download):
 * a soft drone plus slow notes, different for the night, the day, the
 * waiting room and the end of the game.
 */
let stored = "off";
try {
  stored = localStorage.getItem("vkMusic") || "off";
} catch (e) {
  // ignore
}

export const musicState = Vue.observable({
  enabled: stored === "on",
  mood: null,
});

let ctx = null;
let master = null;
let drone = null;
let timer = null;

const MOODS = {
  // root frequency, scale (semitones), note gap ms, wave, volume
  lobby: {
    root: 220,
    scale: [0, 3, 5, 7, 10, 12],
    gap: 2600,
    wave: "sine",
    vol: 0.05,
    drone: 110,
  },
  night: {
    root: 146.8,
    scale: [0, 1, 5, 7, 8, 12],
    gap: 3200,
    wave: "triangle",
    vol: 0.06,
    drone: 73.4,
  },
  day: {
    root: 261.6,
    scale: [0, 2, 4, 7, 9, 12],
    gap: 1900,
    wave: "sine",
    vol: 0.045,
    drone: 130.8,
  },
  over: {
    root: 196,
    scale: [0, 4, 7, 11, 12, 16],
    gap: 1400,
    wave: "triangle",
    vol: 0.05,
    drone: 98,
  },
};

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function startDrone(freq) {
  stopDrone();
  const c = context();
  if (!c) return;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  gain.gain.exponentialRampToValueAtTime(0.5, c.currentTime + 3);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  const oscs = [freq, freq * 1.005, freq * 1.5].map((f) => {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.connect(filter);
    o.start();
    return o;
  });
  // slow movement in the filter
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  filter.connect(gain).connect(master);
  drone = { oscs: [...oscs, lfo], gain };
}

function stopDrone() {
  if (!drone || !ctx) return;
  const old = drone;
  drone = null;
  old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.8);
  setTimeout(() => old.oscs.forEach((o) => o.stop()), 3000);
}

function note(mood) {
  const c = context();
  if (!c) return;
  const step = mood.scale[Math.floor(Math.random() * mood.scale.length)];
  const freq =
    mood.root * shift * Math.pow(2, step / 12) * (Math.random() < 0.3 ? 2 : 1);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = mood.wave;
  o.frequency.value = freq;
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  // a little echo
  const delay = c.createDelay();
  delay.delayTime.value = 0.38;
  const fb = c.createGain();
  fb.gain.value = 0.35;
  o.connect(g);
  g.connect(master);
  g.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(master);
  o.start(t);
  o.stop(t + 2.8);
}

function apply() {
  clearInterval(timer);
  timer = null;
  const mood = musicState.enabled && MOODS[musicState.mood];
  if (!mood) {
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    stopDrone();
    return;
  }
  const c = context();
  if (!c) return;
  master.gain.setTargetAtTime(mood.vol, c.currentTime, 1.2);
  startDrone(mood.drone * shift);
  note(mood);
  timer = setInterval(() => {
    if (Math.random() < 0.8) note(mood);
  }, mood.gap);
}

// each room theme shifts the music a little
const THEME_SHIFT = { classic: 1, snow: 1.26, swamp: 0.84, blood: 0.94 };
let shift = 1;
export function setTheme(theme) {
  const next = THEME_SHIFT[theme] || 1;
  if (next === shift) return;
  shift = next;
  apply();
}

export function setMood(mood) {
  if (musicState.mood === mood) return;
  musicState.mood = mood;
  apply();
}

export function setMusic(on) {
  musicState.enabled = on;
  try {
    localStorage.setItem("vkMusic", on ? "on" : "off");
  } catch (e) {
    // ignore
  }
  apply();
}

// browsers allow audio only after a tap
if (typeof document !== "undefined") {
  const first = () => {
    if (musicState.enabled) apply();
    document.removeEventListener("pointerdown", first, true);
  };
  document.addEventListener("pointerdown", first, true);
}
