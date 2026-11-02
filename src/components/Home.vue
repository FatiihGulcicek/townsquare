<template>
  <div class="page home">
    <div class="top">
      <button class="icon" @click="$emit('settings')" aria-label="Ayarlar">
        ⚙️
      </button>
    </div>
    <header>
      <img src="static/apple-icon.png" alt="" class="logo" />
      <h1>Vampir Köylü</h1>
      <p class="muted">Kasaba Meydanı · arkadaşlarınla telefondan oyna</p>
    </header>

    <div class="card me-card">
      <button
        class="photo-btn"
        @click="choosePhoto"
        aria-label="Profil fotoğrafı"
      >
        <Avatar :name="name || '?'" :size="64" :src="game.myPhoto" />
        <span class="cam">📷</span>
      </button>
      <div class="grow">
        <label class="label" for="name">Adın</label>
        <input
          id="name"
          class="field"
          v-model="name"
          maxlength="24"
          placeholder="Örn. Fatih"
          autocomplete="nickname"
          @change="saveName"
        />
      </div>
    </div>

    <div class="profile-row">
      <button class="btn small" @click="profileTab = 'me'">👤 Profilim</button>
      <button class="btn small" @click="profileTab = 'top'">🏆 Sıralama</button>
    </div>
    <Profile
      v-if="profileTab"
      :initial-tab="profileTab"
      @close="profileTab = null"
    />

    <div class="card">
      <h3>Oda kur</h3>
      <button class="btn primary" :disabled="busy" @click="create('auto')">
        🤖 Uygulama anlatsın
      </button>
      <p class="hint muted">
        Anlatıcıya gerek yok: gece, oylama ve sonuç otomatik.
      </p>
      <button class="btn" :disabled="busy" @click="create('human')">
        🎙️ Ben anlatıcıyım
      </button>
      <p class="hint muted">
        Sen oynamazsın; her şeyi görürsün ve oyunu sen ilerletirsin.
      </p>
    </div>

    <div class="card">
      <h3>Odaya katıl</h3>
      <div class="join">
        <input
          class="field code"
          v-model="code"
          maxlength="4"
          placeholder="ODA KODU"
          autocapitalize="characters"
          autocomplete="off"
          @keyup.enter="joinRoom"
        />
        <button
          class="btn primary"
          :disabled="code.length !== 4"
          @click="joinRoom"
        >
          Katıl
        </button>
      </div>
    </div>

    <details class="card rules">
      <summary>Nasıl oynanır?</summary>
      <p>
        Köyde gizli <b>vampirler</b> var. Herkes rolünü sadece kendi telefonunda
        görür.
      </p>
      <p>
        🌙 <b>Gece</b> herkes telefonuna bakar. Vampirler birlikte bir kurban
        seçer, 🩺 Doktor birini korur, 👁️ Gözcü birinin vampir olup olmadığını
        öğrenir. Diğerleri de (iz bırakmamak için) şüphelendiği birini seçer.
      </p>
      <p>
        ☀️ <b>Gündüz</b> gece ne olduğu açıklanır. Konuşun, tartışın ve
        şüphelendiğiniz kişiye oy verin. En çok oyu alan asılır; eşitlikte kimse
        asılmaz. Ölenlerin rolü açıklanır.
      </p>
      <p>
        🏁 Bütün vampirler ölürse <b>köylüler</b>, vampirler köylülerin sayısına
        ulaşırsa <b>vampirler</b> kazanır.
      </p>
      <p class="muted">4–20 oyuncu. Oyunu kuran kişi başlatır.</p>
    </details>

    <p class="install" v-if="!pwa.isStandalone">
      <a href="#" @click.prevent="installApp">📲 Ana ekrana ekle</a>
      <span v-if="showIOS" class="muted">
        — Safari'de Paylaş düğmesine dokun ve “Ana Ekrana Ekle”yi seç.
        Bildirimler iPhone'da yalnızca böyle çalışır.
      </span>
    </p>
  </div>
</template>

<script>
import { game, setName, createRoom, join, toast, setMyPhoto } from "../game";
import { pwaState, install } from "../pwa";
import { unlockVoice } from "../voice";
import Profile from "./Profile";
import Avatar from "./Avatar";
import { pickPhoto } from "../photo";

export default {
  components: { Profile, Avatar },
  data() {
    return {
      profileTab: null,
      game,
      name: game.name,
      code: "",
      busy: false,
      pwa: pwaState,
      showIOS: false,
    };
  },
  watch: {
    code(value) {
      const clean = value.toUpperCase().replace(/[^A-Z]/g, "");
      if (clean !== value) this.code = clean;
    },
  },
  methods: {
    async choosePhoto() {
      if (
        game.myPhoto &&
        !confirm("Fotoğrafını değiştirmek ister misin? (İptal: kaldır)")
      ) {
        setMyPhoto("");
        toast("Profil fotoğrafı kaldırıldı.", "info");
        return;
      }
      const data = await pickPhoto();
      if (data) {
        setMyPhoto(data);
        toast("Profil fotoğrafın kaydedildi 📷", "success");
      }
    },
    saveName() {
      setName(this.name);
    },
    needName() {
      this.saveName();
      if (!game.name) {
        toast("Önce adını yaz.", "warning");
        document.getElementById("name").focus();
        return true;
      }
      return false;
    },
    async create(mode) {
      unlockVoice();
      if (mode === "auto" && this.needName()) return;
      if (mode === "human") this.saveName();
      this.busy = true;
      try {
        await createRoom(mode);
      } catch (e) {
        toast("Şu an oda kurulamadı, biraz sonra tekrar dene.", "warning");
      }
      this.busy = false;
    },
    joinRoom() {
      unlockVoice();
      if (this.needName()) return;
      join(this.code);
    },
    async installApp() {
      if (pwaState.canInstall) await install();
      else this.showIOS = !this.showIOS;
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";

.top {
  display: flex;
  justify-content: flex-end;
}
.icon {
  background: none;
  border: 0;
  font-size: 24px;
  padding: 6px;
  cursor: pointer;
}
header {
  text-align: center;
  margin: 0 0 6px;
  .logo {
    width: 92px;
    height: 92px;
    border-radius: 22px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  h1 {
    margin: 10px 0 2px;
    font-size: 34px;
    color: $gold;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
  }
  p {
    margin: 0;
  }
}
h3 {
  margin: 0 0 6px;
  font-size: 19px;
}
.label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
}
.me-card {
  display: flex;
  align-items: center;
  gap: 14px;
  .grow {
    flex: 1;
  }
}
.photo-btn {
  position: relative;
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  .cam {
    position: absolute;
    right: -4px;
    bottom: -4px;
    font-size: 18px;
    background: #1b1f30;
    border-radius: 50%;
    padding: 3px;
  }
}
.profile-row {
  display: flex;
  gap: 8px;
  .btn {
    flex: 1;
    width: auto;
  }
}
.hint {
  margin: -2px 0 8px;
  font-size: 14px;
}
.join {
  display: flex;
  gap: 8px;
  align-items: center;
  .code {
    text-transform: uppercase;
    letter-spacing: 0.3em;
    text-align: center;
    font-weight: 700;
    flex: 1;
  }
  .btn {
    width: auto;
    margin: 0;
  }
}
.rules {
  summary {
    font-weight: 700;
    cursor: pointer;
    font-size: 17px;
  }
  p {
    line-height: 1.45;
  }
}
.install {
  text-align: center;
  font-size: 15px;
  a {
    color: $gold;
  }
}
</style>
