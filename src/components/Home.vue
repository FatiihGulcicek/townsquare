<template>
  <div class="page home">
    <!-- me: photo, name, settings -->
    <div class="me-bar">
      <button
        class="photo-btn"
        @click="choosePhoto"
        aria-label="Profil fotoğrafı"
      >
        <Avatar :name="name || '?'" :size="46" :src="game.myPhoto" />
        <span class="cam">📷</span>
      </button>
      <input
        id="name"
        class="name-in"
        v-model="name"
        maxlength="24"
        placeholder="Adın"
        autocomplete="nickname"
        @change="saveName"
      />
      <button class="icon" @click="$emit('settings')" aria-label="Ayarlar">
        ⚙️
      </button>
    </div>

    <!-- ========== PLAY ========== -->
    <section v-if="tab === 'play'" class="play">
      <h1 class="sr-only">Vampir Köylü</h1>

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
          class="btn"
          :class="{ primary: code.length === 4 }"
          :disabled="code.length !== 4"
          @click="joinRoom"
        >
          Katıl
        </button>
      </div>

      <div class="quick">
        <button class="art-tile" :disabled="busy" @click="tutorial">
          <img src="static/tile-tutorial.webp" alt="" />
          <span class="sr-only">Öğretici oyun</span>
        </button>
        <button class="art-tile" @click="profileTab = 'top'">
          <img src="static/tile-rank.webp" alt="" />
          <span class="sr-only">Sıralama</span>
        </button>
      </div>

      <p class="champion" v-if="champion" @click="profileTab = 'top'">
        👑 Geçen haftanın şampiyonu: <b>{{ champion.name }}</b> ({{
          champion.wins
        }}
        galibiyet)
      </p>

      <div class="my-rooms" v-if="rooms.length">
        <h4>Odalarım</h4>
        <div class="room-row" v-for="r in rooms" :key="r.code">
          <b class="rc">{{ r.code }}</b>
          <small class="muted">
            {{ r.mode === "human" ? "🎙️ anlatıcılı" : "🤖 otomatik" }}
          </small>
          <button class="btn small primary" @click="reopen(r)">Aç</button>
          <button class="x" @click="forget(r)" aria-label="Sil">✕</button>
        </div>
      </div>

      <details class="rules">
        <summary>Nasıl oynanır?</summary>
        <p>
          Köyde gizli <b>vampirler</b> var. Herkes rolünü sadece kendi
          telefonunda görür.
        </p>
        <p>
          🌙 <b>Gece</b> herkes telefonuna bakar. Vampirler birlikte bir kurban
          seçer, 🩺 Doktor birini korur, 👁️ Gözcü birinin vampir olup olmadığını
          öğrenir. Diğerleri de (iz bırakmamak için) şüphelendiği birini seçer.
        </p>
        <p>
          ☀️ <b>Gündüz</b> gece ne olduğu açıklanır. Konuşun, tartışın ve
          şüphelendiğiniz kişiye oy verin. En çok oyu alan asılır; eşitlikte
          kimse asılmaz. Ölenlerin rolü açıklanır.
        </p>
        <p>
          🏁 Bütün vampirler ölürse <b>köylüler</b>, vampirler köylülerin
          sayısına ulaşırsa <b>vampirler</b> kazanır.
        </p>
        <p class="muted">4–20 oyuncu. Oyunu kuran kişi başlatır.</p>
      </details>

      <div class="play-dock">
        <button class="btn gold play-btn" :disabled="busy" @click="newRoom">
          ▶ Oyun kur
        </button>
      </div>
    </section>

    <!-- ========== TOWN SQUARE ========== -->
    <section v-else-if="tab === 'square'">
      <OnlineList />
      <LobbyChat />
    </section>

    <!-- new room sheet -->
    <div class="sheet-bg" v-if="creating" @click.self="creating = false">
      <div class="sheet create">
        <h3>Yeni oda</h3>
        <button class="mode" :disabled="busy" @click="create('auto')">
          <span class="ic">🤖</span>
          <span>
            <b>Uygulama anlatsın</b>
            <small>Anlatıcıya gerek yok: gece, oylama ve sonuç otomatik.</small>
          </span>
        </button>
        <button class="mode" :disabled="busy" @click="create('human')">
          <span class="ic">🎙️</span>
          <span>
            <b>Ben anlatıcıyım</b>
            <small
              >Sen oynamazsın; her şeyi görürsün ve oyunu sen
              ilerletirsin.</small
            >
          </span>
        </button>
        <details class="more">
          <summary>Kendi kodun ve şifre (isteğe bağlı)</summary>
          <input
            class="field code-in"
            v-model="wanted"
            maxlength="4"
            placeholder="Kendi kodun (isteğe bağlı, ör. CUMA)"
            autocapitalize="characters"
            autocomplete="off"
          />
          <p class="hint muted">
            Kendi kodunu seçersen her hafta aynı linkle toplanabilirsiniz.
          </p>
          <input
            class="field"
            v-model="roomPass"
            maxlength="20"
            placeholder="🔒 Şifre (isteğe bağlı)"
            autocomplete="off"
          />
        </details>
        <button class="btn ghost" @click="creating = false">Vazgeç</button>
      </div>
    </div>

    <Profile
      v-if="profileTab"
      :initial-tab="profileTab"
      @close="profileTab = null"
    />

    <!-- bottom tabs -->
    <nav class="tabs">
      <button :class="{ on: tab === 'play' }" @click="tab = 'play'">
        <span>🎮</span>Oyna
      </button>
      <button :class="{ on: tab === 'square' }" @click="tab = 'square'">
        <span>💬</span>Meydan
        <i class="badge" v-if="others">{{ others }}</i>
      </button>
      <button @click="profileTab = 'me'"><span>👤</span>Profil</button>
      <button @click="profileTab = 'shop'"><span>🛒</span>Mağaza</button>
    </nav>
  </div>
</template>

<script>
import {
  game,
  setName,
  createRoom,
  join,
  toast,
  setMyPhoto,
  savedRooms,
  forgetRoom,
  fetchLeaderboard,
} from "../game";
import { unlockVoice } from "../voice";
import Profile from "./Profile";
import Avatar from "./Avatar";
import OnlineList from "./OnlineList";
import LobbyChat from "./LobbyChat";
import { lobby } from "../lobby";
import { pickPhoto } from "../photo";

export default {
  components: { Profile, Avatar, OnlineList, LobbyChat },
  data() {
    return {
      profileTab: null,
      tab: "play",
      creating: false,
      lobby,
      game,
      wanted: "",
      roomPass: "",
      champion: null,
      rooms: savedRooms(),
      name: game.name,
      code: "",
      busy: false,
    };
  },
  computed: {
    others() {
      return this.lobby.online.filter((p) => p.pub !== this.lobby.me).length;
    },
  },
  async mounted() {
    const result = await fetchLeaderboard("week");
    this.champion = result.champion || null;
  },
  watch: {
    "game.name"(value) {
      // the name typed on the welcome screen
      if (value && !this.name) this.name = value;
    },
    code(value) {
      const clean = value.toUpperCase().replace(/[^A-Z]/g, "");
      if (clean !== value) this.code = clean;
    },
    wanted(value) {
      const clean = value.toUpperCase().replace(/[^A-Z]/g, "");
      if (clean !== value) this.wanted = clean;
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
    newRoom() {
      unlockVoice();
      if (this.needName()) return;
      this.creating = true;
    },
    async create(mode, code) {
      unlockVoice();
      if (mode === "auto" && this.needName()) return;
      if (mode === "human") this.saveName();
      const wanted = (code || this.wanted || "").toUpperCase();
      if (wanted && !/^[A-Z]{4}$/.test(wanted)) {
        toast("Oda kodu 4 harf olmalı (Türkçe karakter olmadan).", "warning");
        return;
      }
      this.busy = true;
      try {
        await createRoom(
          mode,
          wanted || undefined,
          false,
          this.roomPass.trim() || undefined,
        );
      } catch (e) {
        toast(
          e.message === "code"
            ? "Bu kod kullanılamıyor."
            : "Şu an oda kurulamadı, biraz sonra tekrar dene.",
          "warning",
        );
      }
      this.busy = false;
      this.creating = false;
    },
    async tutorial() {
      unlockVoice();
      if (this.needName()) return;
      this.busy = true;
      try {
        await createRoom("auto", undefined, true);
      } catch (e) {
        toast("Şu an açılamadı, biraz sonra tekrar dene.", "warning");
      }
      this.busy = false;
    },
    reopen(r) {
      this.create(r.mode, r.code);
    },
    forget(r) {
      forgetRoom(r.code);
      this.rooms = savedRooms();
    },
    joinRoom() {
      unlockVoice();
      if (this.needName()) return;
      join(this.code);
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";

.home {
  padding-bottom: calc(86px + env(safe-area-inset-bottom));
}
.me-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 2px 8px;
  .name-in {
    flex: 1;
    min-width: 0;
    height: 42px;
    border-radius: 21px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.35);
    color: $text;
    padding: 0 14px;
    font-size: 16px;
    font-weight: 600;
    outline: none;
    &:focus {
      border-color: $gold;
    }
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
    font-size: 14px;
  }
}
.icon {
  background: none;
  border: 0;
  font-size: 24px;
  padding: 6px;
  cursor: pointer;
}
.play {
  padding-top: 8px;
  /* room for the play button docked above the tab bar */
  padding-bottom: 110px;
}
.play-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(72px + env(safe-area-inset-bottom));
  z-index: 99;
  padding: 0 16px 10px;
  pointer-events: none;
  .play-btn {
    pointer-events: auto;
    margin: 0 auto;
  }
}
.play-btn {
  animation: breathe 2.6s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    transform: scale(1.02);
  }
}
.join {
  display: flex;
  gap: 8px;
  .code {
    flex: 1;
    margin: 0;
    text-align: center;
    letter-spacing: 0.3em;
    font-weight: 800;
    text-transform: uppercase;
  }
  .btn {
    margin: 0;
    width: auto;
    padding: 0 22px;
  }
}
.quick {
  display: grid;
  grid-template-columns: repeat(2, min(36vw, 150px));
  justify-content: center;
  gap: 18px;
  margin: 14px 0 6px;
}
.art-tile {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  aspect-ratio: 1;
  transition: transform 0.12s;
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.55));
  }
  &:active {
    transform: scale(0.96);
  }
  &:disabled {
    opacity: 0.6;
  }
}
.tile-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(16, 18, 34, 0.75);
  color: $text;
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  span {
    font-size: 26px;
  }
  &:active {
    transform: scale(0.97);
  }
}
.champion {
  text-align: center;
  font-size: 14px;
  color: $muted;
  cursor: pointer;
  b {
    color: $gold;
  }
}
.my-rooms {
  margin-top: 10px;
  h4 {
    margin: 6px 0;
    color: $muted;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
}
.room-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 12px;
  background: rgba(16, 18, 34, 0.7);
  .rc {
    font-size: 18px;
    letter-spacing: 0.15em;
    color: $gold;
  }
  small {
    flex: 1;
  }
  .btn {
    margin: 0;
    width: auto;
  }
  .x {
    border: 0;
    background: none;
    color: $muted;
    font-size: 16px;
    cursor: pointer;
  }
}
.rules {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(16, 18, 34, 0.7);
  summary {
    cursor: pointer;
    font-weight: 700;
  }
  p {
    line-height: 1.45;
  }
}
.create {
  .mode {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    text-align: left;
    padding: 14px;
    margin-bottom: 10px;
    border-radius: 16px;
    border: 1px solid rgba(233, 180, 76, 0.45);
    background: rgba(233, 180, 76, 0.08);
    color: $text;
    font: inherit;
    cursor: pointer;
    .ic {
      font-size: 34px;
    }
    b {
      display: block;
      font-size: 17px;
    }
    small {
      color: $muted;
      font-size: 13px;
    }
    &:active {
      transform: scale(0.98);
    }
  }
  .more {
    margin: 4px 0 10px;
    summary {
      color: $muted;
      font-size: 14px;
      cursor: pointer;
      margin-bottom: 8px;
    }
  }
  .hint {
    font-size: 13px;
    margin: 4px 0 8px;
  }
}
.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  justify-content: space-around;
  padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
  background: rgba(8, 9, 20, 0.94);
  border-top: 1px solid rgba(233, 180, 76, 0.25);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  button {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    border: 0;
    background: none;
    color: $muted;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 0;
    cursor: pointer;
    span {
      font-size: 22px;
      filter: grayscale(0.6);
    }
    &.on {
      color: $gold;
      span {
        filter: none;
      }
    }
  }
  .badge {
    position: absolute;
    top: 2px;
    left: 56%;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    background: #2fbf71;
    color: white;
    font-style: normal;
    font-size: 11px;
    line-height: 18px;
    padding: 0 4px;
  }
}
</style>
