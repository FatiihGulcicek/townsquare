<template>
  <transition-group tag="ul" name="toast" class="toasts" aria-live="polite">
    <li
      v-for="n in notifications.list"
      :key="n.id"
      :class="n.type"
      @click="dismiss(n.id)"
    >
      <font-awesome-icon :icon="n.icon" />
      <span>{{ n.text }}</span>
      <em v-if="n.count > 1">×{{ n.count }}</em>
    </li>
  </transition-group>
</template>

<script>
import { notifications, dismiss } from "../notify";

export default {
  data() {
    return { notifications };
  },
  methods: { dismiss },
};
</script>

<style lang="scss" scoped>
@import "../vars.scss";

.toasts {
  position: fixed;
  top: calc(64px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  width: min(92vw, 420px);
  z-index: 150;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  padding: 0;
  margin: 0;
}

li {
  pointer-events: all;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(10, 12, 20, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-left: 4px solid $townsfolk;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  color: white;
  font-size: 95%;
  line-height: 1.3;
  cursor: pointer;
  svg {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    color: $townsfolk;
  }
  span {
    flex: 1;
  }
  em {
    font-style: normal;
    opacity: 0.7;
    font-size: 85%;
  }
  &.success {
    border-left-color: #2ecc71;
    svg {
      color: #2ecc71;
    }
  }
  &.warning,
  &.death {
    border-left-color: $demon;
    svg {
      color: $demon;
    }
  }
  &.role {
    border-left-color: $fabled;
    svg {
      color: $fabled;
    }
  }
  &.night {
    border-left-color: #8e7cff;
    svg {
      color: #8e7cff;
    }
  }
  &.day {
    border-left-color: #ffb347;
    svg {
      color: #ffb347;
    }
  }
  &.vote {
    border-left-color: $minion;
    svg {
      color: $minion;
    }
  }
}

.toast-enter-active,
.toast-leave-active {
  transition:
    transform 250ms ease,
    opacity 250ms ease;
}
.toast-enter,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
.toast-move {
  transition: transform 250ms ease;
}
</style>
