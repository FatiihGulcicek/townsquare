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
import { setMood, setTheme } from "./music";
import { pwaState, applyUpdate } from "./pwa";
import { lobby, startLobby, acceptInvite, declineInvite } from "./lobby";
import { game, restore } from "./game";

export default {
  components: { Home, Room, RoleCard, Settings, LiveStory },
  data() {
    return { game, settingsOpen: false, pwa: pwaState, lobby };
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
    const boot = document.getElementById("boot");
    if (boot) boot.remove();
    restore();
    startLobby();
    window.addEventListener("hashchange", () => {
      const code = location.hash.replace("#", "");
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

html.chat-lock,
html.chat-lock body {
  overflow: hidden;
  overscroll-behavior: none;
}
html {
  background: #05060c;
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

/* the town from the original game; at night a dark sky with drifting clouds */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: -3;
  overflow: hidden;
  background: #05060c;
  /* the picture is drawn a bit larger so its bottom-right corner (where the
     artist's credit is printed) stays off screen; the credit is shown in
     Settings instead */
  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: -22%;
    bottom: -22%;
    background: url("assets/background.jpg") 40% top / cover no-repeat;
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
body.tint-dusk .night-sky {
  opacity: 0.45;
}
body.tint-home .night-sky {
  opacity: 0.35;
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
}

.page {
  max-width: 560px;
  margin: 0 auto;
  padding: calc(12px + env(safe-area-inset-top)) 14px
    calc(28px + env(safe-area-inset-bottom));
}

.card {
  background: $panel;
  border: 1px solid $line;
  border-radius: 16px;
  padding: 14px;
  margin: 12px 0;
  backdrop-filter: blur(6px);
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
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: $text;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  &:active {
    transform: scale(0.98);
  }
  &.primary {
    background: linear-gradient(180deg, $gold, darken($gold, 14%));
    border-color: lighten($gold, 10%);
    color: #1a1204;
  }
  &.danger {
    background: linear-gradient(180deg, $blood, darken($blood, 12%));
    border-color: lighten($blood, 10%);
    color: white;
  }
  &.ghost {
    background: transparent;
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
}

input.field {
  width: 100%;
  min-height: 50px;
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(0, 0, 0, 0.45);
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
  background: radial-gradient(circle at 50% 40%, #1d1a4d, #03030a 75%);
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
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 560px;
  max-height: 92vh;
  overflow-y: auto;
  background: #0d0f1c;
  border-top: 3px solid $gold;
  border-radius: 20px 20px 0 0;
  padding: 16px 16px calc(18px + env(safe-area-inset-bottom));
}
</style>
