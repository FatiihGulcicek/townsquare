<template>
  <div id="app">
    <div class="backdrop"></div>
    <Home v-if="!game.code" @settings="settingsOpen = true" />
    <Room v-else @settings="settingsOpen = true" />
    <RoleCard />
    <Settings v-if="settingsOpen" @close="settingsOpen = false" />
    <div class="toasts">
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
import { game, restore } from "./game";

export default {
  components: { Home, Room, RoleCard, Settings },
  data() {
    return { game, settingsOpen: false };
  },
  mounted() {
    const boot = document.getElementById("boot");
    if (boot) boot.remove();
    restore();
    window.addEventListener("hashchange", () => {
      const code = location.hash.replace("#", "");
      if (/^[A-Za-z]{4}$/.test(code) && code.toUpperCase() !== game.code) {
        restore();
      }
    });
  },
  methods: {
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

html,
body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: #05060c;
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

.backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(
      180deg,
      rgba(5, 6, 12, 0.55) 0%,
      rgba(5, 6, 12, 0.88) 55%,
      #05060c 100%
    ),
    url("assets/background.jpg") center top / cover no-repeat;
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
