<template>
  <div class="sheet-bg" @click.self="$emit('close')">
    <div class="sheet">
      <h3>Ayarlar</h3>
      <div class="row" @click="toggleVoice" v-if="voice.supported">
        <span>🔊 Sesli anlatım</span>
        <b :class="{ on: voice.enabled }">{{
          voice.enabled ? "Açık" : "Kapalı"
        }}</b>
      </div>
      <div class="row" @click="toggleSfx">
        <span>🎵 Ses efektleri</span>
        <b :class="{ on: sfx.enabled }">{{
          sfx.enabled ? "Açık" : "Kapalı"
        }}</b>
      </div>
      <div class="row" @click="profile = true">
        <span>👤 Profil ve istatistikler</span>
        <b>›</b>
      </div>
      <div class="row" @click="notifications">
        <span>🔔 Bildirimler</span>
        <b :class="{ on: notif.permission === 'granted' }">{{ notifLabel }}</b>
      </div>
      <p class="muted small" v-if="pwa.isIOS && !pwa.isStandalone">
        iPhone'da oyun kapalıyken bildirim gelmesi için önce Safari'de Paylaş →
        “Ana Ekrana Ekle” ile uygulamayı ekle ve oradan aç.
      </p>
      <div class="row" v-if="!pwa.isStandalone" @click="installApp">
        <span>📲 Ana ekrana ekle</span>
        <b>›</b>
      </div>
      <button class="btn danger" v-if="game.code" @click="leaveRoom">
        🚪 Odadan çık
      </button>
      <button class="btn ghost" @click="$emit('close')">Kapat</button>
    </div>
    <Profile v-if="profile" @close="profile = false" />
  </div>
</template>

<script>
import { game, leave, toast } from "../game";
import { voiceState, setVoice } from "../voice";
import { pwaState, install } from "../pwa";
import { enableNotifications, notificationState } from "../notifications";
import { sfxState, setSfx } from "../sfx";
import Profile from "./Profile";

export default {
  components: { Profile },
  data() {
    return {
      game,
      voice: voiceState,
      pwa: pwaState,
      notif: notificationState,
      sfx: sfxState,
      profile: false,
    };
  },
  computed: {
    notifLabel() {
      return {
        granted: "Açık",
        denied: "Engelli",
        default: "Aç",
        unsupported: "Desteklenmiyor",
      }[this.notif.permission];
    },
  },
  methods: {
    toggleSfx() {
      setSfx(!this.sfx.enabled);
    },
    toggleVoice() {
      setVoice(!this.voice.enabled);
    },
    async notifications() {
      if (this.notif.permission === "denied") {
        toast(
          "Bildirimler engellenmiş. Telefonun ayarlarından bu uygulamaya izin ver.",
          "warning",
          7000,
        );
        return;
      }
      if (this.notif.permission === "unsupported") {
        toast(
          "Bu tarayıcı bildirim desteklemiyor. iPhone'da uygulamayı ana ekrana ekleyip oradan aç.",
          "warning",
          7000,
        );
        return;
      }
      const ok = await enableNotifications();
      if (ok)
        toast(
          "Bildirimler açık: oyun kapalıyken de haber vereceğim.",
          "success",
        );
    },
    async installApp() {
      if (pwaState.canInstall) await install();
      else
        toast(
          "Safari'de Paylaş düğmesine dokun ve “Ana Ekrana Ekle”yi seç.",
          "info",
          7000,
        );
    },
    leaveRoom() {
      if (confirm("Odadan çıkmak istediğine emin misin?")) {
        leave();
        this.$emit("close");
      }
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";
h3 {
  margin: 0 0 10px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 52px;
  padding: 0 4px;
  border-bottom: 1px solid $line;
  font-size: 17px;
  cursor: pointer;
  b {
    color: $muted;
    &.on {
      color: $gold;
    }
  }
}
.small {
  font-size: 14px;
  line-height: 1.4;
}
</style>
