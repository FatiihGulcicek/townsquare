<template>
  <div class="welcome">
    <button class="lang" @click="switchLang">
      🌐 {{ lang === "en" ? "Türkçe" : "English" }}
    </button>

    <!-- 1. profile -->
    <div class="step" v-if="step === 1">
      <img src="static/logo.webp" alt="Vampir Köylü" class="logo" />
      <h1 class="sr-only">Vampir Köylü</h1>
      <p class="muted">Hoş geldin! Önce profilini oluşturalım.</p>
      <button
        class="photo-btn"
        @click="choosePhoto"
        aria-label="Profil fotoğrafı"
      >
        <Avatar :name="name || '?'" :size="96" :src="game.myPhoto" />
        <span class="cam">📷</span>
      </button>
      <p class="muted small">
        {{
          game.myPhoto
            ? "Fotoğrafı değiştirmek için dokun"
            : "Fotoğraf ekle (isteğe bağlı)"
        }}
      </p>
      <input
        class="field"
        v-model="name"
        maxlength="24"
        placeholder="Adın (oyunda görünür)"
        autocomplete="nickname"
        enterkeyhint="next"
        @keyup.enter="saveProfile"
      />
      <button class="btn primary" :disabled="!name.trim()" @click="saveProfile">
        Devam
      </button>
      <div class="dots"><i class="on"></i><i></i></div>
    </div>

    <!-- 2. permissions -->
    <div class="step" v-else>
      <h2>İzinler</h2>
      <p class="muted">
        Oyunun tam çalışması için şunlara izin ver. Hepsi isteğe bağlı; sonra
        Ayarlar'dan da açabilirsin.
      </p>

      <div class="perm" v-if="needsInstall">
        <span class="ico">📲</span>
        <div class="grow">
          <b>Ana ekrana ekle</b>
          <small v-if="pwa.isIOS">
            iPhone'da bildirimler için gerekli: Safari'de Paylaş düğmesine dokun
            → “Ana Ekrana Ekle”, sonra oyunu ana ekrandan aç.
          </small>
          <small v-else>Uygulama gibi tam ekran açılır.</small>
        </div>
        <button class="btn small" v-if="pwa.canInstall" @click="installApp">
          Ekle
        </button>
      </div>

      <div class="perm">
        <span class="ico">🔔</span>
        <div class="grow">
          <b>Bildirimler</b>
          <small
            >Sıra sende olunca, davet gelince ve arkadaşların gelince haber
            verir.</small
          >
        </div>
        <span class="ok" v-if="notif.permission === 'granted'">✓</span>
        <span class="no" v-else-if="notif.permission === 'denied'"
          >Engelli</span
        >
        <button
          class="btn small"
          v-else-if="notif.supported"
          @click="askNotifications"
        >
          İzin ver
        </button>
        <span class="no" v-else>{{
          pwa.isIOS ? "Önce ana ekrana ekle" : "Desteklenmiyor"
        }}</span>
      </div>

      <div class="perm">
        <span class="ico">🎙️</span>
        <div class="grow">
          <b>Mikrofon ve kamera</b>
          <small>Oyunda sesli ve görüntülü sohbet için.</small>
        </div>
        <span class="ok" v-if="media === 'granted'">✓</span>
        <span class="ok" v-else-if="media === 'audio'">🎙️ ✓</span>
        <span class="no" v-else-if="media === 'denied'">Engelli</span>
        <button class="btn small" v-else-if="mediaSupported" @click="askMedia">
          İzin ver
        </button>
        <span class="no" v-else>Desteklenmiyor</span>
      </div>

      <div class="perm" v-if="voice.supported">
        <span class="ico">🔊</span>
        <div class="grow">
          <b>Sesli anlatım</b>
          <small>Anlatıcı olanları yüksek sesle okur.</small>
        </div>
        <button
          class="btn small"
          :class="{ on: voice.enabled }"
          @click="toggleVoice"
        >
          {{ voice.enabled ? "Açık" : "Kapalı" }}
        </button>
      </div>

      <p class="muted small" v-if="denied">
        Engellenen izinleri telefonunun ayarlarından (Safari/Chrome → bu site)
        açabilirsin.
      </p>
      <button class="btn primary" @click="finish">Başla 🎉</button>
      <button class="btn ghost" v-if="firstTime" @click="step = 1">
        ← Geri
      </button>
      <div class="dots" v-if="firstTime"><i></i><i class="on"></i></div>
    </div>
  </div>
</template>

<script>
import Avatar from "./Avatar";
import { game, setName, setMyPhoto, toast } from "../game";
import { pickPhoto } from "../photo";
import { pwaState, install } from "../pwa";
import { enableNotifications, notificationState } from "../notifications";
import { voiceState, setVoice, unlockVoice } from "../voice";
import { lang, setLang } from "../i18n";
import { lobbyHello } from "../lobby";

export default {
  components: { Avatar },
  data() {
    const firstTime = !game.name;
    return {
      game,
      lang,
      pwa: pwaState,
      notif: notificationState,
      voice: voiceState,
      name: game.name || "",
      firstTime,
      step: firstTime ? 1 : 2,
      media: "",
      mediaSupported: !!(
        navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      ),
    };
  },
  computed: {
    needsInstall() {
      return !this.pwa.isStandalone && (this.pwa.isIOS || this.pwa.canInstall);
    },
    denied() {
      return this.notif.permission === "denied" || this.media === "denied";
    },
  },
  async mounted() {
    // already granted earlier?
    try {
      if (navigator.permissions) {
        const mic = await navigator.permissions.query({ name: "microphone" });
        const cam = await navigator.permissions
          .query({ name: "camera" })
          .catch(() => null);
        if (mic.state === "granted" && (!cam || cam.state === "granted"))
          this.media = "granted";
        else if (mic.state === "denied") this.media = "denied";
      }
    } catch (e) {
      // Safari doesn't know these names
    }
  },
  methods: {
    switchLang() {
      if (this.name.trim()) setName(this.name);
      setLang(lang === "en" ? "tr" : "en");
    },
    async choosePhoto() {
      const data = await pickPhoto();
      if (data) setMyPhoto(data);
    },
    saveProfile() {
      if (!this.name.trim()) return;
      setName(this.name);
      lobbyHello();
      this.step = 2;
    },
    async askNotifications() {
      const ok = await enableNotifications();
      if (ok) toast("Bildirimler açık 🔔", "success");
    },
    async askMedia() {
      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          });
          this.media = "granted";
        } catch (e) {
          if (e && e.name === "NotAllowedError") throw e;
          // no camera on this device: the microphone is enough
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.media = "audio";
        }
        stream.getTracks().forEach((track) => track.stop());
      } catch (e) {
        this.media = "denied";
      }
    },
    toggleVoice() {
      setVoice(!this.voice.enabled);
      if (this.voice.enabled) unlockVoice();
    },
    async installApp() {
      await install();
    },
    finish() {
      unlockVoice();
      this.$emit("done");
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";
.welcome {
  position: fixed;
  inset: 0;
  z-index: 500;
  overflow-y: auto;
  background: radial-gradient(
      circle at 50% 0%,
      rgba(70, 50, 120, 0.55),
      rgba(5, 6, 14, 0.96) 70%
    ),
    rgba(5, 6, 14, 0.9);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: calc(20px + env(safe-area-inset-top)) 20px
    calc(24px + env(safe-area-inset-bottom));
}
.lang {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top));
  right: 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.35);
  color: $text;
  border-radius: 16px;
  padding: 6px 12px;
  font-size: 13px;
}
.step {
  max-width: 420px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding-top: 24px;
  animation: rise 0.4s ease-out;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
.logo {
  width: min(62vw, 240px);
  height: auto;
  filter: drop-shadow(0 12px 30px rgba(200, 30, 80, 0.35));
}
h1 {
  margin: 0;
  font-family: "Cinzel", serif;
  color: $gold;
  font-size: 30px;
}
h2 {
  margin: 8px 0 0;
  font-family: "Cinzel", serif;
  color: $gold;
}
p {
  margin: 0;
}
.small {
  font-size: 13px;
}
.photo-btn {
  position: relative;
  border: 0;
  background: none;
  padding: 0;
  margin-top: 6px;
  .cam {
    position: absolute;
    right: -4px;
    bottom: -4px;
    font-size: 24px;
  }
}
.field {
  width: 100%;
  text-align: center;
  font-size: 18px;
}
.btn {
  width: 100%;
}
.perm {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  .ico {
    font-size: 28px;
  }
  .grow {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  small {
    color: $muted;
    font-size: 12.5px;
    line-height: 1.35;
  }
  .btn {
    width: auto;
    margin: 0;
    white-space: nowrap;
    &.on {
      border-color: $gold;
      color: $gold;
    }
  }
  .ok {
    color: #3ddc84;
    font-weight: 800;
    font-size: 18px;
  }
  .no {
    color: $muted;
    font-size: 12px;
    max-width: 90px;
    text-align: right;
  }
}
.dots {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
    &.on {
      background: $gold;
    }
  }
}
</style>
