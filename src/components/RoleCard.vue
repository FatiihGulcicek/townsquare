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
        <div class="art-wrap" v-if="art">
          <span class="halo"></span>
          <img class="art" :src="art" :alt="role.name" />
        </div>
        <div class="emoji" v-else>{{ role.emoji }}</div>
        <h2>{{ role.name }}</h2>
        <div class="team">
          {{
            role.team === "vampir"
              ? "Vampirlerin takımı"
              : role.team === "deli"
              ? "Tek başına oynuyorsun"
              : "Köylülerin takımı"
          }}
        </div>
        <p class="desc">{{ role.desc }}</p>
        <p class="mates" v-if="mates.length">
          Diğer vampirler: <b>{{ mates.join(", ") }}</b>
        </p>
        <p class="mates lover" v-if="state.lover">
          <img :src="loversArt" alt="" />
          <span
            >💘 Aşık oldun: <b>{{ state.lover.name }}</b></span
          >
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
import { roleArt } from "../roleArt";
import { enableNotifications, notificationState } from "../notifications";

export default {
  data() {
    return { game, notif: notificationState };
  },
  computed: {
    state() {
      return game.state;
    },
    art() {
      return this.state && roleArt(this.state.me.role);
    },
    loversArt() {
      return roleArt("asiklar", true);
    },
    role() {
      const s = this.state;
      return s && s.me.role ? s.roles[s.me.role] : null;
    },
    mates() {
      const s = this.state;
      if (!s || !s.me.role || s.roles[s.me.role].team !== "vampir") return [];
      return s.players
        .filter(
          (p) =>
            p.role && s.roles[p.role].team === "vampir" && p.pid !== s.me.pid,
        )
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
  overflow-y: auto;
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
.art-wrap {
  position: relative;
  height: min(42vh, 360px);
  margin: 4px auto -10px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  .art {
    position: relative;
    height: 100%;
    width: auto;
    max-width: 100%;
    object-fit: contain;
    filter: drop-shadow(0 14px 26px rgba(0, 0, 0, 0.75));
    animation: art-in 0.8s cubic-bezier(0.2, 1.2, 0.4, 1) both;
    -webkit-mask-image: linear-gradient(180deg, #000 82%, transparent);
    mask-image: linear-gradient(180deg, #000 82%, transparent);
  }
  .halo {
    position: absolute;
    left: 50%;
    top: 45%;
    width: 80%;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(233, 180, 76, 0.45),
      rgba(233, 180, 76, 0) 65%
    );
    animation: halo 3s ease-in-out infinite;
  }
}
.vampir .halo {
  background: radial-gradient(circle, rgba(255, 40, 60, 0.5), transparent 65%);
}
.deli .halo {
  background: radial-gradient(
    circle,
    rgba(170, 90, 255, 0.45),
    transparent 65%
  );
}
@keyframes art-in {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.9);
  }
}
@keyframes halo {
  50% {
    transform: translate(-50%, -50%) scale(1.12);
    opacity: 0.7;
  }
}
.lover {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  img {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #ff6b9a;
  }
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
