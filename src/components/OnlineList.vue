<template>
  <div class="card online">
    <div class="head">
      <h3><span class="dot"></span> Sitede {{ others.length + 1 }} kişi</h3>
      <small class="muted" v-if="!lobby.connected">bağlanıyor…</small>
    </div>
    <p class="muted small" v-if="!others.length">
      Şu an senden başka kimse yok. Arkadaşlarına linki gönder!
    </p>
    <div class="person" v-for="p in others" :key="p.pub">
      <Avatar :name="p.name" :size="38" />
      <div class="who">
        <b>{{ p.name }}</b>
        <small class="muted">
          {{ p.level }}. seviye ·
          {{
            p.room
              ? p.room === game.code
                ? "bu odada"
                : "bir oyunda"
              : p.away
              ? "uzakta"
              : "bekliyor"
          }}
        </small>
      </div>
      <button
        class="btn small"
        v-if="p.room !== game.code"
        :disabled="recently(p.pub)"
        @click="invite(p)"
      >
        {{
          recently(p.pub)
            ? "Çağrıldı ✓"
            : game.code
            ? "Odama çağır"
            : "Birlikte oyna"
        }}
      </button>
    </div>
    <button class="btn small notify" v-if="canAsk" @click="ask">
      🔔 Biri siteye girince bana haber ver
    </button>
  </div>
</template>

<script>
import Avatar from "./Avatar";
import { game } from "../game";
import { lobby, inviteToRoom, setArrivalNotifications } from "../lobby";
import { enableNotifications, notificationState } from "../notifications";

export default {
  components: { Avatar },
  data() {
    return { lobby, game, now: Date.now(), notif: notificationState };
  },
  computed: {
    canAsk() {
      return this.notif.supported && this.notif.permission === "default";
    },
    others() {
      return this.lobby.online.filter((p) => p.pub !== this.lobby.me);
    },
  },
  mounted() {
    this.timer = setInterval(() => (this.now = Date.now()), 5000);
  },
  beforeDestroy() {
    clearInterval(this.timer);
  },
  methods: {
    recently(pub) {
      return this.now - (this.lobby.invited[pub] || 0) < 15000;
    },
    async ask() {
      const ok = await enableNotifications();
      if (ok) setArrivalNotifications(true);
    },
    invite(p) {
      inviteToRoom(p.pub);
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  h3 {
    margin: 0 0 6px;
    font-size: 18px;
  }
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #3ddc84;
  box-shadow: 0 0 8px #3ddc84;
  margin-right: 4px;
}
.person {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid $line;
  .who {
    flex: 1;
    min-width: 0;
    b {
      display: block;
    }
  }
  .btn {
    margin: 0;
    font-size: 14px;
  }
}
.notify {
  width: 100%;
  margin-top: 10px;
}
.small {
  font-size: 14px;
}
</style>
