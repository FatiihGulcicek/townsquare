import Vue from "vue";
import { lang, t } from "./i18n";

/*
 * Spoken narration (Turkish text-to-speech through the browser).
 * iPhone/Safari only speaks after the user tapped something once, so turning
 * narration on from a button also "unlocks" the speech engine.
 */
const synth =
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;

let stored = false;
try {
  stored = localStorage.getItem("voice") === "on";
} catch (e) {
  // ignore
}

export const voiceState = Vue.observable({
  supported: !!synth,
  enabled: stored && !!synth,
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
  const u = new SpeechSynthesisUtterance(english ? t(text) : text);
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
  try {
    localStorage.setItem("voice", voiceState.enabled ? "on" : "off");
  } catch (e) {
    // ignore
  }
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
