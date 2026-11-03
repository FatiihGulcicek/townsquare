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
      <div class="row" @click="toggleBots" v-if="voice.supported">
        <span>🤖 Botlar sesli konuşsun</span>
        <b :class="{ on: voice.bots }">{{ voice.bots ? "Açık" : "Kapalı" }}</b>
      </div>
      <div class="row" @click="toggleMusic">
        <span>🎼 Atmosfer müziği</span>
        <b :class="{ on: music.enabled }">{{
          music.enabled ? "Açık" : "Kapalı"
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
      <div class="row" @click="switchLang">
        <span>🌐 Dil · Language</span>
        <b class="on">{{ lang === "en" ? "English" : "Türkçe" }}</b>
      </div>
      <div class="row" @click="toggleArrivals">
        <span>🌙 Biri siteye girince haber ver</span>
        <b :class="{ on: lobby.notifyArrivals }">{{
          lobby.notifyArrivals ? "Açık" : "Kapalı"
        }}</b>
      </div>
      <div class="blocked" v-if="lobby.blocked.length">
        <span>🚫 Engellediklerin</span>
        <div v-for="b in lobby.blocked" :key="b.pub" class="brow">
          {{ b.name }}
          <button class="btn small" @click="unblock(b.pub)">Kaldır</button>
        </div>
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
      <p class="links">
        <a href="/gizlilik.html" target="_blank" rel="noopener">Gizlilik</a> ·
        <a href="/kosullar.html" target="_blank" rel="noopener"
          >Kullanım şartları</a
        >
        ·
        <a href="mailto:destek@darkspire.co">İletişim</a> ·
        <a href="#" @click.prevent="deleteData">Verilerimi sil</a>
      </p>
      <p class="credit muted">Görseller ve logo: Vampir Köylü · darkspire.co</p>
    </div>
    <Profile v-if="profile" @close="profile = false" />
  </div>
</template>

<script>
import { game, leave, toast } from "../game";
import { storedKeys, setItem } from "../storage";
import { voiceState, setVoice, setBotVoices } from "../voice";
import { pwaState, install } from "../pwa";
import { askNotifications, notificationState } from "../notifications";
import { sfxState, setSfx } from "../sfx";
import { musicState, setMusic } from "../music";
import { lobby, setArrivalNotifications, unblockUser } from "../lobby";
import { lang, setLang } from "../i18n";
import Profile from "./Profile";

export default {
  components: { Profile },
  data() {
    return {
      game,
      lang,
      voice: voiceState,
      pwa: pwaState,
      notif: notificationState,
      sfx: sfxState,
      music: musicState,
      lobby,
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
    switchLang() {
      setLang(lang === "en" ? "tr" : "en");
    },
    unblock(pub) {
      unblockUser(pub);
    },
    async toggleArrivals() {
      const on = !this.lobby.notifyArrivals;
      setArrivalNotifications(on);
      if (on && this.notif.permission !== "granted") await this.notifications();
    },
    toggleMusic() {
      setMusic(!this.music.enabled);
    },
    toggleSfx() {
      setSfx(!this.sfx.enabled);
    },
    toggleVoice() {
      setVoice(!this.voice.enabled);
    },
    toggleBots() {
      setBotVoices(!this.voice.bots);
    },
    notifications: askNotifications,
    async deleteData() {
      if (
        !confirm(
          "Profilin, istatistiklerin, fotoğrafın ve bu telefondaki tüm oyun verilerin silinsin mi? Bu geri alınamaz.",
        )
      )
        return;
      try {
        await fetch("/api/me/delete", {
          method: "POST",
          headers: { "X-Player-Id": game.playerId },
        });
      } catch (e) {
        // the phone's copy is removed anyway
      }
      leave(true);
      storedKeys()
        .filter((k) => k.startsWith("vk") || k === "voice")
        .forEach((k) => setItem(k, null));
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && (await reg.pushManager.getSubscription());
        if (sub) await sub.unsubscribe();
      } catch (e) {
        // no push
      }
      location.replace("/");
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
.blocked {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  .brow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    .btn {
      margin: 0;
      width: auto;
    }
  }
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
.links {
  text-align: center;
  font-size: 13px;
  margin: 10px 0 0;
  a {
    color: $muted;
  }
}
.credit {
  text-align: center;
  font-size: 12px;
  margin: 6px 0 0;
}
.small {
  font-size: 14px;
  line-height: 1.4;
}
</style>
