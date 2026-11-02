import Vue from "vue";
import { lang, t } from "./i18n";
import { getFlag, setFlag } from "./storage";

/*
 * Spoken narration (Turkish text-to-speech through the browser).
 * iPhone/Safari only speaks after the user tapped something once, so turning
 * narration on from a button also "unlocks" the speech engine.
 */
const synth =
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;

export const voiceState = Vue.observable({
  supported: !!synth,
  enabled: getFlag("voice", false) && !!synth,
  bots: getFlag("vkBotVoice", true) && !!synth,
  queued: 0,
  unlocked: false,
});

let voice = null;
function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices() || [];
  voice =
    voices.find((v) => /^tr(-|_|$)/i.test(v.lang) && v.localService) ||
    voices.find((v) => /^tr(-|_|$)/i.test(v.lang)) ||
    null;
  return voice;
}
if (synth) {
  pickVoice();
  if (typeof synth.addEventListener === "function") {
    synth.addEventListener("voiceschanged", pickVoice);
  } else {
    synth.onvoiceschanged = pickVoice;
  }
}

function utter(text) {
  const english = lang === "en";
  const u = new SpeechSynthesisUtterance(sayable(english ? t(text) : text));
  u.lang = english ? "en-US" : "tr-TR";
  if (!english && (voice || pickVoice())) u.voice = voice;
  u.rate = 0.95;
  u.pitch = 0.9;
  u.volume = 1;
  return u;
}

/** Read a sentence aloud (queued after what is being spoken). */
export function speak(text) {
  if (!synth || !voiceState.enabled || !text) return;
  try {
    // Chrome sometimes gets stuck in "paused" after the tab was hidden
    if (synth.paused) synth.resume();
    synth.speak(utter(text));
  } catch (e) {
    // speech is optional
  }
}

/*
 * Bots talk out loud. Each bot gets its own voice: a different installed
 * voice when the phone has several, otherwise its own pitch and speed.
 */
/** speech engines read emoji out loud ("robot face"): leave them out */
const sayable = (text) =>
  String(text)
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function speakAs(who, text) {
  if (!synth || !voiceState.bots || !text) return;
  const english = lang === "en";
  const said = sayable(english ? t(text) : text);
  if (!said) return;
  const all = synth.getVoices() || [];
  const mine = all.filter((v) =>
    english ? /^en(-|_|$)/i.test(v.lang) : /^tr(-|_|$)/i.test(v.lang),
  );
  const h = hash(who);
  try {
    if (synth.paused) synth.resume();
    // do not let bot chatter pile up behind the narrator
    if (synth.pending && voiceState.queued > 2) return;
    const u = new SpeechSynthesisUtterance(said);
    u.lang = english ? "en-US" : "tr-TR";
    if (mine.length) u.voice = mine[h % mine.length];
    u.pitch = 0.7 + (h % 7) * 0.1; // 0.7 … 1.3
    u.rate = 0.95 + ((h >> 3) % 4) * 0.07; // 0.95 … 1.16
    voiceState.queued++;
    u.onend = u.onerror = () => {
      voiceState.queued = Math.max(0, voiceState.queued - 1);
    };
    synth.speak(u);
  } catch (e) {
    // speech is optional
  }
}

export function setBotVoices(on) {
  voiceState.bots = !!on && !!synth;
  setFlag("vkBotVoice", voiceState.bots);
  if (voiceState.bots) unlockVoice();
}

/** Call from a tap handler: unlocks speech on iOS. */
export function unlockVoice() {
  if (!synth || voiceState.unlocked) return;
  try {
    const u = utter(" ");
    u.volume = 0;
    synth.speak(u);
    voiceState.unlocked = true;
  } catch (e) {
    // ignore
  }
}

export function setVoice(enabled) {
  voiceState.enabled = !!enabled && !!synth;
  setFlag("voice", voiceState.enabled);
  if (voiceState.enabled) {
    unlockVoice();
    speak("Sesli anlatım açık.");
  } else if (synth) {
    synth.cancel();
  }
}

// iOS needs a gesture after every reload: unlock on the first tap anywhere
if (typeof document !== "undefined") {
  const first = () => {
    if (voiceState.enabled) unlockVoice();
    document.removeEventListener("pointerdown", first, true);
  };
  document.addEventListener("pointerdown", first, true);
}
