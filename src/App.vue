<template>
  <div id="app">
    <div class="backdrop"></div>
    <div class="night-sky"><div class="clouds"></div></div>
    <div class="readable"></div>
    <div class="theme-layer" :class="'t-' + theme">
      <span v-if="theme === 'snow'" class="snow"></span>
      <span v-if="theme === 'snow'" class="snow s2"></span>
      <span v-if="theme === 'swamp'" class="fog"></span>
    </div>
    <Home v-if="!game.code" @settings="settingsOpen = true" />
    <Room v-else @settings="settingsOpen = true" />
    <RoleCard />
    <Welcome v-if="onboarding" @done="finishOnboarding" />
    <LiveStory />
    <div class="sheet-bg invite-bg" v-if="lobby.invite">
      <div class="sheet center">
        <div class="inv-emoji">📨</div>
        <h3>{{ lobby.invite.from }} seni oyuna çağırıyor!</h3>
        <p class="muted">
          Oda kodu: <b>{{ lobby.invite.code }}</b>
        </p>
        <button class="btn primary" @click="acceptInvite">Katıl</button>
        <button class="btn ghost" @click="declineInvite">Şimdi değil</button>
      </div>
    </div>
    <div class="sheet-bg invite-bg" v-if="game.passPrompt">
      <form class="sheet center" @submit.prevent="enterPass">
        <div class="inv-emoji">🔒</div>
        <h3>{{ game.passPrompt.code }} şifreli bir oda</h3>
        <p class="muted" v-if="game.passPrompt.wrong">
          Şifre yanlış, tekrar dene.
        </p>
        <p class="muted" v-else>Girmek için oda şifresini yaz.</p>
        <input
          class="field"
          v-model="pass"
          maxlength="20"
          placeholder="Oda şifresi"
          autocomplete="off"
          ref="pass"
        />
        <button class="btn primary" type="submit" :disabled="!pass.trim()">
          Gir
        </button>
        <button class="btn ghost" type="button" @click="game.passPrompt = null">
          Vazgeç
        </button>
      </form>
    </div>
    <transition name="toast">
      <div class="update" v-if="pwa.updateReady">
        <span>✨ Yeni sürüm hazır</span>
        <button @click="update">Yenile</button>
        <button class="later" @click="pwa.updateReady = false">Sonra</button>
      </div>
    </transition>
    <Settings v-if="settingsOpen" @close="settingsOpen = false" />
    <div class="toasts" v-show="!game.liveQueue.length">
      <transition-group name="toast">
        <div
          v-for="t in game.toasts"
          :key="t.id"
          class="toast"
          :class="t.type"
          @click="dismiss(t.id)"
        >
          {{ t.text }}
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script>
import Home from "./components/Home";
import Room from "./components/Room";
import RoleCard from "./components/RoleCard";
import Settings from "./components/Settings";
import LiveStory from "./components/LiveStory";
import Welcome from "./components/Welcome";
import { setMood, setTheme } from "./music";
import { pwaState, applyUpdate } from "./pwa";
import { lobby, startLobby, acceptInvite, declineInvite } from "./lobby";
import { game, restore, join } from "./game";
import { getItem, setItem } from "./storage";

export default {
  components: { Home, Room, RoleCard, Settings, LiveStory, Welcome },
  data() {
    const onboarding = getItem("vkOnboarded") !== "1";
    return {
      game,
      settingsOpen: false,
      pwa: pwaState,
      lobby,
      pass: "",
      onboarding,
    };
  },
  computed: {
    theme() {
      const s = game.state;
      return (game.code && s && s.settings && s.settings.theme) || "classic";
    },
    mood() {
      const s = game.state;
      if (!game.code || !s) return null;
      if (["night", "roles"].includes(s.phase)) return "night";
      if (s.phase === "over") return "over";
      if (s.phase === "lobby") return "lobby";
      return "day";
    },
    tint() {
      const s = game.state;
      if (!game.code || !s) return "tint-home";
      if (["night", "roles"].includes(s.phase)) return "tint-night";
      if (["day", "lastwords"].includes(s.phase)) return "tint-day";
      if (s.phase === "dusk") return "tint-dusk";
      return "";
    },
  },
  watch: {
    mood: {
      immediate: true,
      handler(value) {
        setMood(value);
      },
    },
    // a new version while on the home screen: install it straight away
    // (inside a room the banner waits until the player chooses)
    "pwa.updateReady"(ready) {
      if (ready && !game.code) applyUpdate();
    },
    theme: {
      immediate: true,
      handler(value) {
        setTheme(value);
      },
    },
    tint: {
      immediate: true,
      handler(value, old) {
        if (old) document.body.classList.remove(old);
        if (value) document.body.classList.add(value);
      },
    },
  },
  mounted() {
    // the loading screen fades out (unless it is installing an update)
    if (window.__hideBoot) window.__hideBoot();
    else {
      const boot = document.getElementById("boot");
      if (boot) boot.remove();
    }
    // first visit: profile and permissions first, then the room from the link
    if (!this.onboarding) restore();
    startLobby();
    window.addEventListener("hashchange", () => {
      const code = location.hash.replace("#", "");
      if (this.onboarding) return;
      if (/^[A-Za-z]{4}$/.test(code) && code.toUpperCase() !== game.code) {
        restore();
        startLobby();
      }
    });
  },
  methods: {
    acceptInvite() {
      acceptInvite();
    },
    finishOnboarding() {
      setItem("vkOnboarded", "1");
      this.onboarding = false;
      restore();
    },
    enterPass() {
      const { code } = game.passPrompt;
      game.passPrompt = null;
      join(code, this.pass);
      this.pass = "";
    },
    declineInvite() {
      declineInvite();
    },
    update() {
      applyUpdate();
    },
    dismiss(id) {
      const i = game.toasts.findIndex((t) => t.id === id);
      if (i >= 0) game.toasts.splice(i, 1);
    },
  },
};
</script>

<style lang="scss">
@import "vars";

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
html.chat-lock,
html.chat-lock body {
  overflow: hidden;
  overscroll-behavior: none;
}
html {
  background: #0a0409;
}
html,
body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  color: $text;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
}

#app {
  min-height: 100vh;
  min-height: 100dvh;
  position: relative;
}

/* The same castle and village artwork anchors every game screen. */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: -3;
  overflow: hidden;
  background: #0a0409;
  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: url("assets/darkspire-castle-v3.webp") center top / cover no-repeat;
  }
}
.night-sky {
  position: fixed;
  inset: 0;
  z-index: -2;
  overflow: hidden;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 1) 0%,
    rgba(1, 22, 46, 1) 50%,
    rgba(0, 39, 70, 1) 100%
  );
  opacity: 0;
  transition: opacity 1.5s ease-in-out;
  .clouds {
    width: 100%;
    padding-right: 2000px;
    height: 100%;
    background: url("assets/clouds.png") repeat;
    background-size: 2000px auto;
    animation: move-clouds 120s linear infinite;
    animation-play-state: paused;
    opacity: 0.3;
  }
}
@keyframes move-clouds {
  from {
    transform: translate3d(-2000px, 0, 0);
  }
  to {
    transform: translate3d(0, 0, 0);
  }
}
body.tint-night .night-sky {
  opacity: 0.82;
}
body.tint-night .night-sky .clouds,
body.tint-dusk .night-sky .clouds {
  animation-play-state: running;
}
body.tint-dusk .night-sky {
  opacity: 0.45;
}
body.tint-home .night-sky {
  display: none;
}
/* keeps text readable over the picture without hiding the town */
.readable {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(5, 6, 12, 0.15) 0%,
    rgba(5, 6, 12, 0.45) 45%,
    rgba(5, 6, 12, 0.8) 100%
  );
  transition: background 1.5s;
}
body.tint-night .readable {
  background: linear-gradient(
    180deg,
    rgba(5, 6, 12, 0.1) 0%,
    rgba(5, 6, 12, 0.35) 50%,
    rgba(5, 6, 12, 0.75) 100%
  );
}

h1,
h2,
h3,
.title-font {
  font-family: "Cinzel", Georgia, serif;
  letter-spacing: 0.02em;
  color: #f2d49a;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
}

.page {
  max-width: 640px;
  margin: 0 auto;
  padding: calc(12px + env(safe-area-inset-top)) 14px
    calc(28px + env(safe-area-inset-bottom));
}

.card {
  background: linear-gradient(150deg, rgba(48, 11, 23, 0.94), $panel 70%);
  border: 1px solid $line;
  border-radius: 18px;
  padding: 16px;
  margin: 12px 0;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.38), inset 0 1px rgba(255, 228, 165, 0.08);
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 50px;
  padding: 10px 16px;
  margin: 8px 0;
  border: 1px solid rgba(233, 189, 112, 0.65);
  border-radius: 13px;
  background: linear-gradient(180deg, #5c1427, #250711);
  color: $text;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  box-shadow: inset 0 1px rgba(255, 227, 169, 0.25), 0 5px 12px rgba(0, 0, 0, 0.35);
  &:active {
    transform: scale(0.98);
  }
  &.primary {
    background: linear-gradient(180deg, #f5d99f, #bd8439);
    border-color: #f5d99f;
    color: #270c11;
  }
  &.danger {
    background: linear-gradient(180deg, $blood, darken($blood, 12%));
    border-color: lighten($blood, 10%);
    color: white;
  }
  &.ghost {
    background: rgba(27, 7, 17, 0.5);
  }
  &.small {
    min-height: 40px;
    font-size: 15px;
    width: auto;
    margin: 4px 0;
  }
  &:disabled,
  &.disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  /* the ornate golden button from the game's artwork */
  &.gold {
    max-width: 380px;
    margin: 10px auto;
    aspect-ratio: 1064 / 268;
    min-height: 0;
    height: auto;
    padding: 0 18%;
    border: 0;
    border-radius: 0;
    background: url("assets/btn-gold.webp") center / 100% 100% no-repeat;
    color: #2b1204;
    font-size: clamp(17px, 5vw, 22px);
    font-weight: 900;
    letter-spacing: 0.02em;
    text-shadow: 0 1px 0 rgba(255, 236, 170, 0.7);
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.55));
    &:disabled,
    &.disabled {
      opacity: 1;
      filter: grayscale(0.7) brightness(0.6);
    }
  }
}

/* iPhone zooms into text fields smaller than 16px: keep them at least 16px */
input,
select,
textarea {
  font-size: max(16px, 1em);
}
input.field {
  width: 100%;
  min-height: 50px;
  padding: 10px 14px;
  border-radius: 13px;
  border: 1px solid $line;
  background: rgba(13, 4, 10, 0.88);
  color: $text;
  font-size: 18px;
  outline: none;
  &:focus {
    border-color: $gold;
  }
}

.muted {
  color: $muted;
}

.toasts {
  position: fixed;
  left: 0;
  right: 0;
  top: calc(8px + env(safe-area-inset-top));
  z-index: 500;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  padding: 0 10px;
}

.toast {
  pointer-events: all;
  max-width: 520px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(16, 18, 30, 0.96);
  border: 1px solid $line;
  border-left: 4px solid $gold;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  font-size: 15px;
  line-height: 1.35;
  &.warning,
  &.death {
    border-left-color: $blood;
  }
  &.success {
    border-left-color: $good;
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s;
}
.toast-enter,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.phase-overlay {
  position: fixed;
  inset: 0;
  z-index: 350;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
  background: radial-gradient(circle at 50% 40%, #53132a, #080308 75%);
  .phase-icon {
    font-size: 96px;
    animation: rise 1.4s ease-out;
  }
  h2 {
    margin: 10px 0 6px;
    font-size: 38px;
    color: $gold;
  }
  p {
    font-size: 19px;
    color: $text;
    max-width: 420px;
  }
  &.day {
    background: radial-gradient(circle at 50% 35%, #6b3d10, #120a03 75%);
  }
  &.over {
    background: radial-gradient(circle at 50% 35%, #4d3a10, #050403 75%);
  }
}
@keyframes rise {
  from {
    transform: translateY(40px) scale(0.6);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
.phase-enter-active,
.phase-leave-active {
  transition: opacity 0.5s;
}
.phase-enter,
.phase-leave-to {
  opacity: 0;
}

/* room themes: effects over the town picture */
.theme-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
  transition: background 1.5s;
  &.t-snow {
    background: linear-gradient(
      180deg,
      rgba(150, 190, 255, 0.18),
      rgba(220, 235, 255, 0.08)
    );
  }
  &.t-swamp {
    background: linear-gradient(
      180deg,
      rgba(40, 90, 50, 0.3),
      rgba(10, 40, 20, 0.35)
    );
  }
  &.t-blood {
    background: radial-gradient(
      circle at 70% 10%,
      rgba(200, 0, 30, 0.45),
      rgba(60, 0, 10, 0.35) 60%
    );
  }
  .snow {
    position: absolute;
    inset: -100% 0 0 0;
    background-image: radial-gradient(2px 2px at 10% 20%, white, transparent),
      radial-gradient(2px 2px at 30% 60%, white, transparent),
      radial-gradient(1.5px 1.5px at 50% 30%, white, transparent),
      radial-gradient(2.5px 2.5px at 70% 80%, white, transparent),
      radial-gradient(1.5px 1.5px at 90% 40%, white, transparent),
      radial-gradient(2px 2px at 80% 10%, white, transparent);
    background-size: 300px 300px;
    animation: snow 14s linear infinite;
    opacity: 0.8;
    &.s2 {
      background-size: 200px 200px;
      animation-duration: 9s;
      opacity: 0.5;
    }
  }
  .fog {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 300%;
    height: 60%;
    background: url("assets/clouds.png") repeat-x bottom / auto 100%;
    filter: hue-rotate(60deg) saturate(0.6);
    opacity: 0.35;
    animation: fog 60s linear infinite;
  }
}
@keyframes snow {
  to {
    transform: translateY(50%);
  }
}
@keyframes fog {
  to {
    transform: translateX(-66%);
  }
}
.invite-bg {
  z-index: 420;
  align-items: center;
  .sheet {
    border-radius: 20px;
    max-width: 380px;
    margin: 0 16px;
    text-align: center;
  }
  .inv-emoji {
    font-size: 54px;
  }
}
.update {
  position: fixed;
  z-index: 450;
  left: 50%;
  bottom: calc(86px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 14px;
  border-radius: 24px;
  background: rgba(16, 18, 30, 0.97);
  border: 1px solid $gold;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
  button {
    border: 0;
    border-radius: 16px;
    padding: 7px 12px;
    background: $gold;
    color: #1a1204;
    font-weight: 700;
    &.later {
      background: transparent;
      color: $muted;
    }
  }
}

.sheet-bg {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(3, 1, 4, 0.82);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 640px;
  max-height: 92dvh;
  overflow-y: auto;
  background: linear-gradient(160deg, #3a1022, #13070f 62%);
  border: 1px solid $line;
  border-top: 3px solid $gold;
  border-radius: 22px 22px 0 0;
  padding: 20px 16px calc(18px + env(safe-area-inset-bottom));
  box-shadow: 0 -18px 50px rgba(0, 0, 0, 0.65);
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 3px solid #f5d99f;
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
</style>
