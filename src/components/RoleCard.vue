<template>
  <transition name="fade">
    <div
      class="reveal"
      v-if="game.roleCardOpen && role"
      :class="role.team"
      @click.self="close"
    >
      <div class="inner">
        <div class="eyebrow">Senin rolün</div>
        <div class="emoji">{{ role.emoji }}</div>
        <h2>{{ role.name }}</h2>
        <div class="team">
          {{
            role.team === "vampir" ? "Vampirlerin takımı" : "Köylülerin takımı"
          }}
        </div>
        <p class="desc">{{ role.desc }}</p>
        <p class="mates" v-if="mates.length">
          Diğer vampirler: <b>{{ mates.join(", ") }}</b>
        </p>
        <p class="secret">Gizli tut! Bunu sadece sen görüyorsun.</p>
        <button class="btn primary" @click="close">Anladım</button>
        <button
          class="btn"
          v-if="canAskNotifications"
          @click="enableNotifications"
        >
          🔔 Sıram gelince bildirim gönder
        </button>
      </div>
    </div>
  </transition>
</template>

<script>
import { game, toast } from "../game";
import { enableNotifications, notificationState } from "../notifications";

export default {
  data() {
    return { game, notif: notificationState };
  },
  computed: {
    state() {
      return game.state;
    },
    role() {
      const s = this.state;
      return s && s.me.role ? s.roles[s.me.role] : null;
    },
    mates() {
      const s = this.state;
      if (!s || s.me.role !== "vampir") return [];
      return s.players
        .filter((p) => p.role === "vampir" && p.id !== s.me.id)
        .map((p) => p.name);
    },
    canAskNotifications() {
      return this.notif.supported && this.notif.permission === "default";
    },
  },
  methods: {
    close() {
      game.roleCardOpen = false;
    },
    async enableNotifications() {
      const ok = await enableNotifications();
      toast(
        ok ? "Bildirimler açık 🔔" : "Bildirim izni verilmedi.",
        ok ? "success" : "warning",
      );
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";

.reveal {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: radial-gradient(circle at 50% 35%, #1a2348, #03040a 75%);
  &.vampir {
    background: radial-gradient(circle at 50% 35%, #4a0910, #03040a 75%);
  }
}
.inner {
  width: 100%;
  max-width: 420px;
  text-align: center;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.25em;
  font-size: 13px;
  color: $muted;
}
.emoji {
  font-size: 110px;
  line-height: 1.1;
  margin: 10px 0 4px;
  animation: pop 0.6s cubic-bezier(0.2, 1.5, 0.4, 1);
}
h2 {
  margin: 0;
  font-size: 40px;
  color: $gold;
}
.vampir h2 {
  color: #ff5a5f;
}
.team {
  margin: 4px 0 10px;
  color: $muted;
}
.desc {
  font-size: 18px;
  line-height: 1.45;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 12px 14px;
}
.mates {
  font-size: 17px;
}
.secret {
  font-size: 14px;
  color: $muted;
}
@keyframes pop {
  from {
    transform: scale(0.2) rotate(-25deg);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
