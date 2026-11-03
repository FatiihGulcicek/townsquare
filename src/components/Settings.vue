<template>
  <div class="sheet-bg settings-bg" @click.self="$emit('close')">
    <div class="sheet settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="settings-header">
        <img src="static/ic-settings.webp" alt="" />
        <div>
          <h2 id="settings-title">Ayarlar</h2>
          <p>Oyun deneyimini düzenle</p>
        </div>
        <button class="close-button" type="button" aria-label="Ayarları kapat" @click="$emit('close')">×</button>
      </header>

      <section class="settings-section" aria-labelledby="sound-title">
        <h3 id="sound-title">Ses</h3>
        <div class="settings-group">
          <button v-if="voice.supported" class="setting-row" type="button" role="switch" :aria-checked="voice.enabled" @click="toggleVoice">
            <span class="setting-copy"><strong>Sesli anlatım</strong><small>Oyun olaylarını seslendirir</small></span>
            <span class="switch" :class="{ on: voice.enabled }" aria-hidden="true"></span>
          </button>
          <button v-if="voice.supported" class="setting-row" type="button" role="switch" :aria-checked="voice.bots" @click="toggleBots">
            <span class="setting-copy"><strong>Bot sesleri</strong><small>Bot mesajlarını seslendirir</small></span>
            <span class="switch" :class="{ on: voice.bots }" aria-hidden="true"></span>
          </button>
          <button class="setting-row" type="button" role="switch" :aria-checked="music.enabled" @click="toggleMusic">
            <span class="setting-copy"><strong>Atmosfer müziği</strong><small>Arka plan müziği</small></span>
            <span class="switch" :class="{ on: music.enabled }" aria-hidden="true"></span>
          </button>
          <button class="setting-row" type="button" role="switch" :aria-checked="sfx.enabled" @click="toggleSfx">
            <span class="setting-copy"><strong>Ses efektleri</strong><small>Oyun içi kısa sesler</small></span>
            <span class="switch" :class="{ on: sfx.enabled }" aria-hidden="true"></span>
          </button>
        </div>
      </section>

      <section class="settings-section" aria-labelledby="notice-title">
        <h3 id="notice-title">Bildirimler</h3>
        <div class="settings-group">
          <button class="setting-row" type="button" @click="notifications">
            <span class="setting-copy"><strong>Oyun bildirimleri</strong><small>Sıran ve davetler için haber verir</small></span>
            <span class="setting-status" :class="{ on: notif.permission === 'granted' }">{{ notifLabel }}</span>
          </button>
          <button class="setting-row" type="button" role="switch" :aria-checked="lobby.notifyArrivals" @click="toggleArrivals">
            <span class="setting-copy"><strong>Oyuncu gelişleri</strong><small>Biri siteye girince haber ver</small></span>
            <span class="switch" :class="{ on: lobby.notifyArrivals }" aria-hidden="true"></span>
          </button>
        </div>
        <p class="settings-note" v-if="pwa.isIOS && !pwa.isStandalone">
          iPhone'da oyun kapalıyken bildirim almak için uygulamayı Safari'den ana ekrana ekle.
        </p>
      </section>

      <section class="settings-section" aria-labelledby="account-title">
        <h3 id="account-title">Hesap ve uygulama</h3>
        <div class="settings-group">
          <button class="setting-row" type="button" @click="profile = true">
            <span class="setting-copy"><strong>Profil ve istatistikler</strong></span><span class="chevron" aria-hidden="true">›</span>
          </button>
          <button class="setting-row" type="button" @click="switchLang">
            <span class="setting-copy"><strong>Dil · Language</strong></span><span class="setting-status on">{{ lang === "en" ? "English" : "Türkçe" }}</span>
          </button>
          <button v-if="!pwa.isStandalone" class="setting-row" type="button" @click="installApp">
            <span class="setting-copy"><strong>Ana ekrana ekle</strong></span><span class="chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <section class="settings-section" v-if="lobby.blocked.length" aria-labelledby="blocked-title">
        <h3 id="blocked-title">Engellediklerin</h3>
        <div class="settings-group">
          <div v-for="b in lobby.blocked" :key="b.pub" class="blocked-row">
            <span>{{ b.name }}</span><button class="btn small" type="button" @click="unblock(b.pub)">Kaldır</button>
          </div>
        </div>
      </section>

      <button class="leave-button" type="button" v-if="game.code" @click="leaveRoom">Odadan çık</button>
      <footer class="settings-footer">
        <a href="/gizlilik.html" target="_blank" rel="noopener">Gizlilik</a>
        <a href="/kosullar.html" target="_blank" rel="noopener">Kullanım şartları</a>
        <a href="mailto:destek@darkspire.co">İletişim</a>
        <button type="button" @click="deleteData">Verilerimi sil</button>
      </footer>
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
.settings-bg {
  align-items: center;
  padding: 16px;
}
.settings-sheet {
  max-width: 520px;
  max-height: min(90dvh, 760px);
  padding: 0 18px calc(18px + env(safe-area-inset-bottom));
  border: 1px solid rgba(234, 174, 85, 0.55);
  border-radius: 20px;
  background: linear-gradient(160deg, #27101d, #110a12 65%);
  scrollbar-width: thin;
}
.settings-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 0 12px;
  background: linear-gradient(180deg, #27101d 82%, rgba(39, 16, 29, 0));
  img {
    width: 42px;
    height: 42px;
    object-fit: contain;
  }
  h2 {
    margin: 0;
    color: #f4d29b;
    font-family: "Cinzel", Georgia, serif;
    font-size: 22px;
  }
  p {
    margin: 1px 0 0;
    color: $muted;
    font-size: 12px;
  }
}
.close-button {
  margin-left: auto;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(234, 174, 85, 0.45);
  border-radius: 50%;
  background: rgba(9, 6, 11, 0.8);
  color: #f4d29b;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.settings-section {
  margin-top: 14px;
  h3 {
    margin: 0 0 8px 3px;
    color: #e9bd7a;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
}
.settings-group {
  overflow: hidden;
  border: 1px solid rgba(213, 151, 79, 0.34);
  border-radius: 12px;
  background: rgba(7, 6, 11, 0.56);
}
.setting-row,
.blocked-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 54px;
  width: 100%;
  padding: 9px 12px;
  border: 0;
  border-bottom: 1px solid rgba(234, 174, 85, 0.13);
  background: transparent;
  color: $text;
  text-align: left;
  font: inherit;
  &:last-child { border-bottom: 0; }
}
.setting-row {
  cursor: pointer;
  &:hover { background: rgba(234, 174, 85, 0.07); }
}
.setting-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  strong { font-size: 14px; font-weight: 650; }
  small { color: $muted; font-size: 11px; line-height: 1.3; }
}
.switch {
  position: relative;
  flex: 0 0 39px;
  width: 39px;
  height: 22px;
  border: 1px solid rgba(234, 174, 85, 0.5);
  border-radius: 20px;
  background: #241a20;
  transition: background 0.2s;
  &::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #b6a5a0;
    transition: transform 0.2s, background 0.2s;
  }
  &.on {
    background: #8b3a18;
    &::after { transform: translateX(17px); background: #ffd385; }
  }
}
.setting-status {
  flex: 0 0 auto;
  color: $muted;
  font-size: 12px;
  &.on { color: #f3c77f; }
}
.chevron { color: #f3c77f; font-size: 22px; line-height: 1; }
.settings-note {
  margin: 8px 4px 0;
  color: $muted;
  font-size: 12px;
  line-height: 1.4;
}
.blocked-row {
  font-size: 14px;
  .btn { width: auto; min-height: 32px; margin: 0; }
}
.leave-button {
  display: block;
  width: 100%;
  min-height: 42px;
  margin-top: 18px;
  border: 1px solid rgba(214, 79, 79, 0.55);
  border-radius: 10px;
  background: rgba(109, 19, 30, 0.28);
  color: #ffc5bd;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.settings-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 7px 16px;
  margin-top: 17px;
  padding-top: 14px;
  border-top: 1px solid rgba(234, 174, 85, 0.17);
  a, button {
    border: 0;
    padding: 0;
    background: none;
    color: $muted;
    font: inherit;
    font-size: 11px;
    text-decoration: none;
    cursor: pointer;
  }
  a:hover, button:hover { color: #f3c77f; }
}
@media (max-width: 600px) {
  .settings-bg { align-items: flex-end; padding: 0; }
  .settings-sheet { max-height: 94dvh; border-radius: 18px 18px 0 0; border-bottom: 0; }
}
</style>
